/**
 * ConfirmProbableSourceLink — the person says "yes, that is my account".
 *
 * **This is the ONLY way a probable match becomes a link.** Nothing else in
 * this module promotes `PENDING_CONFIRMATION` to `LINKED`: not an
 * observation, not a re-import, not a repository, and not a heuristic that
 * grew confident. The database backs it —
 * `account_source_links_probable_requires_confirmation` refuses the state
 * without `subject_confirmed_at` — so the rule holds for every writer.
 *
 * The confirmation instant comes from the clock at the moment the person
 * decided, and it is stored. That matters more than it looks: without it,
 * "linked because the person said so" and "linked because a rule was sure"
 * are the same row, and nobody reviewing an account months later can tell
 * which one they are looking at.
 *
 * The version predicate is required rather than optional. Two devices
 * answering the same suggestion is an ordinary race, and the losing answer is
 * usually a person's real decision — so it loses visibly rather than being
 * overwritten.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  confirmSourceLink,
  toAccountSourceLinkView,
  type AccountSourceLinkView,
} from '../../domain/account-source-link.js';
import type { AccountSourceLinkId } from '../../domain/refs.js';
import {
  SOURCE_LINK_NOT_FOUND,
  storeFailure,
  type ConfirmProbableSourceLinkError,
} from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface ConfirmProbableSourceLinkInput {
  readonly linkId: AccountSourceLinkId;
  readonly expectedVersion: number;
}

export class ConfirmProbableSourceLink {
  constructor(
    private readonly links: AccountSourceLinkRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ConfirmProbableSourceLinkInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<AccountSourceLinkView, ConfirmProbableSourceLinkError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let current;
    try {
      current = await this.links.findOwnById(principal.value, input.linkId);
    } catch (error) {
      return Result.err(storeFailure('source link read', error));
    }
    if (current === null) return Result.err(SOURCE_LINK_NOT_FOUND);

    const confirmed = confirmSourceLink(current, this.clock.now());
    if (!confirmed.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: confirmed.error,
        message: confirmed.error.message,
      });
    }
    // Already settled: the domain answered idempotently, and there is nothing
    // to write. A second confirmation is a retry, not a second decision.
    if (confirmed.value === current) {
      return Result.ok(toAccountSourceLinkView(current));
    }

    let outcome;
    try {
      outcome = await this.links.update(principal.value, input.expectedVersion, confirmed.value);
    } catch (error) {
      return Result.err(storeFailure('source link confirmation', error));
    }
    if (outcome.kind === 'not_found') return Result.err(SOURCE_LINK_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this suggestion was answered on another device while this request was in flight. ' +
          'Re-read it and decide again: the other answer is a real decision somebody made, and ' +
          'silently overwriting it would discard exactly the confirmation this path exists to record',
      });
    }
    return Result.ok(toAccountSourceLinkView(outcome.link));
  }
}
