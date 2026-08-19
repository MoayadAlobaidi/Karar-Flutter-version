/**
 * Response serialization for transfer matches — a CLOSED field set, picked by
 * name.
 *
 * THE MATCH CARRIES NO AMOUNT, AND THIS FILE MUST NOT GIVE IT ONE. The row
 * has no amount column: the figures live on the two transactions the match
 * names, and a copy on the relationship would be a third number free to
 * disagree with both. `version` is the only number that leaves here, and
 * `MatchSideView` carries a transaction id, an account id and a currency —
 * enough for a client to fetch the real figures from the transactions
 * surface, and not enough to invent one.
 *
 * `authoritative` is stated rather than inferred. A suggestion changes
 * nothing; only the person's confirmation makes a match authoritative, and a
 * client that had to derive that from the status vocabulary would eventually
 * derive it wrongly and present a guess as a decision.
 *
 * There is no exchange rate and no converted figure, because cross-currency
 * movements are not matchable at all — so there is nothing to convert and no
 * field in which a conversion could hide.
 */

import { isAuthoritative } from '@karar/transfer-matching';
import type { MatchSide, TransferMatch } from '@karar/transfer-matching';

import { instantWire, nullableInstantWire } from './wire.js';

export interface MatchSideWire {
  readonly transactionId: string;
  readonly accountId: string;
  readonly currency: string;
}

function matchSideWire(side: MatchSide): MatchSideWire {
  return {
    transactionId: side.transactionRef.transactionId,
    accountId: side.accountRef.accountId,
    currency: side.currencyCode,
  };
}

export interface TransferMatchWire {
  readonly matchId: string;
  readonly outflow: MatchSideWire;
  readonly inflow: MatchSideWire;
  readonly state: string;
  readonly authoritative: boolean;
  readonly suggestionBasis: string;
  readonly suggestionWindow: string;
  readonly subjectDecidedAt: string | null;
  readonly firstSuggestedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export function transferMatchWire(match: TransferMatch): TransferMatchWire {
  return {
    matchId: match.id,
    outflow: matchSideWire(match.outflow),
    inflow: matchSideWire(match.inflow),
    state: match.state,
    // The module's own predicate, so "does this count?" has one answer.
    authoritative: isAuthoritative(match.state),
    suggestionBasis: match.suggestionBasis,
    // The VERSION LABEL of the rule that looked at this data, so a person can
    // tell later which rule produced the suggestion.
    suggestionWindow: match.suggestionWindow,
    subjectDecidedAt: nullableInstantWire(match.subjectDecidedAt),
    firstSuggestedAt: instantWire(match.firstSuggestedAt),
    createdAt: instantWire(match.createdAt),
    updatedAt: instantWire(match.updatedAt),
    version: match.version,
  };
}
