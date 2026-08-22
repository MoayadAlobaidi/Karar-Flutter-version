/**
 * `MatchCandidateSearchPort` over Prisma.
 *
 * Reads `public.transactions` — rows `modules/transactions` owns — for one
 * question and one only: which of THIS principal's own transactions sit inside
 * the declared window, in the same currency, on some other account. The shape
 * of this file is `modules/statement-imports`'
 * `prisma-canonical-dedup-lookup.ts`, which reads the same table for its own
 * single question and for the same reason: the answer is needed by a module
 * that does not own the table, and the alternative — a method on the owning
 * module answering "is this part of a transfer?" — would make the match schema
 * that module's business.
 *
 * ## It selects six columns, and the omissions are the whole point
 *
 * `id`, `accountId`, `amountMinor`, `currencyCode`, `bookingDate`, `status`.
 * **No description, no merchant, no note, no provenance, no fingerprint.** A
 * suggestion pass runs over every row in a window, so a read that carried
 * narrative would make each written transaction a bulk read path into another
 * bounded context's `HIGHLY_SENSITIVE_FINANCIAL` prose. The `select` is what
 * makes that structural instead of a promise about how callers behave — and it
 * is why this reader exists at all rather than the pass going through
 * `TransactionRepository.findById`, which DECRYPTS that narrative because its
 * own callers need it.
 *
 * ## RLS is the boundary, and here it is load-bearing rather than conventional
 *
 * Every statement runs inside `withPrincipalContext` with BOTH principal GUCs
 * required, so the policies on `public.transactions` decide which rows exist
 * for this read. The `where` clause naming tenant and user is Layer-2
 * convenience: **remove it and the answer does not change.** This is the one
 * place in the module that enumerates rather than resolving a known id, so it
 * is the one place where a missing principal would be the difference between
 * "your own transactions" and "everybody's" — and the platform's context helper
 * refuses to open the transaction at all without both.
 *
 * ## The cap is a cap, not a page
 *
 * `take: limit + 1` reads one row past the cap so the caller learns the window
 * held more than it asked for, without a second statement and without a
 * `count` — which this module does not offer anywhere. Nothing pages: a
 * suggestion pass that walked page after page would be scanning a person's
 * history looking for something to say about it.
 *
 * ## No arithmetic
 *
 * The amount is read, never computed with; the opposite of the anchor's amount
 * is deliberately not asked for, because computing it here would be a second
 * arithmetic operation over a person's money in a module that performs exactly
 * one. `domain/equal-and-opposite.ts` still decides, over the rows this
 * returns.
 */

import { CalendarDay, TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  MatchCandidateQuery,
  MatchCandidateSearchPort,
  MatchCandidateWindow,
} from '../../application/ports/match-candidate-search.js';
import type {
  MatchableTransactionStatus,
  MatchableTransactionSummary,
} from '../../application/ports/matchable-transaction-access.js';
import type { MatchingPrincipal } from '../../application/principal.js';
import { MatchedAccountRef, TransactionRef } from '../../domain/refs.js';

/**
 * The status vocabulary mapping, stated here for the same reason
 * `transactions-matchable-transaction-access.ts` states it: a status the
 * transactions module adds and nobody maps becomes `UNRECOGNIZED`, which is
 * never matchable. There is no default-to-`POSTED` arm, because a default
 * would widen what may be paired on the strength of an omission.
 */
function toMatchableStatus(status: string): MatchableTransactionStatus {
  switch (status) {
    case 'POSTED':
      return 'POSTED';
    case 'VOIDED':
      return 'VOIDED';
    default:
      return 'UNRECOGNIZED';
  }
}

/**
 * A `date` column as the calendar day it always was.
 *
 * The discriminator is `modules/transactions`' own (`row-mappers.ts`), for the
 * reason recorded there: Prisma's pg adapter builds a `Date` at midnight UTC
 * for a `date` column, node-postgres builds one at midnight LOCAL, and only
 * one of those two frames can put a value at exactly 00:00 UTC. Reading the
 * UTC components unconditionally is wrong by a whole day for one of them —
 * which at a month boundary is a whole month (ADR-0027).
 */
function calendarDayOf(value: Date | string): CalendarDay {
  if (typeof value === 'string') return CalendarDay.parse(value);
  const isUtcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0;
  return isUtcMidnight
    ? CalendarDay.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
    : CalendarDay.of(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/** One candidate row, exactly as selected. */
interface CandidateRow {
  readonly id: string;
  readonly accountId: string;
  readonly amountMinor: bigint;
  readonly currencyCode: string;
  readonly bookingDate: Date | string;
  readonly status: string;
}

export class PrismaMatchCandidateReader implements MatchCandidateSearchPort {
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

  async findOwnCandidates(
    principal: MatchingPrincipal,
    query: MatchCandidateQuery,
  ): Promise<MatchCandidateWindow> {
    const rows = await this.inContext(principal, async (tx) =>
      tx.transaction.findMany({
        where: {
          tenantId: TenantId.toString(principal.tenantId),
          userId: UserId.toString(principal.userId),
          // Every one of these NARROWS the read. None of them decides a pair:
          // `checkSuggestable` runs over each row this returns and refuses
          // anything these clauses let through.
          status: 'POSTED',
          currencyCode: query.currencyCode,
          id: { not: query.excludedTransactionRef.transactionId },
          accountId: { not: query.excludedAccountRef.accountId },
          bookingDate: {
            gte: query.earliestBookingDate.toUtcMidnight(),
            lte: query.latestBookingDate.toUtcMidnight(),
          },
        },
        select: {
          id: true,
          accountId: true,
          amountMinor: true,
          currencyCode: true,
          bookingDate: true,
          status: true,
        },
        // A TOTAL order, so a truncated window is truncated at a stated place
        // rather than wherever the planner happened to stop.
        orderBy: [{ bookingDate: 'asc' }, { id: 'asc' }],
        // ONE row past the cap: it reports that the window held more without a
        // second statement and without a count, which this module offers
        // nowhere.
        take: query.limit + 1,
      }),
    );
    const truncated = rows.length > query.limit;
    const read = (truncated ? rows.slice(0, query.limit) : rows) as readonly CandidateRow[];
    return {
      candidates: read.map((row): MatchableTransactionSummary => ({
        transactionRef: TransactionRef.of(row.id),
        accountRef: MatchedAccountRef.of(row.accountId),
        amountMinorUnits: row.amountMinor,
        currencyCode: row.currencyCode,
        bookingDate: calendarDayOf(row.bookingDate),
        status: toMatchableStatus(row.status),
      })),
      truncated,
    };
  }
}
