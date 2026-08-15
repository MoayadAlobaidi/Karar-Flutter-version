import { describe, expect, it } from 'vitest';
import { jurisdictionId } from './index';

describe('jurisdictionId', () => {
  it('brands without altering the value', () => {
    expect(jurisdictionId('QA')).toBe('QA');
  });
});
