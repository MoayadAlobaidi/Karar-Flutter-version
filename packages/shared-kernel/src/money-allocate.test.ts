import { describe, expect, it } from 'vitest';
import { Currency, Money } from './index';

const qar = Currency.get('QAR');
const kwd = Currency.get('KWD');

describe('Money.allocate — largest remainder', () => {
  it.each([
    // [total, weights, expected parts]
    [100n, [1n, 1n, 1n], [34n, 33n, 33n]],
    [100n, [1n, 1n, 1n, 1n], [25n, 25n, 25n, 25n]],
    [101n, [3n, 7n], [30n, 71n]],
    [0n, [5n, 5n], [0n, 0n]],
    [-100n, [1n, 1n, 1n], [-33n, -33n, -34n]],
    [7n, [1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n], [1n, 1n, 1n, 1n, 1n, 1n, 1n, 0n]],
    [100n, [0n, 1n], [0n, 100n]],
    [101n, [1n, 0n, 1n], [51n, 0n, 50n]],
    [42n, [7n], [42n]],
    [1n, [1n, 1n], [1n, 0n]], // remainder tie: earliest index wins, deterministically
    [-1n, [1n, 1n], [0n, -1n]],
  ] as const)('splits %s across weights [%s] as [%s]', (total, weights, expected) => {
    const parts = Money.of(total, qar).allocate(weights);
    expect(parts.map((part) => part.minorUnits)).toEqual([...expected]);
    expect(parts.every((part) => part.currency === qar)).toBe(true);
  });

  it('conserves an amount that does not fit in a double', () => {
    const total = 2n ** 64n + 13n;
    const parts = Money.of(total, kwd).allocate([3n, 5n, 7n]);
    expect(parts.reduce((sum, part) => sum + part.minorUnits, 0n)).toBe(total);
  });

  it('rejects invalid weight lists with a typed error', () => {
    const money = Money.of(100n, qar);
    expect(() => money.allocate([])).toThrow(Money.InvalidAllocationError);
    expect(() => money.allocate([1n, -1n])).toThrow(Money.InvalidAllocationError);
    expect(() => money.allocate([0n, 0n])).toThrow(Money.InvalidAllocationError);
  });
});

// ---------------------------------------------------------------------------
// Property test: allocation conserves every minor unit, across randomized
// cases from a seeded PRNG — deterministic and replayable, per the kernel's
// no-ambient-randomness rule (the seed is the input; Math.random appears
// nowhere).
// ---------------------------------------------------------------------------

/** mulberry32 — small deterministic PRNG, seeded explicitly. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, maxExclusive: number): number {
  return Math.floor(random() * maxExclusive);
}

/** A random bigint with up to `chunks` 32-bit limbs — far beyond 2^53. */
function randomBigInt(random: () => number, chunks: number): bigint {
  let value = 0n;
  for (let i = 0; i < chunks; i += 1) {
    value = (value << 32n) + BigInt(Math.floor(random() * 4294967296));
  }
  return value;
}

const PRIMES = [2n, 3n, 7n, 97n, 65537n, 1000000007n, 2305843009213693951n]; // includes 2^61 - 1

function randomTotal(random: () => number): bigint {
  switch (randomInt(random, 5)) {
    case 0:
      return BigInt(randomInt(random, 2001) - 1000); // small, around zero
    case 1:
      return PRIMES[randomInt(random, PRIMES.length)] ?? 7n;
    case 2:
      return -(PRIMES[randomInt(random, PRIMES.length)] ?? 7n);
    case 3:
      return randomBigInt(random, 3); // up to ~2^96, beyond 2^53
    default:
      return -randomBigInt(random, 3);
  }
}

describe('Money.allocate — conservation property (seeded)', () => {
  it('sums exactly to the original across 1000 randomized cases', () => {
    const random = mulberry32(0x5eed_ca5e);
    for (let caseIndex = 0; caseIndex < 1000; caseIndex += 1) {
      const total = randomTotal(random);
      const weightCount = 1 + randomInt(random, 8);
      const weights: bigint[] = [];
      for (let i = 0; i < weightCount; i += 1) {
        // Mix of zero, small, and large weights.
        const kind = randomInt(random, 4);
        weights.push(kind === 0 ? 0n : randomBigInt(random, kind));
      }
      const hasPositiveWeight = weights.some((weight) => weight > 0n);
      if (!hasPositiveWeight) {
        weights[0] = 1n;
      }

      const money = Money.of(total, qar);
      const parts = money.allocate(weights);
      const context = `case ${caseIndex}: total=${total} weights=[${weights.join(',')}]`;

      // Conservation: the parts sum to exactly the original, always.
      const sum = parts.reduce((acc, part) => acc + part.minorUnits, 0n);
      expect(sum, context).toBe(total);
      expect(parts).toHaveLength(weights.length);

      // Fairness bound: each part is within one minor unit of its exact
      // proportional share — |part * W - total * w| < W.
      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0n);
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const weight = weights[i];
        if (part === undefined || weight === undefined) throw new Error('index out of range');
        const deviation = part.minorUnits * totalWeight - total * weight;
        const magnitude = deviation < 0n ? -deviation : deviation;
        expect(magnitude < totalWeight, `${context} part=${i} deviation=${deviation}`).toBe(true);
        // A zero weight receives exactly zero.
        if (weight === 0n) {
          expect(part.minorUnits, `${context} part=${i} (zero weight)`).toBe(0n);
        }
      }
    }
  });
});
