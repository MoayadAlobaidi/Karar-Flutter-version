import { describe, expect, it } from 'vitest';
import { SHELL_TITLE } from './shell';

describe('shell', () => {
  it('names the Phase 1 placeholder', () => {
    expect(SHELL_TITLE).toBe('Karar Admin — Phase 1 shell');
  });
});
