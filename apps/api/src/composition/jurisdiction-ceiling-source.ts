/**
 * Binds the jurisdiction workstream's policy resolution to the capability
 * workstream's `PolicyCeilingSource` port. Both sides deliberately refused a
 * direct dependency (the packages would otherwise form a cycle), so the
 * translation lives here, at the composition root.
 *
 * The governing jurisdiction comes from the ONE shared derivation
 * (`governingJurisdictionFor`), so the ceiling, the reported jurisdiction,
 * the reported pack, and any pinned provenance are computed from the same
 * assignment — see effective-jurisdiction.ts for the rule and why there is
 * no tenant fallback.
 *
 * Fail-closed by construction: every path that cannot produce a complete,
 * honest answer returns a denying `CeilingFacts` variant or throws
 * `PolicyCeilingUnresolvableError`, which the resolver converts into a
 * denial. Nothing here invents a jurisdiction, a pack version, or a
 * clearance.
 */

import {
  PolicyCeilingUnresolvableError,
  type PolicyCeilingQuery,
  type PolicyCeilingSource,
} from '@karar/capability';
import type { CeilingFacts } from '@karar/capability/dist/domain/resolution.js';
import { CAPABILITY_IDS, CAPABILITY_REGISTRY } from '@karar/capability-registry';
import {
  POLICY_PACKS,
  jurisdictionId,
  resolveEffectivePolicy,
  type PolicyEnvironment,
} from '@karar/jurisdiction-policy';
import type { GetActivePackVersion } from '@karar/jurisdiction';
import type { Clock } from '@karar/shared-kernel';
import type { PrismaUserJurisdictionAssignmentRepository } from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-assignment-repositories.js';

import { governingJurisdictionFor } from './effective-jurisdiction.js';

/**
 * The disclosure-bearing ids, passed as DATA on every resolution so the
 * pack validator's approval-policy rule is armed on the runtime path. Left
 * absent, that rule silently never fires — the independent review found it
 * disarmed here.
 */
const DISCLOSURE_BEARING_IDS: readonly string[] = CAPABILITY_IDS.filter(
  (id) => CAPABILITY_REGISTRY[id].disclosureBearing,
);

export interface JurisdictionCeilingSourceDeps {
  readonly assignments: PrismaUserJurisdictionAssignmentRepository;
  readonly activePackVersion: GetActivePackVersion;
  readonly clock: Clock;
}

export class JurisdictionCeilingSource implements PolicyCeilingSource {
  constructor(private readonly deps: JurisdictionCeilingSourceDeps) {}

  async effectivePolicyFor(query: PolicyCeilingQuery): Promise<CeilingFacts> {
    if (query.userId === null) {
      // The assignment read is tenant+user RLS-scoped; without a principal
      // there is no context to read under, so the ceiling denies.
      throw new PolicyCeilingUnresolvableError(
        'no principal in context; the governing jurisdiction cannot be resolved',
      );
    }
    const governing = await governingJurisdictionFor(this.deps.assignments, this.deps.clock, {
      userId: String(query.userId),
      tenantId: String(query.tenantId),
    });
    if (governing.kind === 'NONE' || governing.code === null) {
      return { kind: 'NO_ASSIGNMENT' };
    }
    const scopeRef = governing.code;
    if (governing.kind === 'UNVERIFIED') {
      return { kind: 'UNVERIFIED_ASSIGNMENT', scopeRef };
    }

    const active = await this.deps.activePackVersion.execute({
      jurisdictionCode: scopeRef,
      environment: query.environment as PolicyEnvironment,
    });
    if (!active.ok || !active.value.active) {
      return { kind: 'PACK_NOT_APPROVED', scopeRef, packVersionRef: null };
    }

    const resolved = resolveEffectivePolicy({
      jurisdiction: jurisdictionId(scopeRef),
      requestedAt: query.at,
      packs: POLICY_PACKS,
      selection: { kind: 'EXPLICIT_VERSION', version: active.value.packVersion },
      environment: query.environment as PolicyEnvironment,
      disclosureBearingCapabilityIds: DISCLOSURE_BEARING_IDS,
    });
    if (!resolved.ok) {
      // resolveEffectivePolicy applies the activation rules itself (a DRAFT or
      // otherwise unapprovable pack never resolves for this environment), so a
      // failure here IS the not-approved answer.
      return { kind: 'PACK_NOT_APPROVED', scopeRef, packVersionRef: active.value.packVersion };
    }
    const policy = resolved.value;

    if (policy.capabilityCeiling.length > 0) {
      // A cleared capability needs facts this seam cannot yet derive from the
      // resolution result alone (verified-assignment requirement, processing
      // basis, licence type refs). No pack clears anything today — qa/v1's
      // cleared set is empty and every capability is NOT_IMPLEMENTED, so the
      // descriptor gate denies first regardless. Completing this mapping is
      // entry work for the phase that clears the first real capability;
      // until then a clearance must deny rather than resolve on guessed facts.
      throw new PolicyCeilingUnresolvableError(
        'the pack clears a capability, but the composition cannot yet derive its full clearance facts; failing closed',
      );
    }

    return {
      kind: 'RESOLVED',
      scopeRef,
      assignmentVerified: true,
      packVersionRef: policy.packVersion,
      cleared: [],
    };
  }
}
