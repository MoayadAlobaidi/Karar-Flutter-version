/**
 * The financial-connections module's only legal import surface (architecture
 * test 3). Nothing outside this module may reach past this file.
 *
 * Exported: the domain read shapes and rules, the application ports and
 * errors, the use cases, and the infrastructure implementations the
 * composition root needs to wire them.
 *
 * **Deliberately NOT exported, and worth stating so nobody adds it later:**
 *
 * - **no way to read an external account reference back out.** The read paths
 *   return `AccountSourceLinkView`, which carries neither the reference nor
 *   the fingerprint; the entity that holds them is exported as a TYPE for the
 *   ports that must name it, and no exported function returns one to a
 *   caller outside this module.
 * - **no fingerprint constructor, and no way to compare two fingerprints from
 *   outside.** `SourceAccountFingerprintPort` is exported so a composition
 *   root can bind a key-management-backed adapter; nothing here lets another
 *   module mint or test a value. A fingerprint is only meaningful inside the
 *   subject it was derived for, and an exported comparator would be the first
 *   step toward one leaving.
 * - **no way to construct a connection on an unimplemented rail.** The
 *   factory accepts only `ImplementedConnectionRail`, and the database
 *   refuses the row besides — which is the control that matters, because a
 *   type is a convenience and a CHECK is a boundary.
 * - **no status value meaning connected, synced, linked or authorized**, and
 *   no function that could compute one. `impliesLiveInstitutionLink` is
 *   exported precisely because it answers `false` for every value: it makes
 *   the claim checkable rather than merely stated.
 * - **no automatic linking of a probable match.** `ProposeAccountSourceLink`
 *   auto-links an EXACT external-reference match and nothing else;
 *   `ConfirmProbableSourceLink` is the only path from a suggestion to a link,
 *   and the database refuses the state without the subject's recorded
 *   confirmation.
 * - **no merge, no reconciliation, no precedence resolution.** Source
 *   priority and authority are stored; nothing here computes which source
 *   wins, produces a merged view, or derives a balance. Those are different
 *   concepts with their own correctness problems and their own names.
 *
 * This module also exports no presentation layer this phase: the HTTP surface
 * and its composition belong to the API application, and nothing here assumes
 * a transport.
 *
 * **Three ports are declared here and implemented elsewhere in a real
 * deployment**, and the direction is the point: `HsfFieldEncryptionPort` and
 * `SourceAccountFingerprintPort` are satisfied by key-management-backed
 * adapters (ADR-0017), and `FinancialConnectionRetentionDecisionPort` by
 * whatever reads an approved policy pack. `CanonicalAccountAccessPort` is
 * declared here and satisfied by an adapter over
 * `@karar/financial-accounts`' public API — this module depends on that one,
 * and that one knows nothing about this one.
 *
 * **One port is declared here for another module to CALL, and it writes rows
 * rather than reading them.** `SourceObservationWriterPort` says that a
 * delivery arrived through a source link, and `PrismaSourceObservationWriter`
 * records it on a transaction the CALLER opened —
 * `modules/statement-imports`' statement commit, which must land as one unit
 * or not at all. It is declared here because these are this module's rows and
 * because that module already depends on this one, so the reverse import
 * would be a cycle; it is exported because a composition root has to bind it.
 * What it exposes is deliberately tiny: no link is created, re-pointed,
 * confirmed or promoted through it, nothing is read back, and the only answer
 * is how many links moved.
 *
 * **One port runs the other way, and the dependency still does not.**
 * `FinancialAccountsSourceLinkEraser` satisfies `AccountSourceLinkEraserPort`,
 * which `@karar/financial-accounts` DECLARES so that deleting an account
 * reaches the source links that name it. The interface belongs to the module
 * that owns the deletion path; the implementation belongs to the module that
 * owns the rows; the import direction is unchanged, because this module is
 * the one doing the importing. It is exported for a composition root to bind
 * into `DeleteOwnAccount` — an account deleted without it leaves its links
 * behind, which is exactly the defect this closes.
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
  CONNECTION_RAILS,
  CONNECTION_STATUSES,
  CONSTRUCTIBLE_CONNECTION_STATUSES,
  IMPLEMENTED_CONNECTION_RAILS,
  SOURCE_AUTHORITIES,
  SOURCE_CAPABILITY_OBSERVATIONS,
  STATUSES_IMPLYING_A_LIVE_INSTITUTION_LINK,
  impliesLiveInstitutionLink,
  isConnectionRail,
  isConnectionStatus,
  isImplementedConnectionRail,
  isSourceAuthority,
  isSourceCapabilityObservation,
  mayBeAuthoritative,
  type ConnectionRail,
  type ConnectionStatus,
  type ConstructibleConnectionStatus,
  type ImplementedConnectionRail,
  type SourceAuthority,
  type SourceCapabilityObservation,
} from './domain/rails.js';
export {
  MAX_DISPLAY_TEXT_LENGTH,
  acceptsSubjectSuppliedData,
  applyConnectionEdit,
  checkRailImplemented,
  checkStatusForRail,
  createFinancialConnection,
  normalizeDisplayText,
  type ConnectionEdit,
  type FinancialConnection,
  type NewFinancialConnection,
} from './domain/financial-connection.js';
export {
  DEFAULT_SOURCE_PRIORITY,
  MAPPING_SOURCE_LINK_STATUSES,
  MATCH_BASES,
  MAX_SOURCE_PRIORITY,
  MIN_SOURCE_PRIORITY,
  NOTHING_OBSERVED,
  SOURCE_LINK_STATUSES,
  confirmSourceLink,
  createAccountSourceLink,
  declineSourceLink,
  externalReferenceRefusalMessage,
  fingerprintsMatch,
  isMatchBasis,
  isSourceLinkStatus,
  recordSourceObservation,
  toAccountSourceLinkView,
  type AccountSourceLink,
  type AccountSourceLinkView,
  type HistoryCoverage,
  type MatchBasis,
  type NewAccountSourceLink,
  type SourceAccountFingerprint,
  type SourceCapabilities,
  type SourceLinkStatus,
  type SourceObservation,
  type SourceObservationWindow,
} from './domain/account-source-link.js';
export {
  EXTERNAL_REFERENCE_SCHEMES,
  MAX_EXTERNAL_REFERENCE_LENGTH,
  checkExternalReferenceShape,
  isExternalReferenceScheme,
  isStorableExternalReference,
  normalizeExternalReference,
  type ExternalReferenceRefusal,
  type ExternalReferenceScheme,
} from './domain/external-account-reference.js';
export {
  HSF_FIELD_MAX_LENGTH,
  HSF_REDACTION,
  HsfField,
  InvalidHsfFieldError,
  hsfFieldsEqual,
} from './domain/hsf-field.js';
export {
  AccountSourceLinkId,
  CANONICAL_ACCOUNT_REFERENCE_TYPES,
  CanonicalAccountRef,
  FinancialConnectionId,
  INSTITUTION_REFERENCE_TYPES,
  InstitutionRef,
  InvalidReferenceError,
  type CanonicalAccountReferenceType,
  type InstitutionReferenceType,
} from './domain/refs.js';
export {
  FinancialConnectionsStoreError,
  type AuthorityNotAvailableForRail,
  type ConnectionStatusNotAvailable,
  type ExternalReferenceNotStorable,
  type FinancialConnectionRuleViolation,
  type InvalidDisplayText,
  type InvalidHistoryCoverage,
  type InvalidObservationWindow,
  type ProbableMatchNeedsConfirmation,
  type RailNotImplemented,
  type SettledLinkNotRepointable,
  type UnknownVocabularyValue,
} from './domain/errors.js';

// application — principal, errors, ports
export {
  requirePrincipal,
  type ConnectionsPrincipal,
  type MissingPrincipalContext,
} from './application/principal.js';
export {
  ACCOUNT_NOT_FOUND,
  CONNECTION_NOT_FOUND,
  SOURCE_LINK_NOT_FOUND,
  accountAccessUnavailable,
  fingerprintUnavailable,
  retentionUnresolved,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotFound,
  type AccountNotLinkable,
  type ConfirmProbableSourceLinkError,
  type ConnectionNotFound,
  type ConnectionNotUsable,
  type CreateManualConnectionError,
  type DeclineProbableSourceLinkError,
  type DeleteOwnConnectionError,
  type EraseAccountSourceLinksError,
  type FingerprintUnavailable,
  type ListOwnAccountSourceLinksError,
  type ListOwnConnectionsError,
  type ProposeAccountSourceLinkError,
  type RecordSourceObservationError,
  type RetentionUnresolved,
  type RuleViolated,
  type SourceAccountAlreadyLinkedElsewhere,
  type SourceLinkNotFound,
  type StoreFailure,
  type VersionConflict,
} from './application/errors.js';
export type { IdSource } from './application/ports/id-source.js';
export {
  HSF_FIELD_NAMES,
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
  type HsfFieldName,
} from './application/ports/hsf-field-encryption.js';
export type {
  SourceAccountFingerprintInput,
  SourceAccountFingerprintPort,
} from './application/ports/source-account-fingerprint.js';
export {
  ACCOUNT_LIFECYCLE_STATES,
  LINKABLE_ACCOUNT_LIFECYCLE_STATES,
  isLinkableLifecycleState,
  type AccountLifecycleState,
  type CanonicalAccountAccessPort,
  type CanonicalAccountSummary,
} from './application/ports/canonical-account-access.js';
export {
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type FinancialConnectionRetentionDecisionPort,
  type FinancialRetentionDecision,
  type RetentionDecided,
  type RetentionGovernedDataset,
  type RetentionNotApplicable,
  type RetentionPendingLegalReview,
  type RetentionUnavailable,
} from './application/ports/financial-connection-retention-decision.js';
export type {
  ConnectionDeleteOutcome,
  ConnectionUpdateOutcome,
  FinancialConnectionPage,
  FinancialConnectionPageQuery,
  FinancialConnectionRepository,
} from './application/ports/financial-connection-repository.js';
export type {
  AccountSourceLinkPage,
  AccountSourceLinkPageQuery,
  AccountSourceLinkRepository,
  SourceLinkCreateOutcome,
  SourceLinkUpdateOutcome,
} from './application/ports/account-source-link-repository.js';
export type {
  ObservedSourceDelivery,
  SourceObservationWriteUnit,
  SourceObservationWriterPort,
} from './application/ports/source-observation-writer.js';

// application — use cases
export {
  CreateManualConnection,
  type CreateManualConnectionInput,
} from './application/use-cases/create-manual-connection.js';
export {
  ListOwnConnections,
  type ListOwnConnectionsInput,
} from './application/use-cases/list-own-connections.js';
export {
  DeleteOwnConnection,
  type ConnectionDeleted,
  type DeleteOwnConnectionInput,
} from './application/use-cases/delete-own-connection.js';
export {
  ProposeAccountSourceLink,
  type ProposeAccountSourceLinkInput,
  type ProposedSourceLink,
} from './application/use-cases/propose-account-source-link.js';
export {
  ConfirmProbableSourceLink,
  type ConfirmProbableSourceLinkInput,
} from './application/use-cases/confirm-probable-source-link.js';
export {
  DeclineProbableSourceLink,
  type DeclineProbableSourceLinkInput,
} from './application/use-cases/decline-probable-source-link.js';
export {
  ListOwnAccountSourceLinks,
  type ListOwnAccountSourceLinksInput,
  type ListOwnAccountSourceLinksPage,
} from './application/use-cases/list-own-account-source-links.js';
export {
  RecordSourceObservation,
  type RecordSourceObservationInput,
} from './application/use-cases/record-source-observation.js';
export {
  EraseAccountSourceLinks,
  type AccountSourceLinksErased,
  type EraseAccountSourceLinksInput,
} from './application/use-cases/erase-account-source-links.js';

// infrastructure — implementations for the composition root
export { PrismaFinancialConnectionRepository } from './infrastructure/persistence/prisma-financial-connection-repository.js';
export { PrismaAccountSourceLinkRepository } from './infrastructure/persistence/prisma-account-source-link-repository.js';
export { PrismaSourceObservationWriter } from './infrastructure/persistence/prisma-source-observation-writer.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
export { FinancialAccountsCanonicalAccountAdapter } from './infrastructure/adapters/financial-accounts-canonical-account-access.js';
export { FinancialAccountsSourceLinkEraser } from './infrastructure/adapters/financial-accounts-source-link-eraser.js';
export {
  LocalAesGcmFieldEncryptionProvider,
  LocalHsfEncryptionEnvironmentError,
  resolveHsfFieldEncryptionPort,
} from './infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
export {
  LocalKeyedSourceAccountFingerprintProvider,
  SOURCE_ACCOUNT_FINGERPRINT_VERSION,
  sourceAccountFingerprintsEqual,
} from './infrastructure/providers/local-keyed-source-account-fingerprint-provider.js';
export {
  LocalRetentionFixtureEnvironmentError,
  LocalRetentionFixtureMissingError,
  LocalSyntheticRetentionDecisionProvider,
  resolveRetentionDecisionPort,
} from './infrastructure/providers/local-synthetic-retention-decision-provider.js';
