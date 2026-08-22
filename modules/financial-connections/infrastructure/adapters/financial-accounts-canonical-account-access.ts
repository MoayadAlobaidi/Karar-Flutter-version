/**
 * `CanonicalAccountAccessPort` over `@karar/financial-accounts` — the ONE
 * place in this module that imports another module, and it imports only that
 * module's `public-api.ts` (architecture test 3).
 *
 * ## Why the adapter lives here and not in the accounts module
 *
 * The dependency direction is the whole point. `modules/financial-accounts`
 * knows nothing about connections or source links: it declares no port for
 * them, imports nothing from here, and does not need to change for this to
 * work. This module needs one narrow fact about an account, so this module
 * declares the interface for it and satisfies the interface here. Reversing
 * that — a method on the accounts module answering "which sources feed this
 * account?" — would make the accounts schema this module's business and the
 * source-link schema theirs.
 *
 * ## What it translates, and what it refuses to carry across
 *
 * In: this module's `CanonicalAccountRef` and `ConnectionsPrincipal`. Out: an
 * existence answer and a lifecycle state. **Nothing else crosses.** The
 * accounts module's `FinancialAccount` carries the display name, the
 * institution label and the mask, all `HIGHLY_SENSITIVE_FINANCIAL`; this
 * adapter reads the entity because the repository returns one, and then
 * deliberately drops every field but the status. A summary that carried the
 * narrative would make every link proposal a second read path into another
 * context's subject data, and it would put an account's name in reach of a
 * module that has no reason to hold one.
 *
 * ## Two vocabularies, mapped explicitly
 *
 * `AccountStatus` over there and `AccountLifecycleState` here are different
 * vocabularies owned by different contexts, and the mapping is a `switch`
 * with no default-to-`ACTIVE` arm. A status added there and not mapped here
 * becomes `UNRECOGNIZED`, which is not linkable — the honest answer. Mapping
 * an unknown state onto `ACTIVE` would widen what may be linked on the
 * strength of a default; mapping it onto absence would report "no such
 * account" about an account the subject can see.
 *
 * ## Why a null is one answer for four situations
 *
 * `findOwnById` on the accounts repository runs inside the caller's own
 * principal context, so an account that is absent, another user's, another
 * tenant's, or never minted all come back as `null` — and this adapter passes
 * that through unchanged. Distinguishing them would rebuild the existence
 * oracle both modules avoid.
 */

import type {
  AccountsPrincipal,
  AccountStatus,
  FinancialAccountId,
  FinancialAccountRepository,
} from '@karar/financial-accounts';

import type {
  AccountLifecycleState,
  CanonicalAccountAccessPort,
  CanonicalAccountSummary,
} from '../../application/ports/canonical-account-access.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import type { CanonicalAccountRef } from '../../domain/refs.js';

/** The accounts module's lifecycle vocabulary, mapped onto this module's. */
function toLifecycleState(status: AccountStatus): AccountLifecycleState {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'ARCHIVED':
      return 'ARCHIVED';
    case 'CLOSED':
      return 'CLOSED';
    default:
      // Reachable only if the accounts module adds a status and nobody maps
      // it. Never linkable, and deliberately not silently ACTIVE.
      return 'UNRECOGNIZED';
  }
}

export class FinancialAccountsCanonicalAccountAdapter implements CanonicalAccountAccessPort {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async resolveOwnAccount(
    principal: ConnectionsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<CanonicalAccountSummary | null> {
    // The two principals are structurally identical — both are a kernel
    // TenantId plus a kernel UserId — and are still restated field by field
    // rather than cast. A cast would silently keep compiling if either shape
    // gained a field, and the field it would most likely gain is one this
    // module has no business forwarding.
    const actor: AccountsPrincipal = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      ...(principal.sessionId !== undefined ? { sessionId: principal.sessionId } : {}),
      ...(principal.requestId !== undefined ? { requestId: principal.requestId } : {}),
    };
    const account = await this.accounts.findOwnById(
      actor,
      accountRef.accountId as FinancialAccountId,
    );
    if (account === null) return null;
    return {
      accountRef,
      lifecycleState: toLifecycleState(account.status),
    };
  }
}
