/**
 * `AccountSourceLinkRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction.
 *
 * RLS on `account_source_links` requires BOTH principal GUCs, so a call
 * without them returns and affects nothing: the policy fails closed. The
 * explicit `where` clauses are Layer-2 convenience — **RLS is the boundary**,
 * and removing every filter here would change nothing about which rows a
 * caller can reach.
 *
 * ## Two database refusals that must arrive as typed outcomes
 *
 * A create can lose to two different rules, and a caller has to be able to
 * tell them apart because the remedies could not be more different:
 *
 *   * **23505 / P2002** — the unique constraint. This connection already has
 *     a link for this source account. That is the ORDINARY outcome of
 *     re-importing the same statement, and under concurrency it is how two
 *     simultaneous imports of one file settle: exactly one wins, the loser
 *     reads the winner's row. Reported as `duplicate`, never as a failure.
 *   * **KAR23** — the cross-connection guard. This source account already
 *     resolves to a DIFFERENT account for this subject. That is never
 *     ordinary: it is the state ADR-0028 exists to prevent, and it stops the
 *     write. Reported as `conflicting_account`, carrying the account the
 *     source already resolves to so the caller can name it.
 *
 * Both are read STRUCTURALLY out of the driver-adapter cause Prisma attaches,
 * never by matching message text: a message is prose that a later edit
 * rewrites, and a mapping that depends on it fails silently the day somebody
 * improves the wording (`modules/transactions` records the same reasoning).
 *
 * ## The fingerprint is written and read, and never rendered
 *
 * It goes into the row and comes back out of it, and it appears nowhere else:
 * not in a log line here, not in an error message, and not in anything this
 * file returns except the entity the use cases immediately convert to a view
 * that omits it.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  AccountSourceLinkPage,
  AccountSourceLinkPageQuery,
  AccountSourceLinkRepository,
  SourceLinkCreateOutcome,
  SourceLinkUpdateOutcome,
} from '../../application/ports/account-source-link-repository.js';
import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import type {
  AccountSourceLink,
  SourceAccountFingerprint,
} from '../../domain/account-source-link.js';
import type {
  AccountSourceLinkId,
  CanonicalAccountRef,
  FinancialConnectionId,
} from '../../domain/refs.js';
import {
  calendarDayToDate,
  encryptSourceLinkFields,
  toAccountSourceLink,
  type AccountSourceLinkRow,
} from './row-mappers.js';

/** PostgreSQL unique-violation, as Prisma reports it. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * The SQLSTATE `account_source_links_guard` raises when one source account
 * would map to two canonical accounts (migration 0097).
 */
const CONFLICTING_ACCOUNT_SQLSTATE = 'KAR23';

/**
 * The SQLSTATE a driver error carries, or null. Read structurally out of the
 * driver-adapter cause, never by matching the message.
 *
 * Exported for `PrismaSourceObservationWriter`, the sibling adapter in this
 * layer that writes the same table on a caller's transaction. It reads the
 * same driver shape for the same reason — no refusal from this table reaches
 * another module as driver text — and one reading of that shape is safer than
 * two that can drift apart.
 */
export function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return null;
  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return null;
  const cause = (adapterError as { cause?: unknown }).cause;
  if (typeof cause !== 'object' || cause === null) return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    (typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION) ||
    // 23505 reaching us through the driver adapter rather than as P2002.
    sqlStateOf(error) === '23505'
  );
}

export class PrismaAccountSourceLinkRepository implements AccountSourceLinkRepository {
  constructor(
    private readonly handle: PrismaHandle,
    private readonly encryption: HsfFieldEncryptionPort,
  ) {}

  private inContext<T>(
    actor: ConnectionsPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      fn,
      { require: ['tenantId', 'userId'] },
    );
  }

  private async mapAll(
    rows: readonly AccountSourceLinkRow[],
    actor: ConnectionsPrincipal,
  ): Promise<readonly AccountSourceLink[]> {
    // Sequential rather than concurrent, for the reason the connection
    // repository states: a key-management provider is rate-limited everywhere
    // but local.
    const links: AccountSourceLink[] = [];
    for (const row of rows) {
      links.push(await toAccountSourceLink(row, this.encryption, actor));
    }
    return links;
  }

  pageOwn(
    actor: ConnectionsPrincipal,
    query: AccountSourceLinkPageQuery,
  ): Promise<AccountSourceLinkPage> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.accountSourceLink.findMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          ...(query.accountRef === null
            ? {}
            : {
                accountId: query.accountRef.accountId,
                accountReferenceType: query.accountRef.referenceType,
              }),
          ...(query.rail === null ? {} : { connectionRail: query.rail }),
          ...(query.status === null ? {} : { sourceStatus: query.status }),
        },
        // Strongest priority first, oldest first within a priority, and the
        // row id last so the order is TOTAL. Without the id two links written
        // in the same instant at the same priority are interchangeable, and a
        // page boundary between them loses one row and repeats another.
        orderBy: [{ sourcePriority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: query.offset,
        // ONE row past the page: it reports whether another page exists
        // without a second statement, and it is what makes this read cost the
        // caller's limit rather than the number of links they hold.
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        links: await this.mapAll(page as readonly AccountSourceLinkRow[], actor),
        hasMore,
      };
    });
  }

  listOwnForConnection(
    actor: ConnectionsPrincipal,
    connectionId: FinancialConnectionId,
  ): Promise<readonly AccountSourceLink[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.accountSourceLink.findMany({
        where: {
          connectionId,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: { createdAt: 'asc' },
      });
      return this.mapAll(rows as readonly AccountSourceLinkRow[], actor);
    });
  }

  findOwnById(
    actor: ConnectionsPrincipal,
    id: AccountSourceLinkId,
  ): Promise<AccountSourceLink | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.accountSourceLink.findFirst({
        where: {
          id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null
        ? null
        : toAccountSourceLink(row as AccountSourceLinkRow, this.encryption, actor);
    });
  }

  findOwnByFingerprint(
    actor: ConnectionsPrincipal,
    fingerprint: SourceAccountFingerprint,
  ): Promise<readonly AccountSourceLink[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.accountSourceLink.findMany({
        where: {
          // The scope is the PRINCIPAL, across every connection they hold —
          // that is what an exact external-reference match is defined over,
          // and narrowing it to one connection would make the same source
          // account seen through two connections two different source
          // accounts (ADR-0028).
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          sourceAccountFingerprintVersion: fingerprint.version,
          sourceAccountFingerprint: fingerprint.value,
        },
        orderBy: { createdAt: 'asc' },
      });
      return this.mapAll(rows as readonly AccountSourceLinkRow[], actor);
    });
  }

  async create(
    actor: ConnectionsPrincipal,
    link: AccountSourceLink,
  ): Promise<SourceLinkCreateOutcome> {
    const encrypted = await encryptSourceLinkFields(
      this.encryption,
      actor,
      link.id,
      link.sourceAccountReference,
    );
    try {
      const row = await this.inContext(actor, (tx) =>
        tx.accountSourceLink.create({
          data: {
            id: link.id,
            tenantId: TenantId.toString(link.tenantId),
            userId: UserId.toString(link.userId),
            accountId: link.accountRef.accountId,
            accountReferenceType: link.accountRef.referenceType,
            connectionId: link.connectionId,
            connectionRail: link.connectionRail,
            sourceAuthority: link.sourceAuthority,
            ...encrypted,
            sourceAccountFingerprint: link.fingerprint.value,
            sourceAccountFingerprintVersion: link.fingerprint.version,
            matchBasis: link.matchBasis,
            sourceStatus: link.status,
            subjectConfirmedAt: link.subjectConfirmedAt,
            sourcePriority: link.sourcePriority,
            firstObservedAt: link.observation.firstObservedAt,
            lastObservedAt: link.observation.lastObservedAt,
            lastSuccessfulImportAt: link.observation.lastSuccessfulImportAt,
            historyCoverageStart:
              link.historyCoverage === null
                ? null
                : calendarDayToDate(link.historyCoverage.start),
            historyCoverageEnd:
              link.historyCoverage === null
                ? null
                : calendarDayToDate(link.historyCoverage.end),
            balanceCapability: link.capabilities.balance,
            pendingTransactionCapability: link.capabilities.pendingTransactions,
            version: link.version,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
          },
        }),
      );
      return {
        kind: 'created' as const,
        link: await toAccountSourceLink(row as AccountSourceLinkRow, this.encryption, actor),
      };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'duplicate' as const };
      if (sqlStateOf(error) === CONFLICTING_ACCOUNT_SQLSTATE) {
        // The guard names the conflicting account in its message, but the
        // message is prose. The account is looked up instead, inside the
        // caller's own principal context, so the answer is a row this subject
        // owns rather than a string parsed out of an error.
        const conflicting = await this.findOwnByFingerprint(actor, link.fingerprint);
        const mapped = conflicting.find(
          (existing) =>
            existing.status !== 'DECLINED' &&
            existing.accountRef.accountId !== link.accountRef.accountId,
        );
        return {
          kind: 'conflicting_account' as const,
          linkedAccountId: mapped?.accountRef.accountId ?? '',
        };
      }
      throw error;
    }
  }

  async update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: AccountSourceLink,
  ): Promise<SourceLinkUpdateOutcome> {
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      // The identity columns are absent from `data` deliberately: the
      // connection, the rail, the fingerprint and its version are frozen by
      // trigger, and a repository that sent them would be one edit away from
      // trying to relabel which source account a link is about. `accountId`
      // is absent for the same reason at a different level — the guard allows
      // it to move only while a proposal is unsettled, and nothing in this
      // module needs to move it, so the safest expression of that is not to
      // offer it at all.
      const written = await tx.accountSourceLink.updateMany({
        where: { id: next.id, version: expectedVersion, tenantId, userId },
        data: {
          sourceAuthority: next.sourceAuthority,
          matchBasis: next.matchBasis,
          sourceStatus: next.status,
          subjectConfirmedAt: next.subjectConfirmedAt,
          sourcePriority: next.sourcePriority,
          lastObservedAt: next.observation.lastObservedAt,
          lastSuccessfulImportAt: next.observation.lastSuccessfulImportAt,
          historyCoverageStart:
            next.historyCoverage === null
              ? null
              : calendarDayToDate(next.historyCoverage.start),
          historyCoverageEnd:
            next.historyCoverage === null
              ? null
              : calendarDayToDate(next.historyCoverage.end),
          balanceCapability: next.capabilities.balance,
          pendingTransactionCapability: next.capabilities.pendingTransactions,
          version: next.version,
          updatedAt: next.updatedAt,
        },
      });
      if (written.count === 0) {
        const still = await tx.accountSourceLink.findFirst({
          where: { id: next.id, tenantId, userId },
          select: { id: true },
        });
        return still === null ? { kind: 'not_found' as const } : { kind: 'stale' as const };
      }
      const row = await tx.accountSourceLink.findFirst({
        where: { id: next.id, tenantId, userId },
      });
      return row === null
        ? { kind: 'not_found' as const }
        : {
            kind: 'updated' as const,
            link: await toAccountSourceLink(
              row as AccountSourceLinkRow,
              this.encryption,
              actor,
            ),
          };
    });
  }

  eraseForAccount(
    actor: ConnectionsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<number> {
    return this.inContext(actor, async (tx) => {
      // Nothing is decrypted on the way out: an erasure has no reason to read
      // an external account reference, and the cheapest way not to leak a
      // value is not to read it. Idempotent by contract — a second call finds
      // nothing and answers zero.
      const removed = await tx.accountSourceLink.deleteMany({
        where: {
          accountId: accountRef.accountId,
          accountReferenceType: accountRef.referenceType,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return removed.count;
    });
  }
}
