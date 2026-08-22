/**
 * The Redis sliding-window limiter against a REAL Redis (compose service):
 * enforcement, per-key isolation, retry-after, window sliding, and the
 * atomicity claim — N concurrent requests through one Lua script admit
 * EXACTLY the limit, never limit+k.
 *
 * Skips with a loud banner when Redis is unreachable; a skipped run is not
 * evidence (same stance as the database suites).
 */

import net from 'node:net';
import { RATE_LIMIT_POLICIES } from './policy.js';
import { SecretValue } from '../config/secret-value.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Redis } from 'ioredis';

import { RateLimitRedisConnection } from './redis-connection.js';
import {
  RATE_LIMIT_COMMAND_TIMEOUT_MS,
  SLIDING_WINDOW_LUA,
  createRateLimitRedisClient,
  RateLimitStoreError,
  RedisSlidingWindowRateLimiter,
} from './redis-rate-limiter.js';
import { RateLimitKeyHasher, storageKey } from './keys.js';
import { skipUnlessDatabaseRequired } from '../db/connection-budget.js';

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
skipUnlessDatabaseRequired('platform redis rate limiter suite', unreachable);
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
    // A SHORT REAL WINDOW AND A REAL WAIT, because the clock is Redis's now.
    //
    // This test used to drive the window by handing the limiter synthetic
    // instants — 0s, 1s, 2s, then 60.001s — which is precisely the capability
    // that had to be removed: a caller that can name the time can prune a
    // shared window by its own reckoning, and one that had drifted did
    // (KAR-RSK-047). With Redis as the clock there is nowhere honest to inject
    // an instant, so the window is small enough to wait out.
    const subjectKey = uniqueSubject('basic');
    const check = { policyName: 'itest', limit: 3, windowMs: 400, subjectKey };
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.enforce(check)).allowed).toBe(true);
    }
    const refused = await limiter.enforce(check);
    expect(refused.allowed).toBe(false);
    if (refused.allowed) throw new Error('unreachable');
    // Bounded by the window and positive: the exact value depends on how long
    // the three admits took, which is a real property of a real clock.
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(400);

    // Refused attempts are not recorded, so once the oldest admit leaves the
    // window capacity returns — waited out rather than asserted.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await limiter.enforce(check)).allowed).toBe(true);
  }, 30_000);

  it('one clock governs one window, whatever the CALLERS believe the time is', () => {
    // THE DEFECT, AS A PROPERTY OF THE SCRIPT ITSELF.
    //
    // Reproduced against live Redis before the fix: five entries aged 45s in a
    // 60s window with a limit of 5, an instance 20 seconds ahead ADMITTED and
    // took the sorted set from 5 entries to 1 — destroying the history every
    // correctly-clocked instance was counting, so the next correct-clock
    // request admitted too. At a drift of one window the ceiling collapses.
    //
    // The script can no longer be told the time, and that is checked here
    // rather than argued: a timestamp cannot be passed because the script does
    // not read one, and it obtains its own from Redis inside the same atomic
    // evaluation that prunes and admits.
    expect(SLIDING_WINDOW_LUA).toContain("redis.call('TIME')");
    expect(SLIDING_WINDOW_LUA).not.toMatch(/local now = tonumber\(ARGV/);
    // ARGV carries the window, the limit and the member — and no instant.
    expect(SLIDING_WINDOW_LUA).toContain('local window = tonumber(ARGV[1])');
    expect(SLIDING_WINDOW_LUA).toContain('local limit = tonumber(ARGV[2])');
    expect(SLIDING_WINDOW_LUA).toContain('local member = ARGV[3]');
  });

  it('two callers with wildly different clocks still share one window', async () => {
    // The behavioural half. Both calls pass an instant; the limiter ignores
    // them for the window, so the second is refused by the FIRST one's entry
    // rather than admitted by its own reckoning of the time.
    const subjectKey = uniqueSubject('skew');
    const check = { policyName: 'skew', limit: 1, windowMs: 60_000, subjectKey };
    expect((await limiter.enforce(check, new Date('2020-01-01T00:00:00Z'))).allowed).toBe(true);
    expect((await limiter.enforce(check, new Date('2030-01-01T00:00:00Z'))).allowed).toBe(false);
    // …and the far-future caller destroyed nothing: the entry is still there.
    expect((await limiter.enforce(check, new Date())).allowed).toBe(false);
  }, 30_000);

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

describe.skipIf(unreachable !== null)('RateLimitRedisConnection (live Redis)', () => {
  it('pins the cold-start race this class exists to remove', async () => {
    // The driver contract the composition root has to work around: a lazy
    // client with no offline queue starts the handshake for the first command
    // and rejects that command rather than queueing it. Every login policy
    // fails closed on that rejection.
    const cold = createRateLimitRedisClient({ host: redisHost, port: redisPort });
    try {
      const limiter = new RedisSlidingWindowRateLimiter(cold);
      const check = {
        policyName: 'cold',
        limit: 5,
        windowMs: 60_000,
        subjectKey: uniqueSubject('cold'),
      };
      await expect(limiter.enforce(check, T0)).rejects.toBeInstanceOf(RateLimitStoreError);
    } finally {
      cold.disconnect();
    }
  });

  it('serves the FIRST command once the connection was established at startup', async () => {
    const client = createRateLimitRedisClient({ host: redisHost, port: redisPort });
    const connection = new RateLimitRedisConnection(client);
    expect(await connection.connect()).toBe(true);
    try {
      const limiter = new RedisSlidingWindowRateLimiter(client);
      const check = {
        policyName: 'warm',
        limit: 5,
        windowMs: 60_000,
        subjectKey: uniqueSubject('warm'),
      };
      await expect(limiter.enforce(check, T0)).resolves.toEqual({ allowed: true, remaining: 4 });
      // And it answers the readiness round trip.
      await expect(connection.ping()).resolves.toBeUndefined();
    } finally {
      await connection.close();
    }
  });

  it('reports an unreachable store instead of throwing, so the process still boots', async () => {
    // Nothing listens here.
    const client = createRateLimitRedisClient({ host: redisHost, port: 6499 });
    const connection = new RateLimitRedisConnection(client, { startupBudgetMs: 2_000 });
    try {
      expect(await connection.connect()).toBe(false);
      await expect(connection.ping()).rejects.toThrow();
    } finally {
      await connection.close();
    }
  });

  it('bounds a command against a store that ACCEPTS and then stops answering', async () => {
    // "REDIS IS DOWN" AND "REDIS IS SLOW" ARE DIFFERENT FAILURES, and this
    // client could only see the first. The test above proves a refused
    // connection is reported in milliseconds. This one proves the other case:
    // a socket that connects, completes the handshake, and then never replies.
    //
    // Without a command timeout — and ioredis has no default — the guard
    // parked forever. The Fastify server is deliberately booted with no
    // request, connection or handler timeout, so nothing above the guard would
    // have ended it either, and the request had already been authenticated and
    // was holding a database lease. Every declared fail-closed and fail-open
    // behaviour was unreachable for the entire class.
    //
    // The proxy below is the reproduction: it accepts, speaks the handshake by
    // forwarding to the real Redis, and then goes silent on the first command
    // after the connection reports ready.
    const silent = net.createServer((socket) => {
      const upstream = net.connect(redisPort, redisHost);
      let commands = 0;
      socket.on('data', (chunk: Buffer) => {
        commands += 1;
        // Let the handshake through; swallow the first real command.
        if (commands > 2) return;
        upstream.write(chunk);
      });
      upstream.on('data', (chunk: Buffer) => socket.write(chunk));
      socket.on('error', () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
      socket.on('close', () => upstream.destroy());
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const address = silent.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    const client = createRateLimitRedisClient({ host: '127.0.0.1', port });
    try {
      await client.connect();
      const started = Date.now();
      await expect(client.eval('return 1', 0)).rejects.toThrow();
      // Bounded, and bounded by OUR number rather than by a socket giving up.
      expect(Date.now() - started).toBeLessThan(RATE_LIMIT_COMMAND_TIMEOUT_MS * 5);
    } finally {
      client.disconnect();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
    }
  }, 30_000);

  it('closes a connected client cleanly, leaving nothing to reconnect', async () => {
    const client = createRateLimitRedisClient({ host: redisHost, port: redisPort });
    const connection = new RateLimitRedisConnection(client);
    await connection.connect();
    await connection.close();
    const deadline = Date.now() + 10_000;
    while (client.status !== 'end') {
      if (Date.now() > deadline) throw new Error(`client did not close; status: ${client.status}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await expect(client.ping()).rejects.toThrow();
  });
});

/**
 * The FINANCIAL budgets, driven through the real distributed limiter.
 *
 * Two properties the in-process fallback cannot demonstrate: that two service
 * instances sharing one Redis share ONE window (so a second pod is not a second
 * budget), and that the declared policy numbers behave as declared against the
 * real Lua path rather than against a fixture.
 */
describe.skipIf(unreachable !== null)('financial budgets against live Redis', () => {
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

  const financial = [
    RATE_LIMIT_POLICIES.financialStatementUpload,
    RATE_LIMIT_POLICIES.financialCommit,
    RATE_LIMIT_POLICIES.financialTransferDecision,
  ];

  for (const policy of financial) {
    it(`admits exactly ${policy.limit} for ${policy.name} and refuses the next`, async () => {
      const subjectKey = uniqueSubject(`fin-${policy.name}`);
      const check = {
        policyName: policy.name,
        limit: policy.limit,
        windowMs: policy.windowMs,
        subjectKey,
      };
      for (let i = 0; i < policy.limit; i += 1) {
        const decision = await limiter.enforce(check, at(i));
        expect({ attempt: i, allowed: decision.allowed }).toEqual({ attempt: i, allowed: true });
      }
      const refused = await limiter.enforce(check, at(policy.limit));
      expect(refused.allowed).toBe(false);
      if (refused.allowed) throw new Error('unreachable');
      expect(refused.retryAfterMs).toBeGreaterThan(0);
      expect(refused.retryAfterMs).toBeLessThanOrEqual(policy.windowMs);
    });
  }

  it('two service instances sharing one Redis share ONE budget', async () => {
    // A second pod must not be a second budget. Both limiters are separate
    // objects over separate clients; the window they enforce is the same one.
    const second = createRateLimitRedisClient({ host: redisHost, port: redisPort });
    await second.connect();
    try {
      const instanceA = new RedisSlidingWindowRateLimiter(redis);
      const instanceB = new RedisSlidingWindowRateLimiter(second);
      const subjectKey = uniqueSubject('fin-shared-window');
      const check = {
        policyName: RATE_LIMIT_POLICIES.financialCommit.name,
        limit: 2,
        windowMs: 60_000,
        subjectKey,
      };
      // Distinct instants: the window is a sorted set scored by time, so two
      // admits at the identical millisecond are one member, not two.
      expect((await instanceA.enforce(check, at(0))).allowed).toBe(true);
      expect((await instanceB.enforce(check, at(1))).allowed).toBe(true);
      // The third is refused whichever instance sees it — one window, not two.
      expect((await instanceA.enforce(check, at(2))).allowed).toBe(false);
      expect((await instanceB.enforce(check, at(3))).allowed).toBe(false);
    } finally {
      await second.quit();
    }
  });

  it('stores no raw identifier, and every key expires', async () => {
    const hasher = new RateLimitKeyHasher(new SecretValue('pepper-at-least-sixteen-chars'));
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const subjectKey = hasher.subjectKey(tenantId, userId);
    const policy = RATE_LIMIT_POLICIES.financialWrite;
    await limiter.enforce(
      { policyName: policy.name, limit: policy.limit, windowMs: policy.windowMs, subjectKey },
      T0,
    );

    const key = storageKey(policy.name, subjectKey);
    // The identifiers the budget was charged to appear nowhere in the key…
    expect(key).not.toContain(tenantId);
    expect(key).not.toContain(userId);
    expect(key).toContain(subjectKey);
    expect(subjectKey).toMatch(/^[0-9a-f]{32}$/);

    // …and neither does any key Redis actually holds for this run.
    const held = await redis.keys(`karar:rl:${policy.name}:*`);
    for (const heldKey of held) {
      expect(heldKey).not.toContain(tenantId);
      expect(heldKey).not.toContain(userId);
    }

    // No immortal keys: a budget that never expires is a budget that never
    // refills, and a store that grows without bound.
    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(policy.windowMs);
  });
});
