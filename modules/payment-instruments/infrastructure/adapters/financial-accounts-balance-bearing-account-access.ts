/**
 * `BalanceBearingAccountAccessPort` over `@karar/financial-accounts` — one of
 * the TWO places in this module that import another module, and it imports
 * only that module's `public-api.ts` (architecture test 3).
 *
 * ## Why the adapter lives here and not in the accounts module
 *
 * The dependency direction is the whole point. `modules/financial-accounts`
 * knows nothing about payment instruments: it declares no port for them,
 * imports nothing from here, and does not need to change for this to work.
 * This module needs one narrow fact about an account, so this module declares
 * the interface for it and satisfies the interface here. Reversing that — a
 * method on the accounts module answering "which instruments spend from this
 * account?" — would make the instrument schema that module's business.
 *
 * ## What it translates, and what it refuses to carry across
 *
 * In: this module's `BalanceBearingAccountRef` and `InstrumentsPrincipal`.
 * Out: an existence answer and a lifecycle state. **Nothing else crosses, and
 * above all no figure.** The accounts module's `FinancialAccount` carries the
 * display name, the institution label, the currency and its own mask, all
 * `HIGHLY_SENSITIVE_FINANCIAL`; this adapter reads the entity because the
 * repository returns one, and then deliberately drops every field but the
 * status.
 *
 * The one that matters most is the one nobody would think to forbid: the
 * accounts module can answer questions about balances, and **this adapter
 * never asks**. It calls `findOwnById` and reads `status`. A summary that
 * carried a balance would put a figure one function call away from a type
 * whose entire design is that it has no figure, and the first convenience
 * that wanted a per-card total would find it already fetched.
 *
 * ## Two vocabularies, mapped explicitly
 *
 * `AccountStatus` over there and `AccountLifecycleState` here are different
 * vocabularies owned by different contexts, and the mapping is a `switch`
 * with no default-to-`ACTIVE` arm. A status added there and not mapped here
 * becomes `UNRECOGNIZED`, which is not attachable — the honest answer.
 * Mapping an unknown state onto `ACTIVE` would widen what may be attached on
 * the strength of a default; mapping it onto absence would report "no such
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
  BalanceBearingAccountAccessPort,
  BalanceBearingAccountSummary,
} from '../../application/ports/balance-bearing-account-access.js';
import type { InstrumentsPrincipal } from '../../application/principal.js';
import type { BalanceBearingAccountRef } from '../../domain/refs.js';

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
      // it. Never attachable, and deliberately not silently ACTIVE.
      return 'UNRECOGNIZED';
  }
}

export class FinancialAccountsBalanceBearingAccountAdapter
  implements BalanceBearingAccountAccessPort
{
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async resolveOwnAccount(
    principal: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<BalanceBearingAccountSummary | null> {
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
    // Two fields out of an entity with a dozen. Every other one is either
    // narrative this module has no reason to hold, or a figure it must not.
    return {
      accountRef,
      lifecycleState: toLifecycleState(account.status),
    };
  }
}
