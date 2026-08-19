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
 * ## Why `create` claims both transactions before it inserts
 *
 * `transfer_matches_guard` decides the crossed-side case with a SELECT, and no
 * SELECT sees a row another session has written and not yet committed. Two
 * suggestion passes proposing A→B and B→A at the same instant therefore both
 * pass the guard and both commit, and one of the person's movements is
 * explained away twice — with nothing on any screen saying so. The two partial
 * unique indexes do not catch it, because the two rows collide on no single
 * index entry; that is exactly why the crossing needed a trigger.
 *
 * So the write claims both transactions first, through
 * `transfer_matches_lock_transaction_pair` (migration 0099), inside the SAME
 * transaction as the insert. The loser then reaches the guard only after the
 * winner has committed, sees the winner's row, and receives KAR42 — **the same
 * typed refusal the serial path produces**. That is the whole point of doing
 * it here rather than in the use case: a race that a caller experiences as a
 * generic store failure is a race that a caller cannot act on, and a bulk
 * suggestion pass is built on the distinction between "already spoken for,
 * skip it" and "the store broke, stop".
 *
 * **The claim is not the rule and must never be mistaken for it.** It is
 * mutual exclusion between writers; the indexes and the guard are what decide
 * who may exist. A path that skipped the claim would still be refused — it
 * would merely reopen the race for itself.
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
import {
  TransactionRef,
  type MatchedAccountRef,
  type TransferMatchId,
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

  /**
   * Claims both transactions for the rest of the calling transaction, so the
   * guard's SELECT below runs against a settled world.
   *
   * The ORDER the two locks are taken in — and therefore the reason two
   * sessions naming the same pair cannot deadlock — lives in the function, not
   * here. It has to: this repository knows which side is which, and the two
   * writers a crossing race pits against each other disagree about exactly
   * that, so an ordering derived from the sides would let both proceed. The
   * function sorts by the lock key and is symmetric in its arguments.
   */
  private static claimBothTransactions(
    tx: PrismaTransactionClient,
    match: TransferMatch,
  ): Promise<number> {
    // `$executeRaw` rather than `$queryRaw`, because the statement is issued
    // for its EFFECT and returns none: the function is `RETURNS void`, and
    // asking the query path to deserialize a void column fails outright.
    // Tagged template either way, so both ids ride as bind parameters and
    // neither is ever spliced into SQL.
    return tx.$executeRaw`SELECT public.transfer_matches_lock_transaction_pair(${match.outflow.transactionRef.transactionId}::uuid, ${match.inflow.transactionRef.transactionId}::uuid)`;
  }

  async create(
    actor: MatchingPrincipal,
    match: TransferMatch,
  ): Promise<TransferMatchCreateOutcome> {
    try {
      const row = await this.inContext(actor, async (tx) => {
        // BEFORE the insert and inside the same transaction, or it settles
        // nothing: a claim taken after the guard has already run is a claim
        // taken after the race was lost.
        await PrismaTransferMatchRepository.claimBothTransactions(tx, match);
        return tx.transferMatch.create({
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
        });
      });
      return { kind: 'created' as const, match: toTransferMatch(row as TransferMatchRow) };
    } catch (error) {
      const unique = isUniqueViolation(error);
      const guarded = sqlStateOf(error) === ALREADY_MATCHED_SQLSTATE;
      if (!unique && !guarded) throw error;
      // The guard names the conflicting match in its message, but the message
      // is prose. The match is looked up instead, inside the caller's own
      // principal context, so the answer is a row this subject owns rather
      // than a string parsed out of an error.
      const conflicting = await this.findConflictingLiveMatch(actor, match);
      return {
        kind: 'transaction_already_matched' as const,
        conflictingMatchId: conflicting?.match.id ?? '',
        // WHICH collision it was is read off the surviving row, not off the
        // SQLSTATE. The guard is BEFORE INSERT, so it fires ahead of the unique
        // indexes and answers KAR42 for the same-side case as well — deriving
        // the label from the code would report every race loser as a crossing,
        // including the ones that were not, and the loser of a race must
        // receive the same answer the rule produces when nothing is racing.
        collision:
          conflicting?.collision ?? (guarded ? ('CROSSED_SIDES' as const) : ('SAME_SIDE' as const)),
      };
    }
  }

  /**
   * The live match one of these two transactions already belongs to, and
   * whether the collision is a crossing.
   *
   * The crossing test is the one `SuggestTransferMatch` performs when its
   * pre-check is what catches the conflict: for the SHARED transaction, the
   * side it sits on in the surviving row against the side it would have sat on
   * here. Written once per caller rather than shared, because the pre-check has
   * a candidate and this has a built match — but it must stay the same
   * question, or one caller learns a different thing from the other about the
   * same collision.
   */
  private async findConflictingLiveMatch(
    actor: MatchingPrincipal,
    match: TransferMatch,
  ): Promise<{
    readonly match: TransferMatch;
    readonly collision: 'SAME_SIDE' | 'CROSSED_SIDES';
  } | null> {
    for (const ref of [match.outflow.transactionRef, match.inflow.transactionRef]) {
      const existing = await this.findOwnForTransaction(actor, ref);
      const live = existing.find(
        (candidate) => candidate.state !== 'REJECTED' && candidate.id !== match.id,
      );
      if (live === undefined) continue;
      const crossed =
        TransactionRef.equals(live.outflow.transactionRef, ref) !==
        TransactionRef.equals(match.outflow.transactionRef, ref);
      return { match: live, collision: crossed ? 'CROSSED_SIDES' : 'SAME_SIDE' };
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
