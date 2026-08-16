/**
 * The restrict-only merge, property-tested by hand (fast-check is
 * deliberately not a dependency). Three seeded deterministic sweeps, each
 * honest about what it covers:
 *
 *  A. CEILING CORE — genuinely exhaustive over gates 1-4: descriptor (4) ×
 *     processing basis (3) × ceiling (9, including the verified/unverified ×
 *     requires/does-not-require matrix) × availability (10) = 1,080 cells,
 *     each with 5 randomized draws of the four grant dimensions.
 *  B. GRANT DIMENSIONS — genuinely exhaustive over gates 5-8: with every
 *     upstream gate satisfied, all entitlement (4) × consent (7) × licensing
 *     (6) × provider (4) = 672 combinations, checked against an INDEPENDENT
 *     oracle written in this file (not the domain's own predicates).
 *  C. CROSS SWEEP — 2,000 fully randomized configurations across all eight
 *     dimensions, catching interactions the two structured sweeps separate.
 *
 * Properties proven over every generated case:
 *
 *  P1 (meet <= ceiling): a resolution is ALLOWED only when EVERY ceiling
 *     fact independently permits it — descriptor implemented AND deployed,
 *     pack resolved AND capability cleared AND scope declared AND
 *     verification satisfied, availability row in an allowing state,
 *     entitlement satisfying, consent/licence/provider gates content.
 *
 *  P2 (grants never widen): starting from any configuration denied at the
 *     ceiling gates 1-4, upgrading EVERY grant-like dimension to its most
 *     generous value (ACTIVE entitlement, ACTIVE consent on a published
 *     document, evidenced licences, connected providers) never flips the
 *     denial — same gate, same reason.
 *
 *  P3 (rows never widen the code ceiling): adding an AVAILABLE row to any
 *     configuration denied at the descriptor or jurisdiction gates leaves
 *     the denial untouched.
 *
 *  P4 (determinism): resolving the same snapshot twice yields identical
 *     output.
 *
 *  P5 (no unexercised branch): every (gate, reason) pair the engine can
 *     emit is actually observed by the sweeps — including
 *     JURISDICTION_UNVERIFIED reached from a RESOLVED ceiling whose
 *     capability requires verification the assignment lacks, which is a
 *     different branch from the UNVERIFIED_ASSIGNMENT ceiling state. A
 *     harness that silently stops covering a branch fails here.
 */

import { describe, expect, it } from 'vitest';

import {
  resolveCapabilityGates,
  type AvailabilityFacts,
  type CeilingFacts,
  type ConsentFacts,
  type EntitlementFacts,
  type GateInputs,
  type LicensingFacts,
  type ProviderFacts,
} from '../domain/resolution.js';
import { AVAILABILITY_STATES } from '../domain/availability-state.js';
import { clearedFacts, NOW, SCOPE, OTHER_SCOPE } from './fakes/synthetic-fixtures.js';

/** Deterministic PRNG (mulberry32) — the seed is the whole story. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAPABILITY = 'TEST_SYNTH';

// ---------------------------------------------------------------------------
// Dimension generators
// ---------------------------------------------------------------------------

const descriptorVariants = [
  { implemented: true, deployedInEnvironment: true, declaredScopeRefs: [SCOPE] },
  { implemented: true, deployedInEnvironment: true, declaredScopeRefs: [OTHER_SCOPE] },
  { implemented: true, deployedInEnvironment: false, declaredScopeRefs: [SCOPE] },
  { implemented: false, deployedInEnvironment: false, declaredScopeRefs: [SCOPE] },
] as const;

function clearedFor(
  basis: 'DECLARED_BASIS' | 'CONSENT' | 'UNRESOLVED',
  requiresVerifiedAssignment: boolean,
) {
  return clearedFacts(CAPABILITY, {
    requiresVerifiedAssignment,
    processingBasis:
      basis === 'CONSENT'
        ? { kind: 'CONSENT', purposeRef: 'purpose:test' }
        : basis === 'UNRESOLVED'
          ? { kind: 'UNRESOLVED' }
          : { kind: 'DECLARED_BASIS', basisRef: 'basis:contract' },
    requiredLicenceTypeRefs: basis === 'CONSENT' ? ['licence:test'] : [],
    requiredProviderKinds: basis === 'CONSENT' ? ['provider:test'] : [],
  });
}

/**
 * Nine ceilings per basis. The four RESOLVED-with-clearance variants sweep
 * the full verification matrix — assignmentVerified × requiresVerifiedAssignment
 * — so the gate-3 branch that denies JURISDICTION_UNVERIFIED from a RESOLVED
 * ceiling is actually generated, not merely reachable in principle. The two
 * empty-clearance variants vary verification too, proving NOT_CLEARED wins
 * over the verification check regardless.
 */
function ceilingVariants(basis: 'DECLARED_BASIS' | 'CONSENT' | 'UNRESOLVED'): CeilingFacts[] {
  const resolved: CeilingFacts[] = [];
  for (const assignmentVerified of [true, false]) {
    for (const requiresVerifiedAssignment of [true, false]) {
      resolved.push({
        kind: 'RESOLVED',
        scopeRef: SCOPE,
        assignmentVerified,
        packVersionRef: 'pack:t/1',
        cleared: [clearedFor(basis, requiresVerifiedAssignment)],
      });
    }
    resolved.push({
      kind: 'RESOLVED',
      scopeRef: SCOPE,
      assignmentVerified,
      packVersionRef: 'pack:t/1',
      cleared: [],
    });
  }
  return [
    { kind: 'NO_ASSIGNMENT' },
    { kind: 'UNVERIFIED_ASSIGNMENT', scopeRef: SCOPE },
    { kind: 'PACK_NOT_APPROVED', scopeRef: SCOPE, packVersionRef: 'pack:t/1' },
    ...resolved,
  ];
}

const availabilityVariants: AvailabilityFacts[] = [
  { kind: 'NO_ROW', existsForOtherEnvironment: false },
  { kind: 'NO_ROW', existsForOtherEnvironment: true },
  ...AVAILABILITY_STATES.map(
    (state): AvailabilityFacts => ({ kind: 'ROW', rowId: 'row-1', state, version: 1 }),
  ),
];

const entitlementVariants: EntitlementFacts[] = [
  { kind: 'NONE' },
  {
    kind: 'ROW',
    rowId: 'ent-1',
    status: 'ACTIVE',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    version: 1,
  },
  {
    kind: 'ROW',
    rowId: 'ent-1',
    status: 'ACTIVE',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: new Date('2026-02-01T00:00:00Z'),
    version: 2,
  },
  {
    kind: 'ROW',
    rowId: 'ent-1',
    status: 'REVOKED',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: new Date('2026-02-01T00:00:00Z'),
    version: 3,
  },
];

const consentVariants: ConsentFacts[] = [
  { kind: 'NOT_EVALUATED' },
  { kind: 'STATUS', state: 'NO_GRANT', documentAvailable: false },
  { kind: 'STATUS', state: 'NO_GRANT', documentAvailable: true },
  { kind: 'STATUS', state: 'WITHDRAWN', documentAvailable: true },
  { kind: 'STATUS', state: 'RECONSENT_REQUIRED', documentAvailable: true },
  { kind: 'STATUS', state: 'ACTIVE', documentAvailable: false },
  { kind: 'STATUS', state: 'ACTIVE', documentAvailable: true },
];

const licenceVariants: LicensingFacts[] = [
  { kind: 'NOT_EVALUATED' },
  { kind: 'NO_EFFECTIVE_ENTITY' },
  { kind: 'ENTITY', entityRef: 'entity:t', permittedInScope: false, licences: [] },
  { kind: 'ENTITY', entityRef: 'entity:t', permittedInScope: true, licences: [] },
  {
    kind: 'ENTITY',
    entityRef: 'entity:t',
    permittedInScope: true,
    licences: [
      {
        licenceTypeRef: 'licence:test',
        status: 'EVIDENCED',
        effectiveDate: new Date('2026-01-01T00:00:00Z'),
        expiryDate: null,
      },
    ],
  },
  {
    kind: 'ENTITY',
    entityRef: 'entity:t',
    permittedInScope: true,
    licences: [
      {
        licenceTypeRef: 'licence:test',
        status: 'EXPIRED',
        effectiveDate: new Date('2025-01-01T00:00:00Z'),
        expiryDate: new Date('2026-02-01T00:00:00Z'),
      },
    ],
  },
];

const providerVariants: ProviderFacts[] = [
  { kind: 'NOT_EVALUATED' },
  { kind: 'STATUSES', statuses: [{ providerKind: 'provider:test', status: 'NOT_CONFIGURED' }] },
  { kind: 'STATUSES', statuses: [{ providerKind: 'provider:test', status: 'UNAVAILABLE' }] },
  { kind: 'STATUSES', statuses: [{ providerKind: 'provider:test', status: 'CONNECTED' }] },
];

function pick<T>(rand: () => number, items: readonly T[]): T {
  const index = Math.floor(rand() * items.length);
  return items[Math.min(index, items.length - 1)] as T;
}

function inputsOf(parts: {
  descriptor: (typeof descriptorVariants)[number];
  ceiling: CeilingFacts;
  availability: AvailabilityFacts;
  entitlement: EntitlementFacts;
  consent: ConsentFacts;
  licensing: LicensingFacts;
  providers: ProviderFacts;
}): GateInputs<string> {
  return {
    capabilityId: CAPABILITY,
    environment: 'local',
    descriptor: parts.descriptor,
    ceiling: parts.ceiling,
    availability: parts.availability,
    entitlement: parts.entitlement,
    consent: parts.consent,
    licensing: parts.licensing,
    providers: parts.providers,
  };
}

/** P1's right-hand side: does every ceiling fact independently permit? */
function ceilingPermits(inputs: GateInputs<string>): boolean {
  if (!inputs.descriptor.implemented || !inputs.descriptor.deployedInEnvironment) return false;
  if (inputs.ceiling.kind !== 'RESOLVED') return false;
  const ceiling = inputs.ceiling;
  const cleared = ceiling.cleared.find((c) => c.capabilityId === inputs.capabilityId);
  if (cleared === undefined) return false;
  if (!inputs.descriptor.declaredScopeRefs.includes(ceiling.scopeRef)) return false;
  if (cleared.requiresVerifiedAssignment && !ceiling.assignmentVerified) return false;
  if (inputs.availability.kind !== 'ROW') return false;
  if (inputs.availability.state !== 'AVAILABLE' && inputs.availability.state !== 'BETA') {
    return false;
  }
  return true;
}

const GRANT_UPGRADES = {
  entitlement: entitlementVariants[1] as EntitlementFacts,
  consent: { kind: 'STATUS', state: 'ACTIVE', documentAvailable: true } as ConsentFacts,
  licensing: licenceVariants[4] as LicensingFacts,
  providers: providerVariants[3] as ProviderFacts,
};

// ---------------------------------------------------------------------------
// Independent oracles for gates 5-8 — written here from the SPECIFICATION,
// not by calling the domain's own predicates, so sweep B is a real check
// rather than a tautology.
// ---------------------------------------------------------------------------

function entitlementSatisfiesOracle(entitlement: EntitlementFacts): boolean {
  if (entitlement.kind === 'NONE') return false;
  if (entitlement.status !== 'ACTIVE') return false;
  if (entitlement.effectiveFrom.getTime() > NOW.getTime()) return false;
  return entitlement.effectiveTo === null || entitlement.effectiveTo.getTime() > NOW.getTime();
}

function consentSatisfiesOracle(consent: ConsentFacts): boolean {
  if (consent.kind !== 'STATUS') return false;
  if (!consent.documentAvailable) return false;
  return consent.state === 'ACTIVE';
}

function licenceSatisfiesOracle(licensing: LicensingFacts, typeRef: string): boolean {
  if (licensing.kind !== 'ENTITY') return false;
  if (!licensing.permittedInScope) return false;
  return licensing.licences.some(
    (licence) =>
      licence.licenceTypeRef === typeRef &&
      licence.status === 'EVIDENCED' &&
      licence.effectiveDate !== null &&
      licence.effectiveDate.getTime() <= NOW.getTime() &&
      (licence.expiryDate === null || licence.expiryDate.getTime() > NOW.getTime()),
  );
}

function providerSatisfiesOracle(providers: ProviderFacts, kind: string): boolean {
  if (providers.kind !== 'STATUSES') return false;
  return providers.statuses.some((s) => s.providerKind === kind && s.status === 'CONNECTED');
}

/** Observed (gate, reason) pairs plus 'ALLOWED' — the P5 coverage ledger. */
const observed = new Set<string>();

function record(resolution: ReturnType<typeof resolveCapabilityGates>): void {
  observed.add(
    resolution.outcome === 'ALLOWED' ? 'ALLOWED' : `${resolution.gate}:${resolution.reason}`,
  );
}

/**
 * Every outcome the engine can emit. A branch the sweeps stop reaching turns
 * this list into a failing assertion instead of silent dead coverage — the
 * regression guard for exactly the gap this harness once had at
 * JURISDICTION:JURISDICTION_UNVERIFIED-from-RESOLVED.
 */
const EXPECTED_OUTCOMES = [
  'ALLOWED',
  'DESCRIPTOR:NOT_IMPLEMENTED',
  'DESCRIPTOR:NOT_DEPLOYED',
  'ENVIRONMENT:WRONG_ENVIRONMENT',
  'JURISDICTION:JURISDICTION_ABSENT',
  'JURISDICTION:JURISDICTION_UNVERIFIED',
  'JURISDICTION:JURISDICTION_NOT_CLEARED',
  'JURISDICTION:POLICY_PACK_NOT_APPROVED',
  'AVAILABILITY:DISABLED',
  'AVAILABILITY:INTERNAL_ONLY',
  'AVAILABILITY:PARTNER_ONLY',
  'AVAILABILITY:PENDING_PROVIDER',
  'AVAILABILITY:PENDING_LEGAL_REVIEW',
  'AVAILABILITY:PENDING_REGULATORY_REVIEW',
  'ENTITLEMENT:ENTITLEMENT_MISSING',
  'ENTITLEMENT:ENTITLEMENT_EXPIRED',
  'CONSENT:CONSENT_REQUIRED',
  'CONSENT:RECONSENT_REQUIRED',
  'CONSENT:PROCESSING_BASIS_UNRESOLVED',
  'LICENCE:LICENCE_MISSING',
  'LICENCE:LICENCE_EXPIRED',
  'PROVIDER:PENDING_PROVIDER',
  'PROVIDER:PROVIDER_UNAVAILABLE',
] as const;

describe('restrict-only property harness (seeded; exhaustive gates 1-4 and 5-8, plus a cross sweep)', () => {
  const CEILING_GATES = new Set(['DESCRIPTOR', 'ENVIRONMENT', 'JURISDICTION', 'AVAILABILITY']);

  it('A. holds P1-P4 over the exhaustive ceiling core (1,080 cells x 5 grant draws)', () => {
    const rand = mulberry32(0x5eed_cafe);
    let checked = 0;
    let allowedSeen = 0;
    let unverifiedFromResolved = 0;
    for (const descriptor of descriptorVariants) {
      for (const basis of ['DECLARED_BASIS', 'CONSENT', 'UNRESOLVED'] as const) {
        for (const ceiling of ceilingVariants(basis)) {
          for (const availability of availabilityVariants) {
            // Randomize the grant dimensions (5 draws per core cell).
            for (let draw = 0; draw < 5; draw += 1) {
              const inputs = inputsOf({
                descriptor,
                ceiling,
                availability,
                entitlement: pick(rand, entitlementVariants),
                consent: pick(rand, consentVariants),
                licensing: pick(rand, licenceVariants),
                providers: pick(rand, providerVariants),
              });
              checked += 1;

              const resolution = resolveCapabilityGates(inputs, NOW);
              record(resolution);

              // P4 — determinism.
              expect(resolveCapabilityGates(inputs, NOW)).toEqual(resolution);

              // P1 — allowed implies the full ceiling permits.
              if (resolution.outcome === 'ALLOWED') {
                allowedSeen += 1;
                expect(ceilingPermits(inputs)).toBe(true);
              }

              // The verification matrix is genuinely swept: count the branch
              // where a RESOLVED ceiling still denies because THIS capability
              // requires a verified assignment the subject lacks.
              if (
                resolution.outcome === 'DENIED' &&
                resolution.reason === 'JURISDICTION_UNVERIFIED' &&
                ceiling.kind === 'RESOLVED'
              ) {
                unverifiedFromResolved += 1;
              }

              // P2 — a ceiling-gate denial survives every grant upgrade.
              if (resolution.outcome === 'DENIED' && CEILING_GATES.has(resolution.gate)) {
                const upgraded = resolveCapabilityGates(
                  { ...inputs, ...GRANT_UPGRADES },
                  NOW,
                );
                expect(upgraded.outcome).toBe('DENIED');
                if (upgraded.outcome === 'DENIED') {
                  expect(upgraded.gate).toBe(resolution.gate);
                  expect(upgraded.reason).toBe(resolution.reason);
                }
              }

              // P3 — an AVAILABLE row cannot fix a descriptor/jurisdiction denial.
              if (
                resolution.outcome === 'DENIED' &&
                (resolution.gate === 'DESCRIPTOR' || resolution.gate === 'JURISDICTION')
              ) {
                const withRow = resolveCapabilityGates(
                  {
                    ...inputs,
                    availability: {
                      kind: 'ROW',
                      rowId: 'row-injected',
                      state: 'AVAILABLE',
                      version: 9,
                    },
                  },
                  NOW,
                );
                expect(withRow.outcome).toBe('DENIED');
                if (withRow.outcome === 'DENIED') {
                  expect(withRow.gate).toBe(resolution.gate);
                  expect(withRow.reason).toBe(resolution.reason);
                }
              }
            }
          }
        }
      }
    }
    // The core is the declared size, the positive arm is reachable (the
    // harness is not vacuous), and the verification matrix really fires.
    expect(checked).toBe(descriptorVariants.length * 3 * 9 * availabilityVariants.length * 5);
    expect(checked).toBe(5400);
    expect(allowedSeen).toBeGreaterThan(0);
    expect(unverifiedFromResolved).toBeGreaterThan(0);
  });

  it('B. holds P1 over the exhaustive grant-dimension space (672 combinations, independent oracle)', () => {
    // Every upstream gate satisfied, so gates 5-8 alone decide. The basis is
    // CONSENT and the pack requires a licence and a provider, which is the
    // only configuration under which all four grant gates are live.
    const descriptor = descriptorVariants[0];
    const ceiling: CeilingFacts = {
      kind: 'RESOLVED',
      scopeRef: SCOPE,
      assignmentVerified: true,
      packVersionRef: 'pack:t/1',
      cleared: [clearedFor('CONSENT', true)],
    };
    const availability: AvailabilityFacts = {
      kind: 'ROW',
      rowId: 'row-1',
      state: 'AVAILABLE',
      version: 1,
    };

    let checked = 0;
    let allowedSeen = 0;
    for (const entitlement of entitlementVariants) {
      for (const consent of consentVariants) {
        for (const licensing of licenceVariants) {
          for (const providers of providerVariants) {
            const inputs = inputsOf({
              descriptor,
              ceiling,
              availability,
              entitlement,
              consent,
              licensing,
              providers,
            });
            checked += 1;
            const resolution = resolveCapabilityGates(inputs, NOW);
            record(resolution);

            // The independent oracle: ALLOWED exactly when all four grant
            // dimensions independently satisfy their gate.
            const oracleAllows =
              entitlementSatisfiesOracle(entitlement) &&
              consentSatisfiesOracle(consent) &&
              licenceSatisfiesOracle(licensing, 'licence:test') &&
              providerSatisfiesOracle(providers, 'provider:test');
            expect(resolution.outcome === 'ALLOWED').toBe(oracleAllows);
            if (resolution.outcome === 'ALLOWED') {
              allowedSeen += 1;
              expect(ceilingPermits(inputs)).toBe(true);
            } else {
              // Gates 5-8 only: nothing upstream can deny in this block.
              expect(CEILING_GATES.has(resolution.gate)).toBe(false);
            }
          }
        }
      }
    }
    expect(checked).toBe(
      entitlementVariants.length *
        consentVariants.length *
        licenceVariants.length *
        providerVariants.length,
    );
    expect(checked).toBe(672);
    expect(allowedSeen).toBeGreaterThan(0);
  });

  it('C. holds P1 and P2 over a fully randomized cross sweep (seeded, 2,000 draws)', () => {
    const rand = mulberry32(0xdead_beef);
    for (let i = 0; i < 2000; i += 1) {
      const basis = pick(rand, ['DECLARED_BASIS', 'CONSENT', 'UNRESOLVED'] as const);
      const inputs = inputsOf({
        descriptor: pick(rand, descriptorVariants),
        ceiling: pick(rand, ceilingVariants(basis)),
        availability: pick(rand, availabilityVariants),
        entitlement: pick(rand, entitlementVariants),
        consent: pick(rand, consentVariants),
        licensing: pick(rand, licenceVariants),
        providers: pick(rand, providerVariants),
      });
      const resolution = resolveCapabilityGates(inputs, NOW);
      record(resolution);
      if (resolution.outcome === 'ALLOWED') {
        expect(ceilingPermits(inputs)).toBe(true);
      } else if (CEILING_GATES.has(resolution.gate)) {
        const upgraded = resolveCapabilityGates({ ...inputs, ...GRANT_UPGRADES }, NOW);
        expect(upgraded.outcome).toBe('DENIED');
      }
    }
  });

  it('D. P5 — every (gate, reason) the engine can emit was actually exercised', () => {
    // Runs last: the three sweeps above populate the ledger. An unexercised
    // branch fails HERE rather than passing as invisible dead coverage.
    //
    // Honest limit of this ledger: it keys on (gate, reason), and two
    // DIFFERENT branches can emit the same pair — JURISDICTION_UNVERIFIED
    // arises both from an UNVERIFIED_ASSIGNMENT ceiling and from a RESOLVED
    // ceiling whose capability requires verification. P5 alone would stay
    // green if the second branch stopped being generated, which is why
    // sweep A counts that branch explicitly. Mutation-checked: dropping the
    // requiresVerifiedAssignment variants fails sweep A, not this test.
    const missing = EXPECTED_OUTCOMES.filter((outcome) => !observed.has(outcome));
    expect(missing).toEqual([]);
    // And nothing unexpected appeared (a new reason must be declared above).
    expect([...observed].sort()).toEqual([...EXPECTED_OUTCOMES].sort());
  });
});
