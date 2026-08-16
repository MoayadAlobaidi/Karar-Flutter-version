/**
 * The Redis sliding-window limiter against a REAL Redis (compose service):
 * enforcement, per-key isolation, retry-after, window sliding, and the
 * atomicity claim — N concurrent requests through one Lua script admit
 * EXACTLY the limit, never limit+k.
 *
 * Skips with a loud banner when Redis is unreachable; a skipped run is not
 * evidence (same stance as the database suites).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Redis } from 'ioredis';

import { createRateLimitRedisClient, RedisSlidingWindowRateLimiter } from './redis-rate-limiter.js';
import { storageKey } from './keys.js';

const redisPort = Number(process.env['REDIS_PORT'] ?? '6379');
const redisHost = process.env['REDIS_HOST'] ?? '127.0.0.1';

async function probeRedis(): Promise<string | null> {
  const probe = new Redis({
    host: redisHost,
    port: redisPort,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
  });
  try {
    await probe.connect();
    await probe.ping();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    probe.disconnect();
  }
}

const unreachable = await probeRedis();
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `REDIS RATE-LIMITER TESTS SKIPPED — Redis is not reachable at ${redisHost}:${redisPort}`,
      `(${unreachable})`,
      'These tests are the evidence for the distributed limiter; a skipped run',
      'proves nothing. Start the compose services and rerun:',
      '  POSTGRES_PORT=5433 REDIS_PORT=6380 docker compose up -d postgres redis --wait',
      '  REDIS_PORT=6380 pnpm --filter @karar/platform test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const T0 = new Date('2026-08-16T09:00:00.000Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);
const uniqueSubject = (label: string) => `${label}-${process.pid}-${Date.now()}`;

describe.skipIf(unreachable !== null)('RedisSlidingWindowRateLimiter (live Redis)', () => {
  let redis: Redis;
  let limiter: RedisSlidingWindowRateLimiter;

  beforeAll(async () => {
    redis = createRateLimitRedisClient({ host: redisHost, port: redisPort });
    await redis.connect();
    limiter = new RedisSlidingWindowRateLimiter(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('admits to the limit, refuses with retryAfter, and slides the window', async () => {
    const subjectKey = uniqueSubject('basic');
    const check = { policyName: 'itest', limit: 3, windowMs: 60_000, subjectKey };
    for (let i = 0; i < 3; i += 1) {
      const decision = await limiter.enforce(check, at(i * 1000));
      expect(decision.allowed).toBe(true);
    }
    const refused = await limiter.enforce(check, at(3_000));
    expect(refused.allowed).toBe(false);
    if (refused.allowed) throw new Error('unreachable');
    expect(refused.retryAfterMs).toBe(57_000);
    // Refused attempts are not recorded: once the oldest admit leaves the
    // window, capacity returns.
    const afterSlide = await limiter.enforce(check, at(60_001));
    expect(afterSlide.allowed).toBe(true);
  });

  it('isolates windows per (policy, subject) key', async () => {
    const a = uniqueSubject('iso-a');
    const b = uniqueSubject('iso-b');
    const base = { limit: 1, windowMs: 60_000 };
    expect((await limiter.enforce({ policyName: 'p1', ...base, subjectKey: a }, T0)).allowed).toBe(
      true,
    );
    expect((await limiter.enforce({ policyName: 'p1', ...base, subjectKey: a }, T0)).allowed).toBe(
      false,
    );
    expect((await limiter.enforce({ policyName: 'p1', ...base, subjectKey: b }, T0)).allowed).toBe(
      true,
    );
    expect((await limiter.enforce({ policyName: 'p2', ...base, subjectKey: a }, T0)).allowed).toBe(
      true,
    );
  });

  it('ATOMIC under concurrency: 25 parallel attempts admit exactly the limit of 10', async () => {
    const subjectKey = uniqueSubject('conc');
    const check = { policyName: 'conc', limit: 10, windowMs: 60_000, subjectKey };
    const decisions = await Promise.all(
      Array.from({ length: 25 }, () => limiter.enforce(check, T0)),
    );
    expect(decisions.filter((d) => d.allowed)).toHaveLength(10);
    expect(decisions.filter((d) => !d.allowed)).toHaveLength(15);
  });

  it('stores windows under the digested storage key with a TTL (no immortal keys)', async () => {
    const subjectKey = uniqueSubject('ttl');
    await limiter.enforce({ policyName: 'ttl', limit: 5, windowMs: 30_000, subjectKey }, T0);
    const ttl = await redis.pttl(storageKey('ttl', subjectKey));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30_000);
  });
});
