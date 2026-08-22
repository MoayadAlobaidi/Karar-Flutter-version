/**
 * `FinancialRecordPresencePort` — "does this account hold any financial
 * record?", declared INWARD here and implemented by the transactions module.
 *
 * ## The defect this port closes
 *
 * The currency-immutability rule says an account's currency may be corrected
 * while the account is empty and is frozen once financial records exist,
 * because reinterpreting stored minor units under a different exponent
 * silently rescales every figure already recorded (KWD is three decimals, QAR
 * is two — the same integer is ten times the money). `UpdateOwnAccount`
 * enforced that by counting BALANCE SNAPSHOTS only. Transactions are also
 * financial records, they are also denominated in the account's currency, and
 * no foreign key reaches them (no FK crosses a module boundary,
 * data-model.md §2) — so an account with a thousand transactions and no
 * snapshot could have its currency changed, and every one of those amounts
 * would quietly mean something else afterwards.
 *
 * ## Why the answer is a boolean and never rows
 *
 * The question is a PREDICATE, and the answer is the smallest thing that
 * answers it. This module must not learn what a person spent, where, or how
 * often: transaction narrative is `HIGHLY_SENSITIVE_FINANCIAL` and belongs to
 * a different bounded context, and a port that returned rows — or even a
 * count — would put a volume signal about a subject's behaviour inside a
 * module that has no business holding one. A typed summary rather than a bare
 * boolean so the shape can gain a further predicate later without every call
 * site changing, but every member is and stays a fact ABOUT the account, not
 * about the records.
 *
 * ## Who implements it
 *
 * The transactions module, which is the only thing that can answer without
 * this module importing it. The dependency direction is what matters: the
 * interface is owned HERE, so `modules/financial-accounts/domain` never
 * imports `modules/transactions`, and the two stay independently
 * substitutable (clean-architecture.md §4; architecture test 5).
 *
 * ## Failure is not an answer
 *
 * There is no "unknown" arm. An implementation that cannot answer rejects,
 * and `UpdateOwnAccount` treats a rejection as a refusal to change the
 * currency — fail closed. The alternative reading, "we could not find any
 * records so there are none", is how a rescaling bug ships.
 */

import type { FinancialAccountId } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

/**
 * What one account looks like to the record-holding module. Facts about the
 * ACCOUNT; never anything about an individual record.
 */
export interface FinancialRecordPresence {
  readonly accountId: FinancialAccountId;
  /**
   * True when at least one financial record is scoped to this account for
   * this principal. Deliberately not a count: how many transactions a person
   * has is information about that person, and the rule does not need it.
   */
  readonly hasAnyRecord: boolean;
}

export interface FinancialRecordPresencePort {
  /**
   * Whether any financial record exists for one of the acting principal's own
   * accounts.
   *
   * Scoped to the principal like every other port in this module: an
   * implementation runs inside the caller's own principal context, so another
   * subject's records are not merely filtered out but invisible. That is also
   * why a neighbour's transactions cannot make this answer `true` — asserted
   * by test, because a cross-subject leak here would freeze a currency the
   * caller is entitled to correct.
   */
  hasAnyRecordForAccount(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<FinancialRecordPresence>;
}
