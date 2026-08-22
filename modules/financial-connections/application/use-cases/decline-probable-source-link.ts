/**
 * DeclineProbableSourceLink — the person says "no, that is not my account".
 *
 * **The refusal is kept rather than deleted**, and that is the design. A
 * declined link records that this source account is NOT the account it was
 * suggested for, so the same wrong suggestion does not return on the next
 * import — which is what would happen if a refusal simply removed the row.
 * Migration 0097 leans on the same distinction: declined rows are excluded
 * from the "one source account, one canonical account" guard precisely
 * because a refusal is a record of what did not happen.
 *
 * A settled link cannot be declined. Removing a source that is already
 * feeding an account is a different operation, with its own answer about what
 * happens to everything it delivered, and it is not this one.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  declineSourceLink,
  toAccountSourceLinkView,
  type AccountSourceLinkView,
} from '../../domain/account-source-link.js';
import type { AccountSourceLinkId } from '../../domain/refs.js';
import {
  SOURCE_LINK_NOT_FOUND,
  storeFailure,
  type DeclineProbableSourceLinkError,
} from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface DeclineProbableSourceLinkInput {
  readonly linkId: AccountSourceLinkId;
  readonly expectedVersion: number;
}

export class DeclineProbableSourceLink {
  constructor(
    private readonly links: AccountSourceLinkRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: DeclineProbableSourceLinkInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<AccountSourceLinkView, DeclineProbableSourceLinkError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let current;
    try {
      current = await this.links.findOwnById(principal.value, input.linkId);
    } catch (error) {
      return Result.err(storeFailure('source link read', error));
    }
    if (current === null) return Result.err(SOURCE_LINK_NOT_FOUND);

    const declined = declineSourceLink(current, this.clock.now());
    if (!declined.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: declined.error,
        message: declined.error.message,
      });
    }

    let outcome;
    try {
      outcome = await this.links.update(principal.value, input.expectedVersion, declined.value);
    } catch (error) {
      return Result.err(storeFailure('source link decline', error));
    }
    if (outcome.kind === 'not_found') return Result.err(SOURCE_LINK_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this suggestion was answered on another device while this request was in flight. ' +
          'Re-read it and decide again',
      });
    }
    return Result.ok(toAccountSourceLinkView(outcome.link));
  }
}
