/**
 * Pagination for the financial surface, in ONE place.
 *
 * WHY THIS EXISTS RATHER THAN A LOOP IN EACH CONTROLLER. Every list on this
 * surface promises the same three things — a bounded page size, an opaque
 * cursor, and an explicit `hasMore` — and a promise implemented eight times
 * is a promise that will be broken once. The bounds themselves are NOT
 * declared here: they arrive as an argument from the central ingestion limit
 * policy (packages/platform/src/ingestion/limits.ts), because a limit that
 * lives beside the path it guards drifts from every other path and from the
 * architecture check that reads the registry.
 *
 * TWO CURSOR SHAPES, AND THE DIFFERENCE IS DELIBERATE.
 *
 *   * The transactions module owns a KEYSET cursor over
 *     `(bookingDate DESC, id DESC)`. That cursor is passed through this
 *     surface untouched: re-encoding it here would put a second decoder in
 *     the system, and the two would eventually disagree about where a page
 *     ends.
 *   * Every other read on this surface is a use case that answers with the
 *     caller's complete, stably ordered set — the module declares no page
 *     query and inventing one at the edge would be a lie about what the store
 *     did. Those pages are cut HERE, from an offset the cursor carries.
 *
 * An offset cursor is honest for a subject's own bounded collections (their
 * accounts, their connections, one account's instruments) and dishonest for
 * an unbounded one, which is why the unbounded collection — transactions —
 * is the one that has a keyset cursor in its module rather than an offset
 * here.
 *
 * A MALFORMED CURSOR IS REFUSED, NEVER RESET. Silently restarting at page one
 * shows a person the wrong rows and tells them nothing; it is also how a
 * paging bug becomes an invisible data-completeness bug.
 */

/** The page bounds one path is held to, taken from the central policy. */
export interface PageBounds {
  readonly maxPageSize: number;
  readonly defaultPageSize: number;
}

/** What the client asked for, after clamping. */
export interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}

/** The page shape every list response on this surface carries. */
export interface PageInfo {
  readonly limit: number;
  readonly returned: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: PageInfo;
}

/** A refusal that names itself, so a caller maps it to one problem code. */
export type PagingRefusal = 'INVALID_LIMIT' | 'INVALID_CURSOR';

const CURSOR_PREFIX = 'karar-page-offset:';

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(`${CURSOR_PREFIX}${String(offset)}`, 'utf8').toString('base64url');
}

function decodeOffsetCursor(cursor: string): number | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!decoded.startsWith(CURSOR_PREFIX)) return null;
  const offset = Number(decoded.slice(CURSOR_PREFIX.length));
  if (!Number.isInteger(offset) || offset < 0) return null;
  return offset;
}

/**
 * The `limit` a caller asked for, clamped to the declared bound.
 *
 * CLAMPED RATHER THAN REFUSED, because a client asking for more than the
 * ceiling wants as much as it can have, and the response states the size it
 * actually used. A limit that is not a positive integer IS refused: it is a
 * client defect, and substituting a default would hide it.
 */
export function readLimit(raw: unknown, bounds: PageBounds): number | PagingRefusal {
  if (raw === undefined || raw === null || raw === '') return bounds.defaultPageSize;
  const asString = Array.isArray(raw) ? raw[0] : raw;
  if (typeof asString !== 'string' && typeof asString !== 'number') return 'INVALID_LIMIT';
  const parsed = Number(asString);
  if (!Number.isInteger(parsed) || parsed < 1) return 'INVALID_LIMIT';
  return Math.min(parsed, bounds.maxPageSize);
}

/** The raw cursor string a caller sent, or null; anything odd is refused. */
export function readCursor(raw: unknown): string | null | PagingRefusal {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return 'INVALID_CURSOR';
  return value;
}

/** Both parameters of an OFFSET-paged read, or the refusal that stopped it. */
export function readPageRequest(query: unknown, bounds: PageBounds): PageRequest | PagingRefusal {
  const source = (query ?? {}) as Record<string, unknown>;
  const limit = readLimit(source['limit'], bounds);
  if (typeof limit !== 'number') return limit;
  const cursor = readCursor(source['cursor']);
  if (typeof cursor === 'string' && cursor !== '') {
    const offset = decodeOffsetCursor(cursor);
    if (offset === null) return 'INVALID_CURSOR';
    return { limit, offset };
  }
  if (cursor !== null && typeof cursor !== 'string') return cursor;
  return { limit, offset: 0 };
}

/** Cuts one page out of a complete, stably ordered result set. */
export function pageOf<T>(all: readonly T[], request: PageRequest): Page<T> {
  const items = all.slice(request.offset, request.offset + request.limit);
  const consumed = request.offset + items.length;
  const hasMore = consumed < all.length;
  return {
    items,
    page: {
      limit: request.limit,
      returned: items.length,
      hasMore,
      nextCursor: hasMore ? encodeOffsetCursor(consumed) : null,
    },
  };
}

/**
 * The page envelope for a read whose module produced the cursor.
 *
 * `hasMore` is derived from the module's own `nextCursor` rather than from
 * the item count: a keyset page that happens to fill exactly is not the last
 * page, and inferring otherwise would silently drop a caller's oldest rows.
 */
export function keysetPage<T>(
  items: readonly T[],
  limit: number,
  nextCursor: string | null,
): Page<T> {
  return {
    items,
    page: {
      limit,
      returned: items.length,
      hasMore: nextCursor !== null,
      nextCursor,
    },
  };
}
