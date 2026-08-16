/**
 * §48 exclusion evidence: what the bootstrap surface MUST NOT return.
 *
 * The design decision this suite pins (and the reason it is written this
 * way): bootstrap TRUSTS the client-safe resolver's FILTERING — re-deciding
 * which capability ids are visible here would duplicate the capability
 * workstream's logic and drift from it, giving two answers to one question.
 * What bootstrap owns instead is a structural guarantee at the edge: the
 * serializer projects a CLOSED field set, so anything extra a port attaches
 * is DROPPED rather than shipped.
 *
 * So the hostile fakes below do NOT assert "bootstrap re-filters hidden ids".
 * They assert the two things bootstrap is actually responsible for:
 *   1. every serialized object carries EXACTLY its declared fields — licence
 *      details, pack content, raw consent evidence, internal audit/config,
 *      and register internals attached by a misbehaving port never reach the
 *      response;
 *   2. the capability array is passed through UNENRICHED — bootstrap adds no
 *      field of its own and reads no registry, so a hidden capability can
 *      only appear if the client-safe port emitted it, which is that port's
 *      tested contract (documented in MODULE.md as the trust boundary).
 */

import { describe, expect, it } from 'vitest';

import { GetBootstrap } from '../application/use-cases/get-bootstrap.js';
import { toBootstrapResponse } from '../presentation/dto/bootstrap-responses.js';
import {
  CLIENT,
  FakeResolve,
  RecordingAudit,
  UnreachableBind,
  UnreachableRevoke,
  enrichment,
  fixedClock,
  principal,
} from './helpers/fakes.js';

/** Every port returns its safe shape PLUS forbidden extras, on purpose. */
const hostile = enrichment({
  jurisdiction: {
    stateFor: () =>
      Promise.resolve({
        kind: 'VERIFIED',
        assignment: {
          jurisdictionId: 'IQ',
          // Forbidden: assignment internals on the client-safe view.
          verificationEvidenceRef: 'vault://verification/1',
          assignmentRowId: 'ja-1',
        },
        // Forbidden: raw consent evidence and internal config.
        consentEvidence: { documentText: 'FULL LEGAL TEXT', signatureBlob: 'base64...' },
        internalConfig: { KARAR_FIRST_PARTY_TENANT_ID: '00000000-0000-4000-8000-4b4152415231' },
      } as never),
  },
  operatingEntity: {
    effectiveFor: () =>
      Promise.resolve({
        id: 'ee000000-0000-4000-8000-0000000000ee',
        name: 'Karar Operating Entity',
        // Forbidden: internal licence details and register internals.
        licences: [{ number: 'CBI-2026-001', status: 'EVIDENCED', evidenceRef: 'vault://x' }],
        registerRowId: 'internal-42',
        amanatEnabled: true,
      } as never),
  },
  policyPack: {
    statusFor: () =>
      Promise.resolve({
        version: 'iq/v1',
        status: 'ACTIVE',
        // Forbidden: the full pack content.
        content: { rules: ['...thousands of lines...'], retention: { days: 400 } },
        internalAudit: { lastReviewedBy: 'staff:1', notes: 'internal' },
      } as never),
  },
  capabilities: {
    resolveFor: () =>
      Promise.resolve([
        {
          id: 'TRANSACTIONS',
          status: 'UNAVAILABLE',
          requirements: [
            {
              kind: 'IDENTITY_VERIFICATION',
              detail: 'Verify your identity',
              // Forbidden: internal reasoning and evidence on a requirement.
              internalReason: 'policy pack rule 7.3',
              rawEvidence: { consentGrantId: 'cg-1' },
            },
          ],
          // Forbidden: implementation/deployment internals and licence data.
          implementation: 'NOT_IMPLEMENTED',
          deployment: { production: 'NOT_DEPLOYED' },
          requiredLicences: ['CBI-PAYMENTS'],
          hiddenReason: 'pending legal review',
        },
      ] as never),
  },
});

function hostileBootstrap() {
  return new GetBootstrap({
    resolveTenantContext: new FakeResolve([{ kind: 'UNBOUND' }]),
    bindSession: new UnreachableBind(),
    revokeSession: new UnreachableRevoke(),
    ...hostile,
    auditTrail: new RecordingAudit(),
    clock: fixedClock,
  });
}

describe('§48 — the serializer emits ONLY the declared safe fields', () => {
  it('drops every forbidden extra a hostile port attaches, at the edge', async () => {
    const result = await hostileBootstrap().execute(principal(), CLIENT);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a bootstrap view');

    const response = toBootstrapResponse(result.value);

    expect(Object.keys(response).sort()).toEqual([
      'binding',
      'capabilities',
      'jurisdiction',
      'operatingEntity',
      'policyPack',
      'session',
      'user',
    ]);
    expect(Object.keys(response.jurisdiction).sort()).toEqual(['jurisdictionId', 'state']);
    expect(response.jurisdiction).toEqual({ state: 'VERIFIED', jurisdictionId: 'IQ' });
    expect(Object.keys(response.operatingEntity ?? {}).sort()).toEqual(['id', 'name']);
    expect(Object.keys(response.policyPack ?? {}).sort()).toEqual(['status', 'version']);
    expect(Object.keys(response.capabilities[0] ?? {}).sort()).toEqual([
      'id',
      'requirements',
      'status',
    ]);
    expect(Object.keys(response.capabilities[0]?.requirements[0] ?? {}).sort()).toEqual([
      'detail',
      'kind',
    ]);
    expect(Object.keys(response.user).sort()).toEqual(['emailVerified', 'userId']);
    expect(Object.keys(response.session)).toEqual(['sessionId']);
  });

  it('the serialized document contains none of the forbidden values, anywhere', async () => {
    const result = await hostileBootstrap().execute(principal(), CLIENT);
    if (!result.ok) throw new Error('expected a bootstrap view');
    const serialized = JSON.stringify(toBootstrapResponse(result.value));

    for (const forbidden of [
      'FULL LEGAL TEXT', // raw consent evidence
      'signatureBlob',
      'verificationEvidenceRef', // assignment internals
      'assignmentRowId',
      'KARAR_FIRST_PARTY_TENANT_ID', // internal configuration
      'CBI-2026-001', // internal licence details
      'evidenceRef',
      'registerRowId',
      'amanatEnabled', // Amanat existence
      'AMANAT',
      'thousands of lines', // full PolicyPack content
      'lastReviewedBy', // internal audit
      'policy pack rule 7.3', // internal reasoning
      'consentGrantId', // raw consent evidence
      'NOT_IMPLEMENTED', // implementation internals
      'NOT_DEPLOYED',
      'CBI-PAYMENTS',
      'pending legal review',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('capability output is passed through UNENRICHED: bootstrap adds no field and invents no entry', async () => {
    const result = await hostileBootstrap().execute(principal(), CLIENT);
    if (!result.ok) throw new Error('expected a bootstrap view');
    const response = toBootstrapResponse(result.value);

    // Exactly the entries the client-safe port emitted — no more, no fewer,
    // and no bootstrap-invented status or requirement.
    expect(response.capabilities).toEqual([
      {
        id: 'TRANSACTIONS',
        status: 'UNAVAILABLE',
        requirements: [{ kind: 'IDENTITY_VERIFICATION', detail: 'Verify your identity' }],
      },
    ]);
  });

  it('an EMPTY client-safe result stays empty — no default or fabricated capability appears', async () => {
    const useCase = new GetBootstrap({
      resolveTenantContext: new FakeResolve([{ kind: 'UNBOUND' }]),
      bindSession: new UnreachableBind(),
      revokeSession: new UnreachableRevoke(),
      ...enrichment({ capabilities: { resolveFor: () => Promise.resolve([]) } }),
      auditTrail: new RecordingAudit(),
      clock: fixedClock,
    });
    const result = await useCase.execute(principal(), CLIENT);
    if (!result.ok) throw new Error('expected a bootstrap view');
    expect(toBootstrapResponse(result.value).capabilities).toEqual([]);
  });

  it('unresolved enrichment serializes as explicit nulls, never as fabricated defaults', async () => {
    const useCase = new GetBootstrap({
      resolveTenantContext: new FakeResolve([{ kind: 'UNBOUND' }]),
      bindSession: new UnreachableBind(),
      revokeSession: new UnreachableRevoke(),
      ...enrichment({
        jurisdiction: { stateFor: () => Promise.resolve({ kind: 'NONE' as const }) },
        operatingEntity: { effectiveFor: () => Promise.resolve(null) },
        policyPack: { statusFor: () => Promise.resolve(null) },
      }),
      auditTrail: new RecordingAudit(),
      clock: fixedClock,
    });
    const result = await useCase.execute(principal(), CLIENT);
    if (!result.ok) throw new Error('expected a bootstrap view');
    const response = toBootstrapResponse(result.value);
    // Unresolved jurisdiction is the TYPED NONE state, not a null that could
    // be mistaken for "fine"; the identifier is null because none exists.
    expect(response.jurisdiction).toEqual({ state: 'NONE', jurisdictionId: null });
    expect(response.operatingEntity).toBeNull();
    expect(response.policyPack).toBeNull();
  });

  it('tenant choices carry only the safe selection fields (no status, no entity binding, no membership plumbing)', async () => {
    const useCase = new GetBootstrap({
      resolveTenantContext: new FakeResolve([
        {
          kind: 'TENANT_SELECTION_REQUIRED',
          choices: [
            {
              tenantId: 'aaaaaaaa-0000-4000-8000-00000000000a',
              name: 'Tenant A',
              roleHint: 'MEMBER',
              // A hostile resolution attaching internals:
              status: 'ACTIVE',
              defaultOperatingEntityId: 'ee-1',
              membershipRowId: 'm-1',
            } as never,
          ],
        },
      ]),
      bindSession: new UnreachableBind(),
      revokeSession: new UnreachableRevoke(),
      ...enrichment(),
      auditTrail: new RecordingAudit(),
      clock: fixedClock,
    });
    const result = await useCase.execute(principal(), CLIENT);
    if (!result.ok) throw new Error('expected a bootstrap view');
    const response = toBootstrapResponse(result.value);
    if (response.binding.kind !== 'TENANT_SELECTION_REQUIRED') throw new Error('unexpected state');
    expect(Object.keys(response.binding.choices[0] ?? {}).sort()).toEqual([
      'name',
      'roleHint',
      'tenantId',
    ]);
    expect(JSON.stringify(response)).not.toContain('membershipRowId');
    expect(JSON.stringify(response)).not.toContain('defaultOperatingEntityId');
  });
});
