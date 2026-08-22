/**
 * The principal every use case in this module acts as.
 *
 * **The principal is CONTEXT, never input.** No use-case input type in this
 * module declares a `userId` or a `tenantId` field, and a test asserts that
 * none ever gains one. That is not a style preference: the moment an owner
 * identifier is a parameter, "link this source for user Y" becomes
 * expressible, and every call site becomes a place someone can pass the wrong
 * Y. Here the owner is whoever the caller already authenticated as — resolved
 * at the edge from server-side session and membership state, never from a
 * header, query parameter, or body field (tenancy.md §6).
 *
 * The principal is also what the fingerprint key is derived from, which gives
 * it a second job in this module: get the principal wrong and two people's
 * source accounts would fingerprint into the same namespace. That is the
 * failure the per-subject derivation exists to prevent, so the check below is
 * the first thing every use case does.
 *
 * Both identifiers are required. This module has no tenantless read path, and
 * the RLS policies behind it (migrations 0096, 0097) key on BOTH GUCs, so a
 * partial principal would simply see nothing. Failing here, loudly, is better
 * than a silent empty list that reads like "you have no connections".
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface ConnectionsPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface MissingPrincipalContext {
  readonly kind: 'missing_principal_context';
  readonly message: string;
}

export function requirePrincipal(
  actor: ConnectionsPrincipal | null | undefined,
): Result<ConnectionsPrincipal, MissingPrincipalContext> {
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
        'financial-connection operations require an authenticated, tenant-bound principal — ' +
        'denied (fail closed: there is no default principal, no caller may name the owner they ' +
        'act for, and the source-account fingerprint key is derived from this principal, so an ' +
        'absent one would put two subjects in one equality namespace)',
    });
  }
  return Result.ok(actor);
}
