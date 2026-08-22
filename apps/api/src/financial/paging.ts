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
 *   * Every other read on this surface carries an OFFSET the cursor encodes.
 *     The offset is not applied here: it is handed to a module's page query,
 *     the store cuts the page, and `offsetPage` only puts the envelope round
 *     what came back.
 *
 * WHERE THE PAGE IS CUT MATTERS MORE THAN WHICH CURSOR CARRIES IT. This file
 * used to expose `pageOf`, which slices a COMPLETE result set the use case
 * had already materialised. That is a bounded RESPONSE over an unbounded
 * READ: the process still held every balance an account had ever reported,
 * every match a person had accumulated, every link and every card, and the
 * page bound hid it. So the modules grew page queries, `offsetPage` replaced
 * `pageOf` on those paths, and the only reads still cut in memory are the
 * ones with a stated ceiling — see `pageOf` below for which, and for the
 * bound that makes each safe.
 *
 * The FILTERS travel down with the offset for the same reason, and for a
 * second one: an offset counted over an unfiltered set names a position in a
 * set the caller is not walking, so filtering after the cut would return the
 * wrong rows as well as reading too many.
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

/**
 * Cuts one page out of a complete, stably ordered result set.
 *
 * ONLY FOR A COLLECTION WITH A STATED CEILING, and the four that remain each
 * have one:
 *
 *   * the reviewed institution catalogue and the financial-category
 *     catalogue — reference data that changes by reviewed migration, so its
 *     size is a review decision rather than a function of usage;
 *   * one transaction's provenance — one row per revision of one
 *     transaction, bounded by that transaction's own history; and
 *   * a statement import's row errors — bounded by `maxReportedErrors` in the
 *     central ingestion limit policy, which the import path enforces on the
 *     way in.
 *
 * Anything whose size grows with how long a person has used the product does
 * NOT belong here. It takes a page query into its module and comes back
 * through `offsetPage`.
 */
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
 * The envelope for a page the STORE already cut, from an offset cursor.
 *
 * `hasMore` is the store's answer — it read one row past the page and says
 * whether it found one — rather than something inferred from the item count.
 * A page that happens to fill exactly is not the last page, and inferring
 * otherwise would silently drop a caller's remaining rows.
 *
 * The cursor is encoded HERE, by the same function `pageOf` uses, so a client
 * cannot tell which of the two produced a page: the wire contract is one
 * contract, and a caller's saved cursor keeps meaning what it meant.
 */
export function offsetPage<T>(
  items: readonly T[],
  request: PageRequest,
  hasMore: boolean,
): Page<T> {
  const consumed = request.offset + items.length;
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
