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
 * it will arrive under its own name), no function that sums or nets account
 * balances by `AccountNature` (a net worth is a different concept again, with
 * its own correctness problem), no function that derives one `BalanceKind`
 * from another (`latestReported` requires the caller to name the kind, and a
 * kind nobody reported answers null rather than substituting a neighbour), no way to construct an account `origin` of
 * `EXTERNAL_PROVIDER` (the factory accepts only the constructible origins), no
 * `ProviderConnectionRef` (an account has many data sources over its life and
 * none of them is a field on the account — ADR-0028), and no write path into
 * the institution catalogue or its market rows (both change by reviewed
 * migration, and a runtime writer would be the first step toward one subject's
 * typed bank name becoming global reference data).
 *
 * This module also exports no presentation layer this phase: the HTTP surface
 * and its composition belong to the API application, and nothing here assumes
 * a transport.
 *
 * **Five ports are declared here and implemented elsewhere**, and the
 * direction is the point: `FinancialRecordPresencePort` and
 * `FinancialRecordEraserPort` are satisfied by the transactions module,
 * `AccountSourceLinkEraserPort` by the financial-connections module,
 * `PaymentInstrumentEraserPort` by the payment-instruments module, and
 * `FinancialAccountRetentionDecisionPort` by whatever reads an approved
 * policy pack. Nothing in this module imports any of those implementations,
 * so the interfaces are exported for a composition root to bind — never for
 * another module to depend on this one's internals. In particular this module
 * imports nothing from `@karar/financial-connections` or
 * `@karar/payment-instruments`: those modules depend on this one, and the
 * erasure ports are what let the deletion path reach their rows without the
 * dependency ever pointing back.
 *
 * **The local providers are exported and are refusals as much as they are
 * implementations.** `LocalAesGcmFieldEncryptionProvider` and
 * `LocalSyntheticRetentionDecisionProvider` throw outside `KARAR_ENV=local`,
 * and the two `resolve…` functions throw in any other environment that has
 * not been given an approved provider. Exporting them is what lets a
 * composition root fail at boot instead of at the first write.
 */

// domain — read shapes and rules
export {
  ACCOUNT_NATURES,
  ACCOUNT_ORIGINS,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CONSTRUCTIBLE_ACCOUNT_ORIGINS,
  MAX_DISPLAY_TEXT_LENGTH,
  MAX_MASK_LENGTH,
  WALLET_KINDS,
  applyAccountEdit,
  checkCurrencyChange,
  checkWalletKind,
  createFinancialAccount,
  isAccountNature,
  isAccountOrigin,
  isAccountStatus,
  isAccountType,
  isMask,
  isWalletKind,
  normalizeDisplayText,
  resolveSupportedCurrency,
  type AccountEdit,
  type AccountNature,
  type AccountOrigin,
  type AccountStatus,
  type AccountType,
  type ConstructibleAccountOrigin,
  type FinancialAccount,
  type NewFinancialAccount,
  type WalletKind,
} from './domain/financial-account.js';
export {
  INSTITUTION_KINDS,
  INSTITUTION_STATUSES,
  isInstitutionKind,
  isInstitutionStatus,
  isSelectableForNewAccount,
  isValidInstitutionCode,
  type Institution,
  type InstitutionKind,
  type InstitutionStatus,
} from './domain/institution.js';
export {
  BALANCE_KINDS,
  CONSTRUCTIBLE_SOURCE_KINDS,
  SOURCE_KINDS,
  byMostRecentlyTrue,
  createBalanceSnapshot,
  isBalanceKind,
  isSourceKind,
  isValidSourceReference,
  latestReported,
  type BalanceKind,
  type BalanceSnapshot,
  type ConstructibleSourceKind,
  type NewBalanceSnapshot,
  type SourceKind,
} from './domain/balance-snapshot.js';
export {
  HSF_FIELD_MAX_LENGTH,
  HSF_REDACTION,
  HsfField,
  InvalidHsfFieldError,
  hsfFieldsEqual,
} from './domain/hsf-field.js';
export type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  SourceReference,
} from './domain/refs.js';
export {
  FinancialAccountsStoreError,
  type CurrencyImmutableWithRecords,
  type FinancialAccountRuleViolation,
  type InstitutionNamedTwice,
  type InvalidDisplayText,
  type InvalidSourceReference,
  type MaskNotAMask,
  type SnapshotCurrencyMismatch,
  type UnknownVocabularyValue,
  type UnsupportedCurrency,
  type WalletKindMismatch,
} from './domain/errors.js';

// application — principal, errors, ports
export {
  requirePrincipal,
  type AccountsPrincipal,
  type MissingPrincipalContext,
} from './application/principal.js';
export {
  ACCOUNT_NOT_FOUND,
  recordPresenceUnavailable,
  retentionUnresolved,
  storeFailure,
  type AccountNotFound,
  type CreateManualAccountError,
  type DeleteOwnAccountError,
  type DeletionPartiallyApplied,
  type ErasureIncomplete,
  type InstitutionNotSelectable,
  type InstrumentErasureIncomplete,
  type ListOwnAccountsError,
  type ListOwnBalanceSnapshotsError,
  type ReadOwnAccountError,
  type RecordPresenceUnavailable,
  type RecordReportedBalanceError,
  type RetentionUnresolved,
  type RuleViolated,
  type SourceLinkErasureIncomplete,
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
export {
  HSF_FIELD_NAMES,
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
  type HsfFieldName,
} from './application/ports/hsf-field-encryption.js';
export {
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type FinancialAccountRetentionDecisionPort,
  type FinancialRetentionDecision,
  type RetentionDecided,
  type RetentionGovernedDataset,
  type RetentionNotApplicable,
  type RetentionPendingLegalReview,
  type RetentionUnavailable,
} from './application/ports/financial-account-retention-decision.js';
export type {
  FinancialRecordPresence,
  FinancialRecordPresencePort,
} from './application/ports/financial-record-presence.js';
export {
  ERASABLE_FINANCIAL_RECORD_KINDS,
  NO_RECORDS_ERASED,
  totalErased,
  type ErasableFinancialRecordKind,
  type FinancialRecordEraserPort,
  type FinancialRecordErasureCounts,
  type FinancialRecordErasureOutcome,
} from './application/ports/financial-record-eraser.js';
export type {
  AccountSourceLinkEraserPort,
  AccountSourceLinkErasureOutcome,
} from './application/ports/account-source-link-eraser.js';
export type {
  PaymentInstrumentEraserPort,
  PaymentInstrumentErasureOutcome,
} from './application/ports/payment-instrument-eraser.js';

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
export {
  RecordReportedBalance,
  type RecordReportedBalanceInput,
} from './application/use-cases/record-reported-balance.js';

// infrastructure — implementations for the composition root
export { PrismaFinancialAccountRepository } from './infrastructure/persistence/prisma-financial-account-repository.js';
export { PrismaBalanceSnapshotRepository } from './infrastructure/persistence/prisma-balance-snapshot-repository.js';
export { PrismaInstitutionCatalogueReader } from './infrastructure/persistence/prisma-institution-catalogue-reader.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
export {
  LocalAesGcmFieldEncryptionProvider,
  LocalHsfEncryptionEnvironmentError,
  resolveHsfFieldEncryptionPort,
} from './infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
export {
  LocalRetentionFixtureEnvironmentError,
  LocalRetentionFixtureMissingError,
  LocalSyntheticRetentionDecisionProvider,
  resolveRetentionDecisionPort,
} from './infrastructure/providers/local-synthetic-retention-decision-provider.js';
