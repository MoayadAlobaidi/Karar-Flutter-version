/**
 * `BalanceSnapshotRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction, exactly as the account
 * repository does. RLS on `financial_account_balance_snapshots` requires BOTH
 * principal GUCs (migration 0089), so a call without them reads and writes
 * nothing; the `where` clauses are Layer-2 convenience over that boundary.
 *
 * There is no update method here because there is no update path anywhere: a
 * reported balance is not edited, `karar_app` holds no UPDATE grant, and a
 * trigger raises on the attempt even for the table owner. A corrected figure
 * is a new snapshot.
 *
 * `countForAccount` is a COUNT and never a SUM. Nothing in this file adds
 * amounts together — a balance this platform computed is a different concept
 * from a balance a source reported, and conflating them is the failure this
 * module is built to prevent.
 *
 * `pageForOwnAccount` returns every kind of reported balance a caller did not
 * exclude, in one ordered page, and converts none of them. It filters ONLY on
 * the values the caller named: selecting which kind answers a question is the
 * domain's `latestReported`, which requires the caller to name the kind, and
 * a repository that quietly filtered on its own, or that returned "the
 * latest" across kinds, would answer a question about spendable money with a
 * settled figure.
 *
 * **The page bound is enforced by the STATEMENT, not by the caller.** This
 * table is append-only and nothing prunes it, so an unbounded `findMany` here
 * would be a read whose size is decided by how long a person has held an
 * account. `skip`/`take` put the bound in the query plan, and the one extra
 * row is what reports whether another page exists without counting the rest.
 */

import { Money, TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  BalanceSnapshotPage,
  BalanceSnapshotPageQuery,
  BalanceSnapshotRepository,
} from '../../application/ports/balance-snapshot-repository.js';
import type { AccountsPrincipal } from '../../application/principal.js';
import type { BalanceSnapshot } from '../../domain/balance-snapshot.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import { toBalanceSnapshot } from './row-mappers.js';

export class PrismaBalanceSnapshotRepository implements BalanceSnapshotRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private inContext<T>(
    actor: AccountsPrincipal,
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

  pageForOwnAccount(
    actor: AccountsPrincipal,
    query: BalanceSnapshotPageQuery,
  ): Promise<BalanceSnapshotPage> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.financialAccountBalanceSnapshot.findMany({
        where: {
          accountId: query.accountId,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          // The two kinds a caller named, compared against what was stored
          // and nothing else. A value no source ever reported matches no row,
          // which is the honest answer — the alternative, treating an
          // unrecognised kind as "no filter", would answer a question about
          // one kind with every kind's rows.
          ...(query.balanceKind === null ? {} : { balanceKind: query.balanceKind }),
          ...(query.sourceKind === null ? {} : { sourceKind: query.sourceKind }),
        },
        // Most recently TRUE first, capture instant breaking ties — the same
        // order the domain's comparator defines, so the two cannot disagree
        // about which report is the current one. The row id closes the order:
        // two reports true at the same instant and captured at the same
        // instant are otherwise interchangeable, and a page boundary that
        // falls between two interchangeable rows drops one and repeats the
        // other for whoever walks the cursor.
        orderBy: [{ asOf: 'desc' }, { capturedAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        // ONE row past the page. It is what answers "is there another page"
        // without a second statement over a table nothing prunes, and it is
        // the reason this read is bounded no matter how many balances an
        // account has accumulated.
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      return { snapshots: page.map(toBalanceSnapshot), hasMore };
    });
  }

  countForAccount(actor: AccountsPrincipal, accountId: FinancialAccountId): Promise<number> {
    return this.inContext(actor, (tx) =>
      tx.financialAccountBalanceSnapshot.count({
        where: {
          accountId,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      }),
    );
  }

  append(actor: AccountsPrincipal, snapshot: BalanceSnapshot): Promise<BalanceSnapshot> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.financialAccountBalanceSnapshot.create({
        data: {
          id: snapshot.id,
          tenantId: TenantId.toString(snapshot.tenantId),
          userId: UserId.toString(snapshot.userId),
          accountId: snapshot.accountId,
          // Exact minor units as a bigint, with the currency that scales
          // them. Money never crosses this boundary as a number.
          amountMinorUnits: snapshot.amount.minorUnits,
          currencyCode: snapshot.amount.currency.code,
          asOf: snapshot.asOf,
          sourceKind: snapshot.sourceKind,
          // Written through exactly as the source stated it. Nothing here
          // supplies one, coalesces one, or derives a second row of another
          // kind from this one.
          balanceKind: snapshot.balanceKind,
          sourceReference: snapshot.sourceReference,
          capturedAt: snapshot.capturedAt,
          createdAt: snapshot.createdAt,
        },
      });
      const mapped = toBalanceSnapshot(row);
      // Cheap round-trip assertion on the one value that must survive
      // storage exactly. Money.equals throws across currencies, so a
      // mismatched currency is caught here too.
      if (!mapped.amount.equals(Money.of(snapshot.amount.minorUnits, snapshot.amount.currency))) {
        throw new Error(
          `stored balance ${mapped.amount.toString()} does not match the reported ` +
            `${snapshot.amount.toString()} — a money path that does not round-trip exactly is a defect`,
        );
      }
      return mapped;
    });
  }
}
