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
 * `listForOwnAccount` returns EVERY kind of reported balance in one ordered
 * list and converts none of them. Selecting which kind answers a question is
 * the domain's `latestReported`, which requires the caller to name the kind:
 * a repository that quietly filtered, or that returned "the latest" across
 * kinds, would answer a question about spendable money with a settled figure.
 */

import { Money, TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { BalanceSnapshotRepository } from '../../application/ports/balance-snapshot-repository.js';
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

  listForOwnAccount(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<readonly BalanceSnapshot[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.financialAccountBalanceSnapshot.findMany({
        where: {
          accountId,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        // Most recently TRUE first, capture instant breaking ties — the same
        // order the domain's comparator defines, so the two cannot disagree
        // about which report is the current one.
        orderBy: [{ asOf: 'desc' }, { capturedAt: 'desc' }],
      });
      return rows.map(toBalanceSnapshot);
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
