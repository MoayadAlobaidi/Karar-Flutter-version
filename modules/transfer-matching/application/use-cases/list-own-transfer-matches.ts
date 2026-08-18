/**
 * ListOwnTransferMatches — the person's own matches, optionally in one state.
 *
 * **This use case returns a LIST and nothing else.** No count, no total, no
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

import type { MatchState, TransferMatch } from '../../domain/transfer-match.js';
import { storeFailure, type ListOwnTransferMatchesError } from '../errors.js';
import type { TransferMatchRepository } from '../ports/transfer-match-repository.js';
import { requirePrincipal, type MatchingPrincipal } from '../principal.js';

export interface ListOwnTransferMatchesInput {
  /** Narrow to one state. Absent means every match the principal holds. */
  readonly state?: MatchState | null;
}

export class ListOwnTransferMatches {
  constructor(private readonly matches: TransferMatchRepository) {}

  async execute(
    input: ListOwnTransferMatchesInput,
    actor: MatchingPrincipal,
  ): Promise<Result<readonly TransferMatch[], ListOwnTransferMatchesError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const state = input.state ?? null;
      const found =
        state === null
          ? await this.matches.listOwn(principal.value)
          : await this.matches.listOwnByState(principal.value, state);
      return Result.ok(found);
    } catch (error) {
      return Result.err(storeFailure('transfer match listing', error));
    }
  }
}
