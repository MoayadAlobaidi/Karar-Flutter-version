/**
 * RecordSourceObservation — this platform heard from a source again.
 *
 * **An observation is a report, never a decision.** It moves the last-observed
 * instant, the last successful import, the history a source covered, and what
 * this platform has actually SEEN the source provide. It cannot change which
 * account a link points at, which source account it is about, or whether the
 * person confirmed it — and the absence of those is the point. A code path
 * where "we heard from the source" promotes a pending match to a linked one
 * is how a probable match becomes automatic without anyone having decided to
 * allow it.
 *
 * The capability values are OBSERVATIONS. `OBSERVED` is written only after
 * such data has actually arrived through this link; `NOT_PROVIDED` only when
 * the source itself said so. There is no value meaning "the vendor sheet says
 * it supports balances", because no issuer named anywhere in this platform
 * exposes an interface to Karar, and a capability field is where that fiction
 * would first be written down.
 */

import { Result } from '@karar/shared-kernel';

import {
  recordSourceObservation,
  toAccountSourceLinkView,
  type AccountSourceLinkView,
  type SourceObservation,
} from '../../domain/account-source-link.js';
import type { AccountSourceLinkId } from '../../domain/refs.js';
import {
  SOURCE_LINK_NOT_FOUND,
  storeFailure,
  type RecordSourceObservationError,
} from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface RecordSourceObservationInput {
  readonly linkId: AccountSourceLinkId;
  readonly expectedVersion: number;
  readonly observation: SourceObservation;
}

export class RecordSourceObservation {
  constructor(private readonly links: AccountSourceLinkRepository) {}

  async execute(
    input: RecordSourceObservationInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<AccountSourceLinkView, RecordSourceObservationError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let current;
    try {
      current = await this.links.findOwnById(principal.value, input.linkId);
    } catch (error) {
      return Result.err(storeFailure('source link read', error));
    }
    if (current === null) return Result.err(SOURCE_LINK_NOT_FOUND);

    const next = recordSourceObservation(current, input.observation);
    if (!next.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: next.error,
        message: next.error.message,
      });
    }

    let outcome;
    try {
      outcome = await this.links.update(principal.value, input.expectedVersion, next.value);
    } catch (error) {
      return Result.err(storeFailure('source observation record', error));
    }
    if (outcome.kind === 'not_found') return Result.err(SOURCE_LINK_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this link changed while the observation was in flight. Re-read it and record again — ' +
          'an observation written over an unread change would report a window nobody observed',
      });
    }
    return Result.ok(toAccountSourceLinkView(outcome.link));
  }
}
