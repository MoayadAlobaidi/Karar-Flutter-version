/**
 * Row to domain mapping, and the one place this module's HSF fields cross
 * between ciphertext and `HsfField`.
 *
 * Prisma rows stop here (architecture test 4): nothing above this layer sees
 * a Prisma type or a `bytea` buffer. The row shapes below are structural
 * declarations of the columns migrations 0096 and 0097 create, so the mapping
 * stays readable against the SQL rather than against generated code.
 *
 * **Both mappings are asynchronous, and that is the visible consequence of
 * the design.** A synchronous mapper would mean the display label and the
 * external account reference were lying around as plaintext somewhere; the
 * only plaintext that exists is a short-lived `HsfField` inside a use case.
 *
 * **A row this vocabulary cannot name is a DEFECT, not a user outcome.** An
 * unknown rail, status, authority, match basis or capability means the
 * database and the code have diverged — a migration applied without its code
 * change, or the reverse. That throws `FinancialConnectionsStoreError` rather
 * than becoming a `Result` arm, because silently coercing it (to `MANUAL`, to
 * `PROBABLE`, to `NOT_OBSERVED`) would produce a plausible-looking record
 * that is wrong. The closed CHECK constraints in 0096 and 0097 make these
 * throws unreachable in a consistent database; they are the alarm for when it
 * is not.
 *
 * **The rail is re-checked against the IMPLEMENTED set on the way out**, not
 * merely against the vocabulary. A stored row carrying `OPEN_FINANCE_API`
 * would mean `financial_connections_rail_implemented_check` is missing from
 * the live database, which is the single most important constraint this
 * module has; mapping such a row into a plausible connection would hide
 * exactly the failure worth shouting about.
 *
 * A ciphertext that fails to authenticate is the same kind of alarm and is
 * deliberately NOT caught here: the port's error carries no plaintext and no
 * oracle, and swallowing it would turn tampering into a blank field.
 */

import { CalendarDay, TenantId, UserId } from '@karar/shared-kernel';

import type {
  EncryptedField,
  HsfFieldEncryptionPort,
  HsfFieldName,
} from '../../application/ports/hsf-field-encryption.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import {
  isMatchBasis,
  isSourceLinkStatus,
  type AccountSourceLink,
  type HistoryCoverage,
} from '../../domain/account-source-link.js';
import { FinancialConnectionsStoreError } from '../../domain/errors.js';
import { isExternalReferenceScheme } from '../../domain/external-account-reference.js';
import type { FinancialConnection } from '../../domain/financial-connection.js';
import type { HsfField } from '../../domain/hsf-field.js';
import {
  isConnectionRail,
  isConnectionStatus,
  isImplementedConnectionRail,
  isSourceAuthority,
  isSourceCapabilityObservation,
  type ConnectionRail,
} from '../../domain/rails.js';
import {
  CanonicalAccountRef,
  type AccountSourceLinkId,
  type FinancialConnectionId,
  type InstitutionRef,
} from '../../domain/refs.js';

/** The tables every ciphertext in this module is bound to as associated data. */
export const CONNECTIONS_TABLE = 'financial_connections';
export const SOURCE_LINKS_TABLE = 'account_source_links';

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

export interface FinancialConnectionRow {
  id: string;
  tenantId: string;
  userId: string;
  institutionRef: string | null;
  institutionReferenceType: string | null;
  rail: string;
  status: string;
  hsfAlgorithm: string;
  hsfKeyVersion: string;
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

export async function toFinancialConnection(
  row: FinancialConnectionRow,
  encryption: HsfFieldEncryptionPort,
  actor: ConnectionsPrincipal,
): Promise<FinancialConnection> {
  if (!isConnectionRail(row.rail)) {
    throw new FinancialConnectionsStoreError(
      `financial_connections.rail holds unknown value '${row.rail}' — the closed CHECK in ` +
        'migration 0096 and this vocabulary have diverged',
    );
  }
  if (!isImplementedConnectionRail(row.rail)) {
    throw new FinancialConnectionsStoreError(
      `financial_connections.rail holds '${row.rail}', which is NOT an implemented rail. A row ` +
        'carrying it means financial_connections_rail_implemented_check is missing from this ' +
        'database — the constraint that makes an unimplemented rail unwritable even by direct ' +
        'SQL. Refusing to map it: a connection on a rail nobody built is the first half of a ' +
        'fabricated bank connection',
    );
  }
  if (!isConnectionStatus(row.status)) {
    throw new FinancialConnectionsStoreError(
      `financial_connections.status holds unknown value '${row.status}'`,
    );
  }
  const displayLabel = await encryption.decryptField(
    actor,
    encryptedFrom(
      row,
      row.displayLabelCiphertext,
      row.displayLabelNonce,
      row.displayLabelAuthTag,
    ),
    { table: CONNECTIONS_TABLE, rowId: row.id, field: 'displayLabel' },
  );
  return Object.freeze({
    id: row.id as FinancialConnectionId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    institutionRef:
      row.institutionRef === null
        ? null
        : ({
            referenceType: 'INSTITUTION_CATALOGUE_ENTRY',
            institutionId: row.institutionRef,
          } as InstitutionRef),
    rail: row.rail,
    status: row.status,
    displayLabel,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** The encrypted columns for one connection, under the acting principal. */
export async function encryptConnectionFields(
  encryption: HsfFieldEncryptionPort,
  actor: ConnectionsPrincipal,
  rowId: string,
  displayLabel: HsfField,
): Promise<{
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  displayLabelCiphertext: DbBytes;
  displayLabelNonce: DbBytes;
  displayLabelAuthTag: DbBytes;
}> {
  const field: HsfFieldName = 'displayLabel';
  const encrypted = await encryption.encryptField(actor, displayLabel, {
    table: CONNECTIONS_TABLE,
    rowId,
    field,
  });
  return {
    hsfAlgorithm: encrypted.algorithm,
    hsfKeyVersion: encrypted.keyVersion,
    displayLabelCiphertext: ownedBytes(encrypted.ciphertext),
    displayLabelNonce: ownedBytes(encrypted.nonce),
    displayLabelAuthTag: ownedBytes(encrypted.authTag),
  };
}

export interface AccountSourceLinkRow {
  id: string;
  tenantId: string;
  userId: string;
  accountId: string;
  accountReferenceType: string;
  connectionId: string;
  connectionRail: string;
  sourceAuthority: string;
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  sourceAccountReferenceCiphertext: Uint8Array;
  sourceAccountReferenceNonce: Uint8Array;
  sourceAccountReferenceAuthTag: Uint8Array;
  sourceAccountFingerprint: string;
  sourceAccountFingerprintVersion: string;
  matchBasis: string;
  sourceStatus: string;
  subjectConfirmedAt: Date | null;
  sourcePriority: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
  lastSuccessfulImportAt: Date | null;
  historyCoverageStart: Date | null;
  historyCoverageEnd: Date | null;
  balanceCapability: string;
  pendingTransactionCapability: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A `@db.Date` column arrives as a `Date` at UTC midnight; the calendar day
 * is read back out of its UTC parts, never its local ones. Reading local
 * parts would shift the day by one for anybody west of Greenwich, which for a
 * coverage range means claiming a statement covered a day it did not
 * (ADR-0027).
 */
function calendarDayFrom(value: Date): CalendarDay {
  return CalendarDay.of(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

/** And back: UTC midnight on the stated day, with no timezone invented. */
export function calendarDayToDate(day: CalendarDay): Date {
  return new Date(`${day.toString()}T00:00:00.000Z`);
}

export async function toAccountSourceLink(
  row: AccountSourceLinkRow,
  encryption: HsfFieldEncryptionPort,
  actor: ConnectionsPrincipal,
): Promise<AccountSourceLink> {
  if (!isConnectionRail(row.connectionRail)) {
    throw new FinancialConnectionsStoreError(
      `account_source_links.connection_rail holds unknown value '${row.connectionRail}'`,
    );
  }
  if (!isSourceAuthority(row.sourceAuthority)) {
    throw new FinancialConnectionsStoreError(
      `account_source_links.source_authority holds unknown value '${row.sourceAuthority}'`,
    );
  }
  if (!isMatchBasis(row.matchBasis)) {
    throw new FinancialConnectionsStoreError(
      `account_source_links.match_basis holds unknown value '${row.matchBasis}'`,
    );
  }
  if (!isSourceLinkStatus(row.sourceStatus)) {
    throw new FinancialConnectionsStoreError(
      `account_source_links.source_status holds unknown value '${row.sourceStatus}'`,
    );
  }
  if (
    !isSourceCapabilityObservation(row.balanceCapability) ||
    !isSourceCapabilityObservation(row.pendingTransactionCapability)
  ) {
    throw new FinancialConnectionsStoreError(
      'account_source_links carries a capability observation this vocabulary cannot name',
    );
  }
  if (row.accountReferenceType !== 'FINANCIAL_ACCOUNT') {
    throw new FinancialConnectionsStoreError(
      `account_source_links.account_reference_type holds unknown value ` +
        `'${row.accountReferenceType}' — what account_id points at is not something a reader may guess`,
    );
  }
  // A PROBABLE link that is LINKED with no confirmation instant would mean
  // account_source_links_probable_requires_confirmation is missing from this
  // database. That is the constraint standing between a suggestion and an
  // automatic link, so a row that violates it is refused rather than mapped.
  if (
    row.matchBasis === 'PROBABLE' &&
    (row.sourceStatus === 'LINKED' || row.sourceStatus === 'DORMANT') &&
    row.subjectConfirmedAt === null
  ) {
    throw new FinancialConnectionsStoreError(
      'account_source_links holds a PROBABLE match in a linked state with no subject ' +
        'confirmation. That state is refused by CHECK in migration 0097, so its presence means ' +
        'the constraint is absent from this database — and mapping the row would present a ' +
        'guess as a decision the person made',
    );
  }

  const scheme = 'SOURCE_ACCOUNT_REFERENCE';
  if (!isExternalReferenceScheme(scheme)) {
    throw new FinancialConnectionsStoreError('unknown external reference scheme');
  }

  const sourceAccountReference = await encryption.decryptField(
    actor,
    encryptedFrom(
      row,
      row.sourceAccountReferenceCiphertext,
      row.sourceAccountReferenceNonce,
      row.sourceAccountReferenceAuthTag,
    ),
    { table: SOURCE_LINKS_TABLE, rowId: row.id, field: 'sourceAccountReference' },
  );

  let historyCoverage: HistoryCoverage | null = null;
  if (row.historyCoverageStart !== null && row.historyCoverageEnd !== null) {
    historyCoverage = {
      start: calendarDayFrom(row.historyCoverageStart),
      end: calendarDayFrom(row.historyCoverageEnd),
    };
  }

  return Object.freeze({
    id: row.id as AccountSourceLinkId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    accountRef: CanonicalAccountRef.of(row.accountId),
    connectionId: row.connectionId as FinancialConnectionId,
    connectionRail: row.connectionRail as ConnectionRail,
    sourceAuthority: row.sourceAuthority,
    sourceAccountReference,
    referenceScheme: scheme,
    fingerprint: { version: row.sourceAccountFingerprintVersion, value: row.sourceAccountFingerprint },
    matchBasis: row.matchBasis,
    status: row.sourceStatus,
    subjectConfirmedAt: row.subjectConfirmedAt,
    sourcePriority: row.sourcePriority,
    observation: {
      firstObservedAt: row.firstObservedAt,
      lastObservedAt: row.lastObservedAt,
      lastSuccessfulImportAt: row.lastSuccessfulImportAt,
    },
    historyCoverage,
    capabilities: {
      balance: row.balanceCapability,
      pendingTransactions: row.pendingTransactionCapability,
    },
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** The encrypted columns for one source link, under the acting principal. */
export async function encryptSourceLinkFields(
  encryption: HsfFieldEncryptionPort,
  actor: ConnectionsPrincipal,
  rowId: string,
  sourceAccountReference: HsfField,
): Promise<{
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  sourceAccountReferenceCiphertext: DbBytes;
  sourceAccountReferenceNonce: DbBytes;
  sourceAccountReferenceAuthTag: DbBytes;
}> {
  const field: HsfFieldName = 'sourceAccountReference';
  const encrypted = await encryption.encryptField(actor, sourceAccountReference, {
    table: SOURCE_LINKS_TABLE,
    rowId,
    field,
  });
  return {
    hsfAlgorithm: encrypted.algorithm,
    hsfKeyVersion: encrypted.keyVersion,
    sourceAccountReferenceCiphertext: ownedBytes(encrypted.ciphertext),
    sourceAccountReferenceNonce: ownedBytes(encrypted.nonce),
    sourceAccountReferenceAuthTag: ownedBytes(encrypted.authTag),
  };
}
