/**
 * The payment-instruments module's only legal import surface (architecture
 * test 3). Nothing outside this module may reach past this file.
 *
 * Exported: the domain read shapes and rules, the application ports and
 * errors, the use cases, and the infrastructure implementations the
 * composition root needs to wire them.
 *
 * **Deliberately NOT exported, and worth stating so nobody adds it later:**
 *
 * - **no balance, no amount, no limit, no total, and no function that could
 *   produce one.** `PaymentInstrument` has no numeric field but `version`,
 *   the repository has no `count`, `aggregate` or `groupBy`, and the account
 *   port answers existence and lifecycle state only. The question "how much
 *   is on this card" has no answer in this module and must not acquire one:
 *   two virtual cards on one wallet share ONE balance, so a per-card figure
 *   would either repeat it twice or invent a split nobody stated. The
 *   guarantee is asserted by `__tests__/no-money-arithmetic.test.ts` and by
 *   the exhaustive column-set assertion in
 *   `__tests__/no-instrument-balance-columns.integration.test.ts`, not by
 *   this paragraph.
 * - **no way to construct an instrument that points at two accounts, or at
 *   none.** `BalanceBearingAccountRef` is singular and required, and there is
 *   no edit type carrying an account id — re-pointing is not merely refused,
 *   it is unexpressible. The database refuses it too (SQLSTATE KAR30).
 * - **no PAN, CVV, expiry, network token or wallet credential**, in any
 *   type, any column or any reference. `checkInstrumentMaskShape` is exported
 *   precisely so the refusal is checkable from outside rather than merely
 *   claimed, and `domain/refs.ts` records why there is no credential
 *   reference type either.
 * - **no status value meaning connected, provisioned, tokenized, synced or
 *   authorized**, and no function that could compute one.
 *   `impliesLiveIssuerLink` is exported because it answers `false` for every
 *   value in the vocabulary: it makes the claim checkable rather than merely
 *   stated.
 * - **no use case that reads or writes somebody else's instruments.** There
 *   is no `ListInstrumentsForUser`, no staff read, and no input type with a
 *   `userId` on it. The principal is context, never input.
 *
 * This module also exports no presentation layer this phase: the HTTP surface
 * and its composition belong to the API application, and nothing here assumes
 * a transport.
 *
 * **Two ports are declared here and implemented elsewhere in a real
 * deployment**, and the direction is the point: `HsfFieldEncryptionPort` is
 * satisfied by a key-management-backed adapter (ADR-0017), and
 * `PaymentInstrumentRetentionDecisionPort` by whatever reads an approved
 * policy pack. `BalanceBearingAccountAccessPort` is declared here and
 * satisfied by an adapter over `@karar/financial-accounts`' public API — this
 * module depends on that one, and that one knows nothing about this one.
 *
 * **One port runs the other way, and it is now wired.**
 * `PaymentInstrumentEraserPort` is declared by `@karar/financial-accounts` so
 * that deleting an account reaches the instruments that spend from it;
 * `FinancialAccountsPaymentInstrumentEraser` is the satisfying side, and
 * `DeleteOwnAccount` calls it — after the source links and before the
 * financial records. The export below is an ALIAS of that declaration, kept so
 * a composition root can name the type it is binding; it was a mirror of a
 * port that did not exist yet, and an account deleted through
 * `DeleteOwnAccount` no longer leaves its instruments behind.
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
  CONSTRUCTIBLE_INSTRUMENT_STATUSES,
  INSTRUMENT_STATUSES,
  INSTRUMENT_TYPES,
  MAX_DISPLAY_TEXT_LENGTH,
  SPENDABLE_INSTRUMENT_STATUSES,
  STATUSES_IMPLYING_A_LIVE_ISSUER_LINK,
  ACCOUNT_NOT_REPOINTABLE,
  applyInstrumentEdit,
  canTransition,
  createPaymentInstrument,
  impliesLiveIssuerLink,
  instrumentTypeNotChangeable,
  isConstructibleInstrumentStatus,
  isInstrumentStatus,
  isInstrumentType,
  isSpendableStatus,
  normalizeDisplayText,
  type ConstructibleInstrumentStatus,
  type InstrumentEdit,
  type InstrumentStatus,
  type InstrumentType,
  type NewPaymentInstrument,
  type PaymentInstrument,
} from './domain/payment-instrument.js';
export {
  MAX_INSTRUMENT_MASK_LENGTH,
  checkInstrumentMaskShape,
  instrumentMaskRefusalMessage,
  isInstrumentMask,
  normalizeInstrumentMask,
  type InstrumentMaskRefusal,
} from './domain/instrument-mask.js';
export {
  HSF_FIELD_MAX_LENGTH,
  HSF_REDACTION,
  HsfField,
  InvalidHsfFieldError,
  hsfFieldsEqual,
} from './domain/hsf-field.js';
export {
  BALANCE_BEARING_ACCOUNT_REFERENCE_TYPES,
  BalanceBearingAccountRef,
  InvalidReferenceError,
  PaymentInstrumentId,
  type BalanceBearingAccountReferenceType,
} from './domain/refs.js';
export {
  PaymentInstrumentsStoreError,
  type InstrumentAccountNotRepointable,
  type InstrumentMaskNotStorable,
  type InstrumentTypeNotChangeable,
  type InvalidDisplayText,
  type PaymentInstrumentRuleViolation,
  type StatusTransitionNotAvailable,
  type UnknownVocabularyValue,
} from './domain/errors.js';

// application — principal, errors, ports
export {
  requirePrincipal,
  type InstrumentsPrincipal,
  type MissingPrincipalContext,
} from './application/principal.js';
export {
  ACCOUNT_NOT_FOUND,
  INSTRUMENT_NOT_FOUND,
  accountAccessUnavailable,
  retentionUnresolved,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotAttachable,
  type AccountNotFound,
  type DeleteOwnPaymentInstrumentError,
  type ErasePaymentInstrumentsError,
  type InstrumentNotFound,
  type ListOwnPaymentInstrumentsError,
  type RecordPaymentInstrumentError,
  type RetentionUnresolved,
  type RuleViolated,
  type StoreFailure,
  type UpdateOwnPaymentInstrumentError,
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
export {
  ACCOUNT_LIFECYCLE_STATES,
  ATTACHABLE_ACCOUNT_LIFECYCLE_STATES,
  isAttachableLifecycleState,
  type AccountLifecycleState,
  type BalanceBearingAccountAccessPort,
  type BalanceBearingAccountSummary,
} from './application/ports/balance-bearing-account-access.js';
export {
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type FinancialRetentionDecision,
  type PaymentInstrumentRetentionDecisionPort,
  type RetentionDecided,
  type RetentionGovernedDataset,
  type RetentionNotApplicable,
  type RetentionPendingLegalReview,
  type RetentionUnavailable,
} from './application/ports/payment-instrument-retention-decision.js';
export type {
  InstrumentCreateOutcome,
  InstrumentUpdateOutcome,
  PaymentInstrumentPage,
  PaymentInstrumentPageQuery,
  PaymentInstrumentRepository,
} from './application/ports/payment-instrument-repository.js';
// An ALIAS of the port @karar/financial-accounts declares and this module
// satisfies. See the header and MODULE.md.
export type {
  PaymentInstrumentEraserPort,
  PaymentInstrumentErasureOutcome,
} from './application/ports/payment-instrument-eraser.js';

// application — use cases
export {
  RecordPaymentInstrument,
  type RecordPaymentInstrumentInput,
} from './application/use-cases/record-payment-instrument.js';
export {
  ListOwnPaymentInstruments,
  type ListOwnPaymentInstrumentsInput,
} from './application/use-cases/list-own-payment-instruments.js';
export {
  UpdateOwnPaymentInstrument,
  type UpdateOwnPaymentInstrumentInput,
} from './application/use-cases/update-own-payment-instrument.js';
export {
  DeleteOwnPaymentInstrument,
  type DeleteOwnPaymentInstrumentInput,
  type PaymentInstrumentDeleted,
} from './application/use-cases/delete-own-payment-instrument.js';
export {
  ErasePaymentInstruments,
  type ErasePaymentInstrumentsInput,
  type PaymentInstrumentsErased,
} from './application/use-cases/erase-payment-instruments.js';

// infrastructure — implementations for the composition root
export { PrismaPaymentInstrumentRepository } from './infrastructure/persistence/prisma-payment-instrument-repository.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
export { FinancialAccountsBalanceBearingAccountAdapter } from './infrastructure/adapters/financial-accounts-balance-bearing-account-access.js';
export { FinancialAccountsPaymentInstrumentEraser } from './infrastructure/adapters/financial-accounts-payment-instrument-eraser.js';
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
