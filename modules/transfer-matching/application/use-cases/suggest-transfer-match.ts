/**
 * SuggestTransferMatch — the product asks a question, and nothing more
 * happens.
 *
 * ## What this use case produces
 *
 * A `SUGGESTED` row. That is all. **It changes nothing about either
 * transaction**, it produces no total, it moves no category, and nothing
 * downstream may read it as a fact. The person's confirmation is the only
 * thing that makes a match authoritative, and confirming is a separate act
 * with its own use case and its own recorded instant.
 *
 * ## The order of the gates, and why it is that order
 *
 * 1. **Principal.** No principal, no write — and both sides are resolved
 *    under it, which is what makes "a match may never span two subjects" true.
 * 2. **Retention.** Before anything is read or written. A refusal here must
 *    leave no row behind, which is only true if it runs first.
 * 3. **Both transactions resolved**, each under the caller's own principal
 *    context. Another subject's transaction resolves as absent,
 *    indistinguishably from an id nobody minted.
 * 4. **Both POSTED.** A voided transaction is a record of something that did
 *    not happen; pairing it would explain away a movement already withdrawn.
 * 5. **Orientation.** The caller supplies two ids in whatever order it has
 *    them; this use case decides which is the outflow rather than trusting a
 *    parameter name. A caller that got the order wrong would otherwise store
 *    an inflow in the outflow column, and every later reader would believe it.
 * 6. **The domain rule** — different transactions, different accounts, same
 *    currency, equal and opposite, inside the declared window — in that order,
 *    because the currency check must precede the amount comparison.
 * 7. **Neither transaction already spoken for.** Checked before the write for
 *    a useful answer, and enforced BY the write for correctness under
 *    concurrency: two partial unique indexes and a trigger settle the race
 *    that a pre-check cannot.
 *
 * ## What this use case cannot do
 *
 * It cannot suggest a cross-currency pair. ADR-0028 permits one only on a
 * source-stated FX relationship, and no source states one anywhere in this
 * platform, so there is nothing to match on: the domain refuses it and
 * `transfer_matches_same_currency_only` refuses it again at the database. No
 * rate is looked up, because no rate table is reachable from this module.
 *
 * It cannot pair a fee with a principal. A top-up of 100 with a 2 fee is three
 * transactions and one match; the fee finds no equal-and-opposite counterpart
 * and stays an ordinary expense. Nothing here special-cases that — it falls
 * out of the rule.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  suggestTransferMatch,
  type MatchCandidateSide,
  type TransferMatch,
} from '../../domain/transfer-match.js';
import { orientEqualAndOpposite } from '../../domain/equal-and-opposite.js';
import { TransactionRef, type TransferMatchId } from '../../domain/refs.js';
import {
  retentionUnresolved,
  storeFailure,
  transactionAccessUnavailable,
  transactionNotFound,
  type SuggestTransferMatchError,
} from '../errors.js';
import type { IdSource } from '../ports/id-source.js';
import {
  isMatchableStatus,
  type MatchableTransactionAccessPort,
  type MatchableTransactionSummary,
} from '../ports/matchable-transaction-access.js';
import type { TransferMatchRepository } from '../ports/transfer-match-repository.js';
import {
  permitsDurableWrite,
  type TransferMatchRetentionDecisionPort,
} from '../ports/transfer-match-retention-decision.js';
import { requirePrincipal, type MatchingPrincipal } from '../principal.js';

export interface SuggestTransferMatchInput {
  /**
   * The two transactions, in whatever order the caller holds them. Which is
   * the outflow is DECIDED here from the signs, not taken from the parameter
   * names — see gate 5 in the header.
   */
  readonly firstTransactionId: string;
  readonly secondTransactionId: string;
}

/**
 * A `MatchableTransactionSummary` as the domain's candidate side.
 *
 * The status is dropped: it was the gate above, and a side that carried it
 * would invite a later rule to re-read it from a stored match, where it is not
 * recorded and would be stale if it were.
 */
function toCandidateSide(summary: MatchableTransactionSummary): MatchCandidateSide {
  return {
    transactionRef: summary.transactionRef,
    accountRef: summary.accountRef,
    amountMinorUnits: summary.amountMinorUnits,
    currencyCode: summary.currencyCode,
    bookingDate: summary.bookingDate,
  };
}

export class SuggestTransferMatch {
  constructor(
    private readonly matches: TransferMatchRepository,
    private readonly transactions: MatchableTransactionAccessPort,
    private readonly retention: TransferMatchRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SuggestTransferMatchInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferMatch, SuggestTransferMatchError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let decision;
    try {
      decision = await this.retention.decideFor(principal.value, 'transfer_matches');
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('transfer_matches', decision));
    }

    const firstRef = TransactionRef.of(input.firstTransactionId);
    const secondRef = TransactionRef.of(input.secondTransactionId);

    let first: MatchableTransactionSummary | null;
    let second: MatchableTransactionSummary | null;
    try {
      first = await this.transactions.resolveOwnTransaction(principal.value, firstRef);
      second = await this.transactions.resolveOwnTransaction(principal.value, secondRef);
    } catch (error) {
      return Result.err(transactionAccessUnavailable(error));
    }
    if (first === null) return Result.err(transactionNotFound('FIRST'));
    if (second === null) return Result.err(transactionNotFound('SECOND'));

    for (const [side, summary] of [
      ['FIRST', first],
      ['SECOND', second],
    ] as const) {
      if (!isMatchableStatus(summary.status)) {
        return Result.err({
          kind: 'rule_violated',
          violation: {
            kind: 'transaction_not_matchable',
            status: summary.status,
            message:
              `the ${side.toLowerCase()} transaction is ${summary.status}, so it may not be half ` +
              'of a movement. A voided transaction is a record of something that did NOT ' +
              'happen, and pairing it would explain away a movement that was already withdrawn',
          },
          message: `the ${side.toLowerCase()} transaction is ${summary.status} and cannot be matched`,
        });
      }
    }

    // Which side is which is decided from the SIGNS, never from the parameter
    // names. A caller holding the pair the other way round would otherwise
    // store an inflow in the outflow column, and every later reader would
    // believe it.
    const orientation = orientEqualAndOpposite(
      first.amountMinorUnits,
      second.amountMinorUnits,
    );
    // When neither ordering works the pair is simply not a movement, and the
    // domain rule below produces the refusal that says WHY — cross-currency,
    // not equal and opposite, same account, or too far apart. Choosing an
    // arbitrary orientation here lets that refusal be the specific one rather
    // than a generic "these do not pair".
    const firstIsOutflow = orientation !== 'SECOND_IS_OUTFLOW';
    const outflow = toCandidateSide(firstIsOutflow ? first : second);
    const inflow = toCandidateSide(firstIsOutflow ? second : first);

    const now = this.clock.now();
    const built = suggestTransferMatch({
      id: this.ids.nextId() as TransferMatchId,
      tenantId: principal.value.tenantId,
      userId: principal.value.userId,
      outflow,
      inflow,
      suggestedAt: now,
    });
    if (!built.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: built.error,
        message: built.error.message,
      });
    }

    // A pre-check, for a useful answer. Correctness under concurrency belongs
    // to the write below: two partial unique indexes settle the same-side race
    // and transfer_matches_guard (KAR42) catches the crossing.
    for (const ref of [outflow.transactionRef, inflow.transactionRef]) {
      let existing;
      try {
        existing = await this.matches.findOwnForTransaction(principal.value, ref);
      } catch (error) {
        return Result.err(storeFailure('transfer match lookup by transaction', error));
      }
      const live = existing.find((match) => match.state !== 'REJECTED');
      if (live !== undefined) {
        const crossed =
          TransactionRef.equals(live.outflow.transactionRef, ref) !==
          TransactionRef.equals(outflow.transactionRef, ref);
        return Result.err({
          kind: 'transaction_already_matched',
          conflictingMatchId: live.id,
          collision: crossed ? 'CROSSED_SIDES' : 'SAME_SIDE',
          message:
            'one of these transactions already belongs to a live transfer match, so it may not ' +
            'belong to another. A transaction matched twice would have its movement explained ' +
            'away twice, and the person would see one real movement disappear from what they ' +
            'earned and spent (ADR-0028). Reject the existing match first if it is wrong',
        });
      }
    }

    let outcome;
    try {
      outcome = await this.matches.create(principal.value, built.value);
    } catch (error) {
      return Result.err(storeFailure('transfer match creation', error));
    }
    if (outcome.kind === 'transaction_already_matched') {
      // The database caught what the pre-check could not: another writer
      // matched one of these transactions between the lookup above and this
      // insert.
      return Result.err({
        kind: 'transaction_already_matched',
        conflictingMatchId: outcome.conflictingMatchId,
        collision: outcome.collision,
        message:
          'one of these transactions became part of another live transfer match while this ' +
          'request was in flight, so it was not matched here. A transaction belongs to at most ' +
          'one live match',
      });
    }
    return Result.ok(outcome.match);
  }
}
