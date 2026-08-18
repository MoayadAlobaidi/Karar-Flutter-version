/**
 * Row to domain mapping, and the one place this module's HSF fields cross
 * between ciphertext and `HsfField`.
 *
 * Prisma rows stop here (architecture test 4): nothing above this layer sees
 * a Prisma type or a `bytea` buffer. The row shape below is a structural
 * declaration of the columns migration 0098 creates, so the mapping stays
 * readable against the SQL rather than against generated code.
 *
 * **Read the row shape as evidence.** It is the complete column list, and
 * there is no balance, no amount, no limit, no currency and no numeric field
 * on it except `version`. A future column would have to be added HERE to be
 * mapped, which is one more place a reviewer sees it.
 *
 * **The mapping is asynchronous, and that is the visible consequence of the
 * design.** A synchronous mapper would mean the mask and the label were lying
 * around as plaintext somewhere; the only plaintext that exists is a
 * short-lived `HsfField` inside a use case.
 *
 * **A row this vocabulary cannot name is a DEFECT, not a user outcome.** An
 * unknown instrument type or status means the database and the code have
 * diverged — a migration applied without its code change, or the reverse.
 * That throws `PaymentInstrumentsStoreError` rather than becoming a `Result`
 * arm, because silently coercing it (to `OTHER`, to `ACTIVE`) would produce a
 * plausible-looking record that is wrong. The closed CHECK constraints in
 * 0098 make these throws unreachable in a consistent database; they are the
 * alarm for when it is not.
 *
 * A ciphertext that fails to authenticate is the same kind of alarm and is
 * deliberately NOT caught here: the port's error carries no plaintext and no
 * oracle, and swallowing it would turn tampering into a blank mask that a
 * person would read as their own card.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import type {
  EncryptedField,
  HsfFieldEncryptionPort,
} from '../../application/ports/hsf-field-encryption.js';
import type { InstrumentsPrincipal } from '../../application/principal.js';
import { PaymentInstrumentsStoreError } from '../../domain/errors.js';
import type { HsfField } from '../../domain/hsf-field.js';
import {
  isInstrumentStatus,
  isInstrumentType,
  type PaymentInstrument,
} from '../../domain/payment-instrument.js';
import { BalanceBearingAccountRef, type PaymentInstrumentId } from '../../domain/refs.js';

/** The table every ciphertext in this module is bound to as associated data. */
export const PAYMENT_INSTRUMENTS_TABLE = 'payment_instruments';

/**
 * Byte columns as the driver wants them: an owned, `ArrayBuffer`-backed view.
 * The port returns a plain `Uint8Array`, which may be backed by a
 * `SharedArrayBuffer` as far as the type system knows; copying once on the
 * way to the database both satisfies that and stops a later mutation of the
 * provider's buffer from changing bytes already handed to the driver.
 */
type DbBytes = Uint8Array<ArrayBuffer>;

function ownedBytes(value: Uint8Array): DbBytes {
  return new Uint8Array(value);
}

/**
 * Migration 0098's columns, exhaustively. Note what is not here: no balance,
 * no amount, no limit, no available figure, no currency, no expiry, no CVV,
 * no token.
 */
export interface PaymentInstrumentRow {
  id: string;
  tenantId: string;
  userId: string;
  accountId: string;
  accountReferenceType: string;
  instrumentType: string;
  status: string;
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  instrumentMaskCiphertext: Uint8Array;
  instrumentMaskNonce: Uint8Array;
  instrumentMaskAuthTag: Uint8Array;
  displayLabelCiphertext: Uint8Array;
  displayLabelNonce: Uint8Array;
  displayLabelAuthTag: Uint8Array;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function encryptedFrom(
  row: { hsfAlgorithm: string; hsfKeyVersion: string },
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  authTag: Uint8Array,
): EncryptedField {
  return {
    ciphertext,
    nonce,
    algorithm: row.hsfAlgorithm,
    keyVersion: row.hsfKeyVersion,
    authTag,
  };
}

export async function toPaymentInstrument(
  row: PaymentInstrumentRow,
  encryption: HsfFieldEncryptionPort,
  actor: InstrumentsPrincipal,
): Promise<PaymentInstrument> {
  if (!isInstrumentType(row.instrumentType)) {
    throw new PaymentInstrumentsStoreError(
      `payment_instruments.instrument_type holds unknown value '${row.instrumentType}' — the ` +
        'closed CHECK in migration 0098 and this vocabulary have diverged',
    );
  }
  if (!isInstrumentStatus(row.status)) {
    throw new PaymentInstrumentsStoreError(
      `payment_instruments.status holds unknown value '${row.status}'`,
    );
  }
  if (row.accountReferenceType !== 'FINANCIAL_ACCOUNT') {
    throw new PaymentInstrumentsStoreError(
      `payment_instruments.account_reference_type holds unknown value ` +
        `'${row.accountReferenceType}' — what account_id points at is not something a reader ` +
        'may guess, and guessing it wrong would say money leaves the wrong kind of thing',
    );
  }

  const mask = await encryption.decryptField(
    actor,
    encryptedFrom(
      row,
      row.instrumentMaskCiphertext,
      row.instrumentMaskNonce,
      row.instrumentMaskAuthTag,
    ),
    { table: PAYMENT_INSTRUMENTS_TABLE, rowId: row.id, field: 'instrumentMask' },
  );
  const displayLabel = await encryption.decryptField(
    actor,
    encryptedFrom(
      row,
      row.displayLabelCiphertext,
      row.displayLabelNonce,
      row.displayLabelAuthTag,
    ),
    { table: PAYMENT_INSTRUMENTS_TABLE, rowId: row.id, field: 'displayLabel' },
  );

  return Object.freeze({
    id: row.id as PaymentInstrumentId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    accountRef: BalanceBearingAccountRef.of(row.accountId),
    instrumentType: row.instrumentType,
    status: row.status,
    mask,
    displayLabel,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** The encrypted columns for one instrument, under the acting principal. */
export async function encryptInstrumentFields(
  encryption: HsfFieldEncryptionPort,
  actor: InstrumentsPrincipal,
  rowId: string,
  mask: HsfField,
  displayLabel: HsfField,
): Promise<{
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  instrumentMaskCiphertext: DbBytes;
  instrumentMaskNonce: DbBytes;
  instrumentMaskAuthTag: DbBytes;
  displayLabelCiphertext: DbBytes;
  displayLabelNonce: DbBytes;
  displayLabelAuthTag: DbBytes;
}> {
  // Sequential rather than concurrent: a key-management provider is
  // rate-limited everywhere but local, and two fields is not a place worth
  // spending that budget.
  const encryptedMask = await encryption.encryptField(actor, mask, {
    table: PAYMENT_INSTRUMENTS_TABLE,
    rowId,
    field: 'instrumentMask',
  });
  const encryptedLabel = await encryption.encryptField(actor, displayLabel, {
    table: PAYMENT_INSTRUMENTS_TABLE,
    rowId,
    field: 'displayLabel',
  });
  if (
    encryptedMask.algorithm !== encryptedLabel.algorithm ||
    encryptedMask.keyVersion !== encryptedLabel.keyVersion
  ) {
    // The row carries ONE algorithm and ONE key version for both fields
    // (migration 0098). Two halves encrypted under different versions would
    // leave one of them permanently unreadable with nothing on the row to say
    // which, so it is refused rather than written.
    throw new PaymentInstrumentsStoreError(
      'the mask and the label were encrypted under different algorithms or key versions, and ' +
        'the row records only one of each — writing this would leave one field permanently ' +
        'unreadable with nothing on the row to say which',
    );
  }
  return {
    hsfAlgorithm: encryptedMask.algorithm,
    hsfKeyVersion: encryptedMask.keyVersion,
    instrumentMaskCiphertext: ownedBytes(encryptedMask.ciphertext),
    instrumentMaskNonce: ownedBytes(encryptedMask.nonce),
    instrumentMaskAuthTag: ownedBytes(encryptedMask.authTag),
    displayLabelCiphertext: ownedBytes(encryptedLabel.ciphertext),
    displayLabelNonce: ownedBytes(encryptedLabel.nonce),
    displayLabelAuthTag: ownedBytes(encryptedLabel.authTag),
  };
}
