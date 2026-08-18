/**
 * Synthetic fixtures for the transactions suite.
 *
 * **Nothing here is real financial data and nothing resembles it.** Merchant
 * names are obvious inventions carrying the SYNTHETIC marker, amounts are
 * round test numbers, and every identifier is generated per run. A fixture
 * that looked like a genuine statement line would eventually be copied into
 * a bug report, a screenshot, or a seed file.
 *
 * Identifiers are `randomUUID` rather than fixed literals so two suites
 * running against the same database cannot collide, and so no test can
 * accidentally depend on a hard-coded id.
 */

import { randomUUID } from 'node:crypto';

import { Clock, Currency, Money, TenantId, UserId } from '@karar/shared-kernel';

import { AccountRef } from '../../domain/refs.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';

/** Every merchant string in this suite carries the marker. */
export const SYNTHETIC_MARKER = 'SYNTHETIC';

export const QAR = Currency.get('QAR');
export const KWD = Currency.get('KWD');
export const USD = Currency.get('USD');

/** A fixed instant, so every assertion about time is reproducible. */
export const NOW = new Date('2026-08-18T09:00:00.000Z');
export const BOOKED = new Date('2026-08-17T00:00:00.000Z');
export const EARLIER = new Date('2026-08-10T00:00:00.000Z');

export function fixedClock(at: Date = NOW): Clock {
  return new Clock.Fixed(at);
}

export function principal(tenantId?: string, userId?: string): TransactionsPrincipal {
  return {
    tenantId: TenantId.of(tenantId ?? randomUUID()),
    userId: UserId.of(userId ?? randomUUID()),
  };
}

export function account(): AccountRef {
  return AccountRef.of(randomUUID());
}

/** Obviously invented merchant text. */
export function syntheticMerchant(label: string): string {
  return `${SYNTHETIC_MARKER} ${label}`;
}

/** A magnitude in QAR from a whole-riyal amount, exact. */
export function qar(major: number, minor = 0): Money {
  return Money.of(BigInt(major) * 100n + BigInt(minor), QAR);
}

/** A magnitude in KWD (three decimals) from whole dinars and fils. */
export function kwd(major: number, fils = 0): Money {
  return Money.of(BigInt(major) * 1000n + BigInt(fils), KWD);
}

/**
 * Deterministic pseudo-randomness for the property sweeps. A seeded
 * generator, not `Math.random`: a property test that cannot be replayed on
 * failure is a flaky test, not a proof.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — small, fast, and entirely reproducible.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
