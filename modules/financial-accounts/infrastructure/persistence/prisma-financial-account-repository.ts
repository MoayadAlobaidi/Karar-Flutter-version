/**
 * `FinancialAccountRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction
 * (packages/platform/src/db/principal-context.ts).
 *
 * RLS on `financial_accounts` requires BOTH principal GUCs (`app.tenant_id`
 * and `app.user_id`), so a call without them returns and affects nothing: the
 * policy fails closed. The explicit `where` clauses below are Layer-2
 * convenience that catches honest mistakes early — **RLS is the boundary**,
 * and this file is written so that removing every filter would change nothing
 * about which rows a caller can reach.
 *
 * The update and delete paths carry the version predicate into the WHERE
 * clause and read the affected-row count back, so a concurrent edit loses
 * visibly instead of being overwritten. The database backs this twice: the
 * guard trigger on the table refuses any UPDATE that does not increment
 * `version` by exactly one (migration 0088).
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  AccountDeleteOutcome,
  AccountUpdateOutcome,
  FinancialAccountRepository,
} from '../../application/ports/financial-account-repository.js';
import type { AccountsPrincipal } from '../../application/principal.js';
import type { FinancialAccount } from '../../domain/financial-account.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import { toFinancialAccount } from './row-mappers.js';

export class PrismaFinancialAccountRepository implements FinancialAccountRepository {
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
      // Stated explicitly rather than left to the default: this module has no
      // tenantless read path, and a relaxation would have to be visible here.
      { require: ['tenantId', 'userId'] },
    );
  }

  listOwn(actor: AccountsPrincipal): Promise<readonly FinancialAccount[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.financialAccount.findMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toFinancialAccount);
    });
  }

  findOwnById(
    actor: AccountsPrincipal,
    id: FinancialAccountId,
  ): Promise<FinancialAccount | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.financialAccount.findFirst({
        where: {
          id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null ? null : toFinancialAccount(row);
    });
  }

  create(actor: AccountsPrincipal, account: FinancialAccount): Promise<FinancialAccount> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.financialAccount.create({
        data: {
          id: account.id,
          tenantId: TenantId.toString(account.tenantId),
          userId: UserId.toString(account.userId),
          institutionRef: account.institutionRef,
          userSuppliedInstitutionLabel: account.userSuppliedInstitutionLabel,
          accountType: account.accountType,
          currencyCode: account.currency.code,
          displayName: account.displayName,
          mask: account.mask,
          status: account.status,
          sourceKind: account.sourceKind,
          providerConnectionRef: account.providerConnectionRef,
          version: account.version,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      });
      return toFinancialAccount(row);
    });
  }

  update(
    actor: AccountsPrincipal,
    expectedVersion: number,
    next: FinancialAccount,
  ): Promise<AccountUpdateOutcome> {
    return this.inContext(actor, async (tx) => {
      // updateMany, not update: the version predicate belongs in the WHERE
      // clause so the check and the write are one statement, and the affected
      // count is the answer to "did anyone move first?".
      const written = await tx.financialAccount.updateMany({
        where: {
          id: next.id,
          version: expectedVersion,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        data: {
          institutionRef: next.institutionRef,
          userSuppliedInstitutionLabel: next.userSuppliedInstitutionLabel,
          accountType: next.accountType,
          currencyCode: next.currency.code,
          displayName: next.displayName,
          mask: next.mask,
          status: next.status,
          version: next.version,
          updatedAt: next.updatedAt,
        },
      });
      if (written.count === 0) {
        // Zero rows means either "not yours / never existed" or "someone moved
        // first". Distinguishing them costs one visibility-scoped read and is
        // worth it: the caller's remedy differs (re-read versus stop).
        const still = await tx.financialAccount.findFirst({
          where: {
            id: next.id,
            tenantId: TenantId.toString(actor.tenantId),
            userId: UserId.toString(actor.userId),
          },
          select: { id: true },
        });
        return still === null ? { kind: 'not_found' as const } : { kind: 'stale' as const };
      }
      const row = await tx.financialAccount.findFirst({
        where: {
          id: next.id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null
        ? { kind: 'not_found' as const }
        : { kind: 'updated' as const, account: toFinancialAccount(row) };
    });
  }

  deleteOwn(
    actor: AccountsPrincipal,
    id: FinancialAccountId,
    expectedVersion: number,
  ): Promise<AccountDeleteOutcome> {
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      const account = await tx.financialAccount.findFirst({
        where: { id, tenantId, userId },
        select: { id: true, version: true },
      });
      if (account === null) return { kind: 'not_found' as const };
      if (account.version !== expectedVersion) return { kind: 'stale' as const };

      // The snapshots go first, explicitly, so the count returned to the
      // caller is a measurement rather than an assumption. The foreign key's
      // ON DELETE CASCADE (migration 0089) is the backstop that makes the
      // erasure correct even if this statement is ever removed.
      const snapshots = await tx.financialAccountBalanceSnapshot.deleteMany({
        where: { accountId: id, tenantId, userId },
      });
      const removed = await tx.financialAccount.deleteMany({
        where: { id, version: expectedVersion, tenantId, userId },
      });
      if (removed.count === 0) return { kind: 'stale' as const };
      return { kind: 'deleted' as const, snapshotsDeleted: snapshots.count };
    });
  }
}
