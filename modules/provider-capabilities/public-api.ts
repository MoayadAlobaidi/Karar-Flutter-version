/**
 * The provider-capabilities module's only legal import surface (architecture
 * test 3). Nothing outside this module may reach past this file.
 *
 * Exported: the assertion type and its four constructors, the closed
 * vocabularies, the profile shape and its validator, the empty reviewed
 * registry, the one port, the one use case, and the one adapter a composition
 * root needs to wire them.
 *
 * **Deliberately NOT exported, and worth stating so nobody adds it later:**
 *
 * - **no way to reach `VERIFIED` without an evidence reference.** `verified`
 *   is the only constructor that produces the state and its first parameter is
 *   an `EvidenceReference`, which is nominal and obtainable only from a string
 *   matching the shape migration 0094 already enforces. There is no
 *   `assertionFromState`, no `CapabilityAssertion` factory taking a bare state
 *   word, and no optional evidence field on any arm. Three compile-time proofs
 *   in `domain/capability-assertion.ts` fail the BUILD if that changes.
 * - **no rail token a connection may be opened on.** Everything rail-shaped
 *   here is typed `DataRail`, this module's own wide vocabulary of names,
 *   which is not assignable to `@karar/financial-connections`'
 *   `ImplementedConnectionRail`. There is deliberately no local mirror of
 *   `IMPLEMENTED_CONNECTION_RAILS` either: a copy of a permission is the one
 *   value this module must never hold.
 *   `RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE` is exported precisely because it is
 *   EMPTY: it makes the claim checkable rather than merely stated, and it is
 *   empty for `MANUAL` too, because a description grants nothing at all.
 * - **no function that derives a data rail from a consumer surface**, in
 *   either direction. `impliesDataRail` is exported because it answers `false`
 *   for every value in the vocabulary — an issuer with an app, a portal, a
 *   USSD menu and two thousand agents may expose nothing to Karar, and that is
 *   the ordinary case rather than the exception.
 * - **no issuer name, brand, label, logo, domain, endpoint or base URL**, in
 *   any type or any constant. A profile points at a `public.institutions` row
 *   and describes it; naming issuers is that catalogue's job, done once, under
 *   review. This is what makes "no provider-specific vocabulary in domain or
 *   application" a property of the types rather than a discipline.
 * - **no credential, token, session, cookie or cursor reference type**, and
 *   none may be added. `EMBEDDED_CREDENTIAL_ENTRY` and `SCREEN_SCRAPING` exist
 *   in the consent vocabulary so a review can write down that an issuer offers
 *   only those — and `ACCEPTABLE_CONSENT_METHODS` excludes both, so recording
 *   one alongside an available rail is a validation violation.
 * - **no real provider profile.** `REVIEWED_CAPABILITY_PROFILES` is empty and
 *   frozen. Every synthetic profile lives in `__tests__/`, which is outside
 *   this file and therefore unreachable from any application.
 * - **no repository, no client, no HTTP, no filesystem, no clock and no
 *   randomness — and no import of another module at all**, not even a type
 *   one. The vocabularies other modules own are MIRRORED here and checked
 *   against their owners by test (`__tests__/mirrored-vocabularies.test.ts`),
 *   which is the sanctioned cost of the layering rule; a source scan asserts
 *   the absence of the imports, so this module cannot acquire a path to
 *   another module without someone deleting a test.
 *
 * This module also exports no presentation layer: there is no transport, and
 * when one arrives it is a REVIEWER surface. A description of what an
 * interface might offer has never told a user anything and must not start —
 * no customer-facing screen may render any value here as available,
 * supported, or connected.
 *
 * **One port is declared here and satisfied here**, which is unusual and
 * deliberate: reviewed configuration is code, so the store behind
 * `ReviewedProfileCataloguePort` is this repository. The port exists so a
 * future reviewed source is a substitution rather than a rewrite, and it is
 * synchronous so that an HTTP client is visibly the wrong shape for the hole.
 */

// domain — the assertion, and the rule that makes VERIFIED expensive
export {
  CAPABILITY_STATES,
  UNVERIFIED,
  evidenceOf,
  isCapabilityState,
  isVerified,
  pendingProviderConfirmation,
  unavailable,
  verified,
  type CapabilityAssertion,
  type CapabilityPendingProviderConfirmation,
  type CapabilityState,
  type CapabilityUnavailable,
  type CapabilityUnverified,
  type CapabilityVerified,
} from './domain/capability-assertion.js';

// domain — references, and the evidence reference itself
export {
  EVIDENCE_REFERENCE_PATTERN,
  EvidenceReference,
  INSTITUTION_REFERENCE_TYPES,
  InstitutionRef,
  InvalidReferenceError,
  CountryCode,
  NO_EVIDENCE,
  isEvidenceReference,
  type InstitutionReferenceType,
} from './domain/refs.js';

// domain — an app is not an API
export {
  CONSUMER_SURFACES,
  NO_SURFACE_REVIEWED,
  SURFACES_IMPLYING_A_DATA_RAIL,
  impliesDataRail,
  isConsumerSurface,
  type ConsumerSurface,
  type ConsumerSurfaceProfile,
} from './domain/consumer-surfaces.js';

// domain — rails are described, never granted
export {
  DATA_RAILS,
  NO_RAIL_AVAILABLE,
  NO_RAIL_REVIEWED,
  RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE,
  describedRails,
  isDataRail,
  profileCanMakeExecutable,
  railsDescribedAsAvailable,
  type DataRail,
  type DataRailProfile,
  type RailDescription,
} from './domain/data-rails.js';

// domain — the closed vocabularies, including the mirrored ones
export {
  ACCEPTABLE_CONSENT_METHODS,
  ACCESS_STAGES,
  ACCESS_STAGES_REQUIRING_EVIDENCE,
  ACCOUNT_TYPES,
  CONSENT_METHODS,
  CUSTOMER_SEGMENTS,
  INSTITUTION_KINDS,
  RATE_WINDOWS,
  STATEMENT_FORMATS,
  WALLET_KINDS,
  accessStageRequiresEvidence,
  isAcceptableConsentMethod,
  isAccessStage,
  isAccountType,
  isConsentMethod,
  isCustomerSegment,
  isInstitutionKind,
  isRateWindow,
  isStatementFormat,
  isWalletKind,
  type AcceptableConsentMethod,
  type AccessStage,
  type AccountType,
  type ConsentMethod,
  type CustomerSegment,
  type InstitutionKind,
  type RateWindow,
  type StatementFormat,
  type WalletKind,
} from './domain/vocabularies.js';

// domain — the quantitative descriptions
export {
  HISTORY_DEPTH_UNSTATED,
  QUOTA_UNSTATED,
  RESIDENCY_UNSTATED,
  isPositiveWholeCount,
  type DataResidencyRequirement,
  type DescribedHistoryDepth,
  type DescribedQuota,
} from './domain/described-limits.js';

// domain — the profile
export {
  ACCESS_NOT_OFFERED,
  CONSENT_METHOD_UNKNOWN,
  NO_BALANCE_REVIEWED,
  NO_STATEMENT_FORMAT_REVIEWED,
  PROFILED_BALANCE_KINDS,
  capabilityProfile,
  capabilityProfileKey,
  profileSubjectKey,
  type AccessDescription,
  type CapabilityProfileDraft,
  type ConsentMethodDescription,
  type ProfileReview,
  type ProfileSubject,
  type ProfiledBalanceKind,
  type ProviderCapabilityProfile,
} from './domain/capability-profile.js';

// domain — validation, and the empty reviewed registry
export {
  PROFILE_RULES,
  InvalidCapabilityProfileError,
  isProfileRule,
  type ProfileRule,
  type ProfileViolation,
} from './domain/errors.js';
export {
  assertValidCapabilityProfiles,
  validateCapabilityProfile,
  validateCapabilityProfiles,
} from './domain/profile-validation.js';
export {
  REVIEWED_CAPABILITY_PROFILES,
  assertValidReviewedProfiles,
} from './domain/profile-registry.js';

// application — the port, the errors, the use case
export type {
  ReviewedProfileCataloguePort,
  ReviewedProfileQuery,
} from './application/ports/reviewed-profile-catalogue.js';
export {
  PROFILE_NOT_REVIEWED,
  catalogueUnavailable,
  type CatalogueUnavailable,
  type DescribeProviderCapabilitiesError,
  type ProfileNotReviewed,
} from './application/errors.js';
export {
  DescribeProviderCapabilities,
  type DescribeProviderCapabilitiesInput,
  type ProviderCapabilityDescription,
} from './application/use-cases/describe-provider-capabilities.js';

// infrastructure — the one adapter, over the frozen registry
export { ReviewedRegistryProfileSource } from './infrastructure/registry/reviewed-registry-profile-source.js';
