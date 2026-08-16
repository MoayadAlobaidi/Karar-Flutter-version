/**
 * RevokeInvitation — an ACTIVE member with `tenancy.invitation.revoke`
 * (PolicyService) revokes a still-open invitation in their OWN tenant.
 * Revocation is a one-time UPDATE (revoked_at), never a DELETE — the row is
 * evidence. A cross-tenant id, an unknown id, and an already-terminal
 * invitation are indistinguishable in the answer, by design.
 */

import type { Clock } from '@karar/shared-kernel';
import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { RevokeInvitationError } from '../errors.js';
import type { InvitationRepository } from '../ports/invitation-repository.js';
import type { MembershipRepository } from '../ports/membership-repository.js';
import type { PolicyService } from '../ports/policy-service.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import type { TenantInvitation } from '../../domain/tenancy.js';

export interface InvitationRevoked {
  readonly invitation: TenantInvitation;
  readonly auditFailure: AuditTrailFailure | null;
}

export class RevokeInvitation {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly memberships: MembershipRepository,
    private readonly policy: PolicyService,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    invitationId: string,
    actor: PrincipalActor,
  ): Promise<Result<InvitationRevoked, RevokeInvitationError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }
    try {
      const own = await this.memberships.findOwn(principal.value);
      if (own === null || own.state !== 'ACTIVE') {
        return Result.err({
          kind: 'membership_not_found',
          message: 'revoking an invitation requires an active membership in the bound tenant',
        });
      }
      const decision = await this.policy.authorize(
        { tenantId: principal.value.tenantId, userId: principal.value.userId },
        'tenancy.invitation.revoke',
        { invitationId },
      );
      if (!decision.allowed) {
        return Result.err({
          kind: 'not_authorized',
          permission: 'tenancy.invitation.revoke',
          message: decision.reason,
        });
      }

      const occurredAt = this.clock.now();
      const revoked = await this.invitations.revoke(principal.value, invitationId, occurredAt);
      if (revoked === null) {
        return Result.err({
          kind: 'invitation_not_found',
          message: 'no open invitation with that id exists in the bound tenant',
        });
      }

      const audit = await this.auditTrail.record({
        occurredAt,
        actorRef: `user:${UserId.toString(principal.value.userId)}`,
        tenantRef: `tenant:${TenantId.toString(principal.value.tenantId)}`,
        action: 'tenancy.invitation.revoked',
        resourceType: 'tenant_invitation',
        resourceId: revoked.id,
        requestId: principal.value.requestId ?? null,
        outcome: 'SUCCESS',
      });

      return Result.ok({ invitation: revoked, auditFailure: audit.ok ? null : audit.error });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `invitation revocation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
