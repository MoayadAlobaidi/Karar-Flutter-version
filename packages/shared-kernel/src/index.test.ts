import { describe, expect, it } from 'vitest';
import type { Clock, Currency, Money, Result, TenantId } from './index';

// The nine universals are types; these tests pin the shapes Phase 2 builds on.

const qar = 'QAR' as Currency;

const divide = (a: bigint, b: bigint): Result<bigint, 'division-by-zero'> =>
  b === 0n ? { ok: false, error: 'division-by-zero' } : { ok: true, value: a / b };

describe('Result', () => {
  it('narrows on the ok discriminant', () => {
    const good = divide(10n, 2n);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.value).toBe(5n);
    }

    const bad = divide(10n, 0n);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBe('division-by-zero');
    }
  });
});

describe('Money', () => {
  it('holds integer minor units, never a float', () => {
    const amount: Money = { minorUnits: 12345n, currency: qar };
    expect(typeof amount.minorUnits).toBe('bigint');
    expect(amount.currency).toBe('QAR');
  });
});

describe('Clock', () => {
  it('is injectable and deterministic in tests', () => {
    const fixed = new Date('2026-01-01T00:00:00Z');
    const clock: Clock = { now: () => fixed };
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('branded identifiers', () => {
  it('carry their value through the brand', () => {
    const tenant = '11111111-1111-1111-1111-111111111111' as TenantId;
    expect(tenant).toContain('1111');
  });
});
