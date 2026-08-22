/**
 * The principal every use case in this module acts as.
 *
 * **The principal is CONTEXT, never input.** No use-case input type in this
 * module declares a `userId` or a `tenantId` field, and a test asserts that
 * none ever gains one. That is not a style preference: the moment an owner
 * identifier is a parameter, "commit this statement for user Y" becomes
 * expressible, and every call site becomes a place someone can pass the wrong
 * Y. Here the owner is whoever the caller already authenticated as — resolved
 * at the edge from server-side session and membership state, never from a
 * header, query parameter, or body field (tenancy.md §6).
 *
 * In this module the principal has a second job, and it is the reason the
 * check below runs before anything else. Three keyed values are derived per
 * subject: the encryption key for the stored statement, the file fingerprint
 * that recognises the same upload twice, and — through
 * `modules/transactions` — the dedup fingerprint that decides whether a line
 * is already recorded. Get the principal wrong and two people's statements
 * land in one equality namespace, which is precisely what the per-subject
 * derivations exist to prevent.
 *
 * Both identifiers are required. This module has no tenantless read path, and
 * the RLS policies behind it (migrations 0100, 0101) key on BOTH GUCs, so a
 * partial principal would simply see nothing. Failing here, loudly, is better
 * than a silent empty list that reads like "you have no imports".
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface ImportsPrincipal {
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
  actor: ImportsPrincipal | null | undefined,
): Result<ImportsPrincipal, MissingPrincipalContext> {
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
        'statement-import operations require an authenticated, tenant-bound principal — denied ' +
        '(fail closed: there is no default principal, no caller may name the owner they act for, ' +
        'and the source encryption key, the file fingerprint and the deduplication fingerprint ' +
        'are all derived from this principal, so an absent one would put two subjects in one ' +
        'equality namespace)',
    });
  }
  return Result.ok(actor);
}
