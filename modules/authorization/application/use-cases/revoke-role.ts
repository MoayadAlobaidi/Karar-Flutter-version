/**
 * RevokeRole — revoke a principal's ACTIVE role assignment. Gated on
 * `authorization.role.revoke`; NO peer rule (unlike granting PLATFORM_ADMIN):
 * revocation only ever shrinks authority — the restrict-only direction is
 * always safe to take.
 *
 * Revocation is IMMEDIATELY effective: roles are re-derived from the store
 * on every authorization (no TTL cache anywhere), so the next authorize()
 * after this use case commits sees the REVOKED status — asserted by the
 * authorize → revoke → authorize test in the integration suite. The row
 * itself becomes immutable evidence (0052 guard trigger).
 */

import { Result, TenantId, UserId, type Clock } from '@karar/shared-kernel';

import { isRoleId } from '../../domain/catalogue.js';
import type { RoleAssignment } from '../../domain/role-assignment.js';
import { requirePolicyActor, type PolicyActor } from '../actor.js';
import type { RevokeRoleError } from '../errors.js';
import type { RoleAssignmentRepository } from '../ports/role-assignment-repository.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import type { RbacPolicyService } from '../policy-service.js';

export interface RevokeRoleInput {
  readonly userId: string;
  readonly roleId: string;
  /** Omit/null for the platform-scoped assignment. */
  readonly tenantId?: string | null;
  readonly reason: string;
}

export interface RoleRevoked {
  readonly assignment: RoleAssignment;
  readonly auditFailure: AuditTrailFailure | null;
}

export class RevokeRole {
  constructor(
    private readonly assignments: RoleAssignmentRepository,
    private readonly policy: RbacPolicyService,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RevokeRoleInput,
    actor: PolicyActor,
  ): Promise<Result<RoleRevoked, RevokeRoleError>> {
    const principal = requirePolicyActor(actor);
    if (!principal.ok) {
      return principal;
    }

    const targetUser = UserId.parse(typeof input.userId === 'string' ? input.userId : '');
    if (!targetUser.ok) {
      return Result.err({
        kind: 'invalid_assignment_input',
        message: 'a valid target user id is required',
      });
    }
    if (typeof input.reason !== 'string' || input.reason.trim() === '') {
      return Result.err({
        kind: 'invalid_assignment_input',
        message: 'a revocation requires a non-empty reason',
      });
    }
    if (!isRoleId(input.roleId)) {
      return Result.err({
        kind: 'role_not_found',
        message: `'${String(input.roleId)}' is not a catalogue role`,
      });
    }
    let targetTenant: TenantId | null = null;
    if (input.tenantId !== undefined && input.tenantId !== null) {
      const parsed = TenantId.parse(input.tenantId);
      if (!parsed.ok) {
        return Result.err({
          kind: 'invalid_assignment_input',
          message: 'tenantId, when given, must be a valid tenant id',
        });
      }
      targetTenant = parsed.value;
    }

    try {
      const decision = await this.policy.authorize(principal.value, 'authorization.role.revoke', {
        roleId: input.roleId,
      });
      if (!decision.allowed) {
        await this.recordAudit(principal.value, 'DENIED', {
          resourceId: `${UserId.toString(targetUser.value)}:${input.roleId}`,
          reason: decision.reason,
          roleId: input.roleId,
          scope: targetTenant === null ? 'PLATFORM' : TenantId.toString(targetTenant),
        });
        return Result.err({
          kind: 'not_authorized',
          permission: 'authorization.role.revoke',
          reason: decision.reason,
          message: `'authorization.role.revoke' denied: ${decision.reason}`,
        });
      }

      const revokedAt = this.clock.now();
      const revoked = await this.assignments.revokeActive(
        {
          userId: targetUser.value,
          roleId: input.roleId,
          tenantId: targetTenant,
          revokedBy: principal.value.userId,
          reason: input.reason.trim(),
          revokedAt,
        },
        {
          ...(principal.value.sessionId !== undefined
            ? { sessionId: principal.value.sessionId }
            : {}),
          ...(principal.value.requestId !== undefined
            ? { requestId: principal.value.requestId }
            : {}),
        },
      );
      if (revoked === null) {
        return Result.err({
          kind: 'assignment_not_found',
          message: 'no ACTIVE assignment for that (user, role, scope) exists',
        });
      }

      const audit = await this.recordAudit(principal.value, 'SUCCESS', {
        resourceId: revoked.id,
        reason: input.reason.trim(),
        roleId: input.roleId,
        scope: targetTenant === null ? 'PLATFORM' : TenantId.toString(targetTenant),
      });

      return Result.ok({ assignment: revoked, auditFailure: audit });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `role revocation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async recordAudit(
    actor: PolicyActor,
    outcome: 'SUCCESS' | 'DENIED',
    details: { resourceId: string; reason: string; roleId: string; scope: string },
  ): Promise<AuditTrailFailure | null> {
    const written = await this.auditTrail.record({
      occurredAt: this.clock.now(),
      actorRef: `user:${UserId.toString(actor.userId)}`,
      tenantRef: actor.tenantId === undefined ? null : `tenant:${TenantId.toString(actor.tenantId)}`,
      action: outcome === 'SUCCESS' ? 'authorization.role.revoked' : 'authorization.role.revoke',
      resourceType: 'role_assignment',
      resourceId: details.resourceId,
      reason: details.reason,
      requestId: actor.requestId ?? null,
      afterMetadata: { role_id: details.roleId, scope: details.scope },
      outcome,
    });
    return written.ok ? null : written.error;
  }
}
