/**
 * AssignRole — grant a catalogue role to a principal. Phase 3 deliberately
 * exposes NO HTTP surface for this (no cross-tenant platform-admin APIs);
 * the callers are seeds, tests, and the Phase 8 control plane, all through
 * this use case, so the rules hold no matter which entrance is used.
 *
 * THE DELEGATION RULE, stated once and implemented here: an actor must not
 * be able to grant authority they do not themselves hold ("no
 * self-escalation"). Phase 3 implements it as two checks —
 *
 *   1. the actor needs `authorization.role.assign` (Layer 1, deny-by-default);
 *   2. PLATFORM_ADMIN is grantable only by a PLATFORM_ADMIN peer.
 *
 * Under the seeded catalogue the two checks ARE the general invariant:
 * PLATFORM_ADMIN is the only role granting authorization.role.assign, so any
 * legitimate grantor already holds every grantable permission. Check 2 exists
 * so the invariant SURVIVES a future delegated-admin role that carries
 * role.assign without platform authority — such a role could grant
 * SUPPORT/OPERATOR/etc. but never mint a PLATFORM_ADMIN. Revocation carries
 * no peer rule: revoking only ever shrinks authority (restrict-only
 * direction).
 *
 * Scope discipline: the role's catalogue scope decides the binding shape —
 * a TENANT role must bind to a tenant, a PLATFORM role must not. Grants and
 * denials are audited; the write uses the privileged-write pattern (the
 * repository binds the TARGET principal after THIS use case authorized the
 * actor under the actor's own context).
 */

import { Result, TenantId, UserId, type Clock } from '@karar/shared-kernel';

import { isRoleId, roleDefinition, roleScopeAdmitsBinding } from '../../domain/catalogue.js';
import type { RoleAssignment } from '../../domain/role-assignment.js';
import { requirePolicyActor, type PolicyActor } from '../actor.js';
import type { AssignRoleError } from '../errors.js';
import type {
  RoleAssignmentRepository,
} from '../ports/role-assignment-repository.js';
import { RoleAssignmentConflictError } from '../ports/role-assignment-repository.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import type { RbacPolicyService } from '../policy-service.js';

export interface AssignRoleInput {
  readonly userId: string;
  readonly roleId: string;
  /** Omit/null for a platform-scoped assignment. */
  readonly tenantId?: string | null;
  readonly reason: string;
}

export interface RoleAssigned {
  readonly assignment: RoleAssignment;
  readonly auditFailure: AuditTrailFailure | null;
}

const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';

export class AssignRole {
  constructor(
    private readonly assignments: RoleAssignmentRepository,
    private readonly policy: RbacPolicyService,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AssignRoleInput,
    actor: PolicyActor,
  ): Promise<Result<RoleAssigned, AssignRoleError>> {
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
        message: 'a grant requires a non-empty reason',
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
    const role = roleDefinition(input.roleId);
    if (!roleScopeAdmitsBinding(role.scope, targetTenant !== null)) {
      return Result.err({
        kind: 'role_scope_mismatch',
        message:
          role.scope === 'TENANT'
            ? `role '${role.id}' is tenant-scoped and requires a tenantId`
            : `role '${role.id}' is platform-scoped and must not carry a tenantId`,
      });
    }

    try {
      const decision = await this.policy.authorize(principal.value, 'authorization.role.assign', {
        roleId: role.id,
      });
      if (!decision.allowed) {
        const denied = await this.recordAudit(principal.value, 'DENIED', {
          action: 'authorization.role.grant',
          resourceId: `${UserId.toString(targetUser.value)}:${role.id}`,
          reason: decision.reason,
          roleId: role.id,
          scope: targetTenant === null ? 'PLATFORM' : TenantId.toString(targetTenant),
        });
        void denied;
        return Result.err({
          kind: 'not_authorized',
          permission: 'authorization.role.assign',
          reason: decision.reason,
          message: `'authorization.role.assign' denied: ${decision.reason}`,
        });
      }

      // Delegation rule check 2: only a PLATFORM_ADMIN peer mints a
      // PLATFORM_ADMIN.
      if (role.id === PLATFORM_ADMIN_ROLE) {
        const actorRoles = await this.policy.applicableRoles(principal.value);
        if (!actorRoles.includes(PLATFORM_ADMIN_ROLE)) {
          await this.recordAudit(principal.value, 'DENIED', {
            action: 'authorization.role.grant',
            resourceId: `${UserId.toString(targetUser.value)}:${role.id}`,
            reason: 'delegation_denied',
            roleId: role.id,
            scope: 'PLATFORM',
          });
          return Result.err({
            kind: 'delegation_denied',
            message:
              'PLATFORM_ADMIN is grantable only by a PLATFORM_ADMIN peer — an actor cannot grant authority they do not hold',
          });
        }
      }

      const occurredAt = this.clock.now();
      const assignment = await this.assignments.create(
        {
          userId: targetUser.value,
          roleId: role.id,
          tenantId: targetTenant,
          grantedBy: principal.value.userId,
          reason: input.reason.trim(),
          effectiveFrom: occurredAt,
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

      const audit = await this.recordAudit(principal.value, 'SUCCESS', {
        action: 'authorization.role.granted',
        resourceId: assignment.id,
        reason: input.reason.trim(),
        roleId: role.id,
        scope: targetTenant === null ? 'PLATFORM' : TenantId.toString(targetTenant),
      });

      return Result.ok({ assignment, auditFailure: audit });
    } catch (error) {
      if (error instanceof RoleAssignmentConflictError) {
        return Result.err({
          kind: 'already_assigned',
          message: 'an ACTIVE assignment for this (user, role, scope) already exists',
        });
      }
      return Result.err({
        kind: 'store_failure',
        message: `role grant failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async recordAudit(
    actor: PolicyActor,
    outcome: 'SUCCESS' | 'DENIED',
    details: {
      action: string;
      resourceId: string;
      reason: string;
      roleId: string;
      scope: string;
    },
  ): Promise<AuditTrailFailure | null> {
    const written = await this.auditTrail.record({
      occurredAt: this.clock.now(),
      actorRef: `user:${UserId.toString(actor.userId)}`,
      tenantRef: actor.tenantId === undefined ? null : `tenant:${TenantId.toString(actor.tenantId)}`,
      action: details.action,
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
