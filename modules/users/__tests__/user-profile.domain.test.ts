import { describe, expect, it } from 'vitest';

import {
  USER_STATUSES,
  canTransitionUserStatus,
  parseDisplayName,
  parseLocale,
} from '../domain/user-profile.js';

describe('user status machine (disable/deletion-request foundation)', () => {
  it('allows recording disable and deletion intent from ACTIVE', () => {
    expect(canTransitionUserStatus('ACTIVE', 'DISABLE_REQUESTED')).toBe(true);
    expect(canTransitionUserStatus('ACTIVE', 'DELETION_REQUESTED')).toBe(true);
  });

  it('does not allow a second disable request or moves out of terminal-for-now states', () => {
    expect(canTransitionUserStatus('DISABLE_REQUESTED', 'DISABLE_REQUESTED')).toBe(false);
    expect(canTransitionUserStatus('DISABLED', 'ACTIVE')).toBe(false);
    expect(canTransitionUserStatus('DELETION_REQUESTED', 'ACTIVE')).toBe(false);
  });

  it('the later-phase machinery paths exist: DISABLE_REQUESTED to DISABLED or back to ACTIVE', () => {
    expect(canTransitionUserStatus('DISABLE_REQUESTED', 'DISABLED')).toBe(true);
    expect(canTransitionUserStatus('DISABLE_REQUESTED', 'ACTIVE')).toBe(true);
  });

  it('declares exactly the four foundation statuses', () => {
    expect(USER_STATUSES).toEqual([
      'ACTIVE',
      'DISABLE_REQUESTED',
      'DISABLED',
      'DELETION_REQUESTED',
    ]);
  });
});

describe('parseDisplayName', () => {
  it('trims and accepts a sane name', () => {
    const parsed = parseDisplayName('  Karar Dev  ');
    expect(parsed.ok && parsed.value === 'Karar Dev').toBe(true);
  });

  it('rejects empty, oversized, and control-character names', () => {
    for (const bad of ['', '   ', 'x'.repeat(121), 'evil\u0007name', 'two\nlines']) {
      const parsed = parseDisplayName(bad);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.field).toBe('displayName');
      }
    }
  });
});

describe('parseLocale', () => {
  it('accepts BCP-47-shaped tags', () => {
    for (const good of ['ar', 'ar-QA', 'en-US', 'kw-Arab-KW']) {
      expect(parseLocale(good).ok).toBe(true);
    }
  });

  it('rejects malformed tags', () => {
    for (const bad of ['', 'A', 'AR', 'ar_QA!', 'ar QA', 'a'.repeat(50), '../../etc']) {
      const parsed = parseLocale(bad);
      expect(parsed.ok).toBe(false);
    }
  });
});
