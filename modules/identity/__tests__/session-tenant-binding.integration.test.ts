/**
 * Session-tenant binding against a real PostgreSQL (Phase 3.5, KAR-RSK-021):
 * first bind is null → value ONLY and rotates nothing; rebind (switch)
 * atomically revokes the old session + refresh families and issues a new
 * bound session — the old access token dies at AuthenticateRequest, the old
 * refresh token dies with the family; the ledger and audit record both
 * transitions; and the pooled connection carries no GUC afterwards.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import type { IssuedSession } from '../application/session-issuer.js';
import type { SessionId } from '../domain/session.js';
import {
  allowAllRateLimiter,
  createIdentityHarness,
  printSkipBanner,
  probePostgres,
  securityEventCount,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('TENANT-BINDING', unreachable);

const PASSWORD = 'tenant-binding-suite-password';
const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');

async function registerAndLogin(
  h: IdentityHarness,
  email: string,
): Promise<{ accountId: UserId; session: IssuedSession }> {
  await h.runtime.useCases.registerAccount.execute({ email, password: PASSWORD, client: h.client });
  const account = await h.runtime.deps.accounts.findByEmail(email);
  const outcome = await h.runtime.useCases.login.execute({
    email,
    password: PASSWORD,
    client: h.client,
  });
  if (!outcome.ok || outcome.value.kind !== 'session') throw new Error('expected a session');
  return { accountId: account!.id, session: outcome.value.session };
}

describe.skipIf(unreachable !== null)('session-tenant binding (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'bind', rateLimiter: allowAllRateLimiter });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('first bind sets tenant_binding on the live session WITHOUT rotation — the existing access token keeps working and now carries the binding', async () => {
    const { accountId, session } = await registerAndLogin(h, 'bind-first@example.com');

    const before = await h.runtime.useCases.authenticateRequest.execute(session.accessToken);
    expect(before.ok).toBe(true);
    if (!before.ok) throw new Error('expected authentication');
    expect(before.value.tenantBinding).toBeNull();

    const bound = await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_A,
      client: h.client,
    });
    expect(bound.ok).toBe(true);

    // NO rotation: the SAME access token authenticates, now tenant-scoped.
    const after = await h.runtime.useCases.authenticateRequest.execute(session.accessToken);
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error('expected authentication');
    expect(after.value.sessionId).toBe(session.sessionId);
    expect(after.value.tenantBinding).toBe(TenantId.toString(TENANT_A));

    // The SAME refresh token still rotates (family untouched).
    const refreshed = await h.runtime.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: h.client,
    });
    expect(refreshed.ok).toBe(true);

    // Ledger + audit recorded the bind.
    expect(await securityEventCount(h, accountId, 'session_tenant_bound')).toBe(1);
    const audit = h.auditWriter.events.find(
      (event) => event.action === 'identity.session.tenant_bound',
    );
    expect(audit?.outcome).toBe('SUCCESS');
    expect(audit?.afterMetadata).toMatchObject({ tenantId: TenantId.toString(TENANT_A) });
  });

  it('bind is null → value ONLY: a bound session refuses (switch is the other path), and the binding is unchanged', async () => {
    const { accountId, session } = await registerAndLogin(h, 'bind-guard@example.com');
    const first = await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_A,
      client: h.client,
    });
    expect(first.ok).toBe(true);

    const second = await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_B,
      client: h.client,
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected refusal');
    expect(second.error.kind).toBe('already_bound');

    const principal = await h.runtime.useCases.authenticateRequest.execute(session.accessToken);
    expect(principal.ok && principal.value.tenantBinding).toBe(TenantId.toString(TENANT_A));
  });

  it('bind refuses unknown and revoked sessions', async () => {
    const { accountId, session } = await registerAndLogin(h, 'bind-dead@example.com');
    await h.runtime.useCases.logout.execute({
      accountId,
      sessionId: session.sessionId as SessionId,
      client: h.client,
    });
    const onRevoked = await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_A,
      client: h.client,
    });
    expect(onRevoked.ok).toBe(false);
    if (onRevoked.ok) throw new Error('expected refusal');
    expect(onRevoked.error.kind).toBe('session_not_found');

    const onUnknown = await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: '00000000-0000-4000-8000-00000000dead' as SessionId,
      tenantId: TENANT_A,
      client: h.client,
    });
    expect(onUnknown.ok).toBe(false);
  });

  it('rebind (switch) atomically revokes the old session + family and issues a new bound session: old access token dead, old refresh token dead, new tokens live', async () => {
    const { accountId, session } = await registerAndLogin(h, 'rebind@example.com');
    await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_A,
      client: h.client,
    });

    const rebound = await h.runtime.useCases.rebindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      newTenantId: TENANT_B,
      client: h.client,
    });
    expect(rebound.ok).toBe(true);
    if (!rebound.ok) throw new Error('expected a rebound session');
    expect(rebound.value.previousBinding).toBe(TenantId.toString(TENANT_A));
    expect(rebound.value.newBinding).toBe(TenantId.toString(TENANT_B));
    expect(rebound.value.session.sessionId).not.toBe(session.sessionId);

    // The OLD access token dies at per-request re-validation (old sid revoked).
    const oldAccess = await h.runtime.useCases.authenticateRequest.execute(session.accessToken);
    expect(oldAccess.ok).toBe(false);

    // The OLD refresh token dies with its revoked family.
    const oldRefresh = await h.runtime.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: h.client,
    });
    expect(oldRefresh.ok).toBe(false);

    // The NEW session carries the new binding and a working refresh family.
    const newAccess = await h.runtime.useCases.authenticateRequest.execute(
      rebound.value.session.accessToken,
    );
    expect(newAccess.ok).toBe(true);
    if (!newAccess.ok) throw new Error('expected authentication');
    expect(newAccess.value.sessionId).toBe(rebound.value.session.sessionId);
    expect(newAccess.value.tenantBinding).toBe(TenantId.toString(TENANT_B));
    const newRefresh = await h.runtime.useCases.refreshSession.execute({
      refreshToken: rebound.value.session.refreshToken,
      client: h.client,
    });
    expect(newRefresh.ok).toBe(true);

    // Row truth (read inside the owner scope — RLS hides sessions otherwise):
    // old session + family revoked with reason tenant_switch.
    const { oldRow, oldFamilies } = await h.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${accountId}, true)`;
      return {
        oldRow: await tx.session.findUnique({ where: { id: session.sessionId } }),
        oldFamilies: await tx.refreshTokenFamily.findMany({
          where: { sessionId: session.sessionId },
        }),
      };
    });
    expect(oldRow).not.toBeNull();
    expect(oldRow?.revokedAt).not.toBeNull();
    expect(oldRow?.revokedReason).toBe('tenant_switch');
    expect(oldFamilies.length).toBeGreaterThan(0);
    for (const family of oldFamilies) {
      expect(family.revokedAt).not.toBeNull();
      expect(family.revokedReason).toBe('tenant_switch');
    }

    // Ledger + audit carry old AND new tenant.
    expect(await securityEventCount(h, accountId, 'session_tenant_rebound')).toBe(1);
    const audit = h.auditWriter.events.find(
      (event) => event.action === 'identity.session.tenant_rebound',
    );
    expect(audit?.outcome).toBe('SUCCESS');
    expect(audit?.afterMetadata).toMatchObject({
      oldTenantId: TenantId.toString(TENANT_A),
      newTenantId: TenantId.toString(TENANT_B),
    });
  });

  it('rebind refuses an UNBOUND session (first bind is the other path) and a revoked session', async () => {
    const { accountId, session } = await registerAndLogin(h, 'rebind-guard@example.com');

    const unbound = await h.runtime.useCases.rebindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      newTenantId: TENANT_B,
      client: h.client,
    });
    expect(unbound.ok).toBe(false);
    if (unbound.ok) throw new Error('expected refusal');
    expect(unbound.error.kind).toBe('not_bound');

    await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_A,
      client: h.client,
    });
    await h.runtime.useCases.logout.execute({
      accountId,
      sessionId: session.sessionId as SessionId,
      client: h.client,
    });
    const onRevoked = await h.runtime.useCases.rebindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      newTenantId: TENANT_B,
      client: h.client,
    });
    expect(onRevoked.ok).toBe(false);
    if (onRevoked.ok) throw new Error('expected refusal');
    expect(onRevoked.error.kind).toBe('session_not_found');
    // The guarded rebind wrote NOTHING: no orphan replacement session exists
    // (read inside the owner scope — an unscoped read is vacuously empty).
    const sessions = await h.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${accountId}, true)`;
      return tx.session.findMany({ where: { accountId, revokedAt: null } });
    });
    expect(sessions).toHaveLength(0);
  });

  it('rebind to NULL (switch back to unbound) works with full rotation', async () => {
    const { accountId, session } = await registerAndLogin(h, 'rebind-null@example.com');
    await h.runtime.useCases.bindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      tenantId: TENANT_A,
      client: h.client,
    });
    const rebound = await h.runtime.useCases.rebindSessionTenant.execute({
      accountId,
      sessionId: session.sessionId,
      newTenantId: null,
      client: h.client,
    });
    expect(rebound.ok).toBe(true);
    if (!rebound.ok) throw new Error('expected a rebound session');
    expect(rebound.value.newBinding).toBeNull();
    const principal = await h.runtime.useCases.authenticateRequest.execute(
      rebound.value.session.accessToken,
    );
    expect(principal.ok && principal.value.tenantBinding).toBeNull();
  });

  it('pooled-context hygiene: after bind + rebind the pool carries no app.user_id and an unscoped probe sees zero sessions', async () => {
    const probe = await h.prisma.client.$queryRawUnsafe<
      Array<{ user_guc: string | null; sessions: string }>
    >(
      `SELECT current_setting('app.user_id', true) AS user_guc,
              (SELECT count(*) FROM public.sessions)::text AS sessions`,
    );
    expect(probe[0]?.user_guc === null || probe[0]?.user_guc === '').toBe(true);
    // Sessions exist from the tests above; the unscoped read sees NONE.
    expect(probe[0]?.sessions).toBe('0');
  });
});
