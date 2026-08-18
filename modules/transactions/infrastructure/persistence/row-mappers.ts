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
 */

import { Currency, Money } from '@karar/shared-kernel';
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
  bookingDate: Date;
  valueDate: Date | null;
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
  bookingDate: Date;
  valueDate: Date | null;
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

function ownedBytes(value: Uint8Array): DbBytes;
function ownedBytes(value: Uint8Array | null): DbBytes | null;
function ownedBytes(value: Uint8Array | null): DbBytes | null {
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
    bookingDate: row.bookingDate,
    valueDate: row.valueDate,
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
      bookingDate: row.bookingDate,
      valueDate: row.valueDate,
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
