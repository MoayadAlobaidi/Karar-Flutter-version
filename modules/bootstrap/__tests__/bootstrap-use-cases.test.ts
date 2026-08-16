/**
 * The §49 binding matrix at the use-case level: auto-bind on one membership,
 * selection on several, UNBOUND on none, first bind vs switch on POST,
 * uniform membership denials, and both compensating races (membership
 * revoked between the bind and the re-verification). Ports are fakes; the
 * live-database halves of these guarantees are proven in
 * bootstrap-binding.integration.test.ts and the tenancy/identity suites.
 */

import { describe, expect, it } from 'vitest';

import { TenantId } from '@karar/shared-kernel';

import { GetBootstrap } from '../application/use-cases/get-bootstrap.js';
import { SetTenantBinding } from '../application/use-cases/set-tenant-binding.js';
import {
  CHOICE_A,
  CHOICE_B,
  CLIENT,
  FOREIGN_TENANT,
  FailingAudit,
  FailingResolve,
  FakeBind,
  FakeResolve,
  FakeRevoke,
  FakeSwitch,
  NEW_SESSION,
  RecordingAudit,
  TENANT_A,
  TENANT_B,
  UnreachableBind,
  UnreachableRevoke,
  UnreachableSwitch,
  enrichment,
  fixedClock,
  principal,
} from './helpers/fakes.js';

function getBootstrap<A extends RecordingAudit | FailingAudit = RecordingAudit>(parts: {
  resolve: FakeResolve | FailingResolve;
  bind?: FakeBind | UnreachableBind;
  revoke?: FakeRevoke | UnreachableRevoke;
  audit?: A;
}): { audit: A; useCase: GetBootstrap } {
  const audit = (parts.audit ?? (new RecordingAudit() as unknown as A)) as A;
  return {
    audit,
    useCase: new GetBootstrap({
      resolveTenantContext: parts.resolve,
      bindSession: parts.bind ?? new UnreachableBind(),
      revokeSession: parts.revoke ?? new UnreachableRevoke(),
      ...enrichment(),
      auditTrail: audit,
      clock: fixedClock,
    }),
  };
}

function setBinding<A extends RecordingAudit | FailingAudit = RecordingAudit>(parts: {
  resolve: FakeResolve | FailingResolve;
  bind?: FakeBind | UnreachableBind;
  revoke?: FakeRevoke | UnreachableRevoke;
  switchTenant?: FakeSwitch | UnreachableSwitch;
  audit?: A;
}): { audit: A; useCase: SetTenantBinding } {
  const audit = (parts.audit ?? (new RecordingAudit() as unknown as A)) as A;
  return {
    audit,
    useCase: new SetTenantBinding({
      resolveTenantContext: parts.resolve,
      bindSession: parts.bind ?? new UnreachableBind(),
      revokeSession: parts.revoke ?? new UnreachableRevoke(),
      switchTenant: parts.switchTenant ?? new UnreachableSwitch(),
      auditTrail: audit,
      clock: fixedClock,
    }),
  };
}

describe('GET /platform/bootstrap — binding resolution', () => {
  it('ONE membership AUTO-BINDS on GET: the seam is called, the context comes back BOUND, and the bind is audited', async () => {
    const bind = new FakeBind();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
    ]);
    const { useCase, audit } = getBootstrap({ resolve, bind });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a bootstrap view');
    expect(result.value.binding).toEqual({ kind: 'BOUND', tenant: CHOICE_A });
    expect(bind.bound).toEqual([TenantId.toString(TENANT_A)]);
    // Re-verified after binding: resolution ran twice.
    expect(resolve.calls).toBe(2);
    const entry = audit.entries.find((e) => e.action === 'platform.bootstrap.auto_bind');
    expect(entry?.outcome).toBe('SUCCESS');
    expect(entry?.afterMetadata).toEqual({ tenantId: TenantId.toString(TENANT_A) });
  });

  it('SEVERAL memberships → TENANT_SELECTION_REQUIRED with only the active choices, and NOTHING is bound', async () => {
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase, audit } = getBootstrap({ resolve });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a bootstrap view');
    expect(result.value.binding).toEqual({
      kind: 'TENANT_SELECTION_REQUIRED',
      choices: [CHOICE_A, CHOICE_B],
    });
    expect(audit.entries).toHaveLength(0);
  });

  it('NO membership → UNBOUND, nothing bound, nothing audited', async () => {
    const resolve = new FakeResolve([{ kind: 'UNBOUND' }]);
    const { useCase, audit } = getBootstrap({ resolve });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok && result.value.binding).toEqual({ kind: 'UNBOUND' });
    expect(audit.entries).toHaveLength(0);
  });

  it('a BOUND session whose tenant is no longer a usable choice (disabled tenant / revoked membership) reports the need to reselect, never a working tenant', async () => {
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_B] },
    ]);
    const { useCase } = getBootstrap({ resolve });

    const result = await useCase.execute(principal({ tenantId: TENANT_A }), CLIENT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a bootstrap view');
    expect(result.value.binding).toEqual({
      kind: 'TENANT_SELECTION_REQUIRED',
      choices: [CHOICE_B],
    });
  });

  it('a BOUND session whose ONLY membership vanished reports UNBOUND', async () => {
    const resolve = new FakeResolve([{ kind: 'UNBOUND' }]);
    const { useCase } = getBootstrap({ resolve });
    const result = await useCase.execute(principal({ tenantId: TENANT_A }), CLIENT);
    expect(result.ok && result.value.binding).toEqual({ kind: 'UNBOUND' });
  });

  it('a still-valid BOUND session is reported BOUND without touching the binding seam', async () => {
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase } = getBootstrap({ resolve });
    const result = await useCase.execute(principal({ tenantId: TENANT_A }), CLIENT);
    expect(result.ok && result.value.binding).toEqual({ kind: 'BOUND', tenant: CHOICE_A });
  });

  it('RACE: the membership is revoked between the auto-bind and the re-verification — the session is REVOKED, the answer is UNBOUND, and the denial is audited', async () => {
    const bind = new FakeBind();
    const revoke = new FakeRevoke();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
      { kind: 'UNBOUND' }, // the membership vanished under us
    ]);
    const { useCase, audit } = getBootstrap({ resolve, bind, revoke });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok && result.value.binding).toEqual({ kind: 'UNBOUND' });
    expect(revoke.revoked).toEqual([principal().sessionId]);
    const entry = audit.entries.find((e) => e.action === 'platform.bootstrap.auto_bind');
    expect(entry?.outcome).toBe('DENIED');
    expect(entry?.reason).toBe('membership_revoked_concurrently');
  });

  it('a refused auto-bind (concurrent bind or revocation) answers UNBOUND rather than pretending', async () => {
    const bind = new FakeBind({ kind: 'bind_conflict' });
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
    ]);
    const { useCase, audit } = getBootstrap({ resolve, bind });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok && result.value.binding).toEqual({ kind: 'UNBOUND' });
    expect(audit.entries[0]?.outcome).toBe('DENIED');
  });

  it('an unavailable resolution fails closed with context_unavailable (503), never a fabricated context', async () => {
    const { useCase } = getBootstrap({ resolve: new FailingResolve() });
    const result = await useCase.execute(principal(), CLIENT);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('context_unavailable');
  });

  it('FAILS CLOSED when the auto-bind cannot be audited: the session is REVOKED and the call fails — no unaccountable binding is left live', async () => {
    const bind = new FakeBind();
    const revoke = new FakeRevoke();
    const audit = new FailingAudit();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
    ]);
    const { useCase } = getBootstrap({ resolve, bind, revoke, audit });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the fail-closed answer');
    expect(result.error.kind).toBe('context_unavailable');
    // The binding was attempted, then REVERSED.
    expect(bind.bound).toEqual([TenantId.toString(TENANT_A)]);
    expect(revoke.revoked).toEqual([principal().sessionId]);
    expect(audit.attempted).toHaveLength(1);
  });

  it('an unrecordable DENIAL also fails the call rather than returning a clean UNBOUND answer', async () => {
    const bind = new FakeBind({ kind: 'bind_conflict' });
    const audit = new FailingAudit();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
    ]);
    const { useCase } = getBootstrap({ resolve, bind, audit });

    const result = await useCase.execute(principal(), CLIENT);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the fail-closed answer');
    expect(result.error.kind).toBe('context_unavailable');
  });

  it('carries the session/user context and the enrichment views through', async () => {
    const resolve = new FakeResolve([{ kind: 'UNBOUND' }]);
    const { useCase } = getBootstrap({ resolve });
    const result = await useCase.execute(principal({ emailVerified: false }), CLIENT);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a bootstrap view');
    expect(result.value.user).toEqual({ userId: principal().userId, emailVerified: false });
    expect(result.value.session).toEqual({ sessionId: principal().sessionId });
    expect(result.value.jurisdiction).toEqual({
      kind: 'VERIFIED',
      assignment: { jurisdictionId: 'IQ' },
    });
    expect(result.value.policyPack?.version).toBe('iq/v1');
    expect(result.value.capabilities.state).toBe('RESOLVED');
    expect(result.value.capabilities.items).toHaveLength(1);
  });
});

describe('POST /platform/tenant-binding — first bind and switch', () => {
  it('UNBOUND session: FIRST BIND with no rotation — the bind seam runs, the switch seam never does, no tokens come back', async () => {
    const bind = new FakeBind();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
    ]);
    const { useCase, audit } = setBinding({ resolve, bind });

    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_A) },
      principal(),
      CLIENT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a binding');
    expect(result.value.kind).toBe('bound');
    expect(result.value).not.toHaveProperty('session');
    expect(bind.bound).toEqual([TenantId.toString(TENANT_A)]);
    const entry = audit.entries.find((e) => e.action === 'platform.tenant_binding.bound');
    expect(entry?.outcome).toBe('SUCCESS');
  });

  it('BOUND session: SWITCH — the switch seam runs and the NEW session tokens come back', async () => {
    const switchTenant = new FakeSwitch({
      ok: true,
      previousTenantId: TenantId.toString(TENANT_A),
    });
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase, audit } = setBinding({ resolve, switchTenant });

    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_B) },
      principal({ tenantId: TENANT_A }),
      CLIENT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a switch');
    if (result.value.kind !== 'switched') throw new Error('expected the switched shape');
    expect(result.value.session).toEqual(NEW_SESSION);
    expect(result.value.binding).toEqual({ kind: 'BOUND', tenant: CHOICE_B });
    expect(switchTenant.targets).toEqual([TenantId.toString(TENANT_B)]);
    const entry = audit.entries.find((e) => e.action === 'platform.tenant_binding.switched');
    expect(entry?.beforeMetadata).toEqual({ tenantId: TenantId.toString(TENANT_A) });
    expect(entry?.afterMetadata).toEqual({ tenantId: TenantId.toString(TENANT_B) });
  });

  it('DENIES an arbitrary tenant uniformly and never reaches the binding or switch seam', async () => {
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase } = setBinding({ resolve });

    const result = await useCase.execute({ tenantId: FOREIGN_TENANT }, principal(), CLIENT);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a denial');
    expect(result.error.kind).toBe('membership_required');
  });

  it('DENIES a revoked / expired / disabled-tenant target identically (they are simply absent from the choices)', async () => {
    // Resolution already excludes revoked, window-expired, and disabled-tenant
    // memberships (proven over real rows in the tenancy suite), so all three
    // reach this use case as "not a choice" and must answer the same way.
    for (const bound of [null, TENANT_A]) {
      const resolve = new FakeResolve([{ kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A] }]);
      const { useCase } = setBinding({ resolve });
      const result = await useCase.execute(
        { tenantId: TenantId.toString(TENANT_B) },
        principal({ tenantId: bound }),
        CLIENT,
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected a denial');
      expect(result.error.kind).toBe('membership_required');
    }
  });

  it('RACE on first bind: the membership vanishes after binding — the session is REVOKED and the caller is denied, never left bound', async () => {
    const bind = new FakeBind();
    const revoke = new FakeRevoke();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
      { kind: 'UNBOUND' },
    ]);
    const { useCase, audit } = setBinding({ resolve, bind, revoke });

    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_A) },
      principal(),
      CLIENT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the compensated denial');
    expect(result.error.kind).toBe('membership_revoked_concurrently');
    expect(revoke.revoked).toEqual([principal().sessionId]);
    expect(audit.entries[0]?.outcome).toBe('DENIED');
  });

  it('RACE on switch: the tenancy seam reports the compensated denial and it is surfaced as such', async () => {
    const switchTenant = new FakeSwitch({
      ok: false,
      denial: { kind: 'membership_revoked_concurrently' },
    });
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase } = setBinding({ resolve, switchTenant });

    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_B) },
      principal({ tenantId: TENANT_A }),
      CLIENT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a denial');
    expect(result.error.kind).toBe('membership_revoked_concurrently');
  });

  it("maps the switch seam's membership denial to the uniform membership answer", async () => {
    const switchTenant = new FakeSwitch({ ok: false, denial: { kind: 'membership_not_found' } });
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase } = setBinding({ resolve, switchTenant });
    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_B) },
      principal({ tenantId: TENANT_A }),
      CLIENT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a denial');
    expect(result.error.kind).toBe('membership_required');
  });

  it('FAILS CLOSED when a FIRST BIND cannot be audited: the session is REVOKED and the caller is failed', async () => {
    const bind = new FakeBind();
    const revoke = new FakeRevoke();
    const audit = new FailingAudit();
    const resolve = new FakeResolve([
      { kind: 'AUTO_BIND', tenantId: TENANT_A, choice: CHOICE_A },
    ]);
    const { useCase } = setBinding({ resolve, bind, revoke, audit });

    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_A) },
      principal(),
      CLIENT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the fail-closed answer');
    expect(result.error.kind).toBe('context_unavailable');
    expect(bind.bound).toEqual([TenantId.toString(TENANT_A)]);
    expect(revoke.revoked).toEqual([principal().sessionId]);
  });

  it('FAILS CLOSED when a SWITCH cannot be audited: the NEW session is REVOKED and no tokens are handed back', async () => {
    const revoke = new FakeRevoke();
    const audit = new FailingAudit();
    const switchTenant = new FakeSwitch({
      ok: true,
      previousTenantId: TenantId.toString(TENANT_A),
    });
    const resolve = new FakeResolve([
      { kind: 'TENANT_SELECTION_REQUIRED', choices: [CHOICE_A, CHOICE_B] },
    ]);
    const { useCase } = setBinding({ resolve, revoke, switchTenant, audit });

    const result = await useCase.execute(
      { tenantId: TenantId.toString(TENANT_B) },
      principal({ tenantId: TENANT_A }),
      CLIENT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the fail-closed answer');
    expect(result.error.kind).toBe('context_unavailable');
    // The REPLACEMENT session (not the old one) is what gets revoked.
    expect(revoke.revoked).toEqual([NEW_SESSION.sessionId]);
  });

  it('rejects a malformed or missing selection before any seam is touched', async () => {
    for (const candidate of [undefined, null, 42, 'not-a-uuid', { nested: true }]) {
      const resolve = new FakeResolve([{ kind: 'UNBOUND' }]);
      const { useCase } = setBinding({ resolve });
      const result = await useCase.execute({ tenantId: candidate }, principal(), CLIENT);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected a rejection');
      expect(result.error.kind).toBe('invalid_tenant_selection');
      expect(resolve.calls).toBe(0);
    }
  });
});
