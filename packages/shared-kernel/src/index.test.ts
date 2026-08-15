import { describe, expect, it } from 'vitest';
import {
  Clock,
  Currency,
  DomainEvent,
  ExchangeRate,
  Money,
  Percentage,
  Result,
  TenantId,
  UserId,
} from './index';

// The public surface: every one of the nine universals is importable from the
// package entry point and usable, and the supporting vocabulary is reachable
// as members of the nine (the export cap of architecture test 20 hides
// nothing it should not).

describe('kernel surface', () => {
  it('exposes all nine universals in working form', () => {
    const qar = Currency.get('QAR');
    const money = Money.of(1234n, qar);
    const percentage = Percentage.fromPercent('2.5');
    const rate = ExchangeRate.of({
      base: qar,
      quote: Currency.get('KWD'),
      mantissa: 1175n,
      scale: 4,
      source: 'test',
      asOf: new Date('2026-08-01T00:00:00Z'),
    });
    const clock = new Clock.Fixed(new Date('2026-08-01T00:00:00Z'));
    const okResult: Result<bigint, never> = Result.ok(1n);
    const event = DomainEvent.create(
      { eventId: 'e-1', name: 'kernel.Tested', payload: null },
      clock,
    );
    const tenant = TenantId.of('11111111-1111-1111-1111-111111111111');
    const user = UserId.of('22222222-2222-2222-2222-222222222222');

    expect(money.toString()).toBe('QAR 12.34');
    expect(percentage.toString()).toBe('2.5%');
    expect(rate.base.code).toBe('QAR');
    expect(okResult.ok).toBe(true);
    expect(event.occurredAt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(TenantId.toString(tenant)).toContain('1111');
    expect(UserId.toString(user)).toContain('2222');
  });

  it('reaches supporting vocabulary as members of the nine', () => {
    expect(Money.RoundingMode.HALF_EVEN).toBe('HALF_EVEN');
    expect(Currency.codes()).toContain('OMR');
    expect(new Currency.UnsupportedCurrencyError('XXX')).toBeInstanceOf(Error);
    expect(Result.isOk(Result.ok(1))).toBe(true);
    expect(Percentage.MAX_SCALE).toBe(30);
    expect(ExchangeRate.MAX_SCALE).toBe(30);
  });

  it('keeps the Phase 1 Result shape: an ok/err discriminated union', () => {
    const divide = (a: bigint, b: bigint): Result<bigint, 'division-by-zero'> =>
      b === 0n ? Result.err('division-by-zero') : Result.ok(a / b);

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
