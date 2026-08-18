/**
 * Row to domain mapping, and the one place this module's HSF fields cross
 * between ciphertext and `HsfField`.
 *
 * Prisma rows stop here (architecture test 4): nothing above this layer sees
 * a Prisma type, a `BigInt` field, a `bytea` buffer, or a raw currency
 * string. The row shapes below are structural declarations of the columns
 * migrations 0087-0089 create, so the mapping stays readable against the SQL
 * rather than against generated code.
 *
 * **The account mapping is asynchronous, and that is the visible consequence
 * of the fix.** A synchronous mapper would mean the display name, the
 * institution label and the mask were lying around as plaintext somewhere;
 * the whole point is that the only plaintext that exists is a short-lived
 * `HsfField` inside a use case. The transactions module's mapper is
 * asynchronous for exactly this reason.
 *
 * **A row this vocabulary cannot name is a DEFECT, not a user outcome.** An
 * unknown account type, status, origin, wallet kind, account nature, issuer
 * kind, source kind, or currency code means the database and the code have
 * diverged — a migration applied without its code
 * change, or the reverse. That throws `FinancialAccountsStoreError` rather
 * than becoming a `Result` arm, because silently coercing it (to `OTHER`, to
 * `ACTIVE`, to a guessed currency) would produce a plausible-looking record
 * that is wrong, which is exactly the failure mode this module exists to
 * avoid. The closed CHECK constraints in migrations 0087-0089 make these
 * throws unreachable in a consistent database; they are the alarm for when it
 * is not. The wallet biconditional is checked here for the same reason: a row
 * with a wallet kind on a non-wallet type, or a WALLET with none, means the
 * CHECK from migration 0095 is not where it should be, and mapping it into a
 * plausible-looking account would hide that. A ciphertext that fails to authenticate is the same kind of alarm,
 * and is deliberately NOT caught here: the port's error carries no plaintext
 * and no oracle, and swallowing it would turn tampering into a blank field.
 *
 * The money mapping is the other load-bearing one: `amount_minor_units`
 * arrives as a JavaScript `bigint` (never a `number` — 2^53 is not a safe
 * bound) and is paired with its currency, whose ISO 4217 exponent is the only
 * thing that says what those units mean.
 */

import { Currency, Money, TenantId, UserId } from '@karar/shared-kernel';

import type {
  EncryptedField,
  HsfFieldEncryptionPort,
  HsfFieldName,
} from '../../application/ports/hsf-field-encryption.js';
import type { AccountsPrincipal } from '../../application/principal.js';
import {
  isBalanceKind,
  isSourceKind,
  type BalanceSnapshot,
} from '../../domain/balance-snapshot.js';
import { FinancialAccountsStoreError } from '../../domain/errors.js';
import {
  checkWalletKind,
  isAccountNature,
  isAccountOrigin,
  isAccountStatus,
  isAccountType,
  isWalletKind,
  type FinancialAccount,
} from '../../domain/financial-account.js';
import type { HsfField } from '../../domain/hsf-field.js';
import {
  isInstitutionKind,
  isInstitutionStatus,
  type Institution,
} from '../../domain/institution.js';
import type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  SourceReference,
} from '../../domain/refs.js';

/** The table every account ciphertext is bound to as associated data. */
export const ACCOUNTS_TABLE = 'financial_accounts';

function currencyOf(code: string, where: string): Currency {
  const currency = Currency.tryGet(code);
  if (currency === undefined) {
    throw new FinancialAccountsStoreError(
      `${where} holds currency code '${code}', which the platform registry does not know — the ` +
        `database CHECK and packages/shared-kernel/src/currency.ts have diverged, and no exponent ` +
        `means no way to interpret the stored minor units`,
    );
  }
  return currency;
}

export interface InstitutionRow {
  id: string;
  code: string;
  kind: string;
  displayNameEn: string;
  displayNameAr: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toInstitution(row: InstitutionRow): Institution {
  if (!isInstitutionStatus(row.status)) {
    throw new FinancialAccountsStoreError(
      `institutions.status holds unknown value '${row.status}'`,
    );
  }
  if (!isInstitutionKind(row.kind)) {
    throw new FinancialAccountsStoreError(
      `institutions.kind holds unknown value '${row.kind}'`,
    );
  }
  return Object.freeze({
    id: row.id as InstitutionRef,
    code: row.code,
    kind: row.kind,
    displayNameEn: row.displayNameEn,
    displayNameAr: row.displayNameAr,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
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

/** The columns 0088 creates on `financial_accounts`. */
export interface FinancialAccountRow {
  id: string;
  tenantId: string;
  userId: string;
  institutionRef: string | null;
  accountType: string;
  walletKind: string | null;
  accountNature: string;
  currencyCode: string;
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  displayNameCiphertext: Uint8Array;
  displayNameNonce: Uint8Array;
  displayNameAuthTag: Uint8Array;
  userSuppliedInstitutionLabelCiphertext: Uint8Array | null;
  userSuppliedInstitutionLabelNonce: Uint8Array | null;
  userSuppliedInstitutionLabelAuthTag: Uint8Array | null;
  maskCiphertext: Uint8Array | null;
  maskNonce: Uint8Array | null;
  maskAuthTag: Uint8Array | null;
  status: string;
  originKind: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The encrypted columns for one account row, as the writer produces them. */
export interface EncryptedAccountColumns {
  hsfAlgorithm: string;
  hsfKeyVersion: string;
  displayNameCiphertext: DbBytes;
  displayNameNonce: DbBytes;
  displayNameAuthTag: DbBytes;
  userSuppliedInstitutionLabelCiphertext: DbBytes | null;
  userSuppliedInstitutionLabelNonce: DbBytes | null;
  userSuppliedInstitutionLabelAuthTag: DbBytes | null;
  maskCiphertext: DbBytes | null;
  maskNonce: DbBytes | null;
  maskAuthTag: DbBytes | null;
}

/**
 * Encrypts the three HSF fields for one account row.
 *
 * All three go through one call so the row carries ONE algorithm and ONE key
 * version: the fields are written together, always, and per-field versions
 * would make a rotation a partial state a reader has to reason about for no
 * gain. `rowId` is the account id and never changes, so a value re-encrypted
 * on an update still authenticates under the same associated data.
 */
export async function encryptAccountFields(
  encryption: HsfFieldEncryptionPort,
  principal: AccountsPrincipal,
  rowId: string,
  fields: {
    readonly displayName: HsfField;
    readonly userSuppliedInstitutionLabel: HsfField | null;
    readonly mask: HsfField | null;
  },
): Promise<EncryptedAccountColumns> {
  const encryptOne = (field: HsfField, name: HsfFieldName): Promise<EncryptedField> =>
    encryption.encryptField(principal, field, {
      table: ACCOUNTS_TABLE,
      rowId,
      field: name,
    });

  const displayName = await encryptOne(fields.displayName, 'displayName');
  const label =
    fields.userSuppliedInstitutionLabel === null
      ? null
      : await encryptOne(fields.userSuppliedInstitutionLabel, 'userSuppliedInstitutionLabel');
  const mask = fields.mask === null ? null : await encryptOne(fields.mask, 'mask');

  // Every field of a row shares the encryption context columns; a mismatch
  // would mean two calls resolved different key versions mid-row, which is a
  // provider defect rather than a state to persist.
  for (const field of [label, mask]) {
    if (field !== null && field.keyVersion !== displayName.keyVersion) {
      throw new FinancialAccountsStoreError(
        'the encryption provider returned two key versions within one row; a row carries one ' +
          'encryption context by design, and a half-rotated row is not a state this schema can express',
      );
    }
  }

  return {
    hsfAlgorithm: displayName.algorithm,
    hsfKeyVersion: displayName.keyVersion,
    displayNameCiphertext: ownedBytes(displayName.ciphertext),
    displayNameNonce: ownedBytes(displayName.nonce),
    displayNameAuthTag: ownedBytes(displayName.authTag),
    userSuppliedInstitutionLabelCiphertext: label === null ? null : ownedBytes(label.ciphertext),
    userSuppliedInstitutionLabelNonce: label === null ? null : ownedBytes(label.nonce),
    userSuppliedInstitutionLabelAuthTag: label === null ? null : ownedBytes(label.authTag),
    maskCiphertext: mask === null ? null : ownedBytes(mask.ciphertext),
    maskNonce: mask === null ? null : ownedBytes(mask.nonce),
    maskAuthTag: mask === null ? null : ownedBytes(mask.authTag),
  };
}

/** Reassembles one stored triple into the shape the port decrypts. */
function storedField(
  row: FinancialAccountRow,
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

/**
 * An optional triple, refusing a half-written one. The database forbids it by
 * CHECK; this is the alarm for a database where the constraint was dropped,
 * and it refuses rather than treating "ciphertext with no tag" as absence.
 */
function optionalStoredField(
  row: FinancialAccountRow,
  field: HsfFieldName,
  ciphertext: Uint8Array | null,
  nonce: Uint8Array | null,
  authTag: Uint8Array | null,
): EncryptedField | null {
  const present = [ciphertext, nonce, authTag].filter((part) => part !== null).length;
  if (present === 0) return null;
  if (present !== 3 || ciphertext === null || nonce === null || authTag === null) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.${field} is a partial encrypted triple — a ciphertext without its nonce ` +
        'or its authentication tag is unreadable and unverifiable, and the all-or-nothing CHECK in ' +
        'migration 0088 is what normally makes this unrepresentable',
    );
  }
  return storedField(row, ciphertext, nonce, authTag);
}

export async function toFinancialAccount(
  row: FinancialAccountRow,
  encryption: HsfFieldEncryptionPort,
  principal: AccountsPrincipal,
): Promise<FinancialAccount> {
  if (!isAccountType(row.accountType)) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.account_type holds unknown value '${row.accountType}'`,
    );
  }
  if (!isAccountStatus(row.status)) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.status holds unknown value '${row.status}'`,
    );
  }
  if (!isAccountOrigin(row.originKind)) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.origin_kind holds unknown value '${row.originKind}'`,
    );
  }
  if (!isAccountNature(row.accountNature)) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.account_nature holds unknown value '${row.accountNature}'`,
    );
  }
  if (row.walletKind !== null && !isWalletKind(row.walletKind)) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.wallet_kind holds unknown value '${row.walletKind}'`,
    );
  }
  const walletKind = row.walletKind;
  // The biconditional, re-checked on the way out: migration 0095's CHECK is
  // what normally makes a mismatch unrepresentable, so reaching this means the
  // constraint is gone and a plausible-looking account would hide that.
  const wallet = checkWalletKind(row.accountType, walletKind);
  if (!wallet.ok) {
    throw new FinancialAccountsStoreError(
      `financial_accounts row ${row.id} breaks the wallet invariant (account_type ` +
        `'${row.accountType}', wallet_kind ${walletKind === null ? 'NULL' : `'${walletKind}'`}) — ` +
        'a wallet kind exists if and only if the type is WALLET, and migration 0095 has a CHECK ' +
        'that makes this unrepresentable',
    );
  }

  const decryptOne = (encrypted: EncryptedField, field: HsfFieldName): Promise<HsfField> =>
    encryption.decryptField(principal, encrypted, {
      table: ACCOUNTS_TABLE,
      rowId: row.id,
      field,
    });

  const displayName = await decryptOne(
    storedField(row, row.displayNameCiphertext, row.displayNameNonce, row.displayNameAuthTag),
    'displayName',
  );
  const storedLabel = optionalStoredField(
    row,
    'userSuppliedInstitutionLabel',
    row.userSuppliedInstitutionLabelCiphertext,
    row.userSuppliedInstitutionLabelNonce,
    row.userSuppliedInstitutionLabelAuthTag,
  );
  const label =
    storedLabel === null ? null : await decryptOne(storedLabel, 'userSuppliedInstitutionLabel');
  const storedMask = optionalStoredField(
    row,
    'mask',
    row.maskCiphertext,
    row.maskNonce,
    row.maskAuthTag,
  );
  const mask = storedMask === null ? null : await decryptOne(storedMask, 'mask');

  return Object.freeze({
    id: row.id as FinancialAccountId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    institutionRef: row.institutionRef === null ? null : (row.institutionRef as InstitutionRef),
    userSuppliedInstitutionLabel: label,
    accountType: row.accountType,
    walletKind,
    nature: row.accountNature,
    currency: currencyOf(row.currencyCode, 'financial_accounts.currency_code'),
    displayName,
    mask,
    status: row.status,
    origin: row.originKind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  });
}

export interface BalanceSnapshotRow {
  id: string;
  tenantId: string;
  userId: string;
  accountId: string;
  amountMinorUnits: bigint;
  currencyCode: string;
  asOf: Date;
  sourceKind: string;
  balanceKind: string;
  sourceReference: string;
  capturedAt: Date;
  createdAt: Date;
}

export function toBalanceSnapshot(row: BalanceSnapshotRow): BalanceSnapshot {
  if (!isSourceKind(row.sourceKind)) {
    throw new FinancialAccountsStoreError(
      `financial_account_balance_snapshots.source_kind holds unknown value '${row.sourceKind}'`,
    );
  }
  // Refused rather than coerced to a nearest kind: a figure whose kind this
  // code cannot name is a figure nobody can interpret, and substituting one
  // would be the inference the column exists to prevent.
  if (!isBalanceKind(row.balanceKind)) {
    throw new FinancialAccountsStoreError(
      `financial_account_balance_snapshots.balance_kind holds unknown value '${row.balanceKind}'`,
    );
  }
  return Object.freeze({
    id: row.id as BalanceSnapshotId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    accountId: row.accountId as FinancialAccountId,
    amount: Money.of(
      row.amountMinorUnits,
      currencyOf(row.currencyCode, 'financial_account_balance_snapshots.currency_code'),
    ),
    asOf: row.asOf,
    sourceKind: row.sourceKind,
    balanceKind: row.balanceKind,
    sourceReference: row.sourceReference as SourceReference,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
  });
}
