// Pack validation — pure, typed findings, load-time posture
// (jurisdiction-policy.md §8: "Load-time failures — not runtime, not silent").
//
// A finding is a structural defect in the pack itself, distinct from a
// pending decision: PENDING_LEGAL_REVIEW is a valid state a pack may carry;
// a REQUIRED slot with no entry at all, a cleared capability with no named
// strategy, or an APPROVED claim without evidence is a defect that fails
// validation. The resolver refuses invalid packs; the runtime activation use
// case refuses them too.

import type { PolicyPack } from './policy-pack';
import {
  DEFAULT_RESOLUTION_STRATEGIES,
  type ResolutionStrategyRegistry,
} from './resolution/strategies';

export type PackValidationFinding =
  | { readonly kind: 'MISSING_VERSION'; readonly message: string }
  | { readonly kind: 'MISSING_JURISDICTION'; readonly message: string }
  | {
      readonly kind: 'INVALID_EFFECTIVE_PERIOD';
      readonly message: string;
    }
  | {
      readonly kind: 'MISSING_RESOLUTION_STRATEGY';
      readonly capabilityId: string;
      readonly message: string;
    }
  | {
      readonly kind: 'UNKNOWN_RESOLUTION_STRATEGY';
      readonly capabilityId: string;
      readonly strategyId: string;
      readonly message: string;
    }
  | {
      readonly kind: 'MISSING_PROCESSING_BASIS';
      readonly purposeRef: string;
      readonly message: string;
    }
  | {
      readonly kind: 'MISSING_APPROVAL_POLICY';
      readonly capabilityId: string;
      readonly message: string;
    }
  | { readonly kind: 'APPROVAL_EVIDENCE_MISSING'; readonly message: string }
  | { readonly kind: 'DECISION_WITHOUT_BASIS'; readonly where: string; readonly message: string }
  | {
      readonly kind: 'OVERLAPPING_EFFECTIVE_PERIODS';
      readonly versionA: string;
      readonly versionB: string;
      readonly message: string;
    }
  | { readonly kind: 'DUPLICATE_VERSION'; readonly version: string; readonly message: string };

export interface PackValidationContext<Id extends string = string> {
  /** Strategy registry to validate strategy names against; defaults to the
   * launch registry. Passing a wider registry admits its ids — nothing else
   * changes, which is what keeps the registry extensible. */
  readonly strategies?: ResolutionStrategyRegistry;
  /**
   * Capability ids that carry disclosure-bearing behaviour. Supplied by the
   * caller because capability descriptors live in @karar/capability-registry,
   * which depends on this package — the ids arrive as data, not as a type
   * import, and synthetic test ids work identically.
   */
  readonly disclosureBearingCapabilityIds?: readonly Id[] | readonly string[];
}

function decisionEntries<Id extends string>(
  pack: PolicyPack<Id>,
): ReadonlyArray<{ readonly where: string; readonly state: string; readonly basis?: string }> {
  const entries: Array<{ where: string; state: string; basis?: string }> = [];
  const push = (
    where: string,
    decision: { readonly state: string; readonly basis?: string } | undefined,
  ) => {
    if (decision !== undefined) {
      entries.push(
        decision.basis === undefined
          ? { where, state: decision.state }
          : { where, state: decision.state, basis: decision.basis },
      );
    }
  };
  for (const [capabilityId, decision] of Object.entries(pack.financialRulesets)) {
    push(`financialRulesets['${capabilityId}']`, decision as { state: string; basis?: string });
  }
  push('consentRequirements', pack.consentRequirements);
  for (const [purposeRef, decision] of Object.entries(pack.processingBases)) {
    push(`processingBases['${purposeRef}']`, decision);
  }
  for (const [category, decision] of Object.entries(pack.retention)) {
    push(`retention['${category}']`, decision);
  }
  push('identityRequirements', pack.identityRequirements);
  push('disclosurePolicy', pack.disclosurePolicy);
  for (const [capabilityId, decision] of Object.entries(pack.approvalPolicies)) {
    push(`approvalPolicies['${capabilityId}']`, decision as { state: string; basis?: string });
  }
  push('currencyPolicy', pack.currencyPolicy);
  push('aiProcessingPolicy', pack.aiProcessingPolicy);
  return entries;
}

export function validatePack<Id extends string>(
  pack: PolicyPack<Id>,
  context: PackValidationContext<Id> = {},
): readonly PackValidationFinding[] {
  const findings: PackValidationFinding[] = [];
  const strategies = context.strategies ?? DEFAULT_RESOLUTION_STRATEGIES;
  const disclosureBearing = new Set<string>(
    (context.disclosureBearingCapabilityIds ?? []) as readonly string[],
  );

  if (pack.version.trim() === '') {
    findings.push({ kind: 'MISSING_VERSION', message: 'pack declares no version' });
  }
  if (String(pack.jurisdiction).trim() === '') {
    findings.push({ kind: 'MISSING_JURISDICTION', message: 'pack declares no jurisdiction' });
  }
  if (pack.effectiveTo !== null && pack.effectiveTo.getTime() <= pack.effectiveFrom.getTime()) {
    findings.push({
      kind: 'INVALID_EFFECTIVE_PERIOD',
      message: `pack ${pack.version} effectiveTo is not after effectiveFrom`,
    });
  }
  if (
    pack.lifecycle === 'APPROVED' &&
    (pack.approvalReference === null || pack.approvalReference.trim() === '')
  ) {
    findings.push({
      kind: 'APPROVAL_EVIDENCE_MISSING',
      message: `pack ${pack.version} declares lifecycle APPROVED with no approvalReference — absence of evidence means not approved`,
    });
  }

  for (const capabilityId of pack.clearedCapabilities) {
    const strategyId = pack.resolutionStrategies[capabilityId];
    if (strategyId === undefined || strategyId.trim() === '') {
      findings.push({
        kind: 'MISSING_RESOLUTION_STRATEGY',
        capabilityId,
        message: `cleared capability '${capabilityId}' names no resolution strategy — no default exists (jurisdiction-policy.md §5)`,
      });
    } else if (!strategies.has(strategyId)) {
      findings.push({
        kind: 'UNKNOWN_RESOLUTION_STRATEGY',
        capabilityId,
        strategyId,
        message: `cleared capability '${capabilityId}' names unregistered strategy '${strategyId}'`,
      });
    }

    if (disclosureBearing.has(capabilityId)) {
      const approval = pack.approvalPolicies[capabilityId];
      if (approval === undefined || approval.state !== 'DECIDED') {
        findings.push({
          kind: 'MISSING_APPROVAL_POLICY',
          capabilityId,
          message:
            `cleared capability '${capabilityId}' is disclosure-bearing and has no DECIDED ` +
            `approval policy — no capability that discharges data exists without an approval workflow`,
        });
      }
    }
  }

  for (const purposeRef of pack.declaredPurposes) {
    if (pack.processingBases[purposeRef] === undefined) {
      findings.push({
        kind: 'MISSING_PROCESSING_BASIS',
        purposeRef,
        message: `declared purpose '${purposeRef}' has no processing-basis entry — an absent basis fails closed (ADR-0024)`,
      });
    }
  }

  for (const { where, state, basis } of decisionEntries(pack)) {
    if (state === 'DECIDED' && (basis === undefined || basis.trim() === '')) {
      findings.push({
        kind: 'DECISION_WITHOUT_BASIS',
        where,
        message: `${where} is DECIDED with no basis — a decision without its instrument is an assertion`,
      });
    }
  }

  return Object.freeze(findings);
}

/** Validates a set of pack versions together: per-pack findings, duplicate
 * versions, and overlapping effective periods within one jurisdiction. */
export function validatePackSet<Id extends string>(
  packs: readonly PolicyPack<Id>[],
  context: PackValidationContext<Id> = {},
): readonly PackValidationFinding[] {
  const findings: PackValidationFinding[] = [];
  for (const pack of packs) {
    findings.push(...validatePack(pack, context));
  }

  const seenVersions = new Set<string>();
  for (const pack of packs) {
    const key = `${String(pack.jurisdiction)}#${pack.version}`;
    if (seenVersions.has(key)) {
      findings.push({
        kind: 'DUPLICATE_VERSION',
        version: pack.version,
        message: `pack version '${pack.version}' appears twice for ${String(pack.jurisdiction)}`,
      });
    }
    seenVersions.add(key);
  }

  for (let i = 0; i < packs.length; i += 1) {
    for (let j = i + 1; j < packs.length; j += 1) {
      const a = packs[i];
      const b = packs[j];
      if (a === undefined || b === undefined) continue;
      if (String(a.jurisdiction) !== String(b.jurisdiction)) continue;
      const aEnd = a.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
      const bEnd = b.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
      const overlaps = a.effectiveFrom.getTime() < bEnd && b.effectiveFrom.getTime() < aEnd;
      if (overlaps && a.version !== b.version) {
        findings.push({
          kind: 'OVERLAPPING_EFFECTIVE_PERIODS',
          versionA: a.version,
          versionB: b.version,
          message:
            `packs '${a.version}' and '${b.version}' for ${String(a.jurisdiction)} have ` +
            `overlapping effective periods — one instant, one pack in force`,
        });
      }
    }
  }

  return Object.freeze(findings);
}
