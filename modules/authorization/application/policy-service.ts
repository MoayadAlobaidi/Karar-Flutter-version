/**
 * The REAL PolicyService — Layer 1 of the four (tenancy.md §2): "may this
 * actor perform this operation?", answered deny-by-default with a
 * machine-readable reason on every decision.
 *
 * Resolution, per call (access-control.md §7: roles are re-derived from the
 * database per request — revocation is immediate; there is NO TTL cache, and
 * the only sanctioned memoization is the per-request scope in
 * request-scoped-policy-service.ts):
 *
 *   1. the actor is re-validated (fail closed — a cast is not an
 *      authentication);
 *   2. the permission must be in the compile-time catalogue — an unknown
 *      name, a wildcard, or a future capability's permission all deny as
 *      `unknown_permission`;
 *   3. the caller's ACTIVE assignments are resolved under the CALLER's own
 *      principal context (the 0052 self-read arms cover exactly this);
 *   4. scope semantics apply: a tenant-scoped assignment counts only when
 *      the actor's bound tenant matches; a platform-scoped assignment counts
 *      in every context — as a PERMISSION decision only. A platform role
 *      never widens RLS row visibility: whatever this service allows, the
 *      database boundary still scopes every row to the transaction's bound
 *      principal (tenancy.md: RLS is the boundary);
 *   5. role → permission resolution uses the compile-time catalogue (the DB
 *      seed is test-asserted equal), and anything not explicitly granted is
 *      DENIED — including a store failure while resolving, which denies as
 *      `assignment_store_unavailable` rather than throwing an allow past a
 *      caller that treats exceptions loosely.
 *
 * This class deliberately satisfies the PolicyService PORTS the consuming
 * modules declared inward (tenancy's `authorize(actor, permission, resource?)
 * → PolicyDecision`); the PrincipalRefPolicyService facade satisfies the
 * operating-entity/consent Result-shaped variant. One implementation, proven
 * against both shapes in __tests__/port-reconciliation.test.ts.
 */

import type { Clock, TenantId } from '@karar/shared-kernel';

import {
  isPermissionName,
  permissionsGrantedTo,
  validateCatalogue,
} from '../domain/catalogue.js';
import { assignmentActiveAt, assignmentAppliesTo } from '../domain/role-assignment.js';
import { requirePolicyActor, type PolicyActor } from './actor.js';
import type { RoleAssignmentRepository } from './ports/role-assignment-repository.js';

export interface PolicyDecision {
  readonly allowed: boolean;
  /** Machine-readable; surfaced on denial responses, never invented downstream. */
  readonly reason: string;
}

/** Denial reason codes — the closed vocabulary callers may branch on. */
export const POLICY_DENIAL_REASONS = {
  invalidActor: 'invalid_actor',
  unknownPermission: 'unknown_permission',
  noApplicableAssignment: 'no_applicable_assignment',
  permissionNotHeld: 'permission_not_held',
  storeUnavailable: 'assignment_store_unavailable',
} as const;

export type PolicyDenialReason =
  (typeof POLICY_DENIAL_REASONS)[keyof typeof POLICY_DENIAL_REASONS];

/** The canonical PolicyService interface this module implements and exports. */
export interface PolicyService {
  authorize(
    actor: PolicyActor,
    permission: string,
    resource?: Readonly<Record<string, string>>,
  ): Promise<PolicyDecision>;
}

function deny(reason: PolicyDenialReason): PolicyDecision {
  return Object.freeze({ allowed: false, reason });
}

export class RbacPolicyService implements PolicyService {
  constructor(
    private readonly assignments: RoleAssignmentRepository,
    private readonly clock: Clock,
  ) {
    // A service over a broken catalogue must not start.
    validateCatalogue();
  }

  async authorize(
    actor: PolicyActor,
    permission: string,
    resource?: Readonly<Record<string, string>>,
  ): Promise<PolicyDecision> {
    // Reserved for resource-scoped rules; Phase 3 decisions are
    // permission + scope only, and the parameter is deliberately unused.
    void resource;
    const principal = requirePolicyActor(actor);
    if (!principal.ok) {
      return deny(POLICY_DENIAL_REASONS.invalidActor);
    }
    if (typeof permission !== 'string' || !isPermissionName(permission)) {
      return deny(POLICY_DENIAL_REASONS.unknownPermission);
    }

    const now = this.clock.now();
    let resolved;
    try {
      resolved = await this.assignments.listOwnActive(principal.value, now);
    } catch {
      // Fail closed: cannot resolve means cannot allow.
      return deny(POLICY_DENIAL_REASONS.storeUnavailable);
    }

    const actorTenantId: TenantId | null = principal.value.tenantId ?? null;
    const applicable = resolved.filter(
      (assignment) =>
        // The repository resolves the caller's own rows; the domain rules are
        // re-applied here so a widened query can never widen a decision.
        assignmentActiveAt(assignment, now) && assignmentAppliesTo(assignment, actorTenantId),
    );
    if (applicable.length === 0) {
      return deny(POLICY_DENIAL_REASONS.noApplicableAssignment);
    }

    for (const assignment of applicable) {
      if ((permissionsGrantedTo(assignment.roleId) as readonly string[]).includes(permission)) {
        return Object.freeze({ allowed: true, reason: `granted:${assignment.roleId}` });
      }
    }
    return deny(POLICY_DENIAL_REASONS.permissionNotHeld);
  }

  /**
   * The roles applicable to `actor` in its current context, in force now —
   * used by AssignRole's delegation rule (is the actor a PLATFORM_ADMIN
   * peer?). Store failures propagate: the use case treats them as expected
   * store outcomes, not as denials to mislabel.
   */
  async applicableRoles(actor: PolicyActor): Promise<readonly string[]> {
    const principal = requirePolicyActor(actor);
    if (!principal.ok) {
      return [];
    }
    const now = this.clock.now();
    const resolved = await this.assignments.listOwnActive(principal.value, now);
    const actorTenantId: TenantId | null = principal.value.tenantId ?? null;
    return resolved
      .filter(
        (assignment) =>
          assignmentActiveAt(assignment, now) && assignmentAppliesTo(assignment, actorTenantId),
      )
      .map((assignment) => assignment.roleId);
  }
}
