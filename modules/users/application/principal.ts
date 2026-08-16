/**
 * The principal a use case acts as. Resolved at the infrastructure edge from
 * the caller's own session/membership record — NEVER from a client-supplied
 * header, query, or body field (tenancy.md §6) — and passed in; a use case
 * receives its context, it never derives one (backend.md §5).
 *
 * `userId` IS the identity module's account id (Phase 3 contract), and both
 * identifiers are the kernel's branded types: raw request strings cannot
 * arrive here without passing `TenantId.parse` / `UserId.parse` at the edge.
 *
 * Fail-closed rule, applied twice on purpose: use cases deny a missing or
 * malformed principal before touching any port, and the platform's
 * `withPrincipalContext` denies it again beneath the repository — HTTP is not
 * the only caller, and neither layer trusts the other to have checked.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface PrincipalActor {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface MissingPrincipalContext {
  readonly kind: 'missing_principal_context';
  readonly message: string;
}

/**
 * Runtime re-validation of what the types already promise: present and
 * UUID-shaped. Defends the cast-through-`as` path a compromised or careless
 * edge could take.
 */
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
