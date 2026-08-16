// PolicyPack — the typed, versioned, reviewed unit of jurisdictional policy
// (jurisdiction-policy.md §2, §8; ADR-0014/0015).
//
// Packs are CODE: changed by pull request, versioned semantically per
// jurisdiction ('qa/v1', 'qa/v2'), and immutable once published — any change
// is a new version, and effective dates never rewrite history. The database
// stores which version is OPERATIVE (activation metadata), never the pack
// content.
//
// Capability identifiers are plain strings here, generic over
// `Id extends string`. @karar/capability-registry imports JurisdictionId
// from this package, so importing CapabilityId back would create a package
// cycle; the capability workstream validates ids on its side, and synthetic
// test packs clear synthetic ids that never enter the real registry.

import type { JurisdictionId } from './jurisdiction-id';
import type { ReviewStatus } from './jurisdiction';
import type { PolicyDecision } from './decision';

export const PACK_LIFECYCLES = ['DRAFT', 'PENDING_LEGAL_REVIEW', 'APPROVED', 'RETIRED'] as const;
export type PackLifecycle = (typeof PACK_LIFECYCLES)[number];

/** Which financial ruleset version governs a capability in this regime. */
export interface RulesetReference {
  readonly rulesetId: string;
  readonly rulesetVersion: string;
}

/** A consent the regime requires before a purpose may run. */
export interface ConsentRequirement {
  readonly purposeRef: string;
  /** The legal-document kind whose acceptance evidences the consent. */
  readonly documentKind: string;
}

/** A retention period as an ISO-8601 duration; the pack owns the number. */
export interface RetentionPeriod {
  readonly duration: string;
}

export interface IdentityRequirement {
  /** e.g. 'VERIFIED_IDENTITY', 'PROOF_OF_RESIDENCE' — vocabulary grows by review. */
  readonly kind: string;
  readonly description: string;
}

export interface DisclosurePolicy {
  /** Document kinds that must be published before disclosure-bearing behaviour. */
  readonly requiredDocumentKinds: readonly string[];
}

/** The workflow a disclosure-bearing capability requires (architecture test 19). */
export interface ApprovalPolicy {
  readonly workflow: string;
  readonly approverRole: string;
}

export interface CurrencyPolicy {
  readonly baseCurrency: string;
  readonly permittedCurrencies: readonly string[];
}

export interface AiProcessingPolicy {
  readonly permitted: boolean;
  readonly crossBorderTransferPermitted: boolean;
  readonly conditions: readonly string[];
}

/** The option set a pack PERMITS a subject to elect among for one capability
 * (jurisdiction-policy.md §7). Option content is capability-owned; the pack
 * only bounds the electable set — a selection can never expand it. */
export interface SubjectPolicyOptionSet {
  readonly optionSetId: string;
  readonly version: string;
  readonly permittedOptionIds: readonly string[];
}

export interface PackProvenance {
  readonly declaredBy: string;
  readonly declaredAt: Date;
  /** What produced the pack — a scaffold, a review cycle, a legal instruction. */
  readonly source: string;
}

export interface PolicyPack<Id extends string = string> {
  readonly jurisdiction: JurisdictionId;
  /** Semantic pack version, e.g. 'qa/v1'. Published versions are immutable. */
  readonly version: string;
  readonly lifecycle: PackLifecycle;
  readonly reviewStatus: ReviewStatus;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;

  /** Per-capability ruleset selection; a cleared capability with no entry is
   * an UNRESOLVED question the resolver surfaces, never a silent default. */
  readonly financialRulesets: Readonly<Partial<Record<Id, PolicyDecision<RulesetReference>>>>;
  readonly consentRequirements: PolicyDecision<readonly ConsentRequirement[]>;
  /** The processing purposes this pack covers; each MUST have a basis entry. */
  readonly declaredPurposes: readonly string[];
  /** purposeRef -> declared legal basis (e.g. 'basis:consent'). Consent is one
   * basis among several (ADR-0024); an absent entry fails validation. */
  readonly processingBases: Readonly<Record<string, PolicyDecision<string>>>;
  /** data category -> retention decision; DATA_LIFECYCLE.md rows point here. */
  readonly retention: Readonly<Record<string, PolicyDecision<RetentionPeriod>>>;
  readonly identityRequirements: PolicyDecision<readonly IdentityRequirement[]>;
  readonly disclosurePolicy: PolicyDecision<DisclosurePolicy>;
  /** Required (as DECIDED) for every cleared disclosure-bearing capability. */
  readonly approvalPolicies: Readonly<Partial<Record<Id, PolicyDecision<ApprovalPolicy>>>>;
  readonly currencyPolicy: PolicyDecision<CurrencyPolicy>;
  readonly aiProcessingPolicy: PolicyDecision<AiProcessingPolicy>;

  /** The MAXIMUM capability set for this regime — a ceiling, not a grant;
   * availability still passes the registry, entitlement, and consent gates. */
  readonly clearedCapabilities: readonly Id[];
  /** capability id -> resolution strategy id. Every cleared capability names
   * one; no default exists anywhere (jurisdiction-policy.md §5). */
  readonly resolutionStrategies: Readonly<Partial<Record<Id, string>>>;
  readonly subjectPolicyOptions: Readonly<Partial<Record<Id, SubjectPolicyOptionSet>>>;

  readonly provenance: PackProvenance;
  /** Evidence of legal approval (review reference, instrument id). Null means
   * NOT approved, whatever the lifecycle field claims — the validator and the
   * activation predicate both refuse an APPROVED pack without evidence. */
  readonly approvalReference: string | null;
}
