/**
 * In-memory repositories for the use-case suite.
 *
 * These fakes reproduce the DATABASE's refusals, not a convenient
 * approximation of them: the unique constraint over (subject, connection,
 * fingerprint version, fingerprint), and the cross-connection guard that
 * refuses one source account mapping to two canonical accounts. A fake that
 * accepted what PostgreSQL refuses would let the use-case suite pass while
 * the real system failed — and both rules are asserted against live
 * PostgreSQL in the schema and linking suites as well, so this file is the
 * fast check rather than the only one.
 */

import type {
  AccountSourceLinkPage,
  AccountSourceLinkPageQuery,
  AccountSourceLinkRepository,
  SourceLinkCreateOutcome,
  SourceLinkUpdateOutcome,
} from '../../application/ports/account-source-link-repository.js';
import type {
  CanonicalAccountAccessPort,
  CanonicalAccountSummary,
  AccountLifecycleState,
} from '../../application/ports/canonical-account-access.js';
import type {
  ConnectionDeleteOutcome,
  ConnectionUpdateOutcome,
  FinancialConnectionPage,
  FinancialConnectionPageQuery,
  FinancialConnectionRepository,
} from '../../application/ports/financial-connection-repository.js';
import type { IdSource } from '../../application/ports/id-source.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import type {
  AccountSourceLink,
  SourceAccountFingerprint,
} from '../../domain/account-source-link.js';
import type { FinancialConnection } from '../../domain/financial-connection.js';
import type {
  AccountSourceLinkId,
  CanonicalAccountRef,
  FinancialConnectionId,
} from '../../domain/refs.js';

function owns(actor: ConnectionsPrincipal, row: { tenantId: string; userId: string }): boolean {
  return row.tenantId === actor.tenantId && row.userId === actor.userId;
}

export class InMemoryConnectionRepository implements FinancialConnectionRepository {
  readonly rows = new Map<string, FinancialConnection>();

  pageOwn(
    actor: ConnectionsPrincipal,
    query: FinancialConnectionPageQuery,
  ): Promise<FinancialConnectionPage> {
    // The fake cuts the page the way the real store does — narrow, order
    // totally, skip, then read ONE more than asked for — so a caller that
    // mistook the extra row for a result would fail here too.
    const ordered = [...this.rows.values()]
      .filter(
        (row) =>
          owns(actor, row) &&
          (query.rail === null || row.rail === query.rail) &&
          (query.status === null || row.status === query.status) &&
          (query.institutionId === null ||
            row.institutionRef?.institutionId === query.institutionId),
      )
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    const read = ordered.slice(query.offset, query.offset + query.limit + 1);
    const hasMore = read.length > query.limit;
    return Promise.resolve({
      connections: hasMore ? read.slice(0, query.limit) : read,
      hasMore,
    });
  }

  findOwnById(
    actor: ConnectionsPrincipal,
    id: FinancialConnectionId,
  ): Promise<FinancialConnection | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row !== undefined && owns(actor, row) ? row : null);
  }

  create(
    _actor: ConnectionsPrincipal,
    connection: FinancialConnection,
  ): Promise<FinancialConnection> {
    this.rows.set(connection.id, connection);
    return Promise.resolve(connection);
  }

  update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: FinancialConnection,
  ): Promise<ConnectionUpdateOutcome> {
    const current = this.rows.get(next.id);
    if (current === undefined || !owns(actor, current)) {
      return Promise.resolve({ kind: 'not_found' });
    }
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    this.rows.set(next.id, next);
    return Promise.resolve({ kind: 'updated', connection: next });
  }

  deleteOwn(
    actor: ConnectionsPrincipal,
    id: FinancialConnectionId,
    expectedVersion: number,
  ): Promise<ConnectionDeleteOutcome> {
    const current = this.rows.get(id);
    if (current === undefined || !owns(actor, current)) {
      return Promise.resolve({ kind: 'not_found' });
    }
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    this.rows.delete(id);
    return Promise.resolve({ kind: 'deleted', sourceLinksDeleted: 0 });
  }
}

export class InMemorySourceLinkRepository implements AccountSourceLinkRepository {
  readonly rows = new Map<string, AccountSourceLink>();

  private mine(actor: ConnectionsPrincipal): AccountSourceLink[] {
    return [...this.rows.values()].filter((row) => owns(actor, row));
  }

  pageOwn(
    actor: ConnectionsPrincipal,
    query: AccountSourceLinkPageQuery,
  ): Promise<AccountSourceLinkPage> {
    const ordered = this.mine(actor)
      .filter(
        (row) =>
          (query.accountRef === null ||
            row.accountRef.accountId === query.accountRef.accountId) &&
          (query.rail === null || row.connectionRail === query.rail) &&
          (query.status === null || row.status === query.status),
      )
      .sort(
        (left, right) =>
          left.sourcePriority - right.sourcePriority ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    // One row past the page, exactly as the real store reads it.
    const read = ordered.slice(query.offset, query.offset + query.limit + 1);
    const hasMore = read.length > query.limit;
    return Promise.resolve({
      links: hasMore ? read.slice(0, query.limit) : read,
      hasMore,
    });
  }

  listOwnForConnection(
    actor: ConnectionsPrincipal,
    connectionId: FinancialConnectionId,
  ): Promise<readonly AccountSourceLink[]> {
    return Promise.resolve(this.mine(actor).filter((row) => row.connectionId === connectionId));
  }

  findOwnById(
    actor: ConnectionsPrincipal,
    id: AccountSourceLinkId,
  ): Promise<AccountSourceLink | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row !== undefined && owns(actor, row) ? row : null);
  }

  findOwnByFingerprint(
    actor: ConnectionsPrincipal,
    fingerprint: SourceAccountFingerprint,
  ): Promise<readonly AccountSourceLink[]> {
    return Promise.resolve(
      this.mine(actor).filter(
        (row) =>
          row.fingerprint.version === fingerprint.version &&
          row.fingerprint.value === fingerprint.value,
      ),
    );
  }

  create(
    actor: ConnectionsPrincipal,
    link: AccountSourceLink,
  ): Promise<SourceLinkCreateOutcome> {
    // account_source_links_source_account_key.
    const duplicate = this.mine(actor).some(
      (row) =>
        row.connectionId === link.connectionId &&
        row.fingerprint.version === link.fingerprint.version &&
        row.fingerprint.value === link.fingerprint.value,
    );
    if (duplicate) return Promise.resolve({ kind: 'duplicate' });

    // account_source_links_guard, SQLSTATE KAR23.
    if (link.status !== 'DECLINED') {
      const conflicting = this.mine(actor).find(
        (row) =>
          row.status !== 'DECLINED' &&
          row.fingerprint.version === link.fingerprint.version &&
          row.fingerprint.value === link.fingerprint.value &&
          row.accountRef.accountId !== link.accountRef.accountId,
      );
      if (conflicting !== undefined) {
        return Promise.resolve({
          kind: 'conflicting_account',
          linkedAccountId: conflicting.accountRef.accountId,
        });
      }
    }

    this.rows.set(link.id, link);
    return Promise.resolve({ kind: 'created', link });
  }

  update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: AccountSourceLink,
  ): Promise<SourceLinkUpdateOutcome> {
    const current = this.rows.get(next.id);
    if (current === undefined || !owns(actor, current)) {
      return Promise.resolve({ kind: 'not_found' });
    }
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    this.rows.set(next.id, next);
    return Promise.resolve({ kind: 'updated', link: next });
  }

  eraseForAccount(
    actor: ConnectionsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<number> {
    const doomed = this.mine(actor).filter(
      (row) => row.accountRef.accountId === accountRef.accountId,
    );
    for (const row of doomed) this.rows.delete(row.id);
    return Promise.resolve(doomed.length);
  }
}

/**
 * A stand-in for the accounts module. Holds only what the port returns —
 * existence and lifecycle state — which is also the point of the port.
 */
export class InMemoryAccountAccess implements CanonicalAccountAccessPort {
  readonly accounts = new Map<string, { owner: string; state: AccountLifecycleState }>();

  add(actor: ConnectionsPrincipal, accountId: string, state: AccountLifecycleState = 'ACTIVE') {
    this.accounts.set(accountId, { owner: `${actor.tenantId}|${actor.userId}`, state });
  }

  resolveOwnAccount(
    principal: ConnectionsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<CanonicalAccountSummary | null> {
    const found = this.accounts.get(accountRef.accountId);
    if (found === undefined) return Promise.resolve(null);
    // Absent, another user's, another tenant's and never-minted are one
    // answer, exactly as the real adapter produces.
    if (found.owner !== `${principal.tenantId}|${principal.userId}`) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ accountRef, lifecycleState: found.state });
  }
}

/** Deterministic ids, so a use-case assertion never depends on randomness. */
export class SequentialIdSource implements IdSource {
  #next = 1;

  constructor(private readonly prefix: string) {}

  nextId(): string {
    const n = this.#next;
    this.#next += 1;
    return `${this.prefix}${n.toString(16).padStart(4, '0')}`;
  }
}
