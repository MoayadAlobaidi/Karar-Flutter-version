// Pagination: the bounds hold, the cursor is opaque, and a malformed one is
// refused rather than reset.
//
// The last point is the one worth a test. A silent reset to page one shows a
// person the wrong rows and tells them nothing — and it is how a paging bug
// becomes an invisible data-completeness bug, because every page after the
// reset looks perfectly well-formed.
import { describe, expect, it } from 'vitest';

import {
  keysetPage,
  offsetPage,
  pageOf,
  readCursor,
  readLimit,
  readPageRequest,
} from './paging.js';
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

describe('a page the STORE cut carries the same envelope as one cut here', () => {
  const all = Array.from({ length: 7 }, (_, index) => index);

  /**
   * What a bounded repository does: read one row past the page, hand back at
   * most `limit`, and say whether the extra row existed.
   *
   * The fake reads `limit + 1` deliberately. A test store that read the whole
   * array and sliced would still produce the right envelope, and would
   * therefore not be exercising the thing `offsetPage` exists to wrap.
   */
  function storePage(request: { limit: number; offset: number }): {
    items: number[];
    hasMore: boolean;
  } {
    const read = all.slice(request.offset, request.offset + request.limit + 1);
    const hasMore = read.length > request.limit;
    return { items: hasMore ? read.slice(0, request.limit) : read, hasMore };
  }

  it('is BYTE-IDENTICAL to the in-memory cut, so a client cannot tell them apart', () => {
    // The wire contract is one contract. A caller holding a cursor from
    // before the store started cutting the page must still be able to use it,
    // and a generated client must not need to know which read produced a
    // page.
    for (const offset of [0, 3, 6]) {
      const request = { limit: 3, offset };
      const store = storePage(request);
      expect(offsetPage(store.items, request, store.hasMore)).toEqual(pageOf(all, request));
    }
  });

  it('walks every row exactly once, follows only the CURSOR, and terminates', () => {
    // The failure this catches is the one a person experiences as a
    // transaction that is simply missing: a boundary that drops one row and
    // repeats another. Nothing here computes an offset — each page is reached
    // only through the opaque cursor the previous one returned.
    const walked: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const request = readPageRequest(
        cursor === null ? { limit: '3' } : { limit: '3', cursor },
        BOUNDS,
      );
      if (typeof request === 'string') throw new Error(`the walk was refused: ${request}`);
      const store = storePage(request);
      const page = offsetPage(store.items, request, store.hasMore);
      walked.push(...page.items);
      pages += 1;
      expect(page.page.returned).toBe(page.items.length);
      expect(page.page.limit).toBe(3);
      if (!page.page.hasMore) {
        // The end is STATED: no cursor, so a client stops rather than guessing.
        expect(page.page.nextCursor).toBeNull();
        break;
      }
      expect(page.page.nextCursor).not.toBeNull();
      // Termination, asserted rather than assumed: a page that claimed
      // `hasMore` while returning nothing would otherwise spin here forever.
      expect(page.items.length).toBeGreaterThan(0);
      expect(pages).toBeLessThanOrEqual(all.length);
      cursor = page.page.nextCursor;
    }
    expect(walked).toEqual(all);
    expect(new Set(walked).size).toBe(all.length);
    expect(pages).toBe(3);
  });

  it('reports the end from the STORE, not from a full page', () => {
    // A page that happens to fill exactly is not the last page. Inferring
    // otherwise would silently drop whatever came after it.
    const exact = offsetPage([0, 1, 2], { limit: 3, offset: 0 }, true);
    expect(exact.page.hasMore).toBe(true);
    expect(exact.page.nextCursor).not.toBeNull();
    const last = offsetPage([0, 1, 2], { limit: 3, offset: 0 }, false);
    expect(last.page.hasMore).toBe(false);
    expect(last.page.nextCursor).toBeNull();
  });
});
