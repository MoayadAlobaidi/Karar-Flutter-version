/**
 * The transactions module's only legal import surface (architecture test 3).
 *
 * Exported: the domain vocabulary and its pure rules (the sign convention
 * above all), the ports this module declares — including the two the
 * statement-ingestion workstream will bind, `DedupFingerprintPort` and
 * `HsfFieldEncryptionPort` — the use cases, and the infrastructure
 * implementations the composition root wires.
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
  type CategoryUnknown,
  type DuplicateTransaction,
  type InvalidCursor,
  type NoChange,
  type NotFound,
  type PrincipalContextMissing,
  type StoreFailure,
  type UserAssignmentWins,
  type VersionConflict,
} from './application/errors.js';
export type {
  PrincipalContextPort,
  TransactionsPrincipal,
} from './application/ports/principal-context.js';
export type { IdSource } from './application/ports/id-source.js';
export {
  DuplicateTransactionError,
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
