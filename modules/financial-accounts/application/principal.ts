/**
 * The principal every use case in this module acts as.
 *
 * **The principal is CONTEXT, never input.** No use-case input type in this
 * module declares a `userId` or a `tenantId` field, and a test asserts that
 * none ever gains one. That is not a style preference: the moment an owner
 * identifier is a parameter, "read account X as user Y" becomes expressible,
 * and every call site becomes a place someone can pass the wrong Y. Here the
 * owner is whoever the caller already authenticated as — resolved at the edge
 * from server-side session and membership state, never from a header, query
 * parameter, or body field (tenancy.md §6).
 *
 * Both identifiers are required. This module has no tenantless read path: an
 * account belongs to a person inside a tenant, and the RLS policies behind it
 * (migrations 0088, 0089) key on BOTH GUCs, so a partial principal would
 * simply see nothing. Failing here, loudly, is better than a silent empty
 * list that reads like "you have no accounts".
 *
 * The runtime re-validation is deliberate even though the branded types
 * already promise the shape: HTTP is not the only caller, and a cast is not
 * an authentication.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface AccountsPrincipal {
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
  actor: AccountsPrincipal | null | undefined,
): Result<AccountsPrincipal, MissingPrincipalContext> {
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
        'financial-account operations require an authenticated, tenant-bound principal — denied ' +
        '(fail closed: there is no default principal, and no caller may name the owner they act for)',
    });
  }
  return Result.ok(actor);
}
