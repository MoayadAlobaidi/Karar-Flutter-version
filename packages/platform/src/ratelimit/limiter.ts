/**
 * The rate-limiter contract and the pure sliding-window-log core both
 * implementations (Redis, in-process) share.
 *
 * `enforce` COUNTS the attempt and answers: allowed attempts are recorded in
 * the window; refused attempts are not (a refused request must not extend
 * the caller's own lockout). A store failure is not a decision — it is the
 * policy's declared failure mode, applied by the RedisRateLimiter.
 */

export type RateLimitDecision =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly retryAfterMs: number };

export interface RateLimitCheck {
  /** Policy name — the endpoint scope (see RATE_LIMIT_POLICIES). */
  readonly policyName: string;
  readonly limit: number;
  readonly windowMs: number;
  /** Digested subject key (RateLimitKeyHasher) — never a raw identifier. */
  readonly subjectKey: string;
}

export interface RateLimiter {
  enforce(check: RateLimitCheck, now?: Date): Promise<RateLimitDecision>;
}

/**
 * Pure sliding-window-log arithmetic over a sorted timestamp array. Exported
 * for the in-process limiter and for tests; the Redis adapter runs the same
 * algorithm server-side in Lua so concurrent instances share one window.
 */
export function slideWindow(
  timestamps: number[],
  nowMs: number,
  limit: number,
  windowMs: number,
): { decision: RateLimitDecision; timestamps: number[] } {
  const floor = nowMs - windowMs;
  const live = timestamps.filter((t) => t > floor);
  if (live.length < limit) {
    live.push(nowMs);
    return { decision: { allowed: true, remaining: limit - live.length }, timestamps: live };
  }
  const oldest = live[0] ?? nowMs;
  return {
    decision: { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - nowMs) },
    timestamps: live,
  };
}
