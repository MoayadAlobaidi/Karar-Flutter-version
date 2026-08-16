// EffectivePolicy — the ONE typed resolution result use cases consult
// (jurisdiction-policy.md §4): "Use cases never read a country code and never
// branch on jurisdiction. They ask EffectivePolicy a question."
//
// Inputs: the jurisdiction, the instant the question is asked, the known
// pack versions (code), a selection (the version in force, or an explicit
// historical version), the jurisdiction's runtime settings, and the
// environment. Output: the resolved pack's decisions with settings merged
// RESTRICT-ONLY, the capability ceiling with each capability's named
// resolution strategy, every unresolved decision surfaced as a typed denial
// reason, and full provenance (pack version + strategy ids + jurisdiction).
//
// The restrict-only invariant (jurisdiction-policy.md §2) is structural
// here twice over: JurisdictionRuntimeSettings has no field that could name
// an addition, and the merge only ever removes from the pack's ceiling or
// narrows a DECIDED state. No settings value can produce an EffectivePolicy
// permitting more than its pack.

import { Result } from '@karar/shared-kernel';

import type { JurisdictionId } from '../jurisdiction-id';
import type { PolicyEnvironment } from '../environment';
import type { PolicyDecision } from '../decision';
import type {
  AiProcessingPolicy,
  ApprovalPolicy,
  ConsentRequirement,
  CurrencyPolicy,
  DisclosurePolicy,
  IdentityRequirement,
  PackLifecycle,
  PolicyPack,
  RetentionPeriod,
  RulesetReference,
  SubjectPolicyOptionSet,
} from '../policy-pack';
import type { ReviewStatus } from '../jurisdiction';
import { canActivate, canResolveExplicitVersion, type ActivationDenialReason } from '../lifecycle';
import { validatePack, type PackValidationFinding } from '../validation';
import { DEFAULT_RESOLUTION_STRATEGIES, type ResolutionStrategyRegistry } from './strategies';

/** Audited, restrict-only runtime settings (jurisdiction-policy.md §2). The
 * shape itself is the control: there is no field that could ENABLE anything,
 * so "settings widening" is not expressible, and unknown ids in a disable
 * list restrict nothing that was not permitted to begin with. */
export interface JurisdictionRuntimeSettings {
  readonly disabledCapabilityIds?: readonly string[];
  readonly aiProcessingSuspended?: boolean;
  /** Row version of the settings record, for provenance. */
  readonly settingsVersion?: number;
}

export type PackSelection =
  { readonly kind: 'IN_FORCE' } | { readonly kind: 'EXPLICIT_VERSION'; readonly version: string };

export interface ResolveEffectivePolicyInput<Id extends string = string> {
  readonly jurisdiction: JurisdictionId;
  /** The instant the question is asked; also the IN_FORCE selection instant. */
  readonly requestedAt: Date;
  /** The code-resident pack versions known to this build. */
  readonly packs: readonly PolicyPack<Id>[];
  readonly selection: PackSelection;
  readonly settings?: JurisdictionRuntimeSettings;
  readonly environment: PolicyEnvironment;
  readonly strategies?: ResolutionStrategyRegistry;
  /** Disclosure-bearing ids for structural validation; data, not a type import. */
  readonly disclosureBearingCapabilityIds?: readonly string[];
}

/** A DECIDED state narrowed by runtime settings — never widened. */
export interface RestrictedBySettings {
  readonly state: 'RESTRICTED_BY_SETTINGS';
  readonly reason: string;
}

export type EffectiveDecision<T> = PolicyDecision<T> | RestrictedBySettings;

export interface CapabilityCeilingEntry<Id extends string = string> {
  readonly capabilityId: Id;
  readonly strategyId: string;
}

export interface UnresolvedPolicyReason {
  /** Which decision slot is undecided, e.g. "processingBases['purpose:x']". */
  readonly where: string;
  readonly state: 'PENDING_LEGAL_REVIEW' | 'UNRESOLVED';
  readonly reason: string;
}

export interface EffectivePolicyProvenance<Id extends string = string> {
  readonly jurisdiction: JurisdictionId;
  readonly packVersion: string;
  readonly packLifecycle: PackLifecycle;
  readonly selection: PackSelection['kind'];
  readonly environment: PolicyEnvironment;
  readonly requestedAt: Date;
  readonly strategyByCapability: Readonly<Partial<Record<Id, string>>>;
  readonly settingsVersion: number | null;
}

export interface EffectivePolicy<Id extends string = string> {
  readonly jurisdiction: JurisdictionId;
  readonly packVersion: string;
  readonly packLifecycle: PackLifecycle;
  readonly packReviewStatus: ReviewStatus;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly environment: PolicyEnvironment;

  readonly financialRulesets: Readonly<Partial<Record<Id, PolicyDecision<RulesetReference>>>>;
  readonly consentRequirements: PolicyDecision<readonly ConsentRequirement[]>;
  readonly processingBases: Readonly<Record<string, PolicyDecision<string>>>;
  readonly retention: Readonly<Record<string, PolicyDecision<RetentionPeriod>>>;
  readonly identityRequirements: PolicyDecision<readonly IdentityRequirement[]>;
  readonly disclosurePolicy: PolicyDecision<DisclosurePolicy>;
  readonly approvalPolicies: Readonly<Partial<Record<Id, PolicyDecision<ApprovalPolicy>>>>;
  readonly currencyPolicy: PolicyDecision<CurrencyPolicy>;
  readonly aiProcessing: EffectiveDecision<AiProcessingPolicy>;

  /** The cleared-capability ceiling AFTER restrict-only settings, each with
   * its named resolution strategy. A ceiling, never a grant. */
  readonly capabilityCeiling: readonly CapabilityCeilingEntry<Id>[];
  readonly subjectPolicyOptions: Readonly<Partial<Record<Id, SubjectPolicyOptionSet>>>;
  /** Slot for the consumer's SubjectPolicySelection version where a
   * capability declares elective options; null until the consumer fills it. */
  readonly subjectPolicySelectionVersion: string | null;

  /** Every non-DECIDED decision the pack carries — the typed denial reasons
   * consumers enforce (a pending decision denies, it never defaults). */
  readonly unresolved: readonly UnresolvedPolicyReason[];
  readonly provenance: EffectivePolicyProvenance<Id>;
}

export type ResolvePolicyError =
  | { readonly kind: 'NO_PACK_FOR_JURISDICTION'; readonly jurisdiction: string }
  | { readonly kind: 'PACK_VERSION_NOT_FOUND'; readonly version: string }
  | { readonly kind: 'NO_PACK_IN_FORCE'; readonly requestedAt: Date }
  | {
      readonly kind: 'OVERLAPPING_PACKS_IN_FORCE';
      readonly versions: readonly string[];
      readonly requestedAt: Date;
    }
  | {
      readonly kind: 'PACK_NOT_RESOLVABLE';
      readonly version: string;
      readonly environment: PolicyEnvironment;
      readonly reasons: readonly ActivationDenialReason[];
    }
  | {
      readonly kind: 'PACK_INVALID';
      readonly version: string;
      readonly findings: readonly PackValidationFinding[];
    };

function collectUnresolved<Id extends string>(pack: PolicyPack<Id>): UnresolvedPolicyReason[] {
  const unresolved: UnresolvedPolicyReason[] = [];
  const consider = (
    where: string,
    decision: { readonly state: string; readonly reason?: string } | undefined,
  ) => {
    if (decision === undefined) return;
    if (decision.state === 'PENDING_LEGAL_REVIEW' || decision.state === 'UNRESOLVED') {
      unresolved.push({
        where,
        state: decision.state,
        reason: decision.reason ?? '',
      });
    }
  };
  for (const [capabilityId, decision] of Object.entries(pack.financialRulesets)) {
    consider(
      `financialRulesets['${capabilityId}']`,
      decision as { state: string; reason?: string },
    );
  }
  consider('consentRequirements', pack.consentRequirements);
  for (const [purposeRef, decision] of Object.entries(pack.processingBases)) {
    consider(`processingBases['${purposeRef}']`, decision);
  }
  for (const [category, decision] of Object.entries(pack.retention)) {
    consider(`retention['${category}']`, decision);
  }
  consider('identityRequirements', pack.identityRequirements);
  consider('disclosurePolicy', pack.disclosurePolicy);
  for (const [capabilityId, decision] of Object.entries(pack.approvalPolicies)) {
    consider(`approvalPolicies['${capabilityId}']`, decision as { state: string; reason?: string });
  }
  consider('currencyPolicy', pack.currencyPolicy);
  consider('aiProcessingPolicy', pack.aiProcessingPolicy);
  return unresolved;
}

function packInForce<Id extends string>(
  packs: readonly PolicyPack<Id>[],
  at: Date,
): readonly PolicyPack<Id>[] {
  return packs.filter((pack) => {
    const start = pack.effectiveFrom.getTime();
    const end = pack.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
    return start <= at.getTime() && at.getTime() < end;
  });
}

export function resolveEffectivePolicy<Id extends string>(
  input: ResolveEffectivePolicyInput<Id>,
): Result<EffectivePolicy<Id>, ResolvePolicyError> {
  const strategies = input.strategies ?? DEFAULT_RESOLUTION_STRATEGIES;
  const forJurisdiction = input.packs.filter(
    (pack) =>
      // Identity match on the policy key — this package owns that comparison.
      String(pack.jurisdiction) === String(input.jurisdiction),
  );
  if (forJurisdiction.length === 0) {
    return Result.err({
      kind: 'NO_PACK_FOR_JURISDICTION',
      jurisdiction: String(input.jurisdiction),
    });
  }

  let pack: PolicyPack<Id>;
  if (input.selection.kind === 'EXPLICIT_VERSION') {
    const version = input.selection.version;
    const found = forJurisdiction.find((candidate) => candidate.version === version);
    if (found === undefined) {
      return Result.err({ kind: 'PACK_VERSION_NOT_FOUND', version });
    }
    const resolvable = canResolveExplicitVersion(found, input.environment);
    if (!resolvable.allowed) {
      return Result.err({
        kind: 'PACK_NOT_RESOLVABLE',
        version: found.version,
        environment: input.environment,
        reasons: resolvable.reasons,
      });
    }
    pack = found;
  } else {
    // IN_FORCE: the version whose effective period covers requestedAt AND
    // whose lifecycle permits governing this environment now. Fail closed on
    // none and on ambiguity — overlapping in-force versions are a defect the
    // set validator reports, never something to pick between silently.
    const covering = packInForce(forJurisdiction, input.requestedAt);
    const eligible = covering.filter(
      (candidate) => canActivate(candidate, input.environment).allowed,
    );
    if (eligible.length === 0) {
      const blocked = covering.find(
        (candidate) => !canActivate(candidate, input.environment).allowed,
      );
      if (blocked !== undefined) {
        const decision = canActivate(blocked, input.environment);
        return Result.err({
          kind: 'PACK_NOT_RESOLVABLE',
          version: blocked.version,
          environment: input.environment,
          reasons: decision.allowed ? [] : decision.reasons,
        });
      }
      return Result.err({ kind: 'NO_PACK_IN_FORCE', requestedAt: input.requestedAt });
    }
    if (eligible.length > 1) {
      return Result.err({
        kind: 'OVERLAPPING_PACKS_IN_FORCE',
        versions: eligible.map((candidate) => candidate.version),
        requestedAt: input.requestedAt,
      });
    }
    pack = eligible[0] as PolicyPack<Id>;
  }

  const findings = validatePack(pack, {
    strategies,
    ...(input.disclosureBearingCapabilityIds === undefined
      ? {}
      : { disclosureBearingCapabilityIds: input.disclosureBearingCapabilityIds }),
  });
  if (findings.length > 0) {
    return Result.err({ kind: 'PACK_INVALID', version: pack.version, findings });
  }

  // Restrict-only merge: settings may only remove from the ceiling. Ids that
  // are not in the pack's cleared set restrict nothing — and can enable
  // nothing, because the ceiling starts from the pack and only shrinks.
  const disabled = new Set<string>(input.settings?.disabledCapabilityIds ?? []);
  const capabilityCeiling: CapabilityCeilingEntry<Id>[] = [];
  const strategyByCapability: Partial<Record<Id, string>> = {};
  for (const capabilityId of pack.clearedCapabilities) {
    // Validated above: every cleared capability names a registered strategy.
    const strategyId = pack.resolutionStrategies[capabilityId] as string;
    strategyByCapability[capabilityId] = strategyId;
    if (disabled.has(capabilityId)) continue;
    capabilityCeiling.push({ capabilityId, strategyId });
  }

  const aiSuspended = input.settings?.aiProcessingSuspended === true;
  const aiProcessing: EffectiveDecision<AiProcessingPolicy> =
    aiSuspended && pack.aiProcessingPolicy.state === 'DECIDED'
      ? {
          state: 'RESTRICTED_BY_SETTINGS',
          reason: 'AI processing suspended by jurisdiction runtime settings (restrict-only)',
        }
      : pack.aiProcessingPolicy;

  const policy: EffectivePolicy<Id> = {
    jurisdiction: pack.jurisdiction,
    packVersion: pack.version,
    packLifecycle: pack.lifecycle,
    packReviewStatus: pack.reviewStatus,
    effectiveFrom: pack.effectiveFrom,
    effectiveTo: pack.effectiveTo,
    environment: input.environment,
    financialRulesets: pack.financialRulesets,
    consentRequirements: pack.consentRequirements,
    processingBases: pack.processingBases,
    retention: pack.retention,
    identityRequirements: pack.identityRequirements,
    disclosurePolicy: pack.disclosurePolicy,
    approvalPolicies: pack.approvalPolicies,
    currencyPolicy: pack.currencyPolicy,
    aiProcessing,
    capabilityCeiling: Object.freeze(capabilityCeiling),
    subjectPolicyOptions: pack.subjectPolicyOptions,
    subjectPolicySelectionVersion: null,
    unresolved: Object.freeze(collectUnresolved(pack)),
    provenance: {
      jurisdiction: pack.jurisdiction,
      packVersion: pack.version,
      packLifecycle: pack.lifecycle,
      selection: input.selection.kind,
      environment: input.environment,
      requestedAt: input.requestedAt,
      strategyByCapability,
      settingsVersion: input.settings?.settingsVersion ?? null,
    },
  };
  return Result.ok(Object.freeze(policy));
}
