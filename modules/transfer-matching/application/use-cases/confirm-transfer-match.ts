/**
 * ConfirmTransferMatch — the person says yes, and only now is the match a fact.
 *
 * **This is the only path from a suggestion to something authoritative.** A
 * `SUGGESTED` row changes nothing; this use case records the instant the
 * SUBJECT decided, and that instant is what the whole authority of a confirmed
 * match rests on. The database holds the same rule
 * (`transfer_matches_confirmed_requires_subject_decision`), so a backfill, a
 * fixture or an ingestion path written by someone who never read this file
 * still cannot confirm a match on a person's behalf.
 *
 * ## The decision instant comes from the clock, and that needs saying
 *
 * `Clock` is the platform's clock port, bound by the composition root. The
 * instant recorded is the instant this use case ran, which is the instant the
 * person's confirmation reached the system — the closest thing to "when they
 * decided" that a server can honestly claim. It is deliberately NOT a value on
 * the input type: a caller-supplied decision instant is a caller-supplied
 * claim about when somebody decided something, and this column exists
 * precisely to be a fact rather than a claim.
 *
 * ## The optimistic version is required
 *
 * A missing expected version would make every confirmation a
 * last-writer-wins overwrite. Here the losing write is a DECISION about a
 * person's own money, so the conflict is reported rather than resolved.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import { confirmMatch, type TransferMatch } from '../../domain/transfer-match.js';
import { TransferMatchId } from '../../domain/refs.js';
import {
  MATCH_NOT_FOUND,
  storeFailure,
  type ConfirmTransferMatchError,
} from '../errors.js';
import type { TransferMatchRepository } from '../ports/transfer-match-repository.js';
import { requirePrincipal, type MatchingPrincipal } from '../principal.js';

export interface ConfirmTransferMatchInput {
  readonly matchId: string;
  readonly expectedVersion: number;
}

export class ConfirmTransferMatch {
  constructor(
    private readonly matches: TransferMatchRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ConfirmTransferMatchInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferMatch, ConfirmTransferMatchError>> {
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
          'this match changed since it was read. Re-read it and decide again: a confirmation is ' +
          "a decision about the person's own money, and nothing here applies one over a " +
          'concurrent answer they may already have given',
      });
    }

    const confirmed = confirmMatch(current, this.clock.now());
    if (!confirmed.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: confirmed.error,
        message: confirmed.error.message,
      });
    }
    // Identity means it was already confirmed. Re-confirming must not burn a
    // version or rewrite the instant the person actually decided.
    if (confirmed.value === current) return Result.ok(current);

    let outcome;
    try {
      outcome = await this.matches.update(
        principal.value,
        input.expectedVersion,
        confirmed.value,
      );
    } catch (error) {
      return Result.err(storeFailure('transfer match confirmation', error));
    }
    if (outcome.kind === 'not_found') return Result.err(MATCH_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this match changed between the read and the write. The confirmation was refused ' +
          'rather than applied over somebody else’s answer',
      });
    }
    return Result.ok(outcome.match);
  }
}
