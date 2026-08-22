/**
 * ListOwnTransferMatches — the person's own matches, optionally in one state.
 *
 * **The answer is ONE PAGE, cut by the store.** A match is written for every
 * pair the rule finds and kept even once rejected, so this table grows with a
 * person's transactions and nothing prunes it; reading all of it and trimming
 * afterwards would bound the response and leave the read unbounded. The state
 * filter goes down with the bound, because an offset counted over every state
 * names a position in a set the caller is not walking.
 *
 * **This use case returns ROWS and nothing else.** No count, no total, no
 * "you moved X between your own accounts this month". That last one is the
 * temptation, and it is an INSIGHT: it requires summing amounts this module
 * does not store, over a period nobody stated, with a treatment of rejected
 * and unconfirmed matches nobody has decided. ADR-0028 is explicit that it
 * establishes relationships and not conclusions, and this is where the first
 * conclusion would be assembled.
 *
 * The state filter exists because the three states answer three different
 * questions and a caller almost never wants them mixed: `SUGGESTED` is "what
 * is this product asking me", `CONFIRMED` is "which of my movements were
 * transfers", `REJECTED` is history that exists so the same question is not
 * asked twice.
 *
 * There is deliberately no `userId` on the input. The owner is the acting
 * principal, and MODULE.md records the product rule this implements: no staff
 * endpoint returns one customer's transfer matches, and no `?userId=`
 * parameter is accepted anywhere.
 */

import { Result } from '@karar/shared-kernel';

import type { MatchState } from '../../domain/transfer-match.js';
import { storeFailure, type ListOwnTransferMatchesError } from '../errors.js';
import type {
  TransferMatchPage,
  TransferMatchRepository,
} from '../ports/transfer-match-repository.js';
import { requirePrincipal, type MatchingPrincipal } from '../principal.js';

export interface ListOwnTransferMatchesInput {
  /** Narrow to one state. Absent means every match the principal holds. */
  readonly state?: MatchState | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

export class ListOwnTransferMatches {
  constructor(private readonly matches: TransferMatchRepository) {}

  async execute(
    input: ListOwnTransferMatchesInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferMatchPage, ListOwnTransferMatchesError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      return Result.ok(
        await this.matches.pageOwn(principal.value, {
          state: input.state ?? null,
          offset: input.offset,
          limit: input.limit,
        }),
      );
    } catch (error) {
      return Result.err(storeFailure('transfer match listing', error));
    }
  }
}
