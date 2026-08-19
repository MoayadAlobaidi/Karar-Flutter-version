/**
 * ListOwnConnections — the routes by which this subject's financial data
 * reaches Karar.
 *
 * The input names a WINDOW and the ways to narrow it, and carries no owner:
 * "list connections for user X" is not expressible, and the repository runs
 * inside a principal-context transaction where another subject's rows are
 * invisible rather than filtered.
 *
 * **The store cuts the page and applies the narrowing.** Nothing in the
 * schema limits how many connections a person may hold — several connections
 * to one institution on one rail is the ordinary case, not a duplicate — so a
 * read of all of them is a read with no ceiling, and each row costs a
 * key-management call to decrypt. Trimming afterwards would bound the
 * response and leave both costs unbounded.
 *
 * The connection entities are returned whole, including the display label as
 * an `HsfField` — which redacts itself on every accidental rendering path, so
 * a caller that logs the list logs a redaction marker rather than a list of
 * the institutions a person deals with.
 */

import { Result } from '@karar/shared-kernel';

import { storeFailure, type ListOwnConnectionsError } from '../errors.js';
import type {
  FinancialConnectionPage,
  FinancialConnectionPageQuery,
  FinancialConnectionRepository,
} from '../ports/financial-connection-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

/** The window and the narrowing. Deliberately carries no owner identifier. */
export type ListOwnConnectionsInput = FinancialConnectionPageQuery;

export class ListOwnConnections {
  constructor(private readonly connections: FinancialConnectionRepository) {}

  async execute(
    input: ListOwnConnectionsInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<FinancialConnectionPage, ListOwnConnectionsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      return Result.ok(await this.connections.pageOwn(principal.value, input));
    } catch (error) {
      return Result.err(storeFailure('own connection listing', error));
    }
  }
}
