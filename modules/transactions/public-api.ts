/**
 * The transactions module's only legal import surface (architecture test 3).
 *
 * Exported: the domain vocabulary and its pure rules (the sign convention
 * above all), the ports this module declares — including the two the
 * statement-ingestion workstream will bind, `DedupFingerprintPort` and
 * `HsfFieldEncryptionPort` — the use cases, and the infrastructure
 * implementations the composition root wires.
 *
 * Also exported, and worth finding quickly:
 *
 * - `FinancialAccountAccessPort` and `TransactionRetentionDecisionPort` —
 *   the two inward ports `CreateManualTransaction` refuses through. The
 *   composition root binds the first to an adapter over
 *   `modules/financial-accounts`' public API (nothing here imports that
 *   module) and the second to the PolicyPack retention slot, or, in a local
 *   environment only, to the synthetic fixture below.
 * - `PrismaFinancialRecordPresenceReader` and `PrismaFinancialRecordEraser` —
 *   this module's implementations of the two ports the accounts module
 *   declares, so that accounts can block a currency change while records
 *   exist and erase an account's records without ever importing this module.
 *   The eraser takes a `TransferMatchEraserPort` because a record cannot go
 *   before the relationships naming it do.
 * - `TransferMatchEraserPort` — declared here and satisfied by
 *   `modules/transfer-matching`, which depends on this module and is not
 *   depended on by it. Both of this module's deletion paths call it.
 *
 * Deliberately absent:
 *
 * - **Any use case that reads or writes somebody else's transactions.** There
 *   is no `ListTransactionsForUser`, no admin read, and no input type with a
 *   `userId` on it. The principal arrives through `PrincipalContextPort`, and
 *   MODULE.md records the product rule this implements: no staff endpoint
 *   returns one customer's transactions, and no `?userId=` parameter is
 *   accepted anywhere.
 * - **Anything that scores, ranks, or guesses.** Categorisation is a person's
 *   choice or a reviewed exact-match rule. No AI, no LLM, no confidence.
 * - **The CSV pipeline.** Parsing, staging, review, and commit belong to the
 *   ingestion workstream; this module owns the core it commits into and the
 *   two ports it commits through.
 * - **Any HTTP surface.** Presentation arrives with its own workstream.
 *
 * The LOCAL/TEST adapters are exported and say what they are: they hold key
 * material in process memory, which production must not do.
 */

// domain — vocabulary, references, and pure rules
export {
  ACCOUNT_REFERENCE_TYPES,
  AccountRef,
  ActorRef,
  ImportRef,
  InvalidReferenceError,
  RowRef,
  TransactionId,
  type AccountReferenceType,
} from './domain/refs.js';
export {
  HSF_FIELD_MAX_LENGTH,
  HSF_REDACTION,
  HsfField,
  InvalidHsfFieldError,
  hsfFieldsEqual,
} from './domain/hsf-field.js';
export {
  DIRECTION_MAPPINGS,
  MONEY_DIRECTIONS,
  SOURCE_DIRECTIONS,
  SignConventionError,
  directionOf,
  signAgreesWithSource,
  signedAmountFor,
  sourceDirectionOf,
  type DirectionMapping,
  type MoneyDirection,
  type SourceDirection,
} from './domain/sign-convention.js';
export {
  InvalidTransactionError,
  OriginalAmount,
  SOURCE_KINDS,
  TRANSACTION_STATUSES,
  applyCorrection,
  createTransaction,
  type SourceKind,
  type Transaction,
  type TransactionCorrection,
  type TransactionStatus,
} from './domain/transaction.js';
export {
  InvalidRevisionError,
  REVISABLE_FIELDS,
  REVISION_ATTRIBUTIONS,
  changedFieldsBetween,
  correctionRevision,
  divergesFromSource,
  originalRevision,
  sourceSuppliedValues,
  valuesOf,
  type RevisableField,
  type RevisionAttribution,
  type RevisionValues,
  type TransactionRevision,
} from './domain/revision.js';
export {
  CATEGORY_ASSIGNMENT_SOURCES,
  InvalidProvenanceError,
  PROVENANCE_REQUIRED_FACTS,
  createProvenance,
  isExplainable,
  type CategoryAssignmentSource,
  type ProcessingVersions,
  type TransactionProvenance,
} from './domain/provenance.js';
export {
  CategoryCode,
  InvalidCategoryError,
  createFinancialCategory,
  isAssignable,
  type CategoryLabels,
  type FinancialCategory,
} from './domain/category-catalogue.js';
export {
  ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUSES,
  InvalidAssignmentError,
  activeAssignment,
  canSupersede,
  createAssignment,
  hasUserDecision,
  orderedChain,
  type AssignmentSource,
  type AssignmentStatus,
  type TransactionCategoryAssignment,
} from './domain/category-assignment.js';

// application — errors, ports, pagination, use cases
export {
  InvalidTransactionInputError,
  principalContextMissing,
  requireNonEmpty,
  toStoreFailure,
  type AccountCurrencyMismatch,
  type AccountNotWritable,
  type CategoryUnknown,
  type DuplicateTransaction,
  type InvalidCursor,
  type NoChange,
  type NotFound,
  type OccurrenceOrdinalNotNext,
  type PrincipalContextMissing,
  type RetentionUndecided,
  type StoreFailure,
  type TransactionDeletionPartiallyApplied,
  type TransferMatchErasureIncomplete,
  type UserAssignmentWins,
  type VersionConflict,
} from './application/errors.js';
export type {
  PrincipalContextPort,
  TransactionsPrincipal,
} from './application/ports/principal-context.js';
export type { IdSource } from './application/ports/id-source.js';
// The gates CreateManualTransaction refuses through. Bound by the lead: the
// account port to a composition adapter over financial-accounts' public API,
// the retention port to the PolicyPack slot (or, locally only, the fixture).
export {
  ACCOUNT_LIFECYCLE_STATES,
  WRITABLE_ACCOUNT_LIFECYCLE_STATES,
  isWritableLifecycleState,
  type AccountAccessSummary,
  type AccountLifecycleState,
  type FinancialAccountAccessPort,
} from './application/ports/financial-account-access.js';
export {
  RETENTION_DECISION_EFFECTS,
  type RetentionDecided,
  type RetentionDecisionEffect,
  type RetentionPendingLegalReview,
  type RetentionUnavailable,
  type TransactionRetentionDecision,
  type TransactionRetentionDecisionPort,
} from './application/ports/transaction-retention-decision.js';
// The two ports modules/financial-accounts declares and this module fills.
// These are re-exports of that module's own declarations, not copies of them:
// the types travel one way (accounts -> transactions) and the implementations
// travel back through this surface, so the lead binds the adapters below
// straight into its use cases with no adapter in between. A second structurally
// identical declaration here would let the two drift apart silently, which is
// exactly what a shared inward port must not permit.
export {
  ERASABLE_FINANCIAL_RECORD_KINDS,
  NO_RECORDS_ERASED,
  type ErasableFinancialRecordKind,
  type FinancialRecordEraserPort,
  type FinancialRecordErasureCounts,
  type FinancialRecordErasureOutcome,
  type FinancialRecordPresence,
  type FinancialRecordPresencePort,
} from './application/ports/financial-record-lifecycle.js';
// The port THIS module declares and modules/transfer-matching fills, so that
// deleting a transaction — or erasing every record on an account — reaches
// the matches that name them without either deletion path ever importing that
// module. See the file for why both scopes live on one port.
export type {
  TransferMatchEraserPort,
  TransferMatchErasureOutcome,
} from './application/ports/transfer-match-eraser.js';
export {
  DuplicateTransactionError,
  OccurrenceOrdinalNotNextError,
  TransactionVersionConflictError,
  type TransactionCommit,
  type TransactionCorrectionCommit,
  type TransactionCursor,
  type TransactionPage,
  type TransactionPageQuery,
  type TransactionRepository,
} from './application/ports/transaction-repository.js';
export {
  AssignmentConflictError,
  type AssignmentCommit,
  type CategoryAssignmentRepository,
  type FinancialCategoryCatalogue,
  type MerchantRuleDirectory,
  type MerchantRuleMatch,
} from './application/ports/category-repository.js';
// The two ports the statement-ingestion workstream binds.
export type {
  DedupFingerprint,
  DedupFingerprintPort,
  FingerprintInput,
} from './application/ports/dedup-fingerprint.js';
export {
  HSF_FIELD_NAMES,
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
  type HsfFieldName,
} from './application/ports/hsf-field-encryption.js';
export { decodeCursor, encodeCursor } from './application/pagination.js';
export {
  ListOwnTransactions,
  TRANSACTION_PAGE_LIMITS,
  type ListOwnTransactionsError,
  type ListOwnTransactionsInput,
  type TransactionPageView,
} from './application/use-cases/list-own-transactions.js';
export {
  CreateManualTransaction,
  MANUAL_ENTRY_MAPPING_VERSION,
  MANUAL_ENTRY_NORMALIZATION_VERSION,
  MANUAL_ENTRY_PARSER_VERSION,
  type CreateManualTransactionError,
  type CreateManualTransactionInput,
} from './application/use-cases/create-manual-transaction.js';
export {
  ReadOwnTransaction,
  type OwnTransactionView,
  type ReadOwnTransactionError,
  type ReadOwnTransactionInput,
} from './application/use-cases/read-own-transaction.js';
export {
  CORRECTION_FINGERPRINT_VERSION,
  UpdateOwnTransaction,
  type UpdateOwnTransactionError,
  type UpdateOwnTransactionInput,
} from './application/use-cases/update-own-transaction.js';
export {
  DeleteOwnTransaction,
  type DeleteOwnTransactionError,
  type DeleteOwnTransactionInput,
  type TransactionDeleted,
} from './application/use-cases/delete-own-transaction.js';
export {
  AssignCategory,
  type AssignCategoryError,
  type AssignCategoryInput,
} from './application/use-cases/assign-category.js';

// infrastructure — implementations for the composition root
export { PrismaTransactionRepository } from './infrastructure/persistence/prisma-transaction-repository.js';
export {
  PrismaCategoryAssignmentRepository,
  PrismaFinancialCategoryCatalogue,
  PrismaMerchantRuleDirectory,
} from './infrastructure/persistence/prisma-category-repositories.js';
export {
  PrismaFinancialRecordEraser,
  PrismaFinancialRecordPresenceReader,
} from './infrastructure/persistence/prisma-financial-record-lifecycle.js';
export { TransactionStoreError } from './infrastructure/persistence/row-mappers.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
// LOCAL/TEST ONLY — both hold key material in process memory. Production
// binds these ports to adapters over the platform's key-management provider
// (ADR-0017), with custody, rotation, and the sealed-integrity canary.
export { LocalAesGcmFieldEncryptionProvider } from './infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
export {
  DEDUP_FINGERPRINT_VERSION,
  LocalKeyedDedupFingerprintProvider,
  fingerprintsEqual,
} from './infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
// LOCAL ONLY — and it enforces that itself: constructing it outside a local
// environment throws, because a decision with no legal effect must not be
// able to govern real data. A deployed environment binds the retention port
// to the PolicyPack slot, which today answers PENDING_LEGAL_REVIEW.
export {
  LocalRetentionFixtureMissingError,
  LocalSyntheticRetentionDecisionProvider,
} from './infrastructure/providers/local-synthetic-retention-decision-provider.js';
