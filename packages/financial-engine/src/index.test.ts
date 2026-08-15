import { describe, expect, it } from 'vitest';
import type { Currency } from '@karar/shared-kernel';
import { zero } from './index';

describe('zero', () => {
  it('is integer minor units in the requested currency', () => {
    const amount = zero('QAR' as Currency);
    expect(amount.minorUnits).toBe(0n);
    expect(typeof amount.minorUnits).toBe('bigint');
    expect(amount.currency).toBe('QAR');
  });
});
