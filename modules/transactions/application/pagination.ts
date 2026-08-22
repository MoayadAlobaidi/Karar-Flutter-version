/**
 * Cursor pagination for the transaction list.
 *
 * **Keyset, not offset.** The order is `bookingDate DESC, id DESC` — a total
 * order, because `bookingDate` alone is not unique and ties would make page
 * boundaries arbitrary. An `OFFSET` page over a list that is being written to
 * silently drops or repeats rows: insert one transaction while a user is on
 * page 2, and a row they have already seen reappears while one they have not
 * disappears. On a financial list that is not a cosmetic defect — it is a
 * transaction the user never saw.
 *
 * **The cursor is opaque but not secret, and deliberately unsigned.** It
 * encodes a position — a booking instant and a row id — inside the calling
 * principal's OWN rows. Forging one cannot reach another subject's data,
 * because RLS bounds every query to the bound principal regardless of what
 * the cursor says; the worst a tampered cursor achieves is a page starting
 * somewhere else in the forger's own list. Signing it would add key
 * management and a rotation story to defend against nothing.
 *
 * The encoding is base64url of `<YYYY-MM-DD>|<uuid>`, validated strictly on
 * the way in: a malformed cursor is a typed `INVALID_CURSOR` outcome, never a
 * silent fall back to "start from the beginning" (a silent reset is how a
 * user ends up re-reading page one forever and concluding the list is broken).
 *
 * **A calendar day, not an instant** (ADR-0027). The ordering column is a
 * `date`, so the cursor that names a position in that ordering has to be the
 * same kind of value. An ISO instant here would put a timezone back into the
 * page boundary — the same cursor resuming a day early for one reader and a
 * day late for another, which on a transaction list means a row the user
 * never saw. `CalendarDay.parse` also refuses a string carrying a time, so a
 * cursor minted under the old encoding is rejected outright rather than
 * silently truncated into a position that means something slightly different.
 */

import { CalendarDay, Result } from '@karar/shared-kernel';

import { TransactionId } from '../domain/refs.js';
import type { InvalidCursor } from './errors.js';
import type { TransactionCursor } from './ports/transaction-repository.js';

const CURSOR_SEPARATOR = '|';

export function encodeCursor(cursor: TransactionCursor): string {
  const raw = `${cursor.bookingDate.toString()}${CURSOR_SEPARATOR}${cursor.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeCursor(encoded: string): Result<TransactionCursor, InvalidCursor> {
  if (typeof encoded !== 'string' || encoded.trim() === '') {
    return Result.err(invalid('a cursor must be a non-empty string'));
  }
  let raw: string;
  try {
    raw = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return Result.err(invalid('the cursor is not base64url'));
  }
  const separatorAt = raw.indexOf(CURSOR_SEPARATOR);
  if (separatorAt === -1) {
    return Result.err(invalid('the cursor does not carry both a booking day and a row id'));
  }
  let bookingDate;
  try {
    bookingDate = CalendarDay.parse(raw.slice(0, separatorAt));
  } catch {
    return Result.err(invalid('the cursor does not carry a valid booking day (YYYY-MM-DD)'));
  }
  let id;
  try {
    id = TransactionId.of(raw.slice(separatorAt + 1));
  } catch {
    return Result.err(invalid('the cursor does not carry a valid row id'));
  }
  return Result.ok({ bookingDate, id });
}

function invalid(detail: string): InvalidCursor {
  return {
    kind: 'INVALID_CURSOR',
    message: `${detail}; a cursor this service did not mint is refused rather than treated as "start from the beginning", which would silently re-serve the first page forever`,
  };
}
