/**
 * The availability resolution core — eight ordered gates over an immutable
 * facts snapshot, as one pure deterministic function (capability-registry.md
 * §4; every gate is AND, first failure names the denial).
 *
 * RESTRICT-ONLY MERGE, formalized: the resolved outcome is the MEET of the
 * gate outputs. No database row, entitlement, consent, licence, or provider
 * status can yield MORE access than the descriptor + policy-pack ceiling
 * permits — grant-like inputs are consumed only by gates 5-8, which run
 * strictly after the ceiling gates 1-4, so adding any grant can never flip a
 * ceiling denial. The property harness proves both directions over generated
 * configurations.
 *
 * TOCTOU discipline (§44): the engine reads ONLY this snapshot. The caller
 * assembles the snapshot with one read per dimension and the output pins the
 * versions those reads returned (pack version, availability row version,
 * entitlement version), so a concurrent change either lands wholly in a
 * later resolution or is detectable from the pinned provenance — never a
 * half-applied mix inside one resolution.
 *
 * Pure and deterministic: time arrives as an argument, references are
 * compared structurally (`sameRef`), and jurisdiction-valued inputs travel
 * as opaque `scopeRef` strings — behaviour never branches on which
 * jurisdiction it is, only on whether the declared facts hold (architecture
 * test 12).
 */

import {
  isAllowingState,
  type AllowingState,
  type AvailabilityState,
} from './availability-state.js';
import type { DenialReason } from './denial-reason.js';
import { entitlementSatisfiesAt } from './entitlement.js';

// ---------------------------------------------------------------------------
// Facts — the snapshot the gates read. Application code assembles these from
// the ports; tests construct them directly.
// ---------------------------------------------------------------------------

/** What gate 1 needs from the static descriptor, structurally. */
export interface DescriptorFacts {
  readonly implemented: boolean;
  readonly deployedInEnvironment: boolean;
  /** declaredJurisdictions as opaque refs — the code-side ceiling input. */
  readonly declaredScopeRefs: readonly string[];
}

/** Per-capability clearance content from the effective policy ceiling. */
export interface ClearedCapabilityFacts {
  /** Open string by design: an id the registry does not know is simply never AVAILABLE. */
  readonly capabilityId: string;
  /** Opaque reference to the pack's per-capability resolution strategy. */
  readonly resolutionStrategyRef: string;
  /** True when clearance requires a VERIFIED jurisdiction assignment. */
  readonly requiresVerifiedAssignment: boolean;
  readonly processingBasis: ProcessingBasisFacts;
  /** Licence-type refs the pack requires — never invented here; qa/v1 declares none. */
  readonly requiredLicenceTypeRefs: readonly string[];
  /** Provider kinds the pack requires — never invented here; qa/v1 declares none. */
  readonly requiredProviderKinds: readonly string[];
}

export type ProcessingBasisFacts =
  | { readonly kind: 'CONSENT'; readonly purposeRef: string }
  | { readonly kind: 'DECLARED_BASIS'; readonly basisRef: string }
  | { readonly kind: 'UNRESOLVED' };

/**
 * The effective policy ceiling for the subject, or the typed unresolved
 * state that denies every capability at gate 3. The vocabulary is CLOSED
 * here: the port adapter maps the policy workstream's states onto these and
 * fails the resolution outright on anything it cannot map — an unmappable
 * state must never silently pass a gate.
 */
export type CeilingFacts =
  | { readonly kind: 'NO_ASSIGNMENT' }
  | { readonly kind: 'UNVERIFIED_ASSIGNMENT'; readonly scopeRef: string }
  | {
      readonly kind: 'PACK_NOT_APPROVED';
      readonly scopeRef: string;
      readonly packVersionRef: string | null;
    }
  | {
      readonly kind: 'RESOLVED';
      readonly scopeRef: string;
      readonly assignmentVerified: boolean;
      readonly packVersionRef: string;
      readonly cleared: readonly ClearedCapabilityFacts[];
    };

export type AvailabilityFacts =
  | { readonly kind: 'NO_ROW'; readonly existsForOtherEnvironment: boolean }
  | {
      readonly kind: 'ROW';
      readonly rowId: string;
      readonly state: AvailabilityState;
      readonly version: number;
    };

export type EntitlementFacts =
  | { readonly kind: 'NONE' }
  | {
      readonly kind: 'ROW';
      readonly rowId: string;
      readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
      readonly effectiveFrom: Date;
      readonly effectiveTo: Date | null;
      readonly version: number;
    };

export type ConsentFacts =
  | { readonly kind: 'NOT_EVALUATED' }
  | {
      readonly kind: 'STATUS';
      readonly state: 'ACTIVE' | 'WITHDRAWN' | 'RECONSENT_REQUIRED' | 'NO_GRANT';
      /** False when no published document exists to consent to — fails closed. */
      readonly documentAvailable: boolean;
    };

export interface LicenceFacts {
  readonly licenceTypeRef: string;
  readonly status: 'CLAIMED_UNVERIFIED' | 'EVIDENCED' | 'EXPIRED' | 'REVOKED';
  readonly effectiveDate: Date | null;
  readonly expiryDate: Date | null;
}

export type LicensingFacts =
  | { readonly kind: 'NOT_EVALUATED' }
  | { readonly kind: 'NO_EFFECTIVE_ENTITY' }
  | {
      readonly kind: 'ENTITY';
      readonly entityRef: string;
      /** Whether the entity may lawfully operate in the effective scope. */
      readonly permittedInScope: boolean;
      readonly licences: readonly LicenceFacts[];
    };

export type ProviderFacts =
  | { readonly kind: 'NOT_EVALUATED' }
  | {
      readonly kind: 'STATUSES';
      readonly statuses: ReadonlyArray<{
        readonly providerKind: string;
        readonly status: 'CONNECTED' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
      }>;
    };

export interface GateInputs<Id extends string = string> {
  readonly capabilityId: Id;
  readonly environment: string;
  readonly descriptor: DescriptorFacts;
  readonly ceiling: CeilingFacts;
  readonly availability: AvailabilityFacts;
  readonly entitlement: EntitlementFacts;
  readonly consent: ConsentFacts;
  readonly licensing: LicensingFacts;
  readonly providers: ProviderFacts;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export const GATES = [
  'DESCRIPTOR',
  'ENVIRONMENT',
  'JURISDICTION',
  'AVAILABILITY',
  'ENTITLEMENT',
  'CONSENT',
  'LICENCE',
  'PROVIDER',
] as const;

export type GateName = (typeof GATES)[number];

/** The versions this resolution actually read — the §44 pins. */
export interface ResolutionPins {
  readonly packVersionRef: string | null;
  readonly availabilityRowId: string | null;
  readonly availabilityRowVersion: number | null;
  readonly entitlementId: string | null;
  readonly entitlementVersion: number | null;
}

export interface ResolutionProvenance extends ResolutionPins {
  readonly environment: string;
  /** The effective jurisdiction the resolution ran under, when one resolved. */
  readonly jurisdictionRef: string | null;
  readonly resolvedAt: Date;
}

export type CapabilityResolution<Id extends string = string> =
  | {
      readonly capabilityId: Id;
      readonly outcome: 'ALLOWED';
      readonly state: AllowingState;
      readonly provenance: ResolutionProvenance;
    }
  | {
      readonly capabilityId: Id;
      readonly outcome: 'DENIED';
      readonly gate: GateName;
      readonly reason: DenialReason;
      readonly provenance: ResolutionProvenance;
    };

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** Structural reference equality, named so intent survives review. */
function sameRef(a: string, b: string): boolean {
  return a === b;
}

function pinsOf(inputs: GateInputs): ResolutionPins {
  return {
    packVersionRef:
      inputs.ceiling.kind === 'RESOLVED'
        ? inputs.ceiling.packVersionRef
        : inputs.ceiling.kind === 'PACK_NOT_APPROVED'
          ? inputs.ceiling.packVersionRef
          : null,
    availabilityRowId: inputs.availability.kind === 'ROW' ? inputs.availability.rowId : null,
    availabilityRowVersion:
      inputs.availability.kind === 'ROW' ? inputs.availability.version : null,
    entitlementId: inputs.entitlement.kind === 'ROW' ? inputs.entitlement.rowId : null,
    entitlementVersion: inputs.entitlement.kind === 'ROW' ? inputs.entitlement.version : null,
  };
}

function scopeRefOf(ceiling: CeilingFacts): string | null {
  switch (ceiling.kind) {
    case 'NO_ASSIGNMENT':
      return null;
    case 'UNVERIFIED_ASSIGNMENT':
    case 'PACK_NOT_APPROVED':
    case 'RESOLVED':
      return ceiling.scopeRef;
  }
}

/**
 * Resolve one capability against the snapshot. Gates run in declared order;
 * the first failing gate names the denial. Every outcome — allowed or denied
 * — carries the full provenance pins.
 */
export function resolveCapabilityGates<Id extends string>(
  inputs: GateInputs<Id>,
  at: Date,
): CapabilityResolution<Id> {
  const provenance: ResolutionProvenance = {
    ...pinsOf(inputs),
    environment: inputs.environment,
    jurisdictionRef: scopeRefOf(inputs.ceiling),
    resolvedAt: at,
  };
  const deny = (gate: GateName, reason: DenialReason): CapabilityResolution<Id> => ({
    capabilityId: inputs.capabilityId,
    outcome: 'DENIED',
    gate,
    reason,
    provenance,
  });

  // Gate 1 — descriptor: no configuration can override missing code.
  if (!inputs.descriptor.implemented) return deny('DESCRIPTOR', 'NOT_IMPLEMENTED');
  if (!inputs.descriptor.deployedInEnvironment) return deny('DESCRIPTOR', 'NOT_DEPLOYED');

  // Gate 2 — environment: a row targeting only another environment is a
  // configuration for a different deployment, not an enablement here.
  // (The resolution environment itself is server-side input, bound at
  // construction — it never arrives from a client.)
  if (inputs.availability.kind === 'NO_ROW' && inputs.availability.existsForOtherEnvironment) {
    return deny('ENVIRONMENT', 'WRONG_ENVIRONMENT');
  }

  // Gate 3 — jurisdiction and policy pack.
  switch (inputs.ceiling.kind) {
    case 'NO_ASSIGNMENT':
      return deny('JURISDICTION', 'JURISDICTION_ABSENT');
    case 'UNVERIFIED_ASSIGNMENT':
      return deny('JURISDICTION', 'JURISDICTION_UNVERIFIED');
    case 'PACK_NOT_APPROVED':
      return deny('JURISDICTION', 'POLICY_PACK_NOT_APPROVED');
    case 'RESOLVED':
      break;
  }
  const ceiling = inputs.ceiling;
  const cleared = ceiling.cleared.find((c) => sameRef(c.capabilityId, inputs.capabilityId));
  const declared = inputs.descriptor.declaredScopeRefs.some((ref) =>
    sameRef(ref, ceiling.scopeRef),
  );
  // Clearance is the intersection of the pack ceiling AND the descriptor's
  // declared set — either missing means the capability is not cleared for
  // this scope. (Amanat declares [], so no pack can ever clear it.)
  if (cleared === undefined || !declared) {
    return deny('JURISDICTION', 'JURISDICTION_NOT_CLEARED');
  }
  if (cleared.requiresVerifiedAssignment && !ceiling.assignmentVerified) {
    return deny('JURISDICTION', 'JURISDICTION_UNVERIFIED');
  }

  // Gate 4 — availability row: missing row IS DISABLED (deny by default);
  // non-allowing states deny with themselves as the reason.
  if (inputs.availability.kind === 'NO_ROW') return deny('AVAILABILITY', 'DISABLED');
  const state = inputs.availability.state;
  if (!isAllowingState(state)) {
    return deny('AVAILABILITY', state);
  }

  // Gate 5 — entitlement (restrict-only: can satisfy this gate, nothing more).
  if (inputs.entitlement.kind === 'NONE') return deny('ENTITLEMENT', 'ENTITLEMENT_MISSING');
  if (!entitlementSatisfiesAt(inputs.entitlement, at)) {
    return deny(
      'ENTITLEMENT',
      inputs.entitlement.status === 'REVOKED' ? 'ENTITLEMENT_MISSING' : 'ENTITLEMENT_EXPIRED',
    );
  }

  // Gate 6 — consent, only where the pack declares consent as the basis.
  const consentDenial = consentGate(cleared.processingBasis, inputs.consent);
  if (consentDenial !== null) return deny('CONSENT', consentDenial);

  // Gate 7 — licence, only for pack-required licence types (never invented).
  const licenceDenial = licenceGate(cleared.requiredLicenceTypeRefs, inputs.licensing, at);
  if (licenceDenial !== null) return deny('LICENCE', licenceDenial);

  // Gate 8 — provider, only for pack-required provider kinds.
  const providerDenial = providerGate(cleared.requiredProviderKinds, inputs.providers);
  if (providerDenial !== null) return deny('PROVIDER', providerDenial);

  return {
    capabilityId: inputs.capabilityId,
    outcome: 'ALLOWED',
    state,
    provenance,
  };
}

function consentGate(basis: ProcessingBasisFacts, consent: ConsentFacts): DenialReason | null {
  switch (basis.kind) {
    case 'DECLARED_BASIS':
      // A different declared basis must NOT demand consent.
      return null;
    case 'UNRESOLVED':
      // No resolvable basis declared — fail closed.
      return 'PROCESSING_BASIS_UNRESOLVED';
    case 'CONSENT':
      break;
  }
  if (consent.kind === 'NOT_EVALUATED') {
    // Consent is the basis but no status could be evaluated (no principal
    // user, or the caller skipped the gate) — fail closed.
    return 'CONSENT_REQUIRED';
  }
  if (!consent.documentAvailable) {
    // No published disclosure document: unavailable, never fail-open
    // (the inversion of legacy AI-5).
    return 'CONSENT_REQUIRED';
  }
  switch (consent.state) {
    case 'ACTIVE':
      return null;
    case 'RECONSENT_REQUIRED':
      return 'RECONSENT_REQUIRED';
    case 'WITHDRAWN':
    case 'NO_GRANT':
      return 'CONSENT_REQUIRED';
  }
}

function licenceGate(
  requiredTypeRefs: readonly string[],
  licensing: LicensingFacts,
  at: Date,
): DenialReason | null {
  if (requiredTypeRefs.length === 0) return null;
  if (licensing.kind === 'NOT_EVALUATED') return 'LICENCE_MISSING';
  if (licensing.kind === 'NO_EFFECTIVE_ENTITY') return 'LICENCE_MISSING';
  if (!licensing.permittedInScope) return 'LICENCE_MISSING';
  for (const typeRef of requiredTypeRefs) {
    const candidates = licensing.licences.filter((l) => sameRef(l.licenceTypeRef, typeRef));
    const satisfied = candidates.some(
      (l) =>
        l.status === 'EVIDENCED' &&
        l.effectiveDate !== null &&
        l.effectiveDate.getTime() <= at.getTime() &&
        (l.expiryDate === null || l.expiryDate.getTime() > at.getTime()),
    );
    if (satisfied) continue;
    const lapsed = candidates.some(
      (l) => l.status === 'EXPIRED' || (l.expiryDate !== null && l.expiryDate.getTime() <= at.getTime()),
    );
    // A CLAIMED_UNVERIFIED or REVOKED licence never satisfies: a claim is
    // not evidence, and a revocation is an absence, not an expiry.
    return lapsed ? 'LICENCE_EXPIRED' : 'LICENCE_MISSING';
  }
  return null;
}

function providerGate(
  requiredKinds: readonly string[],
  providers: ProviderFacts,
): DenialReason | null {
  if (requiredKinds.length === 0) return null;
  if (providers.kind === 'NOT_EVALUATED') return 'PENDING_PROVIDER';
  for (const kind of requiredKinds) {
    const entry = providers.statuses.find((s) => sameRef(s.providerKind, kind));
    if (entry === undefined || entry.status === 'NOT_CONFIGURED') return 'PENDING_PROVIDER';
    if (entry.status === 'UNAVAILABLE') return 'PROVIDER_UNAVAILABLE';
  }
  return null;
}
