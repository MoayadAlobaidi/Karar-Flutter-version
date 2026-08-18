/**
 * `FinancialConnectionRepository` — persistence for `financial_connections`,
 * declared inward and implemented over Prisma in
 * `infrastructure/persistence`.
 *
 * Every method takes the acting principal, and that is not ceremony: the
 * implementation runs inside a principal-context transaction, so RLS makes
 * another subject's connections invisible rather than merely filtered. A
 * method without the principal would be a query path reachable without one.
 *
 * There is no `findByRail`, no `findByInstitution` across subjects, and no
 * unscoped read of any kind. The only questions this interface can express
 * are about the caller's own connections.
 */

import type { FinancialConnection } from '../../domain/financial-connection.js';
import type { FinancialConnectionId } from '../../domain/refs.js';
import type { ConnectionsPrincipal } from '../principal.js';

/** What an optimistic update did. `stale` means someone else moved first. */
export type ConnectionUpdateOutcome =
  | { readonly kind: 'updated'; readonly connection: FinancialConnection }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

/**
 * What a delete did.
 *
 * `sourceLinksDeleted` is exact and is reported rather than assumed: deleting
 * a connection removes the links it fed, by `ON DELETE CASCADE` in migration
 * 0097, and a caller that has to tell a person what happened needs the true
 * number. `not_found` covers "never existed" and "not yours" alike.
 */
export type ConnectionDeleteOutcome =
  | { readonly kind: 'deleted'; readonly sourceLinksDeleted: number }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

export interface FinancialConnectionRepository {
  /** The principal's own connections, oldest first. */
  listOwn(actor: ConnectionsPrincipal): Promise<readonly FinancialConnection[]>;

  /** One of the principal's own connections, or `null` — see the errors file. */
  findOwnById(
    actor: ConnectionsPrincipal,
    id: FinancialConnectionId,
  ): Promise<FinancialConnection | null>;

  /**
   * Persist a new connection. The row is bound to the acting principal by the
   * RLS `WITH CHECK` arm, so even a defective implementation cannot create a
   * connection for somebody else.
   */
  create(
    actor: ConnectionsPrincipal,
    connection: FinancialConnection,
  ): Promise<FinancialConnection>;

  /**
   * Optimistic update. The version predicate belongs in the WHERE clause so
   * the check and the write are one statement; the database backs it twice
   * with a trigger requiring `version` to advance by exactly one.
   */
  update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: FinancialConnection,
  ): Promise<ConnectionUpdateOutcome>;

  /**
   * Delete one of the principal's own connections and everything that
   * cascaded from it. Reports the exact number of source links removed.
   */
  deleteOwn(
    actor: ConnectionsPrincipal,
    id: FinancialConnectionId,
    expectedVersion: number,
  ): Promise<ConnectionDeleteOutcome>;
}
