/**
 * Principals for tenancy operations. Three shapes on purpose:
 *
 * - `PrincipalActor` — authenticated AND tenant-bound. Tenant identity comes
 *   ONLY from server-side session/membership state resolved at the edge
 *   (tenancy.md §6); nothing here or below accepts a tenant from a request.
 * - `RedeemerActor` — authenticated, tenant NOT required. An invitation
 *   redeemer is logged in but not yet a member of the inviting tenant; the
 *   tenant they join comes from the INVITATION ROW (a server-side record),
 *   never from the client.
 * - `AuthenticatedActor` — authenticated, tenant DELIBERATELY absent
 *   (Phase 3.5 tenant selection/binding): the caller exists before any
 *   binding does, and the operations scoped to it (list own memberships,
 *   resolve tenant context, switch) read only through the 0080/0081
 *   self-arms keyed on app.user_id.
 *
 * All are re-validated at runtime (fail closed) even though the types
 * already promise the shape — HTTP is not the only caller, and a cast is not
 * an authentication.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface PrincipalActor {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface RedeemerActor {
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface MissingPrincipalContext {
  readonly kind: 'missing_principal_context';
  readonly message: string;
}

export function requirePrincipal(
  actor: PrincipalActor | null | undefined,
): Result<PrincipalActor, MissingPrincipalContext> {
  if (
    actor === null ||
    actor === undefined ||
    typeof actor.tenantId !== 'string' ||
    typeof actor.userId !== 'string' ||
    !TenantId.parse(actor.tenantId).ok ||
    !UserId.parse(actor.userId).ok
  ) {
    return Result.err({
      kind: 'missing_principal_context',
      message:
        'operation requires an authenticated, tenant-bound principal — denied (fail closed, no default principal exists)',
    });
  }
  return Result.ok(actor);
}

/** Authenticated, deliberately tenantless (tenant selection precedes binding). */
export interface AuthenticatedActor {
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export function requireAuthenticated(
  actor: AuthenticatedActor | null | undefined,
): Result<AuthenticatedActor, MissingPrincipalContext> {
  if (
    actor === null ||
    actor === undefined ||
    typeof actor.userId !== 'string' ||
    !UserId.parse(actor.userId).ok
  ) {
    return Result.err({
      kind: 'missing_principal_context',
      message:
        'operation requires an authenticated principal — denied (fail closed, no default principal exists)',
    });
  }
  return Result.ok(actor);
}

/** Binding operations act on the caller's own session row: sessionId required. */
export function requireSessionActor(
  actor: AuthenticatedActor | null | undefined,
): Result<AuthenticatedActor & { readonly sessionId: string }, MissingPrincipalContext> {
  const authenticated = requireAuthenticated(actor);
  if (!authenticated.ok) {
    return authenticated;
  }
  const { sessionId } = authenticated.value;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return Result.err({
      kind: 'missing_principal_context',
      message:
        'session-binding operations require the authenticated session identity — denied (fail closed)',
    });
  }
  return Result.ok({ ...authenticated.value, sessionId });
}

export function requireRedeemer(
  actor: RedeemerActor | null | undefined,
): Result<RedeemerActor, MissingPrincipalContext> {
  if (
    actor === null ||
    actor === undefined ||
    typeof actor.userId !== 'string' ||
    !UserId.parse(actor.userId).ok
  ) {
    return Result.err({
      kind: 'missing_principal_context',
      message:
        'invitation redemption requires an authenticated principal — denied (the redeemer must be logged in; there is no anonymous redemption)',
    });
  }
  return Result.ok(actor);
}
