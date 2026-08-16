/**
 * RateLimitService — the policy-aware front consumers call.
 *
 * It binds three decisions together so no call site can improvise one:
 * which limiter is primary (the distributed Redis window), what happens on
 * a store failure (the POLICY's declared mode — 503 for fail_closed, the
 * documented in-process fallback for fail_open_fallback), and how outcomes
 * are metered (`karar.ratelimit.decisions` / `karar.ratelimit.store_failures`).
 */

import { ErrorCode, PlatformError } from '../errors/index.js';
import { makeCounter, type CounterHandle } from '../observability/index.js';

import { InProcessRateLimiter } from './in-process-rate-limiter.js';
import type { RateLimitDecision, RateLimiter } from './limiter.js';
import { RateLimitStoreError } from './redis-rate-limiter.js';
import type { RateLimitPolicy } from './policy.js';

export const RATE_LIMIT_METRIC_NAMES = {
  /** Counter — every decision, attributes {policy, outcome: allowed|blocked}. */
  decisions: 'karar.ratelimit.decisions',
  /** Counter — store failures, attributes {policy, mode: fail_closed|fail_open_fallback}. */
  storeFailures: 'karar.ratelimit.store_failures',
} as const;

export interface RateLimitServiceOptions {
  /** The distributed limiter (Redis). */
  readonly primary: RateLimiter;
  /** Fallback for fail_open_fallback policies; defaults to a fresh in-process limiter. */
  readonly fallback?: RateLimiter;
}

export class RateLimitService {
  private readonly primary: RateLimiter;
  private readonly fallback: RateLimiter;
  private readonly decisions: CounterHandle;
  private readonly storeFailures: CounterHandle;

  constructor(options: RateLimitServiceOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback ?? new InProcessRateLimiter();
    this.decisions = makeCounter(RATE_LIMIT_METRIC_NAMES.decisions, {
      description: 'Rate-limit decisions by policy and outcome',
    });
    this.storeFailures = makeCounter(RATE_LIMIT_METRIC_NAMES.storeFailures, {
      description: 'Rate-limit store failures by policy and applied failure mode',
    });
  }

  /**
   * Counts the attempt and returns the decision. Throws
   * `PlatformError(DEPENDENCY_UNAVAILABLE)` when the store is down and the
   * policy fails closed. `subjectKey` must already be a digest
   * (RateLimitKeyHasher) — never a raw identifier.
   */
  async enforce(
    policy: RateLimitPolicy,
    subjectKey: string,
    now?: Date,
  ): Promise<RateLimitDecision> {
    const check = {
      policyName: policy.name,
      limit: policy.limit,
      windowMs: policy.windowMs,
      subjectKey,
    };
    let decision: RateLimitDecision;
    try {
      decision = await this.primary.enforce(check, now);
    } catch (error) {
      if (!(error instanceof RateLimitStoreError)) throw error;
      this.storeFailures.add(1, { policy: policy.name, mode: policy.onStoreFailure });
      if (policy.onStoreFailure === 'fail_closed') {
        throw new PlatformError({
          code: ErrorCode.DEPENDENCY_UNAVAILABLE,
          message: 'Rate limiting is unavailable; the request was not processed.',
          origin: 'infrastructure',
          retryable: true,
          details: { policy: policy.name },
          cause: error,
        });
      }
      decision = await this.fallback.enforce(check, now);
    }
    this.decisions.add(1, {
      policy: policy.name,
      outcome: decision.allowed ? 'allowed' : 'blocked',
    });
    return decision;
  }

  /**
   * `enforce`, then convert a refusal into the platform's RATE_LIMITED error
   * (429 with retryAfterSeconds detail) — for call sites where "blocked" has
   * no domain meaning of its own.
   */
  async assertWithinLimit(policy: RateLimitPolicy, subjectKey: string, now?: Date): Promise<void> {
    const decision = await this.enforce(policy, subjectKey, now);
    if (!decision.allowed) {
      throw new PlatformError({
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests. Try again later.',
        origin: 'infrastructure',
        retryable: true,
        details: {
          policy: policy.name,
          retryAfterSeconds: Math.ceil(decision.retryAfterMs / 1000),
        },
      });
    }
  }
}
