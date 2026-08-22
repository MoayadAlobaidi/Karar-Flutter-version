/**
 * Reading the parts of a request that are DATA, and refusing the rest at the
 * edge.
 *
 * WHY THE EDGE. Almost every reference constructor in the financial modules —
 * `TransactionId.of`, `AccountRef.of`, `StatementImportId.of`,
 * `TransferMatchId.of`, `CategoryCode.of` — THROWS on a malformed value
 * rather than returning a result, and the use cases call them without a
 * try/catch. That is right for a trusted call site and wrong for an untrusted
 * one: a mistyped path parameter would leave as a 500 with a stack in the
 * server log and an opaque INTERNAL_ERROR at the client. Everything below
 * converts "the caller sent something that is not a reference" into a 400
 * before a use case ever sees it.
 *
 * NOTHING HERE READS IDENTITY. There is no `userId` or `tenantId` reader in
 * this file and no caller that wants one: the principal comes from the
 * session (see principal.ts), and every value read here is either a
 * reference to one of the caller's OWN rows or a filter over their own set.
 *
 * A REJECTED VALUE IS NEVER ECHOED. The refusals name the FIELD and say what
 * shape was expected; they do not quote what arrived. A body rejected for the
 * wrong shape may still hold an account number the person typed into the
 * wrong box, and a problem document is copied into logs and tickets far more
 * freely than a request body.
 */

/** RFC 9562 shape. The modules lowercase; this only decides admissibility. */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A query value, flattened: a repeated parameter takes its first occurrence. */
export function queryValue(query: unknown, name: string): string | undefined {
  const source = (query ?? {}) as Record<string, unknown>;
  const raw = source[name];
  const flat = Array.isArray(raw) ? raw[0] : raw;
  if (typeof flat !== 'string' || flat === '') return undefined;
  return flat;
}

/** A query value constrained to a module's own vocabulary, or a refusal. */
export function enumQueryValue(
  query: unknown,
  name: string,
  vocabulary: readonly string[],
): string | undefined | 'INVALID' {
  const value = queryValue(query, name);
  if (value === undefined) return undefined;
  return vocabulary.includes(value) ? value : 'INVALID';
}

export function uuidQueryValue(query: unknown, name: string): string | undefined | 'INVALID' {
  const value = queryValue(query, name);
  if (value === undefined) return undefined;
  return isUuid(value) ? value : 'INVALID';
}

/** `true`/`false` only. An unrecognised value is refused, never coerced. */
export function booleanQueryValue(query: unknown, name: string): boolean | undefined | 'INVALID' {
  const value = queryValue(query, name);
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return 'INVALID';
}

/** `YYYY-MM-DD` and nothing else — a day, never an instant (ADR-0027). */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDayString(value: unknown): value is string {
  return typeof value === 'string' && CALENDAR_DAY.test(value);
}

export function dayQueryValue(query: unknown, name: string): string | undefined | 'INVALID' {
  const value = queryValue(query, name);
  if (value === undefined) return undefined;
  return isCalendarDayString(value) ? value : 'INVALID';
}

export function bodyOf(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/** An exact minor-unit integer as CHARACTERS. Never a JSON number. */
const MINOR_UNITS = /^-?[0-9]{1,30}$/;

export interface AmountInput {
  readonly minorUnits: string;
  readonly currency: string;
}

/**
 * Reads `{ minorUnits, currency }`.
 *
 * A JSON NUMBER IS REFUSED RATHER THAN CONVERTED. `1234` looks harmless and
 * `12.34` does not survive the trip: JSON numbers are IEEE-754 doubles, and a
 * ledger value that has already lost precision cannot be recovered by
 * anything this function does. The refusal is the only correct answer.
 */
export function readAmount(raw: unknown): AmountInput | 'INVALID' {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'INVALID';
  const source = raw as Record<string, unknown>;
  const minorUnits = source['minorUnits'];
  const currency = source['currency'];
  if (typeof minorUnits !== 'string' || !MINOR_UNITS.test(minorUnits)) return 'INVALID';
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return 'INVALID';
  return { minorUnits, currency };
}

/** True when the key is present in the body at all — absent and null differ. */
export function hasKey(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}
