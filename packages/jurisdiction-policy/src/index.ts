// @karar/jurisdiction-policy — pure typed jurisdiction and policy resolution
// (docs/architecture/jurisdiction-policy.md; ADR-0014/0015).
//
// Framework-free, ORM-free, HTTP-free, database-free (architecture tests 1
// and 17; the only permitted dependency is @karar/shared-kernel). Everything
// here is data and pure functions: Country reference data, the Jurisdiction
// model, typed versioned PolicyPacks with explicit unresolved states, the
// activation predicates, the resolution-strategy registry, pack validation,
// and the EffectivePolicy resolver. Runtime persistence (assignments,
// settings rows, the activation ledger) is @karar/jurisdiction's.

export { jurisdictionId, type JurisdictionId } from './jurisdiction-id';

export { POLICY_ENVIRONMENTS, isPolicyEnvironment, type PolicyEnvironment } from './environment';

export {
  decided,
  isDecided,
  pendingLegalReview,
  unresolved,
  type DecidedPolicy,
  type PendingLegalReviewPolicy,
  type PolicyDecision,
  type UnresolvedPolicy,
} from './decision';

export {
  COUNTRIES,
  COUNTRY_STATUSES,
  countryCode,
  findCountry,
  type Country,
  type CountryCode,
  type CountryStatus,
} from './country';

export {
  JURISDICTIONS,
  JURISDICTION_LIFECYCLES,
  JURISDICTION_TYPES,
  REVIEW_STATUSES,
  findJurisdiction,
  sameJurisdiction,
  type Jurisdiction,
  type JurisdictionLifecycle,
  type JurisdictionType,
  type ReviewStatus,
} from './jurisdiction';

export {
  PACK_LIFECYCLES,
  type AiProcessingPolicy,
  type ApprovalPolicy,
  type ConsentRequirement,
  type CurrencyPolicy,
  type DisclosurePolicy,
  type IdentityRequirement,
  type PackLifecycle,
  type PackProvenance,
  type PolicyPack,
  type RetentionPeriod,
  type RulesetReference,
  type SubjectPolicyOptionSet,
} from './policy-pack';

export {
  canActivate,
  canResolveExplicitVersion,
  type ActivationDecision,
  type ActivationDenialReason,
} from './lifecycle';

export {
  validatePack,
  validatePackSet,
  type PackValidationContext,
  type PackValidationFinding,
} from './validation';

export {
  AT_CREATION,
  AT_EVALUATION,
  DEFAULT_RESOLUTION_STRATEGIES,
  MOST_RESTRICTIVE,
  createResolutionStrategyRegistry,
  type GoverningVersionContext,
  type ResolutionStrategyDefinition,
  type ResolutionStrategyRegistry,
} from './resolution/strategies';

export {
  resolveEffectivePolicy,
  type CapabilityCeilingEntry,
  type EffectiveDecision,
  type EffectivePolicy,
  type EffectivePolicyProvenance,
  type JurisdictionRuntimeSettings,
  type PackSelection,
  type ResolveEffectivePolicyInput,
  type ResolvePolicyError,
  type RestrictedBySettings,
  type UnresolvedPolicyReason,
} from './resolution/effective-policy';

export { POLICY_PACKS, QA_V1 } from './packs/qa-v1';
