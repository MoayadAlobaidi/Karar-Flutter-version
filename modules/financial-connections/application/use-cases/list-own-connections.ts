/**
 * ListOwnConnections — the routes by which this subject's financial data
 * reaches Karar.
 *
 * The principal is context, so there is no input at all: "list connections
 * for user X" is not expressible, and the repository runs inside a
 * principal-context transaction where another subject's rows are invisible
 * rather than filtered.
 *
 * The connection entities are returned whole, including the display label as
 * an `HsfField` — which redacts itself on every accidental rendering path, so
 * a caller that logs the list logs a redaction marker rather than a list of
 * the institutions a person deals with.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialConnection } from '../../domain/financial-connection.js';
import { storeFailure, type ListOwnConnectionsError } from '../errors.js';
import type { FinancialConnectionRepository } from '../ports/financial-connection-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export class ListOwnConnections {
  constructor(private readonly connections: FinancialConnectionRepository) {}

  async execute(
    actor: ConnectionsPrincipal,
  ): Promise<Result<readonly FinancialConnection[], ListOwnConnectionsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      return Result.ok(await this.connections.listOwn(principal.value));
    } catch (error) {
      return Result.err(storeFailure('own connection listing', error));
    }
  }
}
