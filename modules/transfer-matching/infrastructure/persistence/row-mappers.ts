/**
 * Row to domain mapping.
 *
 * Prisma rows stop here (architecture test 4): nothing above this layer sees a
 * Prisma type. The row shape below is a structural declaration of the columns
 * migration 0099 creates, so the mapping stays readable against the SQL rather
 * than against generated code.
 *
 * **Read the row shape as evidence.** It is the complete column list, and
 * there is no amount, no net, no total, no category and no numeric field on it
 * except `version`. A future column would have to be added HERE to be mapped,
 * which is one more place a reviewer sees it.
 *
 * **The mapping is synchronous, and that is a fact about this table rather
 * than an optimisation.** There is nothing to decrypt: `transfer_matches`
 * holds no `HIGHLY_SENSITIVE_FINANCIAL` narrative at all, because a
 * relationship between two transactions needs none. The other financial
 * modules' mappers are asynchronous precisely because theirs do.
 *
 * **A row this vocabulary cannot name is a DEFECT, not a user outcome.** An
 * unknown state or basis means the database and the code have diverged — a
 * migration applied without its code change, or the reverse. That throws
 * `TransferMatchesStoreError` rather than becoming a `Result` arm, because
 * silently coercing it (to `SUGGESTED`, to the one known basis) would produce
 * a plausible-looking record that is wrong. The closed CHECK constraints in
 * 0099 make these throws unreachable in a consistent database; they are the
 * alarm for when it is not.
 *
 * **Two invariants are re-checked on the way OUT**, not merely on the way in,
 * and both are ones whose absence would mean a missing constraint:
 *
 *   * a CONFIRMED row with no `subject_decided_at` would mean
 *     `transfer_matches_confirmed_requires_subject_decision` is absent from
 *     this database. That is the constraint standing between a suggestion and
 *     an authoritative claim about a person's money, so such a row is refused
 *     rather than mapped into a match that reads as confirmed;
 *   * two different currency codes would mean
 *     `transfer_matches_same_currency_only` is absent. Mapping that row would
 *     present a cross-currency pairing as an ordinary transfer, which is the
 *     exact fabrication ADR-0028 forbids.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import { TransferMatchesStoreError } from '../../domain/errors.js';
import {
  isMatchState,
  isSuggestionBasis,
  type MatchSide,
  type TransferMatch,
} from '../../domain/transfer-match.js';
import {
  MatchedAccountRef,
  TransactionRef,
  type TransferMatchId,
} from '../../domain/refs.js';

/** The table this module owns. */
export const TRANSFER_MATCHES_TABLE = 'transfer_matches';

/**
 * Migration 0099's columns, exhaustively. Note what is not here: no amount, no
 * net, no total, no category, no score.
 */
export interface TransferMatchRow {
  id: string;
  tenantId: string;
  userId: string;
  outflowTransactionId: string;
  outflowTransactionReferenceType: string;
  outflowAccountId: string;
  outflowCurrencyCode: string;
  inflowTransactionId: string;
  inflowTransactionReferenceType: string;
  inflowAccountId: string;
  inflowCurrencyCode: string;
  matchState: string;
  suggestionBasis: string;
  suggestionWindow: string;
  subjectDecidedAt: Date | null;
  firstSuggestedAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function requireTransactionReferenceType(value: string, column: string): void {
  if (value !== 'TRANSACTION') {
    throw new TransferMatchesStoreError(
      `transfer_matches.${column} holds unknown value '${value}' — what the id points at is not ` +
        'something a reader may guess, and guessing it wrong would relate a movement to the ' +
        'wrong kind of thing',
    );
  }
}

/**
 * A stored side, straight from the row.
 *
 * There is nothing to reconstruct: `MatchSide` carries exactly the three facts
 * the row carries, because a stored match deliberately holds no amount and no
 * booking date. Those two belong to `MatchCandidateSide`, which exists only
 * while a suggestion is being decided — see the note on `MatchSide` in
 * `domain/transfer-match.ts` for why keeping them would be a figure on a row
 * whose whole design is that it has none.
 */
function sideFrom(transactionId: string, accountId: string, currencyCode: string): MatchSide {
  return Object.freeze({
    transactionRef: TransactionRef.of(transactionId),
    accountRef: MatchedAccountRef.of(accountId),
    currencyCode,
  });
}

export function toTransferMatch(row: TransferMatchRow): TransferMatch {
  if (!isMatchState(row.matchState)) {
    throw new TransferMatchesStoreError(
      `transfer_matches.match_state holds unknown value '${row.matchState}' — the closed CHECK ` +
        'in migration 0099 and this vocabulary have diverged',
    );
  }
  if (!isSuggestionBasis(row.suggestionBasis)) {
    throw new TransferMatchesStoreError(
      `transfer_matches.suggestion_basis holds unknown value '${row.suggestionBasis}'`,
    );
  }
  requireTransactionReferenceType(
    row.outflowTransactionReferenceType,
    'outflow_transaction_reference_type',
  );
  requireTransactionReferenceType(
    row.inflowTransactionReferenceType,
    'inflow_transaction_reference_type',
  );
  if (row.matchState === 'CONFIRMED' && row.subjectDecidedAt === null) {
    throw new TransferMatchesStoreError(
      'transfer_matches holds a CONFIRMED match with no subject decision instant. That state is ' +
        'refused by CHECK in migration 0099, so its presence means the constraint is absent from ' +
        'this database — and mapping the row would present a suggestion as a decision the person ' +
        'made about their own money',
    );
  }
  if (row.outflowCurrencyCode !== row.inflowCurrencyCode) {
    throw new TransferMatchesStoreError(
      'transfer_matches holds a match whose two sides are in different currencies. That state is ' +
        'refused by CHECK in migration 0099, so its presence means the constraint is absent from ' +
        'this database — and mapping the row would present a cross-currency pairing as an ' +
        'ordinary transfer, which is a fabricated exchange rate nobody stated (ADR-0028)',
    );
  }

  return Object.freeze({
    id: row.id as TransferMatchId,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    outflow: sideFrom(row.outflowTransactionId, row.outflowAccountId, row.outflowCurrencyCode),
    inflow: sideFrom(row.inflowTransactionId, row.inflowAccountId, row.inflowCurrencyCode),
    state: row.matchState,
    suggestionBasis: row.suggestionBasis,
    suggestionWindow: row.suggestionWindow,
    subjectDecidedAt: row.subjectDecidedAt,
    firstSuggestedAt: row.firstSuggestedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
