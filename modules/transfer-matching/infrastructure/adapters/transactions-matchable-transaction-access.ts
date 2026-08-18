/**
 * `MatchableTransactionAccessPort` over `@karar/transactions` — one of the TWO
 * places in this module that import another module, and it imports only that
 * module's `public-api.ts` (architecture test 3).
 *
 * ## Why the adapter lives here and not in the transactions module
 *
 * The dependency direction is the whole point. `modules/transactions` knows
 * nothing about transfer matches: it declares no port for them, imports
 * nothing from here, and does not need to change for this to work. This module
 * needs a narrow view of a transaction, so this module declares the interface
 * for it and satisfies the interface here. Reversing that — a method on the
 * transactions module answering "is this transaction part of a transfer?" —
 * would make the match schema that module's business.
 *
 * ## What it translates, and what it refuses to carry across
 *
 * In: this module's `TransactionRef` and `MatchingPrincipal`. Out: an account
 * reference, a signed minor-unit amount, a currency code, a booking date and a
 * status. **Nothing else crosses, and the omissions are the point.**
 *
 * The transactions module's `Transaction` carries `merchant`, `description`
 * and `note` as decrypted `HsfField`s — `HIGHLY_SENSITIVE_FINANCIAL` narrative
 * that its own callers need and this module has no rule for. The repository
 * decrypts them because that is what its contract does; this adapter reads the
 * entity and then deliberately drops all three, along with the provenance, the
 * revisions, the original amount, the source kind and the timezone. A summary
 * that carried a description would make every suggestion pass a second read
 * path into another context's subject narrative — and a suggestion pass runs
 * over pairs, which is the worst possible place for one.
 *
 * **The amount is unwrapped from `Money` here and never travels as one.**
 * `summary.amountMinorUnits` is a `bigint` and `summary.currencyCode` is a
 * string, so no arithmetic type enters this module at all; the only operation
 * performed on the pair is the comparison in `domain/equal-and-opposite.ts`,
 * which is pinned by test as the module's only arithmetic.
 *
 * ## Two vocabularies, mapped explicitly
 *
 * `TransactionStatus` over there and `MatchableTransactionStatus` here are
 * different vocabularies owned by different contexts, and the mapping is a
 * `switch` with no default-to-`POSTED` arm. A status added there and not
 * mapped here becomes `UNRECOGNIZED`, which is never matchable — the honest
 * answer. Mapping an unknown status onto `POSTED` would widen what may be
 * paired on the strength of a default; mapping it onto absence would report
 * "no such transaction" about one the subject can see.
 *
 * ## Why a null is one answer for four situations
 *
 * `findById` on the transactions repository runs inside the caller's own
 * principal context, so a transaction that is absent, another user's, another
 * tenant's, or never minted all come back as `null` — and this adapter passes
 * that through unchanged. **That is what makes "a match may never span two
 * subjects" true**, and distinguishing the four would rebuild the existence
 * oracle both modules avoid.
 */

import { CalendarDay } from '@karar/shared-kernel';
import type {
  TransactionId,
  TransactionRepository,
  TransactionStatus,
  TransactionsPrincipal,
} from '@karar/transactions';

import type {
  MatchableTransactionAccessPort,
  MatchableTransactionStatus,
  MatchableTransactionSummary,
} from '../../application/ports/matchable-transaction-access.js';
import type { MatchingPrincipal } from '../../application/principal.js';
import { MatchedAccountRef, type TransactionRef } from '../../domain/refs.js';

/** The transactions module's status vocabulary, mapped onto this module's. */
function toMatchableStatus(status: TransactionStatus): MatchableTransactionStatus {
  switch (status) {
    case 'POSTED':
      return 'POSTED';
    case 'VOIDED':
      return 'VOIDED';
    default:
      // Reachable only if the transactions module adds a status and nobody
      // maps it. Never matchable, and deliberately not silently POSTED.
      return 'UNRECOGNIZED';
  }
}

export class TransactionsMatchableTransactionAdapter implements MatchableTransactionAccessPort {
  constructor(private readonly transactions: TransactionRepository) {}

  async resolveOwnTransaction(
    principal: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<MatchableTransactionSummary | null> {
    // The two principals are structurally identical — both are a kernel
    // TenantId plus a kernel UserId — and are still restated field by field
    // rather than cast. A cast would silently keep compiling if either shape
    // gained a field, and the field it would most likely gain is one this
    // module has no business forwarding.
    const actor: TransactionsPrincipal = {
      tenantId: principal.tenantId,
      userId: principal.userId,
    };
    const transaction = await this.transactions.findById(
      actor,
      transactionRef.transactionId as TransactionId,
    );
    if (transaction === null) return null;

    // Six fields out of an entity with eighteen. `merchant`, `description`
    // and `note` are decrypted HSF narrative and are dropped HERE, at the
    // boundary, rather than carried into a module that has no rule for them.
    return {
      transactionRef,
      accountRef: MatchedAccountRef.of(transaction.accountRef.accountId),
      amountMinorUnits: transaction.amount.minorUnits,
      currencyCode: transaction.amount.currency.code,
      bookingDate: CalendarDay.of(
        transaction.bookingDate.year,
        transaction.bookingDate.month,
        transaction.bookingDate.day,
      ),
      status: toMatchableStatus(transaction.status),
    };
  }
}
