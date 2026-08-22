/**
 * The principal every use case in this module acts as.
 *
 * **The principal is CONTEXT, never input.** No use-case input type in this
 * module declares a `userId` or a `tenantId` field, and a test asserts that
 * none ever gains one. That is not a style preference: the moment an owner
 * identifier is a parameter, "match those two transactions for user Y" becomes expressible,
 * and every call site becomes a place someone can pass the wrong Y. Here the
 * owner is whoever the caller already authenticated as — resolved at the edge
 * from server-side session and membership state, never from a header, query
 * parameter, or body field (tenancy.md §6).
 *
 * The principal has a second job in this module, and it is the one that makes
 * the check below non-negotiable: BOTH sides of a match are resolved through
 * a port that reads transactions under THIS principal's own context. That is
 * what makes "a match may never span two subjects or two tenants" true — the
 * other subject's transaction resolves as absent, indistinguishably from an id
 * nobody minted. A wrong or absent principal would not merely read the wrong
 * rows; it would be the only way a match could ever join two people's money.
 *
 * Both identifiers are required. This module has no tenantless read path, and
 * the RLS policy behind it (migration 0099) keys on BOTH GUCs, so a partial
 * principal would simply see nothing. Failing here, loudly, is better than a
 * silent empty list that reads like "you have no transfers".
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface MatchingPrincipal {
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
  actor: MatchingPrincipal | null | undefined,
): Result<MatchingPrincipal, MissingPrincipalContext> {
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
        'transfer-matching operations require an authenticated, tenant-bound principal — ' +
        'denied (fail closed: there is no default principal, no caller may name the owner they ' +
        'act for, and BOTH sides of a match are resolved under this principal, so an absent one ' +
        "would be the only way a match could join two people's money)",
    });
  }
  return Result.ok(actor);
}
