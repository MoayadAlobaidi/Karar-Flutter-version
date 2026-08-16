/**
 * RoleAssignmentRepository — this module's port onto the role_assignments
 * store (migration 0052). Two access patterns, deliberately distinct:
 *
 * - `listOwnActive` runs inside the CALLER's principal context and returns
 *   the CALLER's assignments in force at `at` — the self-read the 0052
 *   SELECT arms cover (own tenant-scoped rows via the tenant arm, own
 *   platform-scoped rows via the self arm). Assignments the caller holds in
 *   OTHER tenants are invisible in this context by design: exactly the rows
 *   that must not apply there.
 *
 * - `create` / `revokeActive` use the privileged-write pattern the identity
 *   module recorded in 0030: the USE CASE authorizes the acting principal
 *   first (Layer 1), then the repository performs the write in a transaction
 *   bound to the TARGET principal — the 0052 write policies bind every row
 *   to the transaction's principal, so a write path can never scatter
 *   assignments across users. `grantedBy`/`revokedBy` record the actor as
 *   data.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { PolicyActor } from '../actor.js';
import type { RoleAssignment } from '../../domain/role-assignment.js';

export interface RoleAssignmentGrant {
  readonly userId: UserId;
  readonly roleId: string;
  /** null = platform-scoped. */
  readonly tenantId: TenantId | null;
  readonly grantedBy: UserId;
  readonly reason: string;
  readonly effectiveFrom: Date;
}

export interface RoleAssignmentRevocation {
  readonly userId: UserId;
  readonly roleId: string;
  readonly tenantId: TenantId | null;
  readonly revokedBy: UserId;
  readonly reason: string;
  readonly revokedAt: Date;
}

/** Propagated request correlation for the write transaction's GUCs. */
export interface WriteContext {
  readonly sessionId?: string;
  readonly requestId?: string;
}

/** A second ACTIVE assignment for the same (user, role, scope) — an expected conflict. */
export class RoleAssignmentConflictError extends Error {
  override readonly name = 'RoleAssignmentConflictError';
}

export interface RoleAssignmentRepository {
  /** The caller's own assignments in force at `at`, under the caller's principal context. */
  listOwnActive(actor: PolicyActor, at: Date): Promise<RoleAssignment[]>;

  /**
   * Create the assignment in a transaction bound to the TARGET principal
   * (grant.userId / grant.tenantId). Throws RoleAssignmentConflictError when
   * an ACTIVE assignment for the same (user, role, scope) exists.
   */
  create(grant: RoleAssignmentGrant, context: WriteContext): Promise<RoleAssignment>;

  /**
   * Revoke the ACTIVE assignment for (user, role, scope) in a transaction
   * bound to the TARGET principal; returns the revoked row, or null when no
   * ACTIVE assignment is visible to revoke.
   */
  revokeActive(
    revocation: RoleAssignmentRevocation,
    context: WriteContext,
  ): Promise<RoleAssignment | null>;
}
