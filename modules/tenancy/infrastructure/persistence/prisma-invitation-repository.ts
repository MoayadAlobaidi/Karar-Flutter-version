/**
 * PrismaInvitationRepository — the InvitationRepository port under
 * withPrincipalContext, in the two privilege contexts the flow legitimately
 * has (0043 tenant policies; 0044 token policies; the RLS-04 lesson):
 *
 * - tenant context: create / revoke inside the creator's own tenant;
 * - redeemer context: `app.user_id` plus the transaction-local
 *   `app.invitation_token_hash` GUC — bound here with a parameterized
 *   set_config(..., is_local => true), exactly like the principal GUCs —
 *   which exposes the ONE row the presented token identifies;
 * - redemption commit: the redeemer's principal context with the tenant read
 *   from the invitation row. Before writing anything, the transaction reads
 *   back its OWN GUCs and role and fails closed
 *   (RedemptionPrivilegeViolation) unless they are precisely the narrow ones:
 *   invitation's tenant, redeemer's user, non-superuser role without
 *   BYPASSRLS. The evidence is returned so tests assert it — a regression to
 *   legacy-style elevation cannot pass this code path silently.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { uuidv7 } from './uuidv7.js';
import type { PrincipalActor, RedeemerActor } from '../../application/principal.js';
import {
  RedemptionPrivilegeViolation,
  type CreateInvitationRecord,
  type InvitationRepository,
  type RedemptionOutcome,
  type RedemptionPrivilegeEvidence,
} from '../../application/ports/invitation-repository.js';
import { toInvitation, toMembership } from './row-mappers.js';
import type { TenantInvitation } from '../../domain/tenancy.js';

interface EvidenceRow {
  tenant_guc: string | null;
  user_guc: string | null;
  role_name: string;
  bypass_rls: boolean;
  superuser: boolean;
}

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private inTenantContext<T>(
    actor: PrincipalActor,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      fn,
      { require: ['tenantId', 'userId'] },
    );
  }

  /**
   * Redeemer context: authenticated user, NO tenant, plus the token-hash GUC.
   * The relaxation to `require: ['userId']` is the explicit, documented one —
   * a redeemer has no tenant yet; visibility comes from the 0044 policies.
   */
  private inRedeemerContext<T>(
    redeemer: RedeemerActor,
    tokenHash: string,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      {
        userId: redeemer.userId,
        ...(redeemer.sessionId !== undefined ? { sessionId: redeemer.sessionId } : {}),
        ...(redeemer.requestId !== undefined ? { requestId: redeemer.requestId } : {}),
      },
      async (tx) => {
        // Same discipline as the principal GUCs: constant name, bound value,
        // transaction-local (dies at COMMIT/ROLLBACK).
        await tx.$queryRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;
        return fn(tx);
      },
      { require: ['userId'] },
    );
  }

  createForTenant(
    actor: PrincipalActor,
    record: CreateInvitationRecord,
  ): Promise<TenantInvitation> {
    return this.inTenantContext(actor, async (tx) => {
      const row = await tx.tenantInvitation.create({
        data: {
          id: uuidv7(),
          tenantId: TenantId.toString(actor.tenantId),
          email: record.email,
          tokenHash: record.tokenHash,
          roleHint: record.roleHint,
          expiresAt: record.expiresAt,
          maxAttempts: record.maxAttempts,
          createdBy: UserId.toString(actor.userId),
          createdAt: record.occurredAt,
          updatedAt: record.occurredAt,
        },
      });
      return toInvitation(row);
    });
  }

  revoke(actor: PrincipalActor, invitationId: string, at: Date): Promise<TenantInvitation | null> {
    return this.inTenantContext(actor, async (tx) => {
      const where = {
        id: invitationId,
        tenantId: TenantId.toString(actor.tenantId),
        revokedAt: null,
        redeemedAt: null,
      };
      const updated = await tx.tenantInvitation.updateMany({
        where,
        data: { revokedAt: at, updatedAt: at },
      });
      if (updated.count === 0) {
        return null;
      }
      const row = await tx.tenantInvitation.findFirst({
        where: { id: invitationId, tenantId: TenantId.toString(actor.tenantId) },
      });
      return row === null ? null : toInvitation(row);
    });
  }

  findByTokenHash(redeemer: RedeemerActor, tokenHash: string): Promise<TenantInvitation | null> {
    return this.inRedeemerContext(redeemer, tokenHash, async (tx) => {
      const row = await tx.tenantInvitation.findFirst({ where: { tokenHash } });
      return row === null ? null : toInvitation(row);
    });
  }

  recordFailedAttempt(redeemer: RedeemerActor, tokenHash: string, at: Date): Promise<boolean> {
    return this.inRedeemerContext(redeemer, tokenHash, async (tx) => {
      const updated = await tx.tenantInvitation.updateMany({
        where: { tokenHash },
        data: { attempts: { increment: 1 }, updatedAt: at },
      });
      return updated.count > 0;
    });
  }

  redeem(
    redeemer: RedeemerActor,
    invitation: TenantInvitation,
    params: { readonly occurredAt: Date },
  ): Promise<RedemptionOutcome> {
    const tenantId = TenantId.toString(invitation.tenantId);
    const userId = UserId.toString(redeemer.userId);
    // The tenant is bound FROM THE INVITATION ROW — a server-side record the
    // token-context lookup produced — never from anything the client sent.
    return withPrincipalContext(
      this.handle,
      {
        tenantId: invitation.tenantId,
        userId: redeemer.userId,
        ...(redeemer.sessionId !== undefined ? { sessionId: redeemer.sessionId } : {}),
        ...(redeemer.requestId !== undefined ? { requestId: redeemer.requestId } : {}),
      },
      async (tx) => {
        const evidence = await this.verifyNarrowPrivilege(tx, tenantId, userId);

        // Pre-check (same transaction) instead of catching the unique
        // violation: an aborted statement would poison the transaction. The
        // UNIQUE(tenant_id, user_id) constraint remains the backstop.
        const existing = await tx.tenantMember.findFirst({
          where: { tenantId, userId },
        });
        if (existing !== null) {
          return { kind: 'already_member' as const };
        }

        // One-time redemption: the conditional UPDATE is the gate. A lost
        // race (already redeemed/revoked/expired meanwhile) matches nothing.
        const redeemed = await tx.tenantInvitation.updateMany({
          where: {
            id: invitation.id,
            tenantId,
            redeemedAt: null,
            revokedAt: null,
            expiresAt: { gt: params.occurredAt },
          },
          data: {
            redeemedAt: params.occurredAt,
            redeemedBy: userId,
            updatedAt: params.occurredAt,
          },
        });
        if (redeemed.count === 0) {
          return { kind: 'lost_race' as const };
        }

        // The membership INSERT: 0042's WITH CHECK (user_id = app.user_id)
        // makes the database itself refuse a row for anyone but the
        // authenticated redeemer.
        const memberRow = await tx.tenantMember.create({
          data: {
            id: uuidv7(),
            tenantId,
            userId,
            roleHint: invitation.roleHint,
            state: 'ACTIVE',
            effectiveFrom: params.occurredAt,
            createdAt: params.occurredAt,
            updatedAt: params.occurredAt,
          },
        });

        return {
          kind: 'redeemed' as const,
          membership: toMembership(memberRow),
          privilegeEvidence: evidence,
        };
      },
      { require: ['tenantId', 'userId'] },
    );
  }

  findRedeemedBy(actor: PrincipalActor, invitationId: string): Promise<UserId | null> {
    return this.inTenantContext(actor, async (tx) => {
      const row = await tx.tenantInvitation.findFirst({
        where: { id: invitationId, tenantId: TenantId.toString(actor.tenantId) },
        select: { redeemedBy: true },
      });
      return row === null || row.redeemedBy === null ? null : UserId.of(row.redeemedBy);
    });
  }

  /**
   * Reads back the transaction's ACTUAL GUCs and role, and fails closed on
   * anything but the narrow redemption context. This is a runtime control,
   * not test scaffolding: a regression toward legacy RLS-04 (running
   * redemption elevated, or under the wrong principal) throws here before a
   * single write happens.
   */
  private async verifyNarrowPrivilege(
    tx: PrismaTransactionClient,
    expectedTenant: string,
    expectedUser: string,
  ): Promise<RedemptionPrivilegeEvidence> {
    const rows = await tx.$queryRaw<EvidenceRow[]>`
      SELECT current_setting('app.tenant_id', true) AS tenant_guc,
             current_setting('app.user_id', true) AS user_guc,
             current_user::text AS role_name,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`;
    const row = rows[0];
    if (row === undefined) {
      throw new RedemptionPrivilegeViolation('privilege evidence probe returned no row');
    }
    const evidence: RedemptionPrivilegeEvidence = Object.freeze({
      tenantGuc: row.tenant_guc ?? '',
      userGuc: row.user_guc ?? '',
      roleName: row.role_name,
      bypassRls: row.bypass_rls,
      superuser: row.superuser,
    });
    if (
      evidence.tenantGuc !== expectedTenant ||
      evidence.userGuc !== expectedUser ||
      evidence.bypassRls ||
      evidence.superuser
    ) {
      throw new RedemptionPrivilegeViolation(
        `redemption must run in the redeemer's own principal context as a restricted role — ` +
          `got tenant='${evidence.tenantGuc}', user='${evidence.userGuc}', role='${evidence.roleName}', ` +
          `bypassrls=${evidence.bypassRls}, superuser=${evidence.superuser} (legacy RLS-04 guard)`,
      );
    }
    return evidence;
  }
}
