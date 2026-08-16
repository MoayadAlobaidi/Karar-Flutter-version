/**
 * §48 — client exposure separation. Hidden capabilities and hidden denial
 * reasons are OMITTED ENTIRELY from the client-safe view (never returned as
 * available:false); actionable denials surface; PENDING_PROVIDER surfaces
 * only where the descriptor opts in. Tested at both levels: the pure
 * projection over fabricated resolutions (including a fabricated ALLOWED
 * for a hidden capability), and the ResolveClientCapabilityView use case
 * end-to-end over fakes.
 */

import { describe, expect, it } from 'vitest';

import { toClientView } from '../domain/client-view.js';
import {
  DENIAL_REASONS,
  HIDDEN_DENIAL_REASONS,
  clientReasonFor,
  type DenialReason,
} from '../domain/denial-reason.js';
import type { CapabilityResolution, ResolutionProvenance } from '../domain/resolution.js';
import { ResolveCapabilityAvailability } from '../application/use-cases/resolve-capability-availability.js';
import { ResolveClientCapabilityView } from '../application/use-cases/client-capability-view.js';
import { NoProvidersConfiguredSource } from '../infrastructure/providers/no-providers-configured-source.js';
import {
  FixedCeilingSource,
  FixedConsentGate,
  FixedLicenceDirectory,
  InMemoryAvailabilityRepository,
  InMemoryEntitlementRepository,
  recordingAuditTrail,
} from './fakes/gate-fakes.js';
import {
  NOW,
  availabilityRow,
  clearedFacts,
  entitlementRow,
  resolvedCeiling,
  subject,
  synthRegistry,
  type SynthId,
} from './fakes/synthetic-fixtures.js';

const provenance: ResolutionProvenance = {
  environment: 'local',
  jurisdictionRef: 'jurisdiction:qa',
  resolvedAt: NOW,
  packVersionRef: null,
  availabilityRowId: null,
  availabilityRowVersion: null,
  entitlementId: null,
  entitlementVersion: null,
};

function denied(capabilityId: string, reason: DenialReason): CapabilityResolution<string> {
  return { capabilityId, outcome: 'DENIED', gate: 'AVAILABILITY', reason, provenance };
}

const visible = { hidden: false, providerPendingExplainable: false };

describe('clientReasonFor — the one total exposure classification', () => {
  it('is defined for every denial reason, and surfaceable only for the actionable set', () => {
    const surfaced: string[] = [];
    for (const reason of DENIAL_REASONS) {
      const client = clientReasonFor(reason, false);
      if (client !== null) surfaced.push(client);
    }
    expect(surfaced.sort()).toEqual([
      'CONSENT_REQUIRED',
      'ENTITLEMENT_EXPIRED',
      'ENTITLEMENT_MISSING',
      'RECONSENT_REQUIRED',
    ]);
  });

  it('surfaces PENDING_PROVIDER only with the descriptor opt-in', () => {
    expect(clientReasonFor('PENDING_PROVIDER', false)).toBeNull();
    expect(clientReasonFor('PENDING_PROVIDER', true)).toBe('PENDING_PROVIDER');
  });
});

describe('toClientView — hidden filtering in one place', () => {
  it('omits a HIDDEN capability in EVERY state, including a fabricated ALLOWED', () => {
    const view = toClientView(
      [
        {
          capabilityId: 'TEST_HIDDEN',
          outcome: 'ALLOWED',
          state: 'AVAILABLE',
          provenance,
        },
        denied('TEST_HIDDEN', 'CONSENT_REQUIRED'),
      ],
      () => ({ hidden: true, providerPendingExplainable: true }),
    );
    expect(view).toEqual([]);
  });

  it('omits every mandated hidden reason entirely — never available:false', () => {
    for (const reason of HIDDEN_DENIAL_REASONS) {
      const view = toClientView([denied('TEST_SYNTH', reason)], () => visible);
      expect(view).toEqual([]);
    }
  });

  it('omits internal/legal/jurisdictional denials that are not actionable', () => {
    const nonSurfaceable: DenialReason[] = [
      'WRONG_ENVIRONMENT',
      'JURISDICTION_ABSENT',
      'JURISDICTION_UNVERIFIED',
      'POLICY_PACK_NOT_APPROVED',
      'DISABLED',
      'INTERNAL_ONLY',
      'PARTNER_ONLY',
      'PROCESSING_BASIS_UNRESOLVED',
      'LICENCE_MISSING',
      'LICENCE_EXPIRED',
      'PROVIDER_UNAVAILABLE',
      'PENDING_PROVIDER',
    ];
    for (const reason of nonSurfaceable) {
      expect(toClientView([denied('TEST_SYNTH', reason)], () => visible)).toEqual([]);
    }
  });

  it('surfaces actionable denials with their reason', () => {
    const view = toClientView(
      [
        denied('A', 'CONSENT_REQUIRED'),
        denied('B', 'RECONSENT_REQUIRED'),
        denied('C', 'ENTITLEMENT_MISSING'),
        denied('D', 'ENTITLEMENT_EXPIRED'),
      ],
      () => visible,
    );
    expect(view).toEqual([
      { capabilityId: 'A', available: false, reason: 'CONSENT_REQUIRED' },
      { capabilityId: 'B', available: false, reason: 'RECONSENT_REQUIRED' },
      { capabilityId: 'C', available: false, reason: 'ENTITLEMENT_MISSING' },
      { capabilityId: 'D', available: false, reason: 'ENTITLEMENT_EXPIRED' },
    ]);
  });

  it('surfaces PENDING_PROVIDER only for the opted-in descriptor', () => {
    const optedIn = toClientView([denied('TEST_SYNTH', 'PENDING_PROVIDER')], () => ({
      hidden: false,
      providerPendingExplainable: true,
    }));
    expect(optedIn).toEqual([
      { capabilityId: 'TEST_SYNTH', available: false, reason: 'PENDING_PROVIDER' },
    ]);
  });

  it('carries allowed capabilities with their state', () => {
    const view = toClientView(
      [{ capabilityId: 'TEST_SYNTH', outcome: 'ALLOWED', state: 'BETA', provenance }],
      () => visible,
    );
    expect(view).toEqual([{ capabilityId: 'TEST_SYNTH', available: true, state: 'BETA' }]);
  });
});

describe('ResolveClientCapabilityView end-to-end (§48 omission through the facade)', () => {
  function facade() {
    const registry = synthRegistry();
    const availability = new InMemoryAvailabilityRepository();
    const entitlements = new InMemoryEntitlementRepository();
    const who = subject();
    // TEST_SYNTH: fully granted (synthetic positive fixture).
    // TEST_HIDDEN: fully granted TOO — and must still not appear.
    void availability.insert(availabilityRow(), NOW);
    void availability.insert(
      availabilityRow({ id: '00000000-0000-7000-8000-00000000a003', capabilityId: 'TEST_HIDDEN' }),
      NOW,
    );
    void entitlements.insert(
      { tenantId: who.tenantId, userId: who.userId },
      entitlementRow(who.tenantId),
      NOW,
    );
    void entitlements.insert(
      { tenantId: who.tenantId, userId: who.userId },
      entitlementRow(who.tenantId, {
        id: '00000000-0000-7000-8000-00000000e002',
        capabilityId: 'TEST_HIDDEN',
      }),
      NOW,
    );
    const resolver = new ResolveCapabilityAvailability<SynthId>(
      registry,
      'local',
      new FixedCeilingSource(
        resolvedCeiling([clearedFacts('TEST_SYNTH'), clearedFacts('TEST_HIDDEN')]),
      ),
      availability,
      entitlements,
      new FixedConsentGate({ kind: 'NOT_EVALUATED' }),
      new FixedLicenceDirectory({ kind: 'NOT_EVALUATED' }),
      new NoProvidersConfiguredSource(),
      recordingAuditTrail().trail,
    );
    return { view: new ResolveClientCapabilityView<SynthId>(registry, resolver), who, resolver };
  }

  it('returns the visible capability and OMITS the hidden one even when everything is granted', async () => {
    const { view, who, resolver } = facade();
    // The FULL internal view sees both (that is its job) ...
    const full = await resolver.execute({ subject: who, now: NOW });
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.value.resolutions).toHaveLength(2);
      expect(full.value.resolutions.every((r) => r.outcome === 'ALLOWED')).toBe(true);
    }
    // ... the CLIENT view never shows the hidden capability, in any state.
    const client = await view.execute({ subject: who, now: NOW });
    expect(client.ok).toBe(true);
    if (!client.ok) return;
    expect(client.value.capabilities).toEqual([
      { capabilityId: 'TEST_SYNTH', available: true, state: 'AVAILABLE' },
    ]);
    const serialized = JSON.stringify(client.value);
    expect(serialized).not.toContain('TEST_HIDDEN');
  });
});
