/**
 * Redis sliding-window limiter — the DISTRIBUTED limiter (backend.md §10:
 * rate limiting is "distributed, not per-instance"; legacy API-01).
 *
 * The window lives server-side in a ZSET and the whole
 * prune-count-admit-record step runs as one Lua script, so N application
 * instances share one window with no admit race (two concurrent requests at
 * limit-1 cannot both pass).
 *
 * IT IS ALSO TRUE OF TIME, AND THIS PARAGRAPH USED TO SAY THE OPPOSITE. The
 * prune once used the timestamp the CALLING PROCESS supplied (`Date.now()`), so
 * an instance whose clock had drifted pruned the shared window by its own
 * reckoning — destructively, since `ZREMRANGEBYSCORE` deletes for every
 * instance, and at a drift of one window the ceiling collapsed. That was
 * KAR-RSK-047, reproduced against live Redis and fixed sixty lines below: the
 * script calls `TIME` and no caller can send an instant.
 *
 * The header went on describing the defect as current — "not changed here" —
 * after the code changed, and an independent review found it at the closeout.
 * A comment that misdescribes the code it heads is worse than no comment, and
 * worst of all in a file whose reviewers read the header first. `Date.now()`
 * survives in this file only as a uniqueness salt in the member string, where
 * a wrong clock cannot admit or prune anything. Refused attempts are still not
 * recorded — symmetric with the in-process limiter.
 *
 * Store failures are surfaced as `RateLimitStoreError` and DECIDED ABOUT in
 * RateLimitService per the policy's declared failure mode — this class
 * neither fails open nor closed by itself.
 */

import { randomBytes } from 'node:crypto';
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
/**
 * WHOSE CLOCK DECIDES THE WINDOW, and why it cannot be the caller's.
 *
 * The script took `now` as an argument from the calling process. Every
 * application instance therefore pruned the SHARED sorted set by its own
 * reckoning of the time, and the prune is destructive — `ZREMRANGEBYSCORE`
 * deletes, for everyone. An instance whose clock has drifted forward does not
 * merely mis-decide its own request; it erases the history the correctly-clocked
 * instances were counting.
 *
 * Reproduced against live Redis, five entries aged 45s in a 60s window with a
 * limit of 5:
 *
 * ```
 *   correct clock  -> refused,  zcard 5
 *   clock +20s     -> ADMITTED, zcard 5 -> 1     (four entries destroyed)
 *   correct again  -> ADMITTED, zcard 2          (…for everyone)
 * ```
 *
 * At a drift of one full window the ceiling collapses entirely. One pod with a
 * failed NTP sync, a resumed VM snapshot or a stepped host clock is enough, and
 * the damage outlives the request that caused it.
 *
 * So the script asks REDIS for the time. `redis.call('TIME')` is evaluated once,
 * inside the same atomic script that prunes, counts and admits, so there is no
 * window between reading the clock and acting on it, and every instance sharing
 * a key shares one clock by construction rather than by operational discipline.
 *
 * This is why `enforce` no longer sends a timestamp: there is no longer anywhere
 * honest to put one. A caller-supplied instant would have to be either ignored
 * or trusted, and both were tried — trusting it is the defect above.
 */
export const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
-- REDIS IS THE CLOCK. One key, one clock, read inside the same atomic script
-- that acts on it. See the header above for what a caller-supplied clock did.
local t = redis.call('TIME')
local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)
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
 * The client is lazy: `RateLimitRedisConnection` (redis-connection.ts) owns
 * the lifecycle and the composition root OPENS IT BEFORE SERVING TRAFFIC —
 * the first command must never be the one that starts the handshake, because
 * with no offline queue it would be rejected and the fail-closed policies
 * would refuse a request over a store that is up.
 */
/**
 * How long one rate-limit command may take before it is an error.
 *
 * A REFUSED CONNECTION WAS THE ONLY FAILURE THIS CLIENT COULD SEE. With no
 * command timeout — and ioredis has no default — a Redis that ACCEPTS the
 * connection and then stops answering parks the guard forever. Reproduced
 * with a proxy that forwards normally until it sees an `EVAL` and then
 * silences upstream: `connect()` returned true, the client reported `ready`,
 * and both a fail-closed and a fail-open policy were still pending after 15
 * seconds. The Fastify server is deliberately booted with no request,
 * connection or handler timeout, so nothing above the guard would have ended
 * it either — the request had already been authenticated and was holding a
 * database lease.
 *
 * That is the difference between "Redis is down", which this client handled
 * correctly in 0 ms, and "Redis is slow" — an AOF rewrite stalling on fsync,
 * memory pressure, a silent partition — which it could not handle at all. A
 * bounded command turns the second into the first, so the declared
 * fail-closed and fail-open behaviours apply to both.
 *
 * One second is generous for a single `EVAL` against a local or same-network
 * Redis and far below any human-visible latency budget.
 */
export const RATE_LIMIT_COMMAND_TIMEOUT_MS = 1_000;

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
    commandTimeout: RATE_LIMIT_COMMAND_TIMEOUT_MS,
  });
}

export class RedisSlidingWindowRateLimiter implements RateLimiter {
  private readonly redis: RedisEvalClient;
  private counter = 0;

  constructor(redis: RedisEvalClient) {
    this.redis = redis;
  }

  /**
   * `now` IS DELIBERATELY IGNORED FOR THE WINDOW, and kept only to satisfy the
   * shared `RateLimiter` interface that the in-process limiter genuinely needs
   * it for. The window's clock is Redis's — see `SLIDING_WINDOW_LUA`. It is
   * still used for the MEMBER, where it is a uniqueness salt rather than a
   * decision input: a member is opaque to the script, and a wrong clock in one
   * can only make it more unique, never less.
   */
  async enforce(check: RateLimitCheck, now: Date = new Date()): Promise<RateLimitDecision> {
    const nowMs = now.getTime();
    // Member uniqueness within the same millisecond, ACROSS processes.
    //
    // This was `${nowMs}:${process.pid}:${counter}`. Containerised pods
    // routinely share low PIDs, and the counter is per-instance and starts at
    // zero — so immediately after a rolling restart two pods admitting in the
    // same millisecond produce the SAME member, which is one ZADD score update
    // rather than two entries, and the window undercounts. Random bytes remove
    // the coincidence rather than making it rarer.
    this.counter = (this.counter + 1) % 0xffff;
    const member = `${nowMs}:${randomBytes(8).toString('hex')}:${this.counter}`;
    let raw: unknown;
    try {
      raw = await this.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        storageKey(check.policyName, check.subjectKey),
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
