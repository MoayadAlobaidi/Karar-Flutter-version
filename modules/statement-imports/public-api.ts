/**
 * The statement-imports module's only legal import surface (architecture test
 * 3). Nothing outside this module may reach past this file.
 *
 * Exported: the domain vocabulary and its pure rules, the ports this module
 * declares, the use cases, and the infrastructure implementations a
 * composition root wires.
 *
 * **Deliberately NOT exported, and worth stating so nobody adds it later:**
 *
 * - **No way to commit without review.** `CommitStatementImport` refuses any
 *   state but `REVIEW_REQUIRED`, the domain's transition list refuses
 *   `PARSING -> COMMITTED`, and `statement_imports_guard` refuses it in the
 *   database (SQLSTATE `KAR51`). There is no "import and commit" convenience,
 *   no `autoCommit` flag, and no parameter that skips the stop.
 * - **No way to store a source without a retention decision.** The only path
 *   to a stored statement is `StoreImportSource`, which asks the port and
 *   refuses on anything but `DECIDED` — and `statement_import_sources_guard`
 *   refuses the row anyway (`KAR54`).
 * - **No second dedup fingerprint.** This module computes content identity
 *   through `@karar/transactions`' `DedupFingerprintPort` and exports no
 *   fingerprint function, no comparator, and no way for another module to
 *   mint one. Two definitions of "the same transaction" disagree, and the
 *   disagreement surfaces as duplicated or vanished financial records.
 * - **No way to read a stored statement's bytes.** `EncryptedSourceStorePort`
 *   is exported so a composition root can bind a key-management-backed
 *   adapter; no use case returns plaintext, and the preview reports whether a
 *   source exists as a BOOLEAN rather than as a handle.
 * - **No value read out of the file.** `StatementImportPreview` carries
 *   counts, states, versions and `(row number, safe field, reason code)`. No
 *   cell, no header text, no amount, no merchant, no balance, no fingerprint.
 * - **Nothing that scores, ranks, or guesses.** Categorisation is an exact
 *   reviewed rule or nothing. There is no confidence, no similarity, no
 *   nearest match, and no model.
 * - **No way for content to acquire instruction authority.**
 *   `ContentTrust`'s trusted arm is minted only by `platformInstruction`, which
 *   accepts a member of a closed source-declared registry — so a `string` read
 *   out of a file cannot reach it, and a bare object literal is not one either
 *   (the origin is nominally branded). There is no classifier that reads text
 *   and decides it looks safe, no keyword list, and no numeric trust score.
 *   ADR-0029.
 * - **No reconciliation figure this platform derived.** `reconcile` compares
 *   only figures the FILE stated; there is no exported function that sums
 *   rows into a balance, because that number compared against itself is a
 *   control that cannot fail.
 * - **No presentation layer.** The HTTP surface belongs to the API
 *   application and arrives in a later commit with the phase move and the
 *   limit-policy registration — see MODULE.md.
 *
 * **The local providers are exported and are refusals as much as they are
 * implementations.** `LocalEncryptedSourceStore`,
 * `LocalAesGcmFieldEncryptionProvider` and
 * `LocalSyntheticRetentionDecisionProvider` all throw outside
 * `KARAR_ENV=local`, and the two `resolve…` functions throw in any other
 * environment that has not been given an approved provider. Exporting them is
 * what lets a composition root fail at boot instead of at the first write.
 */

// domain — vocabulary and pure rules
export {
  IMPORT_STATES,
  LEGAL_IMPORT_TRANSITIONS,
  STATES_THAT_MAY_HAVE_COMMITTED,
  TERMINAL_IMPORT_STATES,
  checkTransition,
  isImportState,
  isLegalTransition,
  isTerminalImportState,
  mayHaveCommittedTransactions,
  type ImportState,
} from './domain/import-state.js';
export {
  NO_ROWS,
  SUPPORTED_MEDIA_TYPE,
  StatementImportRuleError,
  awaitsSubjectDecision,
  recordRetentionDecision,
  startImport,
  transitionTo,
  type ImportCounts,
  type ImportRetention,
  type NewStatementImport,
  type ProcessingVersions,
  type RetentionDecided as ImportRetentionDecided,
  type RetentionUndecided as ImportRetentionUndecided,
  type StatementImport,
  type SupportedMediaType,
  type TransitionPatch,
} from './domain/statement-import.js';
export {
  IMPORT_REFUSAL_CODES,
  ROW_ERROR_REASON_CODES,
  SAFE_FIELDS,
  isImportRefusalCode,
  isRowErrorReasonCode,
  isSafeField,
  rowError,
  type ImportRefusalCode,
  type RowError,
  type RowErrorReasonCode,
  type SafeField,
} from './domain/reason-codes.js';
export {
  NORMALIZATION_VERSION,
  SUPPORTED_DIGIT_FAMILIES,
  foldDigits,
  isDateOrder,
  normalizeAmount,
  normalizeDay,
  normalizeInstant,
  normalizeText,
  normalizeTimezone,
  DATE_ORDERS,
  type DateOrder,
  type NormalizedAmount,
  type Normalized,
} from './domain/normalization.js';
export {
  AMOUNT_SIGN_FRAMES,
  MAPPING_VERSION,
  MAPPING_VIOLATION_KINDS,
  SOURCE_BALANCE_KINDS,
  STATEMENT_BALANCE_KINDS,
  checkMapping,
  declaredColumns,
  unstatedConventionReason,
  type AmountColumns,
  type AmountSignFrame,
  type DebitCreditColumns,
  type MappingViolation,
  type MappingViolationKind,
  type SignedAmountColumns,
  type SourceBalanceKind,
  type StatementBalanceKind,
  type StatementColumnMapping,
} from './domain/column-mapping.js';
export {
  DIRECTION_MAPPINGS,
  SOURCE_DIRECTIONS,
  distinctAccountIdentifiers,
  mapStatementRow,
  type DirectionMapping,
  type MappedStatementRow,
  type RowMappingOutcome,
  type SourceDirection,
} from './domain/statement-row.js';
export {
  RECONCILIATION_STATUSES,
  RECONCILIATION_UNAVAILABLE_REASONS,
  permitsCommit,
  reconcile,
  type ReconcilableRow,
  type ReconciliationOutcome,
  type ReconciliationStatus,
  type ReconciliationUnavailableReason,
  type StatedStatementBalance,
} from './domain/reconciliation.js';
export {
  INTEGRITY_CHECKSUM_ALGORITHMS,
  InvalidSourceObjectRefError,
  MAX_SOURCE_OBJECT_REF_LENGTH,
  SOURCE_STORE_KINDS,
  SourceObjectRef,
  checksumsEqual,
  type IntegrityChecksumAlgorithm,
  type SourceStoreKind,
  type StoredSourceDescriptor,
} from './domain/encrypted-source.js';
export {
  HSF_FIELD_MAX_LENGTH,
  HSF_REDACTION,
  HsfField,
  InvalidHsfFieldError,
  hsfFieldsEqual,
} from './domain/hsf-field.js';
export {
  CONTENT_TRUST_CLASSES,
  PLATFORM_FACT_DERIVATIONS,
  PLATFORM_INSTRUCTION_ORIGINS,
  RECORDED_NARRATIVE_ORIGINS,
  SUBJECT_TYPED_CONTENT,
  UNTRUSTED_ACQUISITIONS,
  UNTRUSTED_REDACTION,
  UPLOADED_FILE_CONTENT,
  InvalidPlatformInstructionOriginError,
  UntrustedSourceText,
  carriesInstructionAuthority,
  isContentTrustClass,
  isUntrusted,
  platformInstruction,
  structuredPlatformFact,
  trustClassOf,
  trustOfRecordedNarrative,
  untrustedContent,
  type ContentTrust,
  type ContentTrustClass,
  type PlatformFactDerivation,
  type PlatformInstructionOrigin,
  type PlatformInstructionOriginId,
  type RecordedNarrativeOrigin,
  type TrustedPlatformInstruction,
  type TrustedStructuredPlatformFact,
  type UntrustedAcquisition,
  type UntrustedContentTrust,
  type UntrustedExternalContent,
  type UntrustedUserContent,
} from './domain/content-trust.js';
export {
  CANONICAL_ACCOUNT_REFERENCE_TYPES,
  CONNECTION_REFERENCE_TYPES,
  CanonicalAccountRef,
  CommittedTransactionRef,
  ConnectionRef,
  InvalidReferenceError,
  StatementImportId,
  StatementImportRowErrorId,
  StatementImportRowId,
  StatementImportSourceId,
  type CanonicalAccountReferenceType,
  type ConnectionReferenceType,
} from './domain/refs.js';

// application — principal, errors, ports
export {
  requirePrincipal,
  type ImportsPrincipal,
  type MissingPrincipalContext,
} from './application/principal.js';
export {
  ACCOUNT_NOT_FOUND,
  IMPORT_NOT_FOUND,
  accountAccessUnavailable,
  commitFailed,
  fingerprintUnavailable,
  notInExpectedState,
  retentionUnresolved,
  sourceStoreUnavailable,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotFound,
  type AccountNotWritable,
  type CommitFailed,
  type CurrencyMismatch,
  type FingerprintUnavailable,
  type ImportNotFound,
  type ImportNotInExpectedState,
  type MappingUnusable,
  type ReconciliationBlocked,
  type RetentionUnresolved,
  type SourceIntegrityFailed,
  type SourceRefused,
  type SourceStoreUnavailable,
  type StatementImportError,
  type StoreFailure,
  type VersionConflict,
} from './application/errors.js';
export type { IdSource } from './application/ports/id-source.js';
export {
  RETENTION_DECISION_EFFECTS,
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type RetentionDecided,
  type RetentionDecisionEffect,
  type RetentionGovernedDataset,
  type RetentionNotApplicable,
  type RetentionPendingLegalReview,
  type RetentionUnavailable,
  type StatementRetentionDecision,
  type StatementRetentionDecisionPort,
} from './application/ports/statement-retention-decision.js';
export {
  EncryptedSourceStoreError,
  type EncryptedSourceStorePort,
  type SourceFileFingerprintPort,
  type SourceStoreContext,
  type StoredSource,
} from './application/ports/encrypted-source-store.js';
export {
  HSF_FIELD_NAMES,
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
  type HsfFieldName,
} from './application/ports/hsf-field-encryption.js';
export {
  CsvParseRefusedError,
  type CsvParseRequest,
  type CsvParseResult,
  type CsvParserPort,
  type ParsedHeader,
  type ParsedRow,
} from './application/ports/csv-parser.js';
export {
  ACCOUNT_LIFECYCLE_STATES,
  WRITABLE_ACCOUNT_LIFECYCLE_STATES,
  isWritableLifecycleState,
  type AccountLifecycleState,
  type CanonicalAccountAccessPort,
  type CanonicalAccountSummary,
} from './application/ports/canonical-account-access.js';
export type {
  CanonicalDedupLookupPort,
  RecordedOccurrences,
} from './application/ports/canonical-dedup-lookup.js';
export {
  StatementCommitConflictError,
  type DeterministicCategoryMatch,
  type DeterministicCategoryPort,
  type PreparedRowCommit,
  type SourceFreshnessObservation,
  type StatementCommitPlan,
  type StatementCommitPort,
  type StatementCommitReceipt,
  type StatementImportCommittedNotice,
} from './application/ports/statement-commit.js';
export type {
  CanonicalNarrativeEncryptorPort,
  EncryptedNarrativeColumns,
} from './application/ports/canonical-narrative-encryptor.js';
export type {
  CommitUnit,
  StatementImportOutboxPort,
} from './application/ports/statement-import-outbox.js';
export {
  ROW_STATES,
  StatementImportVersionConflictError,
  type NewStagedRow,
  type ParseStaging,
  type RowState,
  type StagedRow,
  type StatementImportRepository,
} from './application/ports/statement-import-repository.js';

// application — use cases
export {
  StartStatementImport,
  type StartStatementImportError,
  type StartStatementImportInput,
} from './application/use-cases/start-statement-import.js';
export {
  StoreImportSource,
  type StoreImportSourceError,
  type StoreImportSourceInput,
} from './application/use-cases/store-import-source.js';
export {
  ParseStatementSource,
  type ParseStatementSourceError,
  type ParseStatementSourceInput,
} from './application/use-cases/parse-statement-source.js';
export {
  PreviewStatementImport,
  type PreviewStatementImportError,
  type PreviewStatementImportInput,
  type StatementImportPreview,
} from './application/use-cases/preview-statement-import.js';
export {
  RejectStatementImport,
  type RejectStatementImportError,
  type RejectStatementImportInput,
} from './application/use-cases/reject-statement-import.js';
export {
  CommitStatementImport,
  type CommitStatementImportError,
  type CommitStatementImportInput,
  type StatementImportCommitted,
} from './application/use-cases/commit-statement-import.js';
export {
  EraseStatementImport,
  type EraseStatementImportError,
  type EraseStatementImportInput,
  type StatementImportErased,
} from './application/use-cases/erase-statement-import.js';

// infrastructure — implementations for the composition root
export {
  CSV_PARSER_VERSION,
  StreamingCsvParser,
} from './infrastructure/parsing/streaming-csv-parser.js';
export {
  STATEMENT_IMPORT_SQLSTATES,
  PrismaStatementImportRepository,
  sqlStateOf,
} from './infrastructure/persistence/prisma-statement-import-repository.js';
export { PrismaCanonicalDedupLookupReader } from './infrastructure/persistence/prisma-canonical-dedup-lookup.js';
export { PrismaStatementCommitUnitOfWork } from './infrastructure/persistence/prisma-statement-commit-unit-of-work.js';
export {
  STATEMENT_IMPORT_COMMITTED_EVENT,
  PlatformOutboxStatementImportRecorder,
} from './infrastructure/persistence/platform-outbox-recorder.js';
export { StatementImportStoreError } from './infrastructure/persistence/row-mappers.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
export { FinancialAccountsCanonicalAccountAdapter } from './infrastructure/adapters/financial-accounts-canonical-account-access.js';
export { TransactionsCanonicalNarrativeAdapter } from './infrastructure/adapters/transactions-canonical-narrative-encryptor.js';
export { TransactionsDeterministicCategoryAdapter } from './infrastructure/adapters/transactions-deterministic-category.js';
// LOCAL/TEST ONLY — all three hold key material in process memory, and the
// source store holds a subject's entire statement there too. Production binds
// these ports to adapters over the platform's key-management provider
// (ADR-0017) and whatever object store the profile provides.
export {
  LocalAesGcmFieldEncryptionProvider,
  LocalHsfEncryptionEnvironmentError,
  resolveHsfFieldEncryptionPort,
} from './infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
export {
  LocalEncryptedSourceStore,
  LocalSourceStoreEnvironmentError,
  resolveEncryptedSourceStorePort,
} from './infrastructure/providers/local-encrypted-source-store.js';
export {
  SOURCE_FILE_FINGERPRINT_VERSION,
  LocalKeyedFileFingerprintProvider,
  SourceFileFingerprintKeyUnavailableError,
  resolveSourceFileFingerprintPort,
  fileFingerprintsEqual,
} from './infrastructure/providers/local-keyed-file-fingerprint-provider.js';
// LOCAL ONLY — and it enforces that itself: constructing it outside a local
// environment throws, because a decision with no legal effect must not be
// able to govern real data. A deployed environment binds the retention port
// to a provider that reads an approved policy pack.
export {
  LocalRetentionFixtureEnvironmentError,
  LocalRetentionFixtureMissingError,
  LocalSyntheticRetentionDecisionProvider,
  resolveRetentionDecisionPort,
} from './infrastructure/providers/local-synthetic-retention-decision-provider.js';
