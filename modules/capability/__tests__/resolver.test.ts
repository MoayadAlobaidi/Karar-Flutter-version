/**
 * The §47 gate cases, each gate separately and in combination, driven
 * through the ResolveCapabilityAvailability use case over port fakes and a
 * SYNTHETIC registry — the positive fixture is synthetic by design; no real
 * capability (all honestly NOT_IMPLEMENTED) ever resolves AVAILABLE here or
 * anywhere.
 */

import { describe, expect, it } from 'vitest';

import type { CeilingFacts } from '../domain/resolution.js';
import { ResolveCapabilityAvailability } from '../application/use-cases/resolve-capability-availability.js';
import type { CapabilityRegistryView } from '../application/registry-view.js';
import { NoProvidersConfiguredSource } from '../infrastructure/providers/no-providers-configured-source.js';
import {
  FixedCeilingSource,
  FixedConsentGate,
  FixedLicenceDirectory,
  FixedProviderSource,
  InMemoryAvailabilityRepository,
  InMemoryEntitlementRepository,
  ThrowingCeilingSource,
  recordingAuditTrail,
} from './fakes/gate-fakes.js';
import {
  NOW,
  SCOPE,
  availabilityRow,
  clearedFacts,
  entitlementRow,
  resolvedCeiling,
  subject,
  synthRegistry,
  type SynthId,
} from './fakes/synthetic-fixtures.js';

interface HarnessOptions {
  readonly registry?: CapabilityRegistryView<SynthId>;
  readonly ceiling?: CeilingFacts;
  readonly rows?: ReadonlyArray<ReturnType<typeof availabilityRow>>;
  readonly entitlements?: ReadonlyArray<ReturnType<typeof entitlementRow>>;
  readonly consent?: FixedConsentGate;
  readonly licences?: FixedLicenceDirectory;
  readonly providers?: FixedProviderSource | NoProvidersConfiguredSource;
  readonly environment?: 'local' | 'dev' | 'staging' | 'production';
}

function harness(options: HarnessOptions = {}) {
  const registry = options.registry ?? synthRegistry();
  const ceiling =
    options.ceiling ?? resolvedCeiling([clearedFacts('TEST_SYNTH'), clearedFacts('TEST_HIDDEN')]);
  const availability = new InMemoryAvailabilityRepository();
  for (const row of options.rows ?? [availabilityRow()]) void availability.insert(row, NOW);
  const entitlements = new InMemoryEntitlementRepository();
  const who = subject();
  for (const row of options.entitlements ?? [entitlementRow(who.tenantId)]) {
    void entitlements.insert({ tenantId: who.tenantId, userId: who.userId }, row, NOW);
  }
  const consent = options.consent ?? new FixedConsentGate({ kind: 'NOT_EVALUATED' });
  const licences = options.licences ?? new FixedLicenceDirectory({ kind: 'NOT_EVALUATED' });
  const providers = options.providers ?? new NoProvidersConfiguredSource();
  const { trail, events } = recordingAuditTrail();
  const resolver = new ResolveCapabilityAvailability<SynthId>(
    registry,
    options.environment ?? 'local',
    new FixedCeilingSource(ceiling),
    availability,
    entitlements,
    consent,
    licences,
    providers,
    trail,
  );
  return { resolver, who, events, consent, availability, entitlements };
}

async function resolveOne(h: ReturnType<typeof harness>, id: SynthId = 'TEST_SYNTH') {
  const result = await h.resolver.execute({ subject: h.who, now: NOW, capabilityIds: [id] });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  const resolution = result.value.resolutions[0];
  if (resolution === undefined) throw new Error('no resolution returned');
  return resolution;
}

function expectDenied(
  resolution: Awaited<ReturnType<typeof resolveOne>>,
  gate: string,
  reason: string,
) {
  expect(resolution.outcome).toBe('DENIED');
  if (resolution.outcome !== 'DENIED') return;
  expect(resolution.gate).toBe(gate);
  expect(resolution.reason).toBe(reason);
}

describe('gate 1 — descriptor', () => {
  it('denies NOT_IMPLEMENTED before anything else, whatever else is granted', async () => {
    const h = harness({
      registry: synthRegistry({
        TEST_SYNTH: { implementation: 'NOT_IMPLEMENTED', deployment: {} },
      }),
    });
    expectDenied(await resolveOne(h), 'DESCRIPTOR', 'NOT_IMPLEMENTED');
  });

  it('denies NOT_DEPLOYED when implemented code is not deployed in this environment', async () => {
    const h = harness({ registry: synthRegistry({ TEST_SYNTH: { deployment: {} } }) });
    expectDenied(await resolveOne(h), 'DESCRIPTOR', 'NOT_DEPLOYED');
  });

  it('treats deployment as per-environment: deployed in staging is not deployed locally', async () => {
    const h = harness({
      registry: synthRegistry({ TEST_SYNTH: { deployment: { staging: 'DEPLOYED' } } }),
    });
    expectDenied(await resolveOne(h), 'DESCRIPTOR', 'NOT_DEPLOYED');
  });
});

describe('gate 2 — environment', () => {
  it('denies WRONG_ENVIRONMENT when the only rows target another environment', async () => {
    const h = harness({ rows: [availabilityRow({ environment: 'staging' })] });
    expectDenied(await resolveOne(h), 'ENVIRONMENT', 'WRONG_ENVIRONMENT');
  });
});

describe('gate 3 — jurisdiction and pack', () => {
  it('denies JURISDICTION_ABSENT with no effective assignment', async () => {
    const h = harness({ ceiling: { kind: 'NO_ASSIGNMENT' } });
    expectDenied(await resolveOne(h), 'JURISDICTION', 'JURISDICTION_ABSENT');
  });

  it('denies JURISDICTION_UNVERIFIED on an unverified assignment', async () => {
    const h = harness({ ceiling: { kind: 'UNVERIFIED_ASSIGNMENT', scopeRef: SCOPE } });
    expectDenied(await resolveOne(h), 'JURISDICTION', 'JURISDICTION_UNVERIFIED');
  });

  it('denies JURISDICTION_UNVERIFIED where the CAPABILITY requires verification the assignment lacks', async () => {
    const h = harness({
      ceiling: resolvedCeiling(
        [clearedFacts('TEST_SYNTH', { requiresVerifiedAssignment: true })],
        { assignmentVerified: false },
      ),
    });
    expectDenied(await resolveOne(h), 'JURISDICTION', 'JURISDICTION_UNVERIFIED');
  });

  it('denies JURISDICTION_NOT_CLEARED when the pack ceiling omits the capability', async () => {
    const h = harness({ ceiling: resolvedCeiling([clearedFacts('SOMETHING_ELSE')]) });
    expectDenied(await resolveOne(h), 'JURISDICTION', 'JURISDICTION_NOT_CLEARED');
  });

  it('denies JURISDICTION_NOT_CLEARED when the descriptor does not declare the scope (the Amanat shape)', async () => {
    const h = harness({ registry: synthRegistry({ TEST_SYNTH: { declaredJurisdictions: [] } }) });
    expectDenied(await resolveOne(h), 'JURISDICTION', 'JURISDICTION_NOT_CLEARED');
  });

  it('denies POLICY_PACK_NOT_APPROVED for a pack not approved in this environment', async () => {
    const h = harness({
      ceiling: { kind: 'PACK_NOT_APPROVED', scopeRef: SCOPE, packVersionRef: 'pack:test-qa/1.0.0' },
    });
    const resolution = await resolveOne(h);
    expectDenied(resolution, 'JURISDICTION', 'POLICY_PACK_NOT_APPROVED');
    expect(resolution.provenance.packVersionRef).toBe('pack:test-qa/1.0.0');
  });

  it('never resolves an id the pack cleared but the registry does not know', async () => {
    const h = harness({
      ceiling: resolvedCeiling([clearedFacts('TEST_SYNTH'), clearedFacts('NOT_IN_ANY_REGISTRY')]),
    });
    const result = await h.resolver.execute({ subject: h.who, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only registry ids resolve at all; the unknown cleared id is inert.
    expect(result.value.resolutions.map((r) => r.capabilityId).sort()).toEqual([
      'TEST_HIDDEN',
      'TEST_SYNTH',
    ]);
  });
});

describe('gate 4 — availability row (deny by default)', () => {
  it('denies DISABLED when NO row exists anywhere', async () => {
    const h = harness({ rows: [] });
    expectDenied(await resolveOne(h), 'AVAILABILITY', 'DISABLED');
  });

  it('denies DISABLED on an explicit DISABLED row', async () => {
    const h = harness({ rows: [availabilityRow({ state: 'DISABLED' })] });
    expectDenied(await resolveOne(h), 'AVAILABILITY', 'DISABLED');
  });

  it.each([
    'PENDING_PROVIDER',
    'PENDING_LEGAL_REVIEW',
    'PENDING_REGULATORY_REVIEW',
    'INTERNAL_ONLY',
    'PARTNER_ONLY',
  ] as const)('denies %s with the state as the reason', async (state) => {
    const h = harness({ rows: [availabilityRow({ state })] });
    expectDenied(await resolveOne(h), 'AVAILABILITY', state);
  });

  it('prefers the jurisdiction-specific row over the environment-wide row', async () => {
    const h = harness({
      rows: [
        availabilityRow({ id: '00000000-0000-7000-8000-00000000a002', jurisdictionRef: null }),
        availabilityRow({ state: 'DISABLED' }),
      ],
    });
    expectDenied(await resolveOne(h), 'AVAILABILITY', 'DISABLED');
  });
});

describe('gate 5 — entitlement', () => {
  it('denies ENTITLEMENT_MISSING with no row', async () => {
    const h = harness({ entitlements: [] });
    expectDenied(await resolveOne(h), 'ENTITLEMENT', 'ENTITLEMENT_MISSING');
  });

  it('denies ENTITLEMENT_MISSING on a REVOKED row', async () => {
    const h = harness({
      entitlements: [
        entitlementRow(subject().tenantId, { status: 'REVOKED', effectiveTo: NOW }),
      ],
    });
    expectDenied(await resolveOne(h), 'ENTITLEMENT', 'ENTITLEMENT_MISSING');
  });

  it('denies ENTITLEMENT_EXPIRED when the window has lapsed', async () => {
    const h = harness({
      entitlements: [
        entitlementRow(subject().tenantId, {
          effectiveTo: new Date('2026-02-01T00:00:00.000Z'),
        }),
      ],
    });
    expectDenied(await resolveOne(h), 'ENTITLEMENT', 'ENTITLEMENT_EXPIRED');
  });

  it('denies ENTITLEMENT_EXPIRED on a stored EXPIRED status', async () => {
    const h = harness({
      entitlements: [entitlementRow(subject().tenantId, { status: 'EXPIRED' })],
    });
    expectDenied(await resolveOne(h), 'ENTITLEMENT', 'ENTITLEMENT_EXPIRED');
  });

  it('fails closed to ENTITLEMENT_MISSING for a principal-less subject', async () => {
    const h = harness();
    const result = await h.resolver.execute({
      subject: { tenantId: h.who.tenantId, userId: null },
      now: NOW,
      capabilityIds: ['TEST_SYNTH'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const resolution = result.value.resolutions[0];
    expect(resolution?.outcome).toBe('DENIED');
    if (resolution?.outcome === 'DENIED') {
      expect(resolution.reason).toBe('ENTITLEMENT_MISSING');
    }
  });
});

describe('gate 6 — consent', () => {
  const consentCleared = () =>
    resolvedCeiling([
      clearedFacts('TEST_SYNTH', {
        processingBasis: { kind: 'CONSENT', purposeRef: 'purpose:ai-processing' },
      }),
      clearedFacts('TEST_HIDDEN'),
    ]);

  it('denies CONSENT_REQUIRED with no grant', async () => {
    const h = harness({
      ceiling: consentCleared(),
      consent: new FixedConsentGate({ kind: 'STATUS', state: 'NO_GRANT', documentAvailable: true }),
    });
    expectDenied(await resolveOne(h), 'CONSENT', 'CONSENT_REQUIRED');
  });

  it('denies CONSENT_REQUIRED on a withdrawn grant', async () => {
    const h = harness({
      ceiling: consentCleared(),
      consent: new FixedConsentGate({
        kind: 'STATUS',
        state: 'WITHDRAWN',
        documentAvailable: true,
      }),
    });
    expectDenied(await resolveOne(h), 'CONSENT', 'CONSENT_REQUIRED');
  });

  it('denies RECONSENT_REQUIRED on outstanding material re-consent', async () => {
    const h = harness({
      ceiling: consentCleared(),
      consent: new FixedConsentGate({
        kind: 'STATUS',
        state: 'RECONSENT_REQUIRED',
        documentAvailable: true,
      }),
    });
    expectDenied(await resolveOne(h), 'CONSENT', 'RECONSENT_REQUIRED');
  });

  it('fails closed when no published disclosure document exists, even with an ACTIVE status', async () => {
    const h = harness({
      ceiling: consentCleared(),
      consent: new FixedConsentGate({ kind: 'STATUS', state: 'ACTIVE', documentAvailable: false }),
    });
    expectDenied(await resolveOne(h), 'CONSENT', 'CONSENT_REQUIRED');
  });

  it('passes with an ACTIVE grant against a published document', async () => {
    const h = harness({
      ceiling: consentCleared(),
      consent: new FixedConsentGate({ kind: 'STATUS', state: 'ACTIVE', documentAvailable: true }),
    });
    const resolution = await resolveOne(h);
    expect(resolution.outcome).toBe('ALLOWED');
    expect(h.consent.queries).toEqual([
      { purposeRef: 'purpose:ai-processing', scopeRef: SCOPE },
    ]);
  });

  it('does NOT demand consent for a different declared basis — and never even queries the gate', async () => {
    const h = harness({
      consent: new FixedConsentGate({
        kind: 'STATUS',
        state: 'NO_GRANT',
        documentAvailable: false,
      }),
    });
    const resolution = await resolveOne(h);
    expect(resolution.outcome).toBe('ALLOWED');
    expect(h.consent.queries).toEqual([]);
  });

  it('denies PROCESSING_BASIS_UNRESOLVED when the pack declares no resolvable basis', async () => {
    const h = harness({
      ceiling: resolvedCeiling([
        clearedFacts('TEST_SYNTH', { processingBasis: { kind: 'UNRESOLVED' } }),
      ]),
    });
    expectDenied(await resolveOne(h), 'CONSENT', 'PROCESSING_BASIS_UNRESOLVED');
  });
});

describe('gate 7 — licence', () => {
  const licenceCleared = () =>
    resolvedCeiling([
      clearedFacts('TEST_SYNTH', { requiredLicenceTypeRefs: ['licence:payment-services'] }),
    ]);
  const licence = (overrides: Record<string, unknown>) => ({
    licenceTypeRef: 'licence:payment-services',
    status: 'EVIDENCED' as const,
    effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    expiryDate: null,
    ...overrides,
  });

  it('denies LICENCE_MISSING when no effective operating entity exists', async () => {
    const h = harness({
      ceiling: licenceCleared(),
      licences: new FixedLicenceDirectory({ kind: 'NO_EFFECTIVE_ENTITY' }),
    });
    expectDenied(await resolveOne(h), 'LICENCE', 'LICENCE_MISSING');
  });

  it('denies LICENCE_MISSING when the entity holds no matching licence', async () => {
    const h = harness({
      ceiling: licenceCleared(),
      licences: new FixedLicenceDirectory({
        kind: 'ENTITY',
        entityRef: 'entity:test',
        permittedInScope: true,
        licences: [],
      }),
    });
    expectDenied(await resolveOne(h), 'LICENCE', 'LICENCE_MISSING');
  });

  it('denies LICENCE_MISSING for a CLAIMED_UNVERIFIED licence — a claim is not evidence', async () => {
    const h = harness({
      ceiling: licenceCleared(),
      licences: new FixedLicenceDirectory({
        kind: 'ENTITY',
        entityRef: 'entity:test',
        permittedInScope: true,
        licences: [licence({ status: 'CLAIMED_UNVERIFIED' })],
      }),
    });
    expectDenied(await resolveOne(h), 'LICENCE', 'LICENCE_MISSING');
  });

  it('denies LICENCE_MISSING when the entity is not permitted in the scope', async () => {
    const h = harness({
      ceiling: licenceCleared(),
      licences: new FixedLicenceDirectory({
        kind: 'ENTITY',
        entityRef: 'entity:test',
        permittedInScope: false,
        licences: [licence({})],
      }),
    });
    expectDenied(await resolveOne(h), 'LICENCE', 'LICENCE_MISSING');
  });

  it('denies LICENCE_EXPIRED past the recorded expiry', async () => {
    const h = harness({
      ceiling: licenceCleared(),
      licences: new FixedLicenceDirectory({
        kind: 'ENTITY',
        entityRef: 'entity:test',
        permittedInScope: true,
        licences: [licence({ expiryDate: new Date('2026-06-01T00:00:00.000Z') })],
      }),
    });
    expectDenied(await resolveOne(h), 'LICENCE', 'LICENCE_EXPIRED');
  });

  it('passes on an EVIDENCED, in-window, scope-permitted licence', async () => {
    const h = harness({
      ceiling: licenceCleared(),
      licences: new FixedLicenceDirectory({
        kind: 'ENTITY',
        entityRef: 'entity:test',
        permittedInScope: true,
        licences: [licence({})],
      }),
    });
    expect((await resolveOne(h)).outcome).toBe('ALLOWED');
  });

  it('requires nothing when the pack requires no licence (the qa/v1 stance)', async () => {
    const h = harness({
      licences: new FixedLicenceDirectory({ kind: 'NO_EFFECTIVE_ENTITY' }),
    });
    expect((await resolveOne(h)).outcome).toBe('ALLOWED');
  });
});

describe('gate 8 — provider', () => {
  const providerCleared = () =>
    resolvedCeiling([clearedFacts('TEST_SYNTH', { requiredProviderKinds: ['provider:bank'] })]);

  it('denies PENDING_PROVIDER under the shipped NoProvidersConfiguredSource', async () => {
    const h = harness({ ceiling: providerCleared(), providers: new NoProvidersConfiguredSource() });
    expectDenied(await resolveOne(h), 'PROVIDER', 'PENDING_PROVIDER');
  });

  it('denies PROVIDER_UNAVAILABLE for a configured-but-down provider', async () => {
    const h = harness({
      ceiling: providerCleared(),
      providers: new FixedProviderSource({ 'provider:bank': 'UNAVAILABLE' }),
    });
    expectDenied(await resolveOne(h), 'PROVIDER', 'PROVIDER_UNAVAILABLE');
  });

  it('passes when every required provider is connected', async () => {
    const h = harness({
      ceiling: providerCleared(),
      providers: new FixedProviderSource({ 'provider:bank': 'CONNECTED' }),
    });
    expect((await resolveOne(h)).outcome).toBe('ALLOWED');
  });
});

describe('positive synthetic fixture and provenance pins (§44)', () => {
  it('resolves AVAILABLE only over the synthetic registry, with every pin recorded', async () => {
    const h = harness();
    const resolution = await resolveOne(h);
    expect(resolution.outcome).toBe('ALLOWED');
    if (resolution.outcome !== 'ALLOWED') return;
    expect(resolution.state).toBe('AVAILABLE');
    expect(resolution.provenance).toEqual({
      environment: 'local',
      jurisdictionRef: SCOPE,
      resolvedAt: NOW,
      packVersionRef: 'pack:test-qa/1.0.0',
      availabilityRowId: '00000000-0000-7000-8000-00000000a001',
      availabilityRowVersion: 1,
      entitlementId: '00000000-0000-7000-8000-00000000e001',
      entitlementVersion: 1,
    });
  });

  it('reports BETA as the allowed state from a BETA row', async () => {
    const h = harness({ rows: [availabilityRow({ state: 'BETA' })] });
    const resolution = await resolveOne(h);
    expect(resolution.outcome).toBe('ALLOWED');
    if (resolution.outcome === 'ALLOWED') expect(resolution.state).toBe('BETA');
  });

  it('pins the versions actually read, so a concurrent change is detectable', async () => {
    const h = harness();
    const before = await resolveOne(h);
    await h.availability.updateState(
      '00000000-0000-7000-8000-00000000a001',
      1,
      'DISABLED',
      'operator disabled mid-flight',
      'staff:test-operator',
      NOW,
    );
    const after = await resolveOne(h);
    expect(before.provenance.availabilityRowVersion).toBe(1);
    expect(before.outcome).toBe('ALLOWED');
    expect(after.provenance.availabilityRowVersion).toBe(2);
    expect(after.outcome).toBe('DENIED');
    // No resolution ever mixes: each carries exactly the version it read.
  });
});

describe('resolution errors and audit', () => {
  it('fails the whole resolution closed when the ceiling source throws', async () => {
    const h = harness();
    const resolver = new ResolveCapabilityAvailability<SynthId>(
      synthRegistry(),
      'local',
      new ThrowingCeilingSource(),
      new InMemoryAvailabilityRepository(),
      new InMemoryEntitlementRepository(),
      new FixedConsentGate({ kind: 'NOT_EVALUATED' }),
      new FixedLicenceDirectory({ kind: 'NOT_EVALUATED' }),
      new NoProvidersConfiguredSource(),
      recordingAuditTrail().trail,
    );
    const result = await resolver.execute({ subject: h.who, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('RESOLUTION_FAILED');
  });

  it('rejects a requested id outside the registry view', async () => {
    const h = harness();
    const result = await h.resolver.execute({
      subject: h.who,
      now: NOW,
      capabilityIds: ['NOT_A_CAPABILITY' as SynthId],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('UNKNOWN_CAPABILITY');
  });

  it('audits a ceiling-gate denial where a grant-like row exists (attempted expansion), outcome DENIED', async () => {
    const h = harness({
      registry: synthRegistry({
        TEST_SYNTH: { implementation: 'NOT_IMPLEMENTED', deployment: {} },
      }),
    });
    const resolution = await resolveOne(h);
    expectDenied(resolution, 'DESCRIPTOR', 'NOT_IMPLEMENTED');
    const denials = h.events.filter(
      (e) => e.action === 'capability.resolution.denied_above_ceiling',
    );
    expect(denials).toHaveLength(1);
    expect(denials[0]?.outcome).toBe('DENIED');
    expect(denials[0]?.resourceId).toBe('TEST_SYNTH');
  });

  it('does not audit ordinary denials with nothing grant-like behind them', async () => {
    const h = harness({
      registry: synthRegistry({
        TEST_SYNTH: { implementation: 'NOT_IMPLEMENTED', deployment: {} },
      }),
      rows: [],
      entitlements: [],
    });
    await resolveOne(h);
    expect(h.events).toHaveLength(0);
  });

  it('resolves in OTHER environments only from construction — never from input', async () => {
    const h = harness({
      registry: synthRegistry({
        TEST_SYNTH: { deployment: { staging: 'DEPLOYED' } },
      }),
      environment: 'staging',
      rows: [availabilityRow({ environment: 'staging' })],
    });
    const resolution = await resolveOne(h);
    expect(resolution.provenance.environment).toBe('staging');
    expect(resolution.outcome).toBe('ALLOWED');
  });
});
