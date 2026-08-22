/**
 * What the financial surface needs from the platform's rate limiter, and
 * nothing more.
 *
 * Declared here for the same reason `capability-gate.ts` declares its own port:
 * nothing under `apps/api/src/financial` constructs a `RateLimitService`, names
 * Redis, or knows a pepper. The composition root binds an adapter, and this
 * directory stays a surface rather than a place where infrastructure decisions
 * accumulate.
 */

import type { RateLimitPolicy } from '@karar/platform/dist/ratelimit/index.js';

import type { FinancialPrincipal } from './principal.js';

export interface FinancialRateLimitPort {
  /**
   * The digest a budget is charged to, derived from the SERVER-resolved
   * principal. Never a raw identifier, and never anything a caller supplied.
   */
  subjectKeyFor(principal: FinancialPrincipal): string;
  /**
   * Refuses by throwing: `RATE_LIMITED` when the budget is spent, or
   * `DEPENDENCY_UNAVAILABLE` when the store is down and the policy fails
   * closed. Returns void when the request may proceed.
   */
  assertWithinLimit(policy: RateLimitPolicy, subjectKey: string): Promise<void>;
}

export const FINANCIAL_RATE_LIMITS = 'karar.api.financial.rate-limits';
