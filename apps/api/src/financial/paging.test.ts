// Pagination: the bounds hold, the cursor is opaque, and a malformed one is
// refused rather than reset.
//
// The last point is the one worth a test. A silent reset to page one shows a
// person the wrong rows and tells them nothing — and it is how a paging bug
// becomes an invisible data-completeness bug, because every page after the
// reset looks perfectly well-formed.
import { describe, expect, it } from 'vitest';

import { keysetPage, pageOf, readCursor, readLimit, readPageRequest } from './paging.js';
import { CSV_STATEMENT_LIMITS, MANUAL_ENTRY_LIMITS } from './use-cases.js';

const BOUNDS = MANUAL_ENTRY_LIMITS;

describe('the page bounds come from the central registry', () => {
  it('uses the declared default when the caller chooses none', () => {
    expect(readLimit(undefined, BOUNDS)).toBe(BOUNDS.defaultPageSize);
  });

  it('CLAMPS an oversized request rather than refusing it', () => {
    // A client asking for more than the ceiling wants as much as it can have,
    // and the response states the size it actually used.
    expect(readLimit(String(BOUNDS.maxPageSize + 1_000), BOUNDS)).toBe(BOUNDS.maxPageSize);
  });

  it('REFUSES a limit that is not a positive integer', () => {
    // A client defect. Substituting the default would hide it.
    for (const bad of ['0', '-3', '2.5', 'many', '']) {
      const result = readLimit(bad === '' ? '' : bad, BOUNDS);
      if (bad === '') expect(result).toBe(BOUNDS.defaultPageSize);
      else expect(result).toBe('INVALID_LIMIT');
    }
  });

  it('holds the CSV path to its own declared page bounds, not the manual one', () => {
    expect(CSV_STATEMENT_LIMITS.pathId).toBe('csv-statement-import');
    expect(MANUAL_ENTRY_LIMITS.pathId).toBe('manual-transaction');
    // Both are real bounds; neither is written in this repository's HTTP layer.
    expect(Number.isInteger(CSV_STATEMENT_LIMITS.maxPageSize)).toBe(true);
    expect(CSV_STATEMENT_LIMITS.defaultPageSize).toBeLessThanOrEqual(
      CSV_STATEMENT_LIMITS.maxPageSize,
    );
  });
});

describe('the cursor', () => {
  it('is opaque, and round-trips through a page', () => {
    const all = Array.from({ length: 7 }, (_, index) => index);
    const first = pageOf(all, { limit: 3, offset: 0 });
    expect(first.items).toEqual([0, 1, 2]);
    expect(first.page.hasMore).toBe(true);
    expect(first.page.nextCursor).not.toBeNull();
    // Opaque: it does not read as a number a client could invent.
    expect(first.page.nextCursor).not.toBe('3');

    const second = readPageRequest({ cursor: first.page.nextCursor, limit: '3' }, BOUNDS);
    expect(second).toEqual({ limit: 3, offset: 3 });
  });

  it('reports the END explicitly rather than leaving it to be inferred', () => {
    const last = pageOf([0, 1, 2], { limit: 3, offset: 0 });
    expect(last.page.hasMore).toBe(false);
    expect(last.page.nextCursor).toBeNull();
    expect(last.page.returned).toBe(3);
  });

  it('REFUSES a malformed cursor rather than silently restarting', () => {
    for (const bad of ['not-base64!!', Buffer.from('elsewhere:2').toString('base64url')]) {
      expect(readPageRequest({ cursor: bad }, BOUNDS)).toBe('INVALID_CURSOR');
    }
    expect(readCursor(['', ''])).toBe('INVALID_CURSOR');
  });
});

describe('a keyset page reports the STORE’s cursor, not the item count', () => {
  it('says there is more when the store says so, even on a full page', () => {
    // A keyset page that happens to fill exactly is not the last page, and
    // inferring otherwise would silently drop a caller's oldest rows.
    const page = keysetPage([1, 2, 3], 3, 'opaque-store-cursor');
    expect(page.page.hasMore).toBe(true);
    expect(page.page.nextCursor).toBe('opaque-store-cursor');
  });

  it('says there is no more when the store returns no cursor', () => {
    const page = keysetPage([1], 3, null);
    expect(page.page.hasMore).toBe(false);
    expect(page.page.nextCursor).toBeNull();
    expect(page.page.returned).toBe(1);
  });
});
