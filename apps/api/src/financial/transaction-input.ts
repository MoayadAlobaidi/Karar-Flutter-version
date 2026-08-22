/**
 * Reading the transaction routes' inputs, and refusing everything else.
 *
 * THE SIGN IS NOT A REQUEST FIELD. A caller sends a NON-NEGATIVE magnitude
 * and a direction; the module applies the canonical sign. Accepting a signed
 * amount would put the one convention this ledger has in the hands of every
 * client that ever integrates, and a client that gets it backwards writes a
 * wrong financial record that looks exactly like a right one.
 *
 * A JSON NUMBER IS REFUSED RATHER THAN CONVERTED. `minorUnits` arrives as
 * characters. `12.34` as a JSON number has already lost whatever it lost
 * before this code sees it, and no amount of parsing recovers it.
 *
 * DAYS AND INSTANTS ARE READ DIFFERENTLY, on purpose (ADR-0027).
 * `bookingDate` and `valueDate` are parsed with `CalendarDay.parse`, which
 * REFUSES a value carrying a time or a zone rather than truncating it —
 * truncation would silently choose which timezone turns an instant into a
 * day. `eventOccurredAt` is a true instant and is parsed as one, and it is
 * refused without the `sourceTimezone` that makes it interpretable.
 *
 * SEVERAL MODULE CONSTRUCTORS THROW rather than returning a result
 * (`CalendarDay.parse`, `Currency.get`, `Money.of`, `TransactionId.of`).
 * Everything below catches at the edge and answers 400, so a mistyped field
 * is never a 500 with a stack in the server log.
 */

import { CalendarDay, Currency, Money } from '@karar/shared-kernel';
import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import { TRANSACTION_STATUSES } from '@karar/transactions';
import type {
  CreateManualTransactionInput,
  MoneyDirection,
  TransactionStatus,
  UpdateOwnTransactionInput,
} from '@karar/transactions';

import { bodyOf, hasKey, isUuid, readAmount } from './request-input.js';

/** The declared bounds for the manual-entry path, from the central registry. */
const LIMITS = INGESTION_LIMIT_POLICIES.manualTransaction;

export interface InputRefusal {
  readonly field: string;
  readonly why: string;
}

export type Read<T> = { readonly value: T } | InputRefusal;

function refusal(field: string, why: string): InputRefusal {
  return { field, why };
}

/** A narrative field: non-blank, and inside the declared field byte bound. */
function readNarrative(raw: unknown, field: string, required: boolean): Read<string | null> {
  if (raw === null || raw === undefined) {
    return required ? refusal(field, 'is required') : { value: null };
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return refusal(field, 'must be a non-empty string');
  }
  return Buffer.byteLength(raw, 'utf8') > LIMITS.maxFieldBytes
    ? refusal(field, 'exceeds the declared field byte bound for this path')
    : { value: raw };
}

function readDay(raw: unknown, field: string): Read<CalendarDay> {
  if (typeof raw !== 'string') return refusal(field, 'must be an ISO calendar date YYYY-MM-DD');
  try {
    return { value: CalendarDay.parse(raw) };
  } catch {
    // Refused rather than truncated: a value carrying a time has not yet
    // decided which zone turns it into a day, and this layer must not decide.
    return refusal(field, 'must be an ISO calendar date YYYY-MM-DD with no time and no zone');
  }
}

function readMagnitude(raw: unknown, field: string): Read<Money> {
  const amount = readAmount(raw);
  if (amount === 'INVALID') {
    return refusal(field, 'must be { minorUnits: string, currency: string }');
  }
  if (amount.minorUnits.startsWith('-')) {
    return refusal(field, 'must be non-negative; the direction supplies the sign');
  }
  const currency = Currency.tryGet(amount.currency);
  if (currency === undefined) return refusal(field, 'names a currency this platform does not hold');
  try {
    return { value: Money.of(amount.minorUnits, currency) };
  } catch {
    return refusal(field, 'is not an exact integer count of minor units');
  }
}

function readDirection(raw: unknown): Read<MoneyDirection> {
  return raw === 'MONEY_OUT' || raw === 'MONEY_IN'
    ? { value: raw }
    : refusal('direction', "must be 'MONEY_OUT' or 'MONEY_IN'");
}

/** The create body. `sourceKind` is fixed to MANUAL and is not a field here. */
export function readCreateTransactionInput(body: unknown): Read<CreateManualTransactionInput> {
  const source = bodyOf(body);
  if (!isUuid(source['accountId'])) return refusal('accountId', 'is not a reference');
  const magnitude = readMagnitude(source['magnitude'], 'magnitude');
  if ('field' in magnitude) return magnitude;
  const direction = readDirection(source['direction']);
  if ('field' in direction) return direction;
  const bookingDate = readDay(source['bookingDate'], 'bookingDate');
  if ('field' in bookingDate) return bookingDate;
  const description = readNarrative(source['description'], 'description', true);
  if ('field' in description) return description;
  const merchant = readNarrative(source['merchant'] ?? null, 'merchant', false);
  if ('field' in merchant) return merchant;
  const note = readNarrative(source['note'] ?? null, 'note', false);
  if ('field' in note) return note;

  const optional: Record<string, unknown> = {};
  if (source['valueDate'] !== undefined && source['valueDate'] !== null) {
    const read = readDay(source['valueDate'], 'valueDate');
    if ('field' in read) return read;
    optional['valueDate'] = read.value;
  }
  if (source['eventOccurredAt'] !== undefined && source['eventOccurredAt'] !== null) {
    const raw = source['eventOccurredAt'];
    const instant = typeof raw === 'string' ? new Date(raw) : new Date(Number.NaN);
    if (Number.isNaN(instant.getTime())) {
      return refusal('eventOccurredAt', 'must be an RFC 3339 instant with an explicit offset');
    }
    if (typeof source['sourceTimezone'] !== 'string') {
      // An instant with no zone is a moment nobody can turn back into a day.
      return refusal('sourceTimezone', 'is required when eventOccurredAt is supplied');
    }
    optional['eventOccurredAt'] = instant;
    optional['sourceTimezone'] = source['sourceTimezone'];
  }
  if (source['occurrenceOrdinal'] !== undefined) {
    const ordinal = source['occurrenceOrdinal'];
    // BOUNDED ABOVE AS WELL AS BELOW. The column is a PostgreSQL `integer`;
    // `3000000000` satisfied `minimum: 1` in the contract, reached the driver
    // and came back as a store failure — a 5xx for a body the schema declared
    // valid, when the caller's request is the thing that is wrong. Found by an
    // independent review at the closeout.
    if (
      typeof ordinal !== 'number' ||
      !Number.isInteger(ordinal) ||
      ordinal < 1 ||
      ordinal > 2_147_483_647
    ) {
      // Validated here because the use case THROWS on a non-positive ordinal
      // rather than returning an error arm.
      return refusal('occurrenceOrdinal', 'must be a positive 32-bit integer');
    }
    optional['occurrenceOrdinal'] = ordinal;
  }
  if (source['originalAmount'] !== undefined && source['originalAmount'] !== null) {
    const read = readMagnitude(source['originalAmount'], 'originalAmount');
    if ('field' in read) return read;
    optional['originalMagnitude'] = read.value;
    optional['originalCurrency'] = read.value.currency;
  }

  return {
    value: {
      accountId: source['accountId'],
      magnitude: magnitude.value,
      direction: direction.value,
      bookingDate: bookingDate.value,
      description: description.value as string,
      ...(merchant.value === null ? {} : { merchant: merchant.value }),
      ...(note.value === null ? {} : { note: note.value }),
      ...optional,
    } as CreateManualTransactionInput,
  };
}

/**
 * The correction body.
 *
 * `magnitude` and `direction` travel together or not at all — the use case
 * THROWS on a half pair — and the account, the currency, the source instant
 * and the source timezone have no branch here because they are not
 * correctable: changing them would make the record a different record while
 * keeping its history.
 */
export function readCorrectionInput(
  transactionId: string,
  body: unknown,
): Read<UpdateOwnTransactionInput> {
  const source = bodyOf(body);
  const expectedVersion = source['expectedVersion'];
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion)) {
    return refusal('expectedVersion', 'is required and must be an integer');
  }

  const patch: Record<string, unknown> = {};
  const hasMagnitude = hasKey(source, 'magnitude');
  const hasDirection = hasKey(source, 'direction');
  if (hasMagnitude !== hasDirection) {
    return refusal('magnitude', 'must be supplied together with direction');
  }
  if (hasMagnitude && hasDirection) {
    const magnitude = readMagnitude(source['magnitude'], 'magnitude');
    if ('field' in magnitude) return magnitude;
    const direction = readDirection(source['direction']);
    if ('field' in direction) return direction;
    patch['magnitude'] = magnitude.value;
    patch['direction'] = direction.value;
  }
  if (hasKey(source, 'bookingDate')) {
    const read = readDay(source['bookingDate'], 'bookingDate');
    if ('field' in read) return read;
    patch['bookingDate'] = read.value;
  }
  if (hasKey(source, 'valueDate')) {
    if (source['valueDate'] === null) patch['valueDate'] = null;
    else {
      const read = readDay(source['valueDate'], 'valueDate');
      if ('field' in read) return read;
      patch['valueDate'] = read.value;
    }
  }
  for (const field of ['merchant', 'note'] as const) {
    if (!hasKey(source, field)) continue;
    if (source[field] === null) {
      patch[field] = null;
      continue;
    }
    const read = readNarrative(source[field], field, true);
    if ('field' in read) return read;
    patch[field] = read.value;
  }
  if (hasKey(source, 'description')) {
    const read = readNarrative(source['description'], 'description', true);
    if ('field' in read) return read;
    patch['description'] = read.value;
  }
  if (hasKey(source, 'status')) {
    const status = source['status'];
    if (
      typeof status !== 'string' ||
      !(TRANSACTION_STATUSES as readonly string[]).includes(status)
    ) {
      return refusal('status', 'is not a value this platform recognises');
    }
    patch['status'] = status as TransactionStatus;
  }

  return { value: { transactionId, expectedVersion, ...patch } as UpdateOwnTransactionInput };
}
