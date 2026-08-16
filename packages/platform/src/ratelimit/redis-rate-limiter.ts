/**
 * Redis sliding-window limiter — the DISTRIBUTED limiter (backend.md §10:
 * rate limiting is "distributed, not per-instance"; legacy API-01).
 *
 * The window lives server-side in a ZSET and the whole
 * prune-count-admit-record step runs as one Lua script, so N application
 * instances share one window with no admit race (two concurrent requests at
 * limit-1 cannot both pass). Refused attempts are not recorded — symmetric
 * with the in-process limiter.
 *
 * Store failures are surfaced as `RateLimitStoreError` and DECIDED ABOUT in
 * RateLimitService per the policy's declared failure mode — this class
 * neither fails open nor closed by itself.
 */

import { Redis } from 'ioredis';

import { storageKey } from './keys.js';
import type { RateLimitCheck, RateLimitDecision, RateLimiter } from './limiter.js';

export class RateLimitStoreError extends Error {
  override readonly name = 'RateLimitStoreError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

// KEYS[1] window zset; ARGV: now-ms, window-ms, limit, member.
// Returns {allowed(1|0), remaining, retryAfterMs}.
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry = window
if oldest[2] then
  retry = (tonumber(oldest[2]) + window) - now
  if retry < 0 then retry = 0 end
end
return {0, 0, retry}
`;

/** The one ioredis capability this adapter uses; tests substitute fakes. */
export interface RedisEvalClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * Builds a fail-fast ioredis client suitable for rate limiting: no offline
 * queue (a down Redis must error NOW, not buffer commands until the outage
 * ends and then replay stale limit checks) and a single retry per request.
 * The composition root owns the lifecycle (`client.quit()` on shutdown).
 */
export function createRateLimitRedisClient(options: {
  readonly host: string;
  readonly port: number;
}): Redis {
  return new Redis({
    host: options.host,
    port: options.port,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
}

export class RedisSlidingWindowRateLimiter implements RateLimiter {
  private readonly redis: RedisEvalClient;
  private counter = 0;

  constructor(redis: RedisEvalClient) {
    this.redis = redis;
  }

  async enforce(check: RateLimitCheck, now: Date = new Date()): Promise<RateLimitDecision> {
    const nowMs = now.getTime();
    // Member uniqueness within the same millisecond, per process.
    this.counter = (this.counter + 1) % 0xffff;
    const member = `${nowMs}:${process.pid}:${this.counter}`;
    let raw: unknown;
    try {
      raw = await this.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        storageKey(check.policyName, check.subjectKey),
        nowMs,
        check.windowMs,
        check.limit,
        member,
      );
    } catch (error) {
      throw new RateLimitStoreError('rate-limit store request failed', { cause: error });
    }
    if (!Array.isArray(raw) || raw.length < 3) {
      throw new RateLimitStoreError('rate-limit store returned an unexpected shape');
    }
    const allowed = Number(raw[0]) === 1;
    return allowed
      ? { allowed: true, remaining: Number(raw[1]) }
      : { allowed: false, retryAfterMs: Number(raw[2]) };
  }
}
