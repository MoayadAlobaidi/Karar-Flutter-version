/**
 * Row <-> domain mapping, and the one place HSF narrative crosses between
 * ciphertext and `HsfField`.
 *
 * Prisma types do not appear in these signatures. The row shapes below are
 * structural declarations of the columns migrations 0090-0093 create, so
 * nothing an ORM generates leaks past this file (architecture test 4) and the
 * mapping stays readable against the SQL rather than against generated code.
 *
 * Mapping is asynchronous because it encrypts and decrypts. That is
 * deliberate and visible: a synchronous mapper would mean the narrative was
 * lying around in plaintext somewhere, and the whole point is that the only
 * plaintext that exists is a short-lived `HsfField` inside a use case.
 *
 * This file is also the ONLY place a `date` column becomes a `CalendarDay`
 * and back (ADR-0027). `calendarDayFromColumn` below explains why that
 * conversion is not the one-liner it looks like.
 */

import { CalendarDay, Currency, Money } from '@karar/shared-kernel';
import type { TenantId, UserId } from '@karar/shared-kernel';

import { HsfField } from '../../domain/hsf-field.js';
import {
  createProvenance,
  type CategoryAssignmentSource,
  type TransactionProvenance,
} from '../../domain/provenance.js';
import {
  createAssignment,
  type AssignmentSource,
  type AssignmentStatus,
  type TransactionCategoryAssignment,
} from '../../domain/category-assignment.js';
import { CategoryCode } from '../../domain/category-catalogue.js';
import {
  AccountRef,
  ActorRef,
  ImportRef,
  RowRef,
  TransactionId,
  type AccountReferenceType,
} from '../../domain/refs.js';
import type {
  RevisableField,
  RevisionAttribution,
  TransactionRevision,
} from '../../domain/revision.js';
import {
  createTransaction,
  OriginalAmount,
  type SourceKind,
  type Transaction,
  type TransactionStatus,
} from '../../domain/transaction.js';
import type {
  DirectionMapping,
  SourceDirection,
} from '../../domain/sign-convention.js';
import type {
  EncryptedField,
  HsfFieldEncryptionPort,
  HsfFieldName,
} from '../../application/ports/hsf-field-encryption.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';

/** Raised when a stored row cannot be read back as a domain value. */
export class TransactionStoreError extends Error {
  override readonly name = 'TransactionStoreError';
}

/** The encrypted triple as three columns, plus the row-level context columns. */
interface CipherTriple {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
}

interface OptionalCipherTriple {
  readonly ciphertext: Uint8Array | null;
  readonly nonce: Uint8Array | null;
  readonly authTag: Uint8Array | null;
}

/**
 * A `date` column, in whichever shape the driver in use hands it over.
 *
 * Two are in play and they disagree, which is exactly why this is a type and
 * not a `Date`: see `calendarDayFromColumn`.
 */
export type DateColumn = Date | string;

/**
 * A `date` column as the `CalendarDay` it always was.
 *
 * The obvious implementation reads the UTC components off the `Date` the
 * driver returns. It is wrong for one of the two drivers this repository
 * runs, and wrong by a whole day — which at a month boundary is a whole
 * month (ADR-0027).
 *
 *   * Prisma's pg adapter passes `date` through as the text PostgreSQL sent
 *     and the client builds a `Date` at midnight **UTC**: `2026-08-12`
 *     becomes `2026-08-12T00:00:00Z`.
 *   * node-postgres, used directly by this module's raw-SQL probes, parses it
 *     as `new Date(year, month - 1, day)` — midnight **LOCAL**. On the
 *     machine this is written for (Asia/Qatar, +03) that is
 *     `2026-08-11T21:00:00Z`, whose UTC day is the 11th.
 *
 * So neither reading is safe on its own. What both encodings DO agree on is
 * that the value is midnight of the intended day in the encoder's own frame,
 * and only one of the two frames can put a `date` at exactly 00:00 UTC. That
 * is the discriminator used below, and it is correct for both drivers at
 * every host offset rather than at the one this happens to run on.
 *
 * A string is preferred over either, because `YYYY-MM-DD` is unambiguous and
 * needs no discriminating at all — a driver configured to hand the text over
 * untouched is the shape this conversion would rather receive.
 */
function calendarDayFromColumn(field: string, value: DateColumn): CalendarDay {
  if (typeof value === 'string') {
    try {
      return CalendarDay.parse(value);
    } catch {
      throw new TransactionStoreError(
        `stored ${field} '${value}' is not an ISO calendar date; a date column that cannot be read as a day is refused rather than guessed at`,
      );
    }
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TransactionStoreError(
      `stored ${field} is neither an ISO calendar date nor a valid Date`,
    );
  }
  const isUtcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0;
  return isUtcMidnight
    ? CalendarDay.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
    : CalendarDay.of(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function optionalCalendarDayFromColumn(
  field: string,
  value: DateColumn | null,
): CalendarDay | null {
  return value === null ? null : calendarDayFromColumn(field, value);
}

/** The columns 0090 creates on `transactions`. */
export interface TransactionRow {
  id: string;
  tenantId: string;
  userId: string;
  accountId: string;
  accountReferenceType: string;
  amountMinor: bigint;
  currencyCode: string;
  originalAmountMinor: bigint | null;
  originalCurrencyCode: string | null;
  bookingDate: DateColumn;
  valueDate: DateColumn | null;
  eventOccurredAt: Date | null;
  sourceTimezone: string | null;
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  descriptionCiphertext: Uint8Array;
  descriptionNonce: Uint8Array;
  descriptionAuthTag: Uint8Array;
  merchantCiphertext: Uint8Array | null;
  merchantNonce: Uint8Array | null;
  merchantAuthTag: Uint8Array | null;
  noteCiphertext: Uint8Array | null;
  noteNonce: Uint8Array | null;
  noteAuthTag: Uint8Array | null;
  sourceKind: string;
  status: string;
  dedupFingerprint: string;
  fingerprintVersion: string;
  occurrenceOrdinal: number;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/** The columns 0091 creates on `transaction_revisions`. */
export interface RevisionRow {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  revisionNumber: number;
  attribution: string;
  actorRef: string;
  amountMinor: bigint;
  currencyCode: string;
  bookingDate: DateColumn;
  valueDate: DateColumn | null;
  eventOccurredAt: Date | null;
  sourceTimezone: string | null;
  status: string;
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  descriptionCiphertext: Uint8Array;
  descriptionNonce: Uint8Array;
  descriptionAuthTag: Uint8Array;
  merchantCiphertext: Uint8Array | null;
  merchantNonce: Uint8Array | null;
  merchantAuthTag: Uint8Array | null;
  noteCiphertext: Uint8Array | null;
  noteNonce: Uint8Array | null;
  noteAuthTag: Uint8Array | null;
  changedFields: string[];
  recordedAt: Date;
}

/** The columns 0091 creates on `transaction_provenance`. */
export interface ProvenanceRow {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  revisionNumber: number;
  sourceKind: string;
  importRef: string | null;
  rowRef: string | null;
  actorRef: string;
  accountId: string;
  accountReferenceType: string;
  parserVersion: string;
  mappingVersion: string;
  normalizationVersion: string;
  fingerprintVersion: string;
  sourceDirection: string;
  directionMapping: string;
  categoryAssignmentSource: string;
  createdAt: Date;
}

/** The columns 0093 creates on `transaction_category_assignments`. */
export interface AssignmentRow {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  categoryCode: string;
  assignmentSource: string;
  ruleVersion: string | null;
  assignedBy: string;
  assignedAt: Date;
  status: string;
  supersededById: string | null;
  supersededAt: Date | null;
}

/**
 * Byte columns as the driver wants them: an owned, `ArrayBuffer`-backed view.
 * The port returns a plain `Uint8Array`, which may be backed by a
 * `SharedArrayBuffer` as far as the type system knows; copying once on the
 * way to the database both satisfies that and stops a later mutation of the
 * provider's buffer from changing bytes already handed to the driver.
 */
type DbBytes = Uint8Array<ArrayBuffer>;

// Exported because the batch writer builds the same columns for an imported
// statement line, and one copy of "own the bytes before handing them over" is
// the only way that rule cannot be half-applied.
export function ownedBytes(value: Uint8Array): DbBytes;
export function ownedBytes(value: Uint8Array | null): DbBytes | null;
export function ownedBytes(value: Uint8Array | null): DbBytes | null {
  return value === null ? null : new Uint8Array(value);
}

/** The encrypted columns for one row, as the writer produces them. */
export interface EncryptedNarrativeColumns {
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  descriptionCiphertext: DbBytes;
  descriptionNonce: DbBytes;
  descriptionAuthTag: DbBytes;
  merchantCiphertext: DbBytes | null;
  merchantNonce: DbBytes | null;
  merchantAuthTag: DbBytes | null;
  noteCiphertext: DbBytes | null;
  noteNonce: DbBytes | null;
  noteAuthTag: DbBytes | null;
}

/**
 * Encrypts the three narrative fields for one row.
 *
 * All three are encrypted under one call so the row carries ONE algorithm and
 * ONE key version. Per-field key versions would be representable but would
 * make a rotation a partial state a reader has to reason about, for no gain:
 * the fields are written together, always.
 */
export async function encryptNarrative(
  encryption: HsfFieldEncryptionPort,
  principal: TransactionsPrincipal,
  table: string,
  rowId: string,
  narrative: {
    readonly description: HsfField;
    readonly merchant: HsfField | null;
    readonly note: HsfField | null;
  },
): Promise<EncryptedNarrativeColumns> {
  const description = await encryption.encryptField(principal, narrative.description, {
    table,
    rowId,
    field: 'description',
  });
  const merchant =
    narrative.merchant === null
      ? null
      : await encryption.encryptField(principal, narrative.merchant, {
          table,
          rowId,
          field: 'merchant',
        });
  const note =
    narrative.note === null
      ? null
      : await encryption.encryptField(principal, narrative.note, {
          table,
          rowId,
          field: 'note',
        });
  // Every field of a row shares the encryption context columns; a mismatch
  // would mean two calls resolved different key versions mid-row, which is a
  // provider defect rather than a state to persist.
  for (const field of [merchant, note]) {
    if (field !== null && field.keyVersion !== description.keyVersion) {
      throw new TransactionStoreError(
        'the encryption provider returned two key versions within one row; a row carries one encryption context by design',
      );
    }
  }
  return {
    hsfAlgorithm: description.algorithm,
    hsfKeyVersion: description.keyVersion,
    descriptionCiphertext: ownedBytes(description.ciphertext),
    descriptionNonce: ownedBytes(description.nonce),
    descriptionAuthTag: ownedBytes(description.authTag),
    merchantCiphertext: ownedBytes(merchant?.ciphertext ?? null),
    merchantNonce: ownedBytes(merchant?.nonce ?? null),
    merchantAuthTag: ownedBytes(merchant?.authTag ?? null),
    noteCiphertext: ownedBytes(note?.ciphertext ?? null),
    noteNonce: ownedBytes(note?.nonce ?? null),
    noteAuthTag: ownedBytes(note?.authTag ?? null),
  };
}

function encryptedField(
  triple: CipherTriple,
  algorithm: string,
  keyVersion: string,
): EncryptedField {
  return {
    ciphertext: triple.ciphertext,
    nonce: triple.nonce,
    algorithm,
    keyVersion,
    authTag: triple.authTag,
  };
}

async function decryptOptional(
  encryption: HsfFieldEncryptionPort,
  principal: TransactionsPrincipal,
  table: string,
  rowId: string,
  field: HsfFieldName,
  triple: OptionalCipherTriple,
  algorithm: string,
  keyVersion: string,
): Promise<HsfField | null> {
  if (triple.ciphertext === null || triple.nonce === null || triple.authTag === null) {
    return null;
  }
  return encryption.decryptField(
    principal,
    encryptedField(
      { ciphertext: triple.ciphertext, nonce: triple.nonce, authTag: triple.authTag },
      algorithm,
      keyVersion,
    ),
    { table, rowId, field },
  );
}

function requireCurrency(code: string): Currency {
  const currency = Currency.tryGet(code.trim());
  if (currency === undefined) {
    throw new TransactionStoreError(
      `stored currency code '${code}' is not in the supported registry; a row denominated in an unsupported currency cannot be scaled correctly and is refused rather than guessed`,
    );
  }
  return currency;
}

export async function toTransaction(
  encryption: HsfFieldEncryptionPort,
  principal: TransactionsPrincipal,
  row: TransactionRow,
): Promise<Transaction> {
  const currency = requireCurrency(row.currencyCode);
  const description = await encryption.decryptField(
    principal,
    encryptedField(
      {
        ciphertext: row.descriptionCiphertext,
        nonce: row.descriptionNonce,
        authTag: row.descriptionAuthTag,
      },
      row.hsfAlgorithm,
      row.hsfKeyVersion,
    ),
    { table: 'transactions', rowId: row.id, field: 'description' },
  );
  const merchant = await decryptOptional(
    encryption,
    principal,
    'transactions',
    row.id,
    'merchant',
    { ciphertext: row.merchantCiphertext, nonce: row.merchantNonce, authTag: row.merchantAuthTag },
    row.hsfAlgorithm,
    row.hsfKeyVersion,
  );
  const note = await decryptOptional(
    encryption,
    principal,
    'transactions',
    row.id,
    'note',
    { ciphertext: row.noteCiphertext, nonce: row.noteNonce, authTag: row.noteAuthTag },
    row.hsfAlgorithm,
    row.hsfKeyVersion,
  );

  const originalCurrency =
    row.originalCurrencyCode === null ? null : requireCurrency(row.originalCurrencyCode);
  const originalAmount =
    row.originalAmountMinor === null || originalCurrency === null
      ? null
      : OriginalAmount.of(Money.of(row.originalAmountMinor, originalCurrency), originalCurrency);

  return createTransaction({
    id: TransactionId.of(row.id),
    tenantId: row.tenantId as TenantId,
    userId: row.userId as UserId,
    accountRef: AccountRef.of(
      row.accountId,
      row.accountReferenceType as AccountReferenceType,
    ),
    amount: Money.of(row.amountMinor, currency),
    bookingDate: calendarDayFromColumn('booking_date', row.bookingDate),
    valueDate: optionalCalendarDayFromColumn('value_date', row.valueDate),
    eventOccurredAt: row.eventOccurredAt,
    sourceTimezone: row.sourceTimezone,
    merchant,
    description,
    note,
    originalAmount,
    sourceKind: row.sourceKind as SourceKind,
    status: row.status as TransactionStatus,
    createdAt: row.createdAt,
    version: row.version,
  });
}

export async function toRevision(
  encryption: HsfFieldEncryptionPort,
  principal: TransactionsPrincipal,
  row: RevisionRow,
): Promise<TransactionRevision> {
  const currency = requireCurrency(row.currencyCode);
  const description = await encryption.decryptField(
    principal,
    encryptedField(
      {
        ciphertext: row.descriptionCiphertext,
        nonce: row.descriptionNonce,
        authTag: row.descriptionAuthTag,
      },
      row.hsfAlgorithm,
      row.hsfKeyVersion,
    ),
    { table: 'transaction_revisions', rowId: row.id, field: 'description' },
  );
  const merchant = await decryptOptional(
    encryption,
    principal,
    'transaction_revisions',
    row.id,
    'merchant',
    { ciphertext: row.merchantCiphertext, nonce: row.merchantNonce, authTag: row.merchantAuthTag },
    row.hsfAlgorithm,
    row.hsfKeyVersion,
  );
  const note = await decryptOptional(
    encryption,
    principal,
    'transaction_revisions',
    row.id,
    'note',
    { ciphertext: row.noteCiphertext, nonce: row.noteNonce, authTag: row.noteAuthTag },
    row.hsfAlgorithm,
    row.hsfKeyVersion,
  );
  return Object.freeze({
    id: row.id,
    transactionId: TransactionId.of(row.transactionId),
    tenantId: row.tenantId,
    userId: row.userId,
    revisionNumber: row.revisionNumber,
    attribution: row.attribution as RevisionAttribution,
    actorRef: ActorRef.of(row.actorRef),
    values: Object.freeze({
      amount: Money.of(row.amountMinor, currency),
      bookingDate: calendarDayFromColumn('booking_date', row.bookingDate),
      valueDate: optionalCalendarDayFromColumn('value_date', row.valueDate),
      eventOccurredAt: row.eventOccurredAt,
      sourceTimezone: row.sourceTimezone,
      merchant,
      description,
      note,
      status: row.status as TransactionStatus,
    }),
    changedFields: Object.freeze([...row.changedFields] as RevisableField[]),
    recordedAt: row.recordedAt,
  });
}

export function toProvenance(row: ProvenanceRow): TransactionProvenance {
  return createProvenance({
    id: row.id,
    transactionId: TransactionId.of(row.transactionId),
    tenantId: row.tenantId,
    userId: row.userId,
    revisionNumber: row.revisionNumber,
    sourceKind: row.sourceKind as SourceKind,
    importRef: row.importRef === null ? null : ImportRef.of(row.importRef),
    rowRef: row.rowRef === null ? null : RowRef.of(row.rowRef),
    actorRef: ActorRef.of(row.actorRef),
    accountRef: AccountRef.of(row.accountId, row.accountReferenceType as AccountReferenceType),
    versions: {
      parserVersion: row.parserVersion,
      mappingVersion: row.mappingVersion,
      normalizationVersion: row.normalizationVersion,
      fingerprintVersion: row.fingerprintVersion,
    },
    sourceDirection: row.sourceDirection as SourceDirection,
    directionMapping: row.directionMapping as DirectionMapping,
    categoryAssignmentSource: row.categoryAssignmentSource as CategoryAssignmentSource,
    createdAt: row.createdAt,
  });
}

export function toAssignment(row: AssignmentRow): TransactionCategoryAssignment {
  return createAssignment({
    id: row.id,
    transactionId: TransactionId.of(row.transactionId),
    tenantId: row.tenantId,
    userId: row.userId,
    categoryCode: CategoryCode.of(row.categoryCode),
    assignmentSource: row.assignmentSource as AssignmentSource,
    ruleVersion: row.ruleVersion,
    assignedBy: ActorRef.of(row.assignedBy),
    assignedAt: row.assignedAt,
    status: row.status as AssignmentStatus,
    supersededById: row.supersededById,
    supersededAt: row.supersededAt,
  });
}
