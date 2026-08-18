/**
 * The financial-accounts module's only legal import surface (architecture
 * test 3). Nothing outside this module may reach past this file.
 *
 * Exported: the domain read shapes and rules, the application ports and
 * errors, the use cases, and the infrastructure implementations the
 * composition root needs to wire them.
 *
 * **Deliberately NOT exported, and worth stating so nobody adds it later:**
 * no function that computes a balance from transactions (there is none to
 * export — a derived balance is a different concept from a reported one, and
 * it will arrive under its own name), no way to construct a `sourceKind` of
 * `EXTERNAL_PROVIDER` (the factory accepts only the constructible kinds), and
 * no write path into the institution catalogue (it changes by reviewed
 * migration, and a runtime writer would be the first step toward one
 * subject's typed bank name becoming global reference data).
 *
 * This module also exports no presentation layer this phase: the HTTP surface
 * and its composition belong to the API application, and nothing here assumes
 * a transport.
 */

// domain — read shapes and rules
export {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CONSTRUCTIBLE_SOURCE_KINDS,
  MAX_DISPLAY_TEXT_LENGTH,
  SOURCE_KINDS,
  applyAccountEdit,
  checkCurrencyChange,
  checkProviderConnection,
  createFinancialAccount,
  isAccountStatus,
  isAccountType,
  isMask,
  isSourceKind,
  normalizeDisplayText,
  resolveSupportedCurrency,
  type AccountEdit,
  type AccountStatus,
  type AccountType,
  type ConstructibleSourceKind,
  type FinancialAccount,
  type NewFinancialAccount,
  type SourceKind,
} from './domain/financial-account.js';
export {
  INSTITUTION_STATUSES,
  isInstitutionStatus,
  isSelectableForNewAccount,
  isValidInstitutionCode,
  type Institution,
  type InstitutionStatus,
} from './domain/institution.js';
export {
  MAX_SOURCE_REFERENCE_LENGTH,
  byMostRecentlyTrue,
  isValidSourceReference,
  latestReported,
  type BalanceSnapshot,
} from './domain/balance-snapshot.js';
export type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  ProviderConnectionRef,
  SourceReference,
} from './domain/refs.js';
export {
  FinancialAccountsStoreError,
  type CurrencyImmutableWithRecords,
  type FinancialAccountRuleViolation,
  type InstitutionNamedTwice,
  type InvalidDisplayText,
  type MaskNotAMask,
  type ProviderConnectionMismatch,
  type UnknownVocabularyValue,
  type UnsupportedCurrency,
} from './domain/errors.js';

// application — principal, errors, ports
export {
  requirePrincipal,
  type AccountsPrincipal,
  type MissingPrincipalContext,
} from './application/principal.js';
export {
  ACCOUNT_NOT_FOUND,
  storeFailure,
  type AccountNotFound,
  type CreateManualAccountError,
  type DeleteOwnAccountError,
  type InstitutionNotSelectable,
  type ListOwnAccountsError,
  type ListOwnBalanceSnapshotsError,
  type ReadOwnAccountError,
  type RuleViolated,
  type StoreFailure,
  type UpdateOwnAccountError,
  type VersionConflict,
} from './application/errors.js';
export type {
  AccountDeleteOutcome,
  AccountUpdateOutcome,
  FinancialAccountRepository,
} from './application/ports/financial-account-repository.js';
export type { BalanceSnapshotRepository } from './application/ports/balance-snapshot-repository.js';
export type { InstitutionCatalogueReader } from './application/ports/institution-catalogue-reader.js';
export type { IdSource } from './application/ports/id-source.js';

// application — use cases
export { ListOwnAccounts } from './application/use-cases/list-own-accounts.js';
export {
  ReadOwnAccount,
  type ReadOwnAccountInput,
} from './application/use-cases/read-own-account.js';
export {
  CreateManualAccount,
  type CreateManualAccountInput,
} from './application/use-cases/create-manual-account.js';
export {
  UpdateOwnAccount,
  type UpdateOwnAccountInput,
} from './application/use-cases/update-own-account.js';
export {
  DeleteOwnAccount,
  type AccountDeleted,
  type DeleteOwnAccountInput,
} from './application/use-cases/delete-own-account.js';
export {
  ListOwnBalanceSnapshots,
  type ListOwnBalanceSnapshotsInput,
} from './application/use-cases/list-own-balance-snapshots.js';

// infrastructure — implementations for the composition root
export { PrismaFinancialAccountRepository } from './infrastructure/persistence/prisma-financial-account-repository.js';
export { PrismaBalanceSnapshotRepository } from './infrastructure/persistence/prisma-balance-snapshot-repository.js';
export { PrismaInstitutionCatalogueReader } from './infrastructure/persistence/prisma-institution-catalogue-reader.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
