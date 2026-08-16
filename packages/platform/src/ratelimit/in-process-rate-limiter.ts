/**
 * In-process sliding-window limiter.
 *
 * Two sanctioned uses, and only these:
 * 1. the DOCUMENTED fallback behind `fail_open_fallback` policies while the
 *    distributed store is down (see policy.ts for why refresh alone opts in);
 * 2. unit tests that exercise limiter behaviour without Redis.
 *
 * It is per-process — N instances multiply the effective limit by N — which
 * is exactly why no `fail_closed` surface ever routes here, and why
 * production rate limiting proper is the Redis limiter (backend.md §10:
 * "distributed, not per-instance").
 *
 * Memory is bounded: at most `maxSubjects` tracked keys; the stalest key is
 * evicted first. Eviction can only ever FORGET history, i.e. rate-limit less
 * strictly for one subject — acceptable for a fallback, unacceptable for the
 * primary limiter, which is another reason this class is not one.
 */

import {
  slideWindow,
  type RateLimitCheck,
  type RateLimitDecision,
  type RateLimiter,
} from './limiter.js';

const DEFAULT_MAX_SUBJECTS = 10_000;

interface Entry {
  timestamps: number[];
  lastTouched: number;
}

export class InProcessRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxSubjects: number;

  constructor(options: { maxSubjects?: number } = {}) {
    this.maxSubjects = options.maxSubjects ?? DEFAULT_MAX_SUBJECTS;
  }

  enforce(check: RateLimitCheck, now: Date = new Date()): Promise<RateLimitDecision> {
    const nowMs = now.getTime();
    const key = `${check.policyName}:${check.subjectKey}`;
    const entry = this.entries.get(key) ?? { timestamps: [], lastTouched: nowMs };
    const { decision, timestamps } = slideWindow(
      entry.timestamps,
      nowMs,
      check.limit,
      check.windowMs,
    );
    entry.timestamps = timestamps;
    entry.lastTouched = nowMs;
    this.entries.delete(key); // re-insert to keep Map iteration ~LRU
    this.entries.set(key, entry);
    this.evictIfNeeded();
    return Promise.resolve(decision);
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxSubjects) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}
