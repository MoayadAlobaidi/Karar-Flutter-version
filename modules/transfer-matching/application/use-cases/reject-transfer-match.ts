/**
 * RejectTransferMatch — the person says no, or withdraws a confirmation.
 *
 * **The row is KEPT, never deleted.** Without it the same wrong suggestion
 * returns on every subsequent import, and the person answers the same question
 * forever with no way to make it stop. A rejection is a record of what did NOT
 * happen, and `modules/financial-connections` keeps a declined source link for
 * exactly the same reason.
 *
 * A rejection frees BOTH transactions: the partial unique indexes and the
 * cross-side guard in migration 0099 all exclude `REJECTED` rows, so a person
 * who rejects one pairing may later accept a different one involving the same
 * transaction. That is the ordinary case rather than an edge — the product
 * suggested the wrong counterpart and the right one is still out there.
 *
 * Withdrawing a confirmation is the same act and uses the same path. A person
 * who realises they answered wrongly must be able to say so, and forcing them
 * to delete the record in order to correct it would erase the evidence that
 * they had once been asked.
 *
 * The decision instant comes from the clock rather than the input, for the
 * reason `confirm-transfer-match.ts` gives: a caller-supplied decision instant
 * is a claim about when somebody decided something, and this column exists to
 * be a fact.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import { rejectMatch, type TransferMatch } from '../../domain/transfer-match.js';
import { TransferMatchId } from '../../domain/refs.js';
import { MATCH_NOT_FOUND, storeFailure, type RejectTransferMatchError } from '../errors.js';
import type { TransferMatchRepository } from '../ports/transfer-match-repository.js';
import { requirePrincipal, type MatchingPrincipal } from '../principal.js';

export interface RejectTransferMatchInput {
  readonly matchId: string;
  readonly expectedVersion: number;
}

export class RejectTransferMatch {
  constructor(
    private readonly matches: TransferMatchRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RejectTransferMatchInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferMatch, RejectTransferMatchError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    const id = TransferMatchId.of(input.matchId);
    let current;
    try {
      current = await this.matches.findOwnById(principal.value, id);
    } catch (error) {
      return Result.err(storeFailure('transfer match read', error));
    }
    if (current === null) return Result.err(MATCH_NOT_FOUND);
    if (current.version !== input.expectedVersion) {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: current.version,
        message:
          'this match changed since it was read. Re-read it and decide again: nothing here ' +
          "applies a rejection over an answer the person may already have given elsewhere",
      });
    }

    const rejected = rejectMatch(current, this.clock.now());
    if (!rejected.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: rejected.error,
        message: rejected.error.message,
      });
    }
    // Identity means it was already rejected. Re-rejecting must not burn a
    // version or rewrite the instant the person actually decided.
    if (rejected.value === current) return Result.ok(current);

    let outcome;
    try {
      outcome = await this.matches.update(principal.value, input.expectedVersion, rejected.value);
    } catch (error) {
      return Result.err(storeFailure('transfer match rejection', error));
    }
    if (outcome.kind === 'not_found') return Result.err(MATCH_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this match changed between the read and the write. The rejection was refused rather ' +
          'than applied over somebody else’s answer',
      });
    }
    return Result.ok(outcome.match);
  }
}
