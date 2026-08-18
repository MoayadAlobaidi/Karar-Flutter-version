/**
 * `MatchableTransactionAccessPort` — the only question this module is allowed
 * to ask about a transaction, declared inward (architecture test 5).
 *
 * ## The defect this exists to close
 *
 * A match is anchored to two transactions by raw UUIDs plus a locally
 * declared reference type (`domain/refs.ts`), and nothing about those UUIDs is
 * self-validating. Without this port, `SuggestTransferMatch` would accept
 * whatever ids it was handed: ids belonging to another user in the same
 * tenant, ids from another tenant entirely, or ids nobody ever minted. RLS
 * does not catch any of it — the match row carries the CALLER's tenant and
 * user, so the policy is satisfied; what is wrong is what the row points at.
 *
 * **This port is what makes "a match may never span two subjects or two
 * tenants" true.** Both sides are resolved through it, under the CALLER's own
 * principal context, so another subject's transaction resolves as `null` —
 * indistinguishably from an id nobody minted. The schema cannot express two
 * subjects either (one `tenant_id`, one `user_id` on the row), and the RLS
 * policy keys on both GUCs. Three layers, and this is the one that catches the
 * case the other two cannot: a caller who knows a real id belonging to
 * somebody else.
 *
 * ## What it returns, and what it deliberately does not
 *
 * Exactly what the suggestion rule needs and nothing else:
 *
 *   - the account the transaction belongs to, so the different-accounts rule
 *     can fire;
 *   - the SIGNED MINOR UNITS and the currency code, so the same-currency and
 *     equal-and-opposite rules can fire — as a `bigint` and a string rather
 *     than a `Money`, so that no arithmetic type enters this module at all;
 *   - the booking date, so the window rule can fire;
 *   - the status, so a voided transaction is never half of a movement.
 *
 * **No merchant, no description, no note, no category, no provenance, no
 * revision history.** All of those are `HIGHLY_SENSITIVE_FINANCIAL` narrative
 * belonging to another bounded context, and no rule in this module could use
 * them. The transactions module's repository decrypts that narrative on the
 * way out because its own callers need it; this port's implementation drops
 * every one of those fields at the boundary and a test asserts the summary
 * type's field list exactly. A summary that carried a description would make
 * every suggestion a second read path into another context's subject data.
 *
 * ## Why the amount is here at all
 *
 * It is the one thing a suggestion genuinely needs, and the module is
 * deliberately built so that this is the ONLY numeric fact it handles: the
 * comparison lives in `domain/equal-and-opposite.ts`, which is pinned by test
 * as the only arithmetic in the module. Nothing sums these values, nothing
 * stores them, and no returned type carries one — `transfer_matches` has no
 * amount column.
 *
 * ## One answer for every invisible transaction
 *
 * `resolveOwnTransaction` returns `null` for a transaction that is absent,
 * another user's, another tenant's, or simply never minted — one
 * indistinguishable outcome, and the use case turns it into the same
 * `transaction_not_found`. A separate "forbidden" answer would be an existence
 * oracle: probe ids, read which ones deny differently, and another subject's
 * transaction history is enumerable without ever seeing one.
 *
 * ## Who implements it
 *
 * **Not the domain, and not another module's internals.** The implementation
 * is an adapter over `@karar/transactions`' `public-api.ts`, living in this
 * module's `infrastructure/adapters/`. The dependency direction is what
 * matters: the interface is owned HERE, `transactions` knows nothing about
 * this module, and this module's domain and application layers never see the
 * transactions module's types.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { MatchedAccountRef, TransactionRef } from '../../domain/refs.js';
import type { MatchingPrincipal } from '../principal.js';

/**
 * The transaction states this module can reason about.
 *
 * Declared HERE rather than imported: the question that matters to this module
 * is "may this be half of a movement", and that question is this module's. The
 * adapter maps one vocabulary onto the other.
 *
 * `UNRECOGNIZED` is the honest answer when the transactions module reports a
 * status this list does not name. It is never matchable. Mapping an unknown
 * status onto `POSTED` would silently widen what may be paired on the strength
 * of a default; mapping it onto absence would report "no such transaction"
 * about one the subject can see.
 */
export const MATCHABLE_TRANSACTION_STATUSES = ['POSTED', 'VOIDED', 'UNRECOGNIZED'] as const;
export type MatchableTransactionStatus = (typeof MATCHABLE_TRANSACTION_STATUSES)[number];

/**
 * The statuses a transaction may be matched in.
 *
 * `VOIDED` is excluded deliberately: a voided transaction is a record of
 * something that did not happen, and pairing it would explain away a movement
 * that was already withdrawn.
 */
export const MATCHABLE_STATUSES: readonly MatchableTransactionStatus[] = Object.freeze([
  'POSTED',
]);

export function isMatchableStatus(status: MatchableTransactionStatus): boolean {
  return MATCHABLE_STATUSES.includes(status);
}

/**
 * Everything this module learns about a transaction it is allowed to see.
 *
 * Five fields and no narrative. If a future rule needs another fact, it is
 * added here explicitly and the reason is written down — the shape is the
 * record of what this module is entitled to know.
 */
export interface MatchableTransactionSummary {
  /** Echoed back so a caller cannot mis-pair a summary with a request. */
  readonly transactionRef: TransactionRef;
  readonly accountRef: MatchedAccountRef;
  /** Signed minor units; negative is money leaving (the canonical convention). */
  readonly amountMinorUnits: bigint;
  /** ISO 4217 alphabetic. A denomination, never an amount. */
  readonly currencyCode: string;
  /** What the institution wrote (ADR-0027), never an instant. */
  readonly bookingDate: CalendarDay;
  readonly status: MatchableTransactionStatus;
}

export interface MatchableTransactionAccessPort {
  /**
   * The summary of a transaction **visible to `principal`**, or `null`.
   *
   * `null` covers absent, another user's, another tenant's, and never-minted
   * alike — see the header. An implementation that distinguished them, in its
   * return value or in a thrown error, would reintroduce the oracle.
   */
  resolveOwnTransaction(
    principal: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<MatchableTransactionSummary | null>;
}
