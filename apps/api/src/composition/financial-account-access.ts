/**
 * `FinancialAccountAccessPort` — the composition root's implementation of the
 * one question `modules/transactions` is allowed to ask about an account.
 *
 * WHY IT LIVES HERE. The port is declared INWARD by the transactions module,
 * and the module that can answer it is `@karar/financial-accounts`. Neither
 * may import the other for this: transactions must not depend on accounts,
 * and accounts must not know that transactions exist. The composition root is
 * where the two meet, which is exactly the seam the inward port was declared
 * to create.
 *
 * ABSENT, SOMEBODY ELSE'S, AND NEVER-MINTED ARE ONE ANSWER: `null`. The
 * repository is already principal-scoped — RLS is armed per transaction and
 * the query carries the acting subject — so an account belonging to another
 * person simply is not found. Distinguishing the cases here, in the return
 * value or in a thrown error, would reintroduce exactly the existence oracle
 * the port's own contract refuses.
 *
 * `providerConnected` IS FALSE, AND IT IS NOT A LOOKUP. No provider connector
 * exists in this platform: `provider_access_status` is NOT_IMPLEMENTED
 * everywhere, no credential of any kind is stored, and nothing may render
 * "Connected" for data a person typed or uploaded (ADR-0028). A `true` here
 * would be a claim nothing could have created legitimately — and its
 * consequence would be a hand-typed record filed into a stream the subject
 * believes came from their bank. It is written as a constant, with this note,
 * rather than derived from a field that does not exist.
 *
 * THE LIFECYCLE STATE IS TRANSLATED, NOT REINTERPRETED. An account status the
 * accounts module recognises maps to the matching writable-state vocabulary;
 * anything else becomes UNRECOGNIZED, which the transactions module treats as
 * not writable. Failing closed on a state nobody has mapped is the point: a
 * status added later must be a decision, not a silent permission.
 */

import { ACCOUNT_LIFECYCLE_STATES } from '@karar/transactions';
import type {
  AccountAccessSummary,
  AccountLifecycleState,
  FinancialAccountAccessPort,
  TransactionsPrincipal,
} from '@karar/transactions';
import type { AccountRef } from '@karar/transactions';
import type { FinancialAccountId, FinancialAccountRepository } from '@karar/financial-accounts';

/** Accounts' own status vocabulary, as the transactions module names it. */
function lifecycleStateOf(status: string): AccountLifecycleState {
  return (ACCOUNT_LIFECYCLE_STATES as readonly string[]).includes(status)
    ? (status as AccountLifecycleState)
    : 'UNRECOGNIZED';
}

export class FinancialAccountsAccessAdapter implements FinancialAccountAccessPort {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async resolveOwnAccount(
    principal: TransactionsPrincipal,
    accountRef: AccountRef,
  ): Promise<AccountAccessSummary | null> {
    const account = await this.accounts.findOwnById(
      { tenantId: principal.tenantId, userId: principal.userId },
      accountRef.accountId as FinancialAccountId,
    );
    if (account === null) return null;
    return {
      accountRef,
      currencyCode: account.currency.code,
      lifecycleState: lifecycleStateOf(account.status),
      // Not a lookup, and not a default that could later become one: no
      // provider connector exists anywhere in this platform.
      providerConnected: false,
    };
  }
}
