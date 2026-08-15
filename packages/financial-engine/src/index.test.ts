import { describe, expect, it } from 'vitest';
import { Currency } from '@karar/shared-kernel';
import { zero } from './index.js';

describe('financial-engine boundary', () => {
  it('produces zero money via the real kernel', () => {
    const qar = Currency.get('QAR');
    const z = zero(qar);
    expect(z.isZero()).toBe(true);
    expect(z.currency.code).toBe('QAR');
  });
});
