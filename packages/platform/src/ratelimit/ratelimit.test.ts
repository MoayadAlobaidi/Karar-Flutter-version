/**
 * Rate limiting without Redis: the sliding-window arithmetic, per-key
 * isolation, digest-only subject keys, path normalization, and the
 * RateLimitService's per-policy failure modes (fail closed = 503
 * DEPENDENCY_UNAVAILABLE; fail open = the documented in-process fallback,
 * still enforcing). The Redis adapter itself is proven in
 * redis-rate-limiter.integration.test.ts against a real Redis.
 */

import { describe, expect, it } from 'vitest';

import { SecretValue } from '../config/secret-value.js';
import { ErrorCode, PlatformError } from '../errors/index.js';

import { InProcessRateLimiter } from './in-process-rate-limiter.js';
import { RateLimitKeyHasher, storageKey } from './keys.js';
import { slideWindow, type RateLimiter } from './limiter.js';
import { RATE_LIMIT_POLICIES, normalizePolicyPath } from './policy.js';
import { RateLimitService } from './rate-limit-service.js';
import { RateLimitStoreError } from './redis-rate-limiter.js';

const T0 = new Date('2026-08-16T09:00:00.000Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

describe('slideWindow', () => {
  it('admits up to the limit inside the window, then refuses with retryAfter', () => {
    let timestamps: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = slideWindow(timestamps, at(i * 1000).getTime(), 3, 60_000);
      expect(result.decision.allowed).toBe(true);
      timestamps = result.timestamps;
    }
    const refused = slideWindow(timestamps, at(3000).getTime(), 3, 60_000);
    expect(refused.decision).toEqual({ allowed: false, retryAfterMs: 57_000 });
    // Refused attempts are NOT recorded: the same call a moment after the
    // oldest falls out succeeds.
    const admitted = slideWindow(refused.timestamps, at(60_001).getTime(), 3, 60_000);
    expect(admitted.decision.allowed).toBe(true);
  });
});

describe('InProcessRateLimiter', () => {
  it('isolates windows per (policy, subject) key', async () => {
    const limiter = new InProcessRateLimiter();
    const check = { policyName: 'p', limit: 1, windowMs: 60_000 };
    expect((await limiter.enforce({ ...check, subjectKey: 'a' }, T0)).allowed).toBe(true);
    expect((await limiter.enforce({ ...check, subjectKey: 'a' }, T0)).allowed).toBe(false);
    // Different subject, same policy: untouched budget.
    expect((await limiter.enforce({ ...check, subjectKey: 'b' }, T0)).allowed).toBe(true);
    // Same subject, different policy: untouched budget.
    expect(
      (await limiter.enforce({ policyName: 'q', limit: 1, windowMs: 60_000, subjectKey: 'a' }, T0))
        .allowed,
    ).toBe(true);
  });

  it('bounds memory by evicting the stalest subject (forgetting, never inventing)', async () => {
    const limiter = new InProcessRateLimiter({ maxSubjects: 2 });
    const check = { policyName: 'p', limit: 1, windowMs: 60_000 };
    await limiter.enforce({ ...check, subjectKey: 'a' }, T0);
    await limiter.enforce({ ...check, subjectKey: 'b' }, T0);
    await limiter.enforce({ ...check, subjectKey: 'c' }, T0); // evicts 'a'
    expect((await limiter.enforce({ ...check, subjectKey: 'a' }, T0)).allowed).toBe(true);
  });
});

describe('RateLimitKeyHasher', () => {
  it('produces stable digests and NEVER the raw identifier', () => {
    const hasher = new RateLimitKeyHasher(new SecretValue('a-pepper-of-adequate-size'));
    const email = 'person@example.com';
    const key = hasher.emailKey(email);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain(email);
    expect(key).not.toContain('person');
    expect(hasher.emailKey(email)).toBe(key); // stable
    expect(hasher.ipKey(email)).not.toBe(key); // domain-separated
    expect(storageKey('login_account', key)).toBe(`karar:rl:login_account:${key}`);
    // A different pepper unlinks everything.
    const other = new RateLimitKeyHasher(new SecretValue('a-different-pepper-value'));
    expect(other.emailKey(email)).not.toBe(key);
  });
});

describe('normalizePolicyPath', () => {
  it('decodes, collapses, strips, and lowercases so policies bind to ONE path', () => {
    expect(normalizePolicyPath('/auth/login')).toBe('/auth/login');
    expect(normalizePolicyPath('//auth///login/')).toBe('/auth/login');
    expect(normalizePolicyPath('/auth/%6Cogin?next=%2Fhome#x')).toBe('/auth/login');
    expect(normalizePolicyPath('/AUTH/LOGIN')).toBe('/auth/login');
    expect(normalizePolicyPath('auth/login')).toBe('/auth/login');
    expect(normalizePolicyPath('/auth/%ZZbroken')).toBe('/auth/%zzbroken'); // undecodable: normalized raw
  });
});

class FailingLimiter implements RateLimiter {
  enforce(): never {
    throw new RateLimitStoreError('store down (test)');
  }
}

describe('RateLimitService failure modes', () => {
  it('fail_closed policies refuse with DEPENDENCY_UNAVAILABLE when the store is down', async () => {
    const service = new RateLimitService({ primary: new FailingLimiter() });
    await expect(service.enforce(RATE_LIMIT_POLICIES.loginPerAccount, 'k', T0)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PlatformError &&
        error.code === ErrorCode.DEPENDENCY_UNAVAILABLE &&
        error.retryable,
    );
  });

  it('fail_open_fallback policies degrade to the in-process fallback — which still limits', async () => {
    const service = new RateLimitService({ primary: new FailingLimiter() });
    const policy = { ...RATE_LIMIT_POLICIES.refresh, limit: 2 };
    expect((await service.enforce(policy, 'k', T0)).allowed).toBe(true);
    expect((await service.enforce(policy, 'k', T0)).allowed).toBe(true);
    expect((await service.enforce(policy, 'k', T0)).allowed).toBe(false);
  });

  it('assertWithinLimit converts refusal into RATE_LIMITED with retryAfterSeconds', async () => {
    const service = new RateLimitService({ primary: new InProcessRateLimiter() });
    const policy = {
      name: 't',
      limit: 1,
      windowMs: 60_000,
      onStoreFailure: 'fail_closed',
    } as const;
    await service.assertWithinLimit(policy, 'k', T0);
    await expect(service.assertWithinLimit(policy, 'k', at(1000))).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PlatformError &&
        error.code === ErrorCode.RATE_LIMITED &&
        error.details?.['retryAfterSeconds'] === 59,
    );
  });

  it('propagates NON-store errors unchanged (a bug is not an outage)', async () => {
    const broken: RateLimiter = {
      enforce: () => Promise.reject(new TypeError('boom')),
    };
    const service = new RateLimitService({ primary: broken });
    await expect(service.enforce(RATE_LIMIT_POLICIES.refresh, 'k', T0)).rejects.toThrow(TypeError);
  });

  it('declares the documented per-endpoint policy table', () => {
    expect(RATE_LIMIT_POLICIES.loginPerAccount).toMatchObject({
      limit: 10,
      windowMs: 900_000,
      onStoreFailure: 'fail_closed',
    });
    expect(RATE_LIMIT_POLICIES.loginPerIp).toMatchObject({ limit: 30, windowMs: 900_000 });
    expect(RATE_LIMIT_POLICIES.verificationSend).toMatchObject({
      limit: 3,
      windowMs: 3_600_000,
      onStoreFailure: 'fail_closed',
    });
    expect(RATE_LIMIT_POLICIES.resetSend).toMatchObject({ limit: 3, windowMs: 3_600_000 });
    expect(RATE_LIMIT_POLICIES.mfaVerify).toMatchObject({ limit: 10, windowMs: 900_000 });
    expect(RATE_LIMIT_POLICIES.refresh).toMatchObject({
      limit: 60,
      windowMs: 900_000,
      onStoreFailure: 'fail_open_fallback',
    });
    expect(RATE_LIMIT_POLICIES.invitationSend).toMatchObject({
      limit: 20,
      windowMs: 3_600_000,
      onStoreFailure: 'fail_closed',
    });
  });
});
