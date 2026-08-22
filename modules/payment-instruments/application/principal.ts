/**
 * The principal every use case in this module acts as.
 *
 * **The principal is CONTEXT, never input.** No use-case input type in this
 * module declares a `userId` or a `tenantId` field, and a test asserts that
 * none ever gains one. That is not a style preference: the moment an owner
 * identifier is a parameter, "record a card for user Y" becomes expressible,
 * and every call site becomes a place someone can pass the wrong Y. Here the
 * owner is whoever the caller already authenticated as — resolved at the edge
 * from server-side session and membership state, never from a header, query
 * parameter, or body field (tenancy.md §6).
 *
 * The principal is also bound as AEAD associated data on every ciphertext
 * this module writes, which gives it a second job: get it wrong and the mask
 * of one person's card is authenticated under another's. That failure is what
 * the binding exists to make impossible, so the check below is the first
 * thing every use case does.
 *
 * Both identifiers are required. This module has no tenantless read path, and
 * the RLS policy behind it (migration 0098) keys on BOTH GUCs, so a partial
 * principal would simply see nothing. Failing here, loudly, is better than a
 * silent empty list that reads like "you have no cards".
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface InstrumentsPrincipal {
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
  actor: InstrumentsPrincipal | null | undefined,
): Result<InstrumentsPrincipal, MissingPrincipalContext> {
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
        'payment-instrument operations require an authenticated, tenant-bound principal — ' +
        'denied (fail closed: there is no default principal, no caller may name the owner they ' +
        'act for, and the principal is bound as associated data on every ciphertext this module ' +
        "writes, so an absent one would authenticate one person's card mask under nobody)",
    });
  }
  return Result.ok(actor);
}
