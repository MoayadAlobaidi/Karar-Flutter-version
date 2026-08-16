import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  appProfile,
  asApp,
  buildAuditTrail,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_B1,
  USER_NEW,
} from './fixtures.js';
import { PrismaMembershipRepository } from '../infrastructure/persistence/prisma-membership-repository.js';
import { PrismaInvitationRepository } from '../infrastructure/persistence/prisma-invitation-repository.js';
import { Sha256InvitationTokenSource } from '../infrastructure/providers/sha256-invitation-token-source.js';
import { PermissiveForTestsPolicyService } from '../application/testing/permissive-policy-service.js';
import { CreateInvitation } from '../application/use-cases/create-invitation.js';
import { RevokeInvitation } from '../application/use-cases/revoke-invitation.js';
import { RedeemInvitation } from '../application/use-cases/redeem-invitation.js';
import type { RedeemerEmailSource } from '../application/ports/redeemer-email-source.js';
import type { PrincipalActor, RedeemerActor } from '../application/principal.js';

// INVITATION REDEMPTION under narrow privilege (the RLS-04 lesson,
// tenancy.md §7): token-scoped lookup, one-time conditional redemption,
// membership bound to the AUTHENTICATED redeemer by RLS itself, and the
// transaction's ACTUAL GUCs and role captured as evidence and asserted here.

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'INVITATION REDEMPTION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_redemption`;

const actorA1: PrincipalActor = { tenantId: TENANT_A, userId: USER_A1 };
const redeemerNew: RedeemerActor = { userId: USER_NEW, requestId: 'req-redeem' };
const NOW = new Date('2026-08-16T12:00:00.000Z');
const HOUR_MS = 3_600_000;

const INVITED_EMAIL = 'invited.person@example.com';

function emailSource(byUser: Record<string, string | null>): RedeemerEmailSource {
  return {
    verifiedEmailOf: (userId) => Promise.resolve(byUser[UserId.toString(userId)] ?? null),
  };
}

const tokens = new Sha256InvitationTokenSource();
const permissive = new PermissiveForTestsPolicyService();

let handle: PrismaHandle;
let auditAdapter: PostgresPersistenceAdapter;
let memberships: PrismaMembershipRepository;
let invitations: PrismaInvitationRepository;
let clock: Clock.Fixed;
let createInvitation: CreateInvitation;
let revokeInvitation: RevokeInvitation;

function redeemUseCase(emails: RedeemerEmailSource): RedeemInvitation {
  const { auditTrail } = buildAuditTrail(auditAdapter);
  return new RedeemInvitation(invitations, tokens, emails, auditTrail, clock);
}

async function issueInvitation(
  email: string,
  expiresInHours = 72,
): Promise<{ id: string; token: string }> {
  const created = await createInvitation.execute({ email, expiresInHours }, actorA1);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('invitation creation failed');
  return { id: created.value.invitation.id, token: created.value.token };
}

describe.skipIf(unreachable !== null)('invitation redemption (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    auditAdapter = new PostgresPersistenceAdapter(appProfile(database));
    memberships = new PrismaMembershipRepository(handle);
    invitations = new PrismaInvitationRepository(handle);
    clock = new Clock.Fixed(NOW);
    const { auditTrail } = buildAuditTrail(auditAdapter);
    createInvitation = new CreateInvitation(
      invitations,
      memberships,
      permissive,
      tokens,
      auditTrail,
      clock,
    );
    revokeInvitation = new RevokeInvitation(
      invitations,
      memberships,
      permissive,
      auditTrail,
      clock,
    );
  }, 60_000);

  afterAll(async () => {
    await handle?.end();
    await auditAdapter?.end();
    await dropDatabase(database);
  });

  it('narrow lookup: the token context sees EXACTLY one row — and none of the tenant\'s other data', async () => {
    const first = await issueInvitation(INVITED_EMAIL);
    const second = await issueInvitation('someone.else@example.com');
    expect(second.token).not.toBe(first.token);

    // Through the repository: only the row the presented token identifies.
    const found = await invitations.findByTokenHash(redeemerNew, tokens.hashOf(first.token));
    expect(found?.id).toBe(first.id);
    expect(found?.email).toBe(INVITED_EMAIL);

    // Through raw SQL in the same context shape: one invitation row visible,
    // zero members, zero tenants — possession of a token grants ONE row.
    await asApp(database, { userId: UserId.toString(USER_NEW) }, async (tx) => {
      await tx.query(`SELECT set_config('app.invitation_token_hash', $1, true)`, [
        tokens.hashOf(first.token),
      ]);
      const visible = await tx.query<{ id: string }>('SELECT id FROM public.tenant_invitations');
      expect(visible.rowCount).toBe(1);
      expect(visible.rows[0]?.id).toBe(first.id);
      const members = await tx.query('SELECT * FROM public.tenant_members');
      expect(members.rowCount).toBe(0);
      const tenantRows = await tx.query('SELECT * FROM public.tenants');
      expect(tenantRows.rowCount).toBe(0);
    });

    // An unknown-but-well-formed token identifies nothing.
    const unknown = await redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: INVITED_EMAIL }),
    ).execute({ token: 'A'.repeat(43) }, redeemerNew);
    expect(!unknown.ok && unknown.error.kind === 'invitation_not_found').toBe(true);
  });

  it('email mismatch: denied, attempts incremented, audit outcome DENIED', async () => {
    const { id, token } = await issueInvitation('precise.match@example.com');
    const result = await redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: 'wrong.person@example.com' }),
    ).execute({ token }, redeemerNew);
    expect(!result.ok && result.error.kind === 'invitation_not_redeemable').toBe(true);
    if (!result.ok && result.error.kind === 'invitation_not_redeemable') {
      expect(result.error.reason).toBe('email_mismatch');
    }

    const attempts = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      async (tx) =>
        (
          await tx.query<{ attempts: number }>(
            'SELECT attempts FROM public.tenant_invitations WHERE id = $1',
            [id],
          )
        ).rows[0]?.attempts,
    );
    expect(attempts).toBe(1);

    const audit = await auditAdapter.query<{ outcome: string; reason: string }>(
      `SELECT outcome, reason FROM audit.audit_events
       WHERE action = 'tenancy.invitation.redeem' AND resource_id = $1`,
      [id],
    );
    expect(audit.rows[0]).toEqual({ outcome: 'DENIED', reason: 'email_mismatch' });
  });

  it('a redeemer with NO verified email can redeem nothing', async () => {
    const { token } = await issueInvitation('needs.email@example.com');
    const result = await redeemUseCase(emailSource({})).execute({ token }, redeemerNew);
    expect(!result.ok && result.error.kind === 'invitation_not_redeemable').toBe(true);
  });

  it('HAPPY PATH: membership binds to the authenticated redeemer, one-time, with narrow-privilege evidence', async () => {
    const { id, token } = await issueInvitation(INVITED_EMAIL);
    const result = await redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: ` ${INVITED_EMAIL.toUpperCase()} ` }),
    ).execute({ token }, redeemerNew);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The membership is FOR the authenticated redeemer, in the inviting tenant.
    expect(result.value.tenantId).toBe(TENANT_A);
    expect(result.value.membership.userId).toBe(USER_NEW);
    expect(result.value.membership.state).toBe('ACTIVE');
    expect(result.value.membership.roleHint).toBe('MEMBER');

    // THE GUC ASSERTION (RLS-04 regression evidence): the redemption
    // transaction ran with the invitation's tenant and the redeemer's user
    // bound — as karar_app, no BYPASSRLS, no superuser. Never elevation.
    expect(result.value.privilegeEvidence).toEqual({
      tenantGuc: TenantId.toString(TENANT_A),
      userGuc: UserId.toString(USER_NEW),
      roleName: 'karar_app',
      bypassRls: false,
      superuser: false,
    });

    // Database truth, read back under the tenant's context: the invitation
    // is redeemed by the redeemer, exactly once, and the roster grew to 3.
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      async (tx) => {
        const invitationRow = await tx.query<{ redeemed_by: string; redeemed_at: Date }>(
          'SELECT redeemed_by, redeemed_at FROM public.tenant_invitations WHERE id = $1',
          [id],
        );
        expect(invitationRow.rows[0]?.redeemed_by).toBe(UserId.toString(USER_NEW));
        expect(invitationRow.rows[0]?.redeemed_at).toBeInstanceOf(Date);
        const member = await tx.query(
          'SELECT * FROM public.tenant_members WHERE user_id = $1 AND tenant_id = $2',
          [UserId.toString(USER_NEW), TenantId.toString(TENANT_A)],
        );
        expect(member.rowCount).toBe(1);
      },
    );

    // ONE-TIME: the same token cannot be redeemed again, by anyone.
    const again = await redeemUseCase(
      emailSource({ [UserId.toString(USER_B1)]: INVITED_EMAIL }),
    ).execute({ token }, { userId: USER_B1 });
    expect(!again.ok && again.error.kind === 'invitation_not_redeemable').toBe(true);
    if (!again.ok && again.error.kind === 'invitation_not_redeemable') {
      expect(again.error.reason).toBe('already_redeemed');
    }
  });

  it('already a member: the invitation is NOT consumed', async () => {
    const { id, token } = await issueInvitation('admin.self@example.com');
    const result = await redeemUseCase(
      emailSource({ [UserId.toString(USER_A1)]: 'admin.self@example.com' }),
    ).execute({ token }, { userId: USER_A1 });
    expect(!result.ok && result.error.kind === 'already_member').toBe(true);

    const row = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      async (tx) =>
        (
          await tx.query<{ redeemed_at: Date | null }>(
            'SELECT redeemed_at FROM public.tenant_invitations WHERE id = $1',
            [id],
          )
        ).rows[0],
    );
    expect(row?.redeemed_at).toBeNull(); // still open for its intended recipient
  });

  it('expired invitations are refused', async () => {
    const { token } = await issueInvitation('late.person@example.com', 1);
    clock.advance(2 * HOUR_MS);
    try {
      const result = await redeemUseCase(
        emailSource({ [UserId.toString(USER_NEW)]: 'late.person@example.com' }),
      ).execute({ token }, redeemerNew);
      expect(!result.ok && result.error.kind === 'invitation_not_redeemable').toBe(true);
      if (!result.ok && result.error.kind === 'invitation_not_redeemable') {
        expect(result.error.reason).toBe('expired');
      }
    } finally {
      clock.advance(-2 * HOUR_MS);
    }
  });

  it('revoked invitations are refused', async () => {
    const { id, token } = await issueInvitation('revoked.person@example.com');
    const revoked = await revokeInvitation.execute(id, actorA1);
    expect(revoked.ok).toBe(true);
    const result = await redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: 'revoked.person@example.com' }),
    ).execute({ token }, redeemerNew);
    expect(!result.ok && result.error.kind === 'invitation_not_redeemable').toBe(true);
    if (!result.ok && result.error.kind === 'invitation_not_redeemable') {
      expect(result.error.reason).toBe('revoked');
    }
  });

  it('attempts exhaust: after max_attempts failures the invitation is dead even for the right email', async () => {
    const { token } = await issueInvitation('guarded.person@example.com');
    const wrongEmail = redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: 'guessing@example.com' }),
    );
    for (let i = 0; i < 5; i += 1) {
      const attempt = await wrongEmail.execute({ token }, redeemerNew);
      expect(attempt.ok).toBe(false);
    }
    const rightEmail = await redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: 'guarded.person@example.com' }),
    ).execute({ token }, redeemerNew);
    expect(!rightEmail.ok && rightEmail.error.kind === 'invitation_not_redeemable').toBe(true);
    if (!rightEmail.ok && rightEmail.error.kind === 'invitation_not_redeemable') {
      expect(rightEmail.error.reason).toBe('attempts_exhausted');
    }
  });

  it('the redeemer must be logged in: no principal, no queries (fail closed)', async () => {
    const result = await redeemUseCase(
      emailSource({ [UserId.toString(USER_NEW)]: INVITED_EMAIL }),
    ).execute({ token: 'A'.repeat(43) }, null as unknown as RedeemerActor);
    expect(!result.ok && result.error.kind === 'missing_principal_context').toBe(true);

    // And the repository itself fails closed on an incomplete redeemer.
    const failure = await invitations
      .findByTokenHash({} as unknown as RedeemerActor, tokens.hashOf('A'.repeat(43)))
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(PrincipalContextError);
  });

  it('cross-tenant invitations stay untouchable: a tenant-B admin cannot revoke tenant A\'s open invitation', async () => {
    const { id } = await issueInvitation('still.open@example.com');
    const revoked = await revokeInvitation.execute(id, {
      tenantId: TENANT_B,
      userId: USER_B1,
    });
    expect(!revoked.ok && revoked.error.kind === 'invitation_not_found').toBe(true);
  });
});
