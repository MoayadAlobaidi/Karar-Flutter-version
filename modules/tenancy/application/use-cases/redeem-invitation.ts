/**
 * RedeemInvitation — an AUTHENTICATED principal presents a bearer token and,
 * if every gate passes, becomes a member of the inviting tenant.
 *
 * Narrow privilege, the RLS-04 lesson (tenancy.md §7): the redeemer is not a
 * member yet, and the legacy answered that by elevating the whole redemption
 * transaction. Here nothing is elevated, ever:
 *
 *   1. lookup runs in the redeemer's token context — app.user_id plus
 *      app.invitation_token_hash (sha256 of the PRESENTED token); the 0044
 *      policies expose exactly the one row that token identifies;
 *   2. the redemption gate is domain logic on that row: revoked, redeemed,
 *      expired, attempts, and the email match against the IDENTITY-verified
 *      email of the authenticated redeemer — never a client claim;
 *   3. commit runs in the redeemer's principal context with the tenant taken
 *      from the INVITATION ROW (server-side record, never client input) and
 *      performs exactly the writes redemption needs: the one-time UPDATE
 *      (WHERE redeemed_at IS NULL ... — a lost race changes nothing) and the
 *      membership INSERT that RLS itself binds to the authenticated redeemer
 *      (0042 WITH CHECK user_id = app.user_id). The repository returns the
 *      transaction's ACTUAL GUCs and role as evidence, verified fail-closed
 *      and asserted by test;
 *   4. the audit append records the outcome — including denials.
 *
 * Denial answers avoid oracles: an unknown token answers exactly like a token
 * that exists in some tenant the caller cannot see.
 */

import type { Clock } from '@karar/shared-kernel';
import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { requireRedeemer, type RedeemerActor } from '../principal.js';
import type { RedeemInvitationError } from '../errors.js';
import type { InvitationRepository } from '../ports/invitation-repository.js';
import type { RedemptionPrivilegeEvidence } from '../ports/invitation-repository.js';
import type { InvitationTokenSource } from '../ports/invitation-token-source.js';
import type { RedeemerEmailSource } from '../ports/redeemer-email-source.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import { evaluateRedeemability, type TenantMembership } from '../../domain/tenancy.js';

export interface RedeemInvitationInput {
  readonly token: string;
}

export interface InvitationRedeemed {
  readonly tenantId: TenantId;
  readonly membership: TenantMembership;
  readonly privilegeEvidence: RedemptionPrivilegeEvidence;
  readonly auditFailure: AuditTrailFailure | null;
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;

export class RedeemInvitation {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly tokens: InvitationTokenSource,
    private readonly redeemerEmails: RedeemerEmailSource,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RedeemInvitationInput,
    actor: RedeemerActor,
  ): Promise<Result<InvitationRedeemed, RedeemInvitationError>> {
    const redeemer = requireRedeemer(actor);
    if (!redeemer.ok) {
      return redeemer;
    }
    if (typeof input.token !== 'string' || !TOKEN_SHAPE.test(input.token)) {
      return Result.err({
        kind: 'invitation_not_found',
        message: 'the presented token does not identify an invitation',
      });
    }

    try {
      const tokenHash = this.tokens.hashOf(input.token);
      const invitation = await this.invitations.findByTokenHash(redeemer.value, tokenHash);
      if (invitation === null) {
        return Result.err({
          kind: 'invitation_not_found',
          message: 'the presented token does not identify an invitation',
        });
      }

      const occurredAt = this.clock.now();
      const email = await this.redeemerEmails.verifiedEmailOf(redeemer.value.userId);
      const gate = evaluateRedeemability(invitation, occurredAt, email);
      if (!gate.ok) {
        if (gate.error === 'email_mismatch') {
          await this.invitations.recordFailedAttempt(redeemer.value, tokenHash, occurredAt);
        }
        await this.auditTrail.record({
          occurredAt,
          actorRef: `user:${UserId.toString(redeemer.value.userId)}`,
          tenantRef: `tenant:${TenantId.toString(invitation.tenantId)}`,
          action: 'tenancy.invitation.redeem',
          resourceType: 'tenant_invitation',
          resourceId: invitation.id,
          reason: gate.error,
          requestId: redeemer.value.requestId ?? null,
          outcome: 'DENIED',
        });
        return Result.err({
          kind: 'invitation_not_redeemable',
          reason: gate.error,
          message: `the invitation cannot be redeemed (${gate.error})`,
        });
      }

      const outcome = await this.invitations.redeem(redeemer.value, invitation, { occurredAt });
      if (outcome.kind === 'already_member') {
        return Result.err({
          kind: 'already_member',
          message: 'the authenticated principal is already a member of this tenant',
        });
      }
      if (outcome.kind === 'lost_race') {
        return Result.err({
          kind: 'invitation_not_redeemable',
          reason: 'already_redeemed',
          message: 'the invitation was redeemed or closed concurrently',
        });
      }

      const audit = await this.auditTrail.record({
        occurredAt,
        actorRef: `user:${UserId.toString(redeemer.value.userId)}`,
        tenantRef: `tenant:${TenantId.toString(invitation.tenantId)}`,
        action: 'tenancy.invitation.redeem',
        resourceType: 'tenant_invitation',
        resourceId: invitation.id,
        requestId: redeemer.value.requestId ?? null,
        afterMetadata: { membershipId: outcome.membership.id },
        outcome: 'SUCCESS',
      });

      return Result.ok({
        tenantId: invitation.tenantId,
        membership: outcome.membership,
        privilegeEvidence: outcome.privilegeEvidence,
        auditFailure: audit.ok ? null : audit.error,
      });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `invitation redemption failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
