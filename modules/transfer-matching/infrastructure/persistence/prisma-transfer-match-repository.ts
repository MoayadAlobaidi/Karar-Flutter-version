/**
 * `TransferMatchRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction.
 *
 * RLS on `transfer_matches` requires BOTH principal GUCs, so a call without
 * them returns and affects nothing: the policy fails closed. The explicit
 * `where` clauses are Layer-2 convenience — **RLS is the boundary**, and
 * removing every filter here would change nothing about which rows a caller
 * can reach.
 *
 * ## What this file deliberately cannot do
 *
 * There is no `aggregate`, no `groupBy`, no `count` and no `_sum` anywhere in
 * it, and there never may be. A repository is where "how much did I move
 * between my own accounts this month" first appears — and that is an INSIGHT,
 * requiring amounts this table does not store, over a period nobody stated,
 * with a treatment of unconfirmed matches nobody has decided. ADR-0028
 * establishes relationships and not conclusions; this is where the first
 * conclusion would be assembled. The module's no-money-arithmetic suite scans
 * this file for exactly those shapes.
 *
 * ## Two database refusals that must arrive as typed outcomes
 *
 *   * **23505 / P2002** — one of the two PARTIAL unique indexes over the
 *     non-REJECTED rows. One of these transactions is already the same SIDE of
 *     another live match. Ordinary under a repeated suggestion pass, and under
 *     concurrency it is how two simultaneous passes settle: exactly one wins.
 *   * **KAR42** — the cross-side guard in `transfer_matches_guard`. One of
 *     these transactions is already the OTHER side of a live match, which no
 *     index can express.
 *
 * Both are read STRUCTURALLY out of the driver-adapter cause Prisma attaches,
 * never by matching message text: a message is prose that a later edit
 * rewrites, and a mapping that depends on it fails silently the day somebody
 * improves the wording.
 *
 * ## The identity columns are absent from every `data` block
 *
 * Both transaction ids, both reference types, both account ids, both currency
 * codes, the subject and `createdAt` are written on INSERT and never appear in
 * an UPDATE. They are frozen by `transfer_matches_guard` (SQLSTATE KAR40), and
 * a repository that sent them would be one edit away from relabelling which
 * movement a person's confirmation was about. The safest expression of "this
 * cannot be updated" is not to offer it.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  TransferMatchCreateOutcome,
  TransferMatchRepository,
  TransferMatchUpdateOutcome,
} from '../../application/ports/transfer-match-repository.js';
import type { MatchingPrincipal } from '../../application/principal.js';
import type { TransferMatch } from '../../domain/transfer-match.js';
import type {
  MatchedAccountRef,
  TransactionRef,
  TransferMatchId,
} from '../../domain/refs.js';
import { toTransferMatch, type TransferMatchRow } from './row-mappers.js';

/** PostgreSQL unique-violation, as Prisma reports it. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * The SQLSTATE `transfer_matches_guard` raises when a transaction already
 * belongs to a live match across the two sides (migration 0099).
 */
const ALREADY_MATCHED_SQLSTATE = 'KAR42';

/**
 * The SQLSTATE a driver error carries, or null. Read structurally out of the
 * driver-adapter cause, never by matching the message.
 */
function sqlStateOf(error: unknown): string | null {
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

export class PrismaTransferMatchRepository implements TransferMatchRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private inContext<T>(
    actor: MatchingPrincipal,
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

  private static map(rows: readonly TransferMatchRow[]): readonly TransferMatch[] {
    return rows.map((row) => toTransferMatch(row));
  }

  listOwn(actor: MatchingPrincipal): Promise<readonly TransferMatch[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.transferMatch.findMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return PrismaTransferMatchRepository.map(rows as readonly TransferMatchRow[]);
    });
  }

  listOwnByState(
    actor: MatchingPrincipal,
    state: TransferMatch['state'],
  ): Promise<readonly TransferMatch[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.transferMatch.findMany({
        where: {
          matchState: state,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return PrismaTransferMatchRepository.map(rows as readonly TransferMatchRow[]);
    });
  }

  findOwnById(actor: MatchingPrincipal, id: TransferMatchId): Promise<TransferMatch | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.transferMatch.findFirst({
        where: {
          id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null ? null : toTransferMatch(row as TransferMatchRow);
    });
  }

  findOwnForTransaction(
    actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<readonly TransferMatch[]> {
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      // BOTH sides, deliberately. "Is this transaction already spoken for?" is
      // not answerable by looking at one column, and the whole point of the
      // one-live-match rule is that a transaction cannot be the outflow of one
      // pairing and the inflow of another.
      const rows = await tx.transferMatch.findMany({
        where: {
          tenantId,
          userId,
          OR: [
            { outflowTransactionId: transactionRef.transactionId },
            { inflowTransactionId: transactionRef.transactionId },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return PrismaTransferMatchRepository.map(rows as readonly TransferMatchRow[]);
    });
  }

  async create(
    actor: MatchingPrincipal,
    match: TransferMatch,
  ): Promise<TransferMatchCreateOutcome> {
    try {
      const row = await this.inContext(actor, (tx) =>
        tx.transferMatch.create({
          data: {
            id: match.id,
            tenantId: TenantId.toString(match.tenantId),
            userId: UserId.toString(match.userId),
            outflowTransactionId: match.outflow.transactionRef.transactionId,
            outflowTransactionReferenceType: match.outflow.transactionRef.referenceType,
            outflowAccountId: match.outflow.accountRef.accountId,
            outflowCurrencyCode: match.outflow.currencyCode,
            inflowTransactionId: match.inflow.transactionRef.transactionId,
            inflowTransactionReferenceType: match.inflow.transactionRef.referenceType,
            inflowAccountId: match.inflow.accountRef.accountId,
            inflowCurrencyCode: match.inflow.currencyCode,
            matchState: match.state,
            suggestionBasis: match.suggestionBasis,
            suggestionWindow: match.suggestionWindow,
            subjectDecidedAt: match.subjectDecidedAt,
            firstSuggestedAt: match.firstSuggestedAt,
            version: match.version,
            createdAt: match.createdAt,
            updatedAt: match.updatedAt,
          },
        }),
      );
      return { kind: 'created' as const, match: toTransferMatch(row as TransferMatchRow) };
    } catch (error) {
      const unique = isUniqueViolation(error);
      const crossSide = sqlStateOf(error) === ALREADY_MATCHED_SQLSTATE;
      if (!unique && !crossSide) throw error;
      // The guard names the conflicting match in its message, but the message
      // is prose. The match is looked up instead, inside the caller's own
      // principal context, so the answer is a row this subject owns rather
      // than a string parsed out of an error.
      const conflicting = await this.findConflictingLiveMatch(actor, match);
      return {
        kind: 'transaction_already_matched' as const,
        conflictingMatchId: conflicting?.id ?? '',
        collision: crossSide ? ('CROSSED_SIDES' as const) : ('SAME_SIDE' as const),
      };
    }
  }

  private async findConflictingLiveMatch(
    actor: MatchingPrincipal,
    match: TransferMatch,
  ): Promise<TransferMatch | null> {
    for (const ref of [match.outflow.transactionRef, match.inflow.transactionRef]) {
      const existing = await this.findOwnForTransaction(actor, ref);
      const live = existing.find(
        (candidate) => candidate.state !== 'REJECTED' && candidate.id !== match.id,
      );
      if (live !== undefined) return live;
    }
    return null;
  }

  update(
    actor: MatchingPrincipal,
    expectedVersion: number,
    next: TransferMatch,
  ): Promise<TransferMatchUpdateOutcome> {
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      const written = await tx.transferMatch.updateMany({
        where: { id: next.id, version: expectedVersion, tenantId, userId },
        data: {
          matchState: next.state,
          subjectDecidedAt: next.subjectDecidedAt,
          version: next.version,
          updatedAt: next.updatedAt,
        },
      });
      if (written.count === 0) {
        const still = await tx.transferMatch.findFirst({
          where: { id: next.id, tenantId, userId },
          select: { id: true },
        });
        return still === null ? { kind: 'not_found' as const } : { kind: 'stale' as const };
      }
      const row = await tx.transferMatch.findFirst({
        where: { id: next.id, tenantId, userId },
      });
      return row === null
        ? { kind: 'not_found' as const }
        : { kind: 'updated' as const, match: toTransferMatch(row as TransferMatchRow) };
    });
  }

  eraseForTransaction(
    actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<number> {
    return this.inContext(actor, async (tx) => {
      // Both sides, and every state including REJECTED: a rejection about a
      // transaction that no longer exists is a record of a question about
      // nothing. Idempotent by contract — a second call finds nothing and
      // answers zero.
      const removed = await tx.transferMatch.deleteMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          OR: [
            { outflowTransactionId: transactionRef.transactionId },
            { inflowTransactionId: transactionRef.transactionId },
          ],
        },
      });
      return removed.count;
    });
  }

  eraseForAccount(actor: MatchingPrincipal, accountRef: MatchedAccountRef): Promise<number> {
    return this.inContext(actor, async (tx) => {
      const removed = await tx.transferMatch.deleteMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          OR: [
            { outflowAccountId: accountRef.accountId },
            { inflowAccountId: accountRef.accountId },
          ],
        },
      });
      return removed.count;
    });
  }
}
