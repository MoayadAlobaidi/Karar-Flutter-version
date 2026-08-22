/**
 * DeleteOwnConnection — a person removes a route they no longer use.
 *
 * **Deleting a connection deletes the links it fed**, by `ON DELETE CASCADE`
 * in migration 0097, and the exact number is reported rather than assumed. It
 * does NOT delete accounts, transactions, or anything a source delivered:
 * those are the person's financial records and they survive the route that
 * carried them. That asymmetry is deliberate and is the honest one — a
 * statement you imported last year is still a record of what happened,
 * whether or not you still upload statements.
 *
 * What the person loses by deleting a connection is the RECOGNITION of the
 * source accounts it carried: a later import through a new connection has no
 * prior fingerprint to match, so it arrives as a probable match and asks
 * rather than linking automatically. That is a question, not a duplicate
 * account, which is the right side to fail on.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialConnectionId } from '../../domain/refs.js';
import {
  CONNECTION_NOT_FOUND,
  storeFailure,
  type DeleteOwnConnectionError,
} from '../errors.js';
import type { FinancialConnectionRepository } from '../ports/financial-connection-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface DeleteOwnConnectionInput {
  readonly connectionId: FinancialConnectionId;
  readonly expectedVersion: number;
}

/** What was removed. The link count is exact, never an estimate. */
export interface ConnectionDeleted {
  readonly connectionId: FinancialConnectionId;
  readonly sourceLinksDeleted: number;
}

export class DeleteOwnConnection {
  constructor(private readonly connections: FinancialConnectionRepository) {}

  async execute(
    input: DeleteOwnConnectionInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<ConnectionDeleted, DeleteOwnConnectionError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let outcome;
    try {
      outcome = await this.connections.deleteOwn(
        principal.value,
        input.connectionId,
        input.expectedVersion,
      );
    } catch (error) {
      return Result.err(storeFailure('own connection deletion', error));
    }
    if (outcome.kind === 'not_found') return Result.err(CONNECTION_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this connection changed since it was read, so it was not deleted. Re-read it and ' +
          'decide again: deleting a route on the strength of a stale view is how somebody ' +
          'removes the one they had just repaired',
      });
    }
    return Result.ok({
      connectionId: input.connectionId,
      sourceLinksDeleted: outcome.sourceLinksDeleted,
    });
  }
}
