/**
 * Row to domain mapping. Prisma rows stop here (architecture test 4): nothing
 * above this layer sees a Prisma type, a `BigInt` field, or a raw currency
 * string.
 *
 * **A row this vocabulary cannot name is a DEFECT, not a user outcome.** An
 * unknown account type, status, source kind, or currency code means the
 * database and the code have diverged — a migration applied without its code
 * change, or the reverse. That throws `FinancialAccountsStoreError` rather
 * than becoming a `Result` arm, because silently coercing it (to `OTHER`, to
 * `ACTIVE`, to a guessed currency) would produce a plausible-looking record
 * that is wrong, which is exactly the failure mode this module exists to
 * avoid. The closed CHECK constraints in migrations 0087-0089 make these
 * throws unreachable in a consistent database; they are the alarm for when it
 * is not.
 *
 * The money mapping is the load-bearing one: `amount_minor_units` arrives as
 * a JavaScript `bigint` (never a `number` — 2^53 is not a safe bound) and is
 * paired with its currency, whose ISO 4217 exponent is the only thing that
 * says what those units mean.
 */

import { Currency, Money, TenantId, UserId } from '@karar/shared-kernel';

import type { BalanceSnapshot } from '../../domain/balance-snapshot.js';
import { FinancialAccountsStoreError } from '../../domain/errors.js';
import {
  isAccountStatus,
  isAccountType,
  isSourceKind,
  type FinancialAccount,
} from '../../domain/financial-account.js';
import { isInstitutionStatus, type Institution } from '../../domain/institution.js';
import type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  ProviderConnectionRef,
  SourceReference,
} from '../../domain/refs.js';

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
  return Object.freeze({
    id: row.id as InstitutionRef,
    code: row.code,
    displayNameEn: row.displayNameEn,
    displayNameAr: row.displayNameAr,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export interface FinancialAccountRow {
  id: string;
  tenantId: string;
  userId: string;
  institutionRef: string | null;
  userSuppliedInstitutionLabel: string | null;
  accountType: string;
  currencyCode: string;
  displayName: string;
  mask: string | null;
  status: string;
  sourceKind: string;
  providerConnectionRef: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toFinancialAccount(row: FinancialAccountRow): FinancialAccount {
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
  if (!isSourceKind(row.sourceKind)) {
    throw new FinancialAccountsStoreError(
      `financial_accounts.source_kind holds unknown value '${row.sourceKind}'`,
    );
  }
  return Object.freeze({
    id: row.id as FinancialAccountId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    institutionRef: row.institutionRef === null ? null : (row.institutionRef as InstitutionRef),
    userSuppliedInstitutionLabel: row.userSuppliedInstitutionLabel,
    accountType: row.accountType,
    currency: currencyOf(row.currencyCode, 'financial_accounts.currency_code'),
    displayName: row.displayName,
    mask: row.mask,
    status: row.status,
    sourceKind: row.sourceKind,
    providerConnectionRef:
      row.providerConnectionRef === null
        ? null
        : (row.providerConnectionRef as ProviderConnectionRef),
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
    sourceReference: row.sourceReference as SourceReference,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
  });
}
