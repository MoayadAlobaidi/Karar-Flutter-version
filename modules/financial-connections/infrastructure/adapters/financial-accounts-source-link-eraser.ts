/**
 * `AccountSourceLinkEraserPort` over this module's own
 * `EraseAccountSourceLinks` — the second of the two files in this module that
 * import `@karar/financial-accounts`, and like the first it imports only that
 * module's `public-api.ts` (architecture test 3).
 *
 * ## Why the adapter lives here, on the implementing side
 *
 * The dependency runs ONE way and this file is what keeps it that way.
 * `modules/financial-accounts` owns the deletion path, so it declares the
 * interface its deletion path needs (`AccountSourceLinkEraserPort`, ports are
 * declared inward — architecture test 5) and knows nothing else: it does not
 * know that source links exist, what table holds them, or that this module is
 * what satisfies the port. This module knows all of that already, so it
 * satisfies the interface here. Putting the adapter in the accounts module
 * instead would make the `account_source_links` schema that module's business
 * and would be the first import pointing the wrong way.
 *
 * ## What crosses, and what does not
 *
 * In: the accounts module's `AccountsPrincipal` and its branded
 * `FinancialAccountId`. Out: an outcome kind and an exact row count.
 * **Nothing about the links themselves crosses** — not the connection they
 * belong to, not the institution, and above all not the external account
 * reference or its fingerprint, which no read path in this module returns to
 * anyone. An erasure has one honest answer, "how many rows went", and that is
 * the whole of it.
 *
 * ## Why `incomplete` is never produced here, and still exists in the port
 *
 * `EraseAccountSourceLinks` delegates to a single repository call that removes
 * every link for the account inside one transaction: it either commits, and
 * everything scoped to the account is gone, or it raises and nothing went.
 * There is no state between the two for this implementation to report. The
 * port keeps the arm because a different implementer — one erasing across
 * several stores — could legitimately land there, and a caller that could not
 * express a partial erasure would have to round it to success or to failure,
 * both of which are lies about a person's data.
 *
 * ## Why the failure reason is fixed text
 *
 * `DeleteOwnAccount` puts `reason` into a caller-visible message. The reason a
 * store did not answer comes from the database driver, and driver text can
 * carry a connection string with credentials, the failing SQL, or a fragment
 * of the ciphertext of the external account reference — the protected value
 * this module exists to keep from leaving. So the reason is this module's own
 * stable sentence, chosen by the refusal's KIND and never interpolated from
 * the throw, and the original travels attached NON-ENUMERABLE for the one
 * boundary allowed to log it (`packages/platform/src/observability/logger.ts`).
 * A field that must not be serialized is safer as a field that cannot be.
 */

import type {
  AccountSourceLinkEraserPort,
  AccountSourceLinkErasureOutcome,
  AccountsPrincipal,
  FinancialAccountId,
} from '@karar/financial-accounts';

import type { EraseAccountSourceLinksError } from '../../application/errors.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import type { EraseAccountSourceLinks } from '../../application/use-cases/erase-account-source-links.js';

/**
 * One sentence per refusal kind. Naming the kind rather than describing the
 * throw is what keeps this stable across a driver upgrade, and a caller that
 * keyed on driver prose would break when the driver changed under it.
 */
const REASONS: Readonly<Record<EraseAccountSourceLinksError['kind'], string>> = {
  store_failure:
    'the store holding the source links did not answer, so no link is known to have been ' +
    'removed. The reason is deliberately not described here because it comes from the database ' +
    'driver; it is logged once at the boundary, against this request',
  missing_principal_context:
    'the erasure was refused for want of an authenticated, tenant-bound principal — source links ' +
    'are only ever erased inside their own subject context, and there is no default one',
};

export class FinancialAccountsSourceLinkEraser implements AccountSourceLinkEraserPort {
  constructor(private readonly erase: EraseAccountSourceLinks) {}

  async eraseAccountSourceLinks(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<AccountSourceLinkErasureOutcome> {
    // The two principals are structurally identical — both are a kernel
    // TenantId plus a kernel UserId — and are still restated field by field
    // rather than cast, for the reason given in
    // `financial-accounts-canonical-account-access.ts`: a cast would keep
    // compiling if either shape gained a field, and the field it would most
    // likely gain is one this module has no business forwarding.
    const principal: ConnectionsPrincipal = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
      ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
    };
    const erased = await this.erase.execute({ accountId }, principal);
    if (erased.ok) {
      return {
        kind: 'erased',
        accountSourceLinksDeleted: erased.value.accountSourceLinksDeleted,
      };
    }
    // `failed` rather than `incomplete`: the use case reports a refusal only
    // when its transaction raised, which rolls back, so nothing went and an
    // immediate retry is safe. That is a different instruction to the caller
    // than "some rows went", and conflating them would send someone hunting
    // for residue that does not exist.
    const failure = { kind: 'failed' as const, reason: REASONS[erased.error.kind] };
    Object.defineProperty(failure, 'cause', {
      value: (erased.error as { cause?: unknown }).cause ?? erased.error,
      enumerable: false,
      writable: false,
    });
    return failure;
  }
}
