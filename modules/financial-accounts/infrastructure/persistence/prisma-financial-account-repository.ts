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
 * **This is also where the account's HSF fields become ciphertext and come
 * back.** The display name, the user-supplied institution label and the mask
 * have no plaintext column (migration 0088); they are encrypted on the way in
 * and decrypted on the way out, bound to tenant, user, table, row id and
 * field as associated data. Two consequences worth stating because they look
 * like inefficiencies until the reason is visible:
 *
 * - the row id is minted by the DOMAIN before the insert, so the associated
 *   data can name the row a ciphertext belongs to. A database-generated id
 *   would leave nothing to bind to at encryption time.
 * - a decryption failure propagates. It is not caught and turned into a null
 *   field: a ciphertext that does not authenticate means the wrong key, the
 *   wrong subject, or tampering, and a blank account name is a worse answer
 *   than a loud one.
 *
 * The update and delete paths carry the version predicate into the WHERE
 * clause and read the affected-row count back, so a concurrent edit loses
 * visibly instead of being overwritten. The database backs this twice: the
 * guard trigger on the table refuses any UPDATE that does not increment
 * `version` by exactly one (migration 0088).
 *
 * **The update path does not consult the account's origin, and that is the
 * behaviour rather than an oversight.** A provider-origin account is exactly as
 * correctable by its owner as one the person typed: an account may be created
 * one way and corrected many times afterwards while remaining one account, so
 * no branch here, no column, and no database constraint makes an edit
 * conditional on how the account first came to exist (ADR-0028).
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
import type {
  AccountDeleteOutcome,
  AccountUpdateOutcome,
  FinancialAccountPage,
  FinancialAccountPageQuery,
  FinancialAccountRepository,
} from '../../application/ports/financial-account-repository.js';
import type { AccountsPrincipal } from '../../application/principal.js';
import type { FinancialAccount } from '../../domain/financial-account.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import { encryptAccountFields, toFinancialAccount } from './row-mappers.js';

export class PrismaFinancialAccountRepository implements FinancialAccountRepository {
  constructor(
    private readonly handle: PrismaHandle,
    private readonly encryption: HsfFieldEncryptionPort,
  ) {}

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

  /** The HSF columns for one account, encrypted under the acting principal. */
  private encrypt(actor: AccountsPrincipal, account: FinancialAccount) {
    return encryptAccountFields(this.encryption, actor, account.id, {
      displayName: account.displayName,
      userSuppliedInstitutionLabel: account.userSuppliedInstitutionLabel,
      mask: account.mask,
    });
  }

  pageOwn(
    actor: AccountsPrincipal,
    query: FinancialAccountPageQuery,
  ): Promise<FinancialAccountPage> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.financialAccount.findMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          ...(query.institutionRef === null ? {} : { institutionRef: query.institutionRef }),
          // The issuer's KIND, asked of the catalogue row this account names.
          // Expressed as a relation predicate so the store decides it: an
          // account naming no catalogue issuer matches no kind, which is the
          // behaviour a filter applied afterwards had, and doing it here is
          // what lets the page be cut before the rows are read.
          ...(query.institutionKind === null
            ? {}
            : { institution: { is: { kind: query.institutionKind } } }),
          ...(query.accountType === null ? {} : { accountType: query.accountType }),
          ...(query.walletKind === null ? {} : { walletKind: query.walletKind }),
          ...(query.nature === null ? {} : { accountNature: query.nature }),
          ...(query.status === null ? {} : { status: query.status }),
          ...(query.origin === null ? {} : { originKind: query.origin }),
          ...(query.currencyCode === null ? {} : { currencyCode: query.currencyCode }),
        },
        // The row id closes the order. `created_at` alone leaves two accounts
        // opened in the same instant interchangeable, and an interchangeable
        // pair straddling a page boundary is a row a caller never sees and
        // another they see twice.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: query.offset,
        // ONE row past the page, which answers "is there another page"
        // without a second statement — and, more importantly, is what keeps
        // this read bounded by the caller's limit rather than by how many
        // accounts the caller happens to hold.
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      // Sequential rather than concurrent: a key-management provider is a
      // rate-limited external dependency in every environment but this one,
      // and a listing that fans out one call per field per row is how a
      // page load becomes a throttling incident. It now runs over ONE page
      // rather than over everything the caller owns.
      const accounts: FinancialAccount[] = [];
      for (const row of hasMore ? rows.slice(0, query.limit) : rows) {
        accounts.push(await toFinancialAccount(row, this.encryption, actor));
      }
      return { accounts, hasMore };
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
      return row === null ? null : toFinancialAccount(row, this.encryption, actor);
    });
  }

  async create(
    actor: AccountsPrincipal,
    account: FinancialAccount,
  ): Promise<FinancialAccount> {
    // Encryption happens BEFORE the transaction opens. A key-management call
    // inside an open database transaction holds a connection and a row lock
    // for the duration of a network round trip to another system.
    const encrypted = await this.encrypt(actor, account);
    return this.inContext(actor, async (tx) => {
      const row = await tx.financialAccount.create({
        data: {
          id: account.id,
          tenantId: TenantId.toString(account.tenantId),
          userId: UserId.toString(account.userId),
          institutionRef: account.institutionRef,
          accountType: account.accountType,
          walletKind: account.walletKind,
          accountNature: account.nature,
          currencyCode: account.currency.code,
          ...encrypted,
          status: account.status,
          originKind: account.origin,
          version: account.version,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      });
      return toFinancialAccount(row, this.encryption, actor);
    });
  }

  async update(
    actor: AccountsPrincipal,
    expectedVersion: number,
    next: FinancialAccount,
  ): Promise<AccountUpdateOutcome> {
    // Re-encrypted in full on every update, with a fresh nonce per field.
    // Reusing a nonce under GCM is catastrophic, so "only re-encrypt what
    // changed" would need per-field nonce bookkeeping to be safe; writing
    // three fresh ciphertexts is both cheaper and harder to get wrong.
    const encrypted = await this.encrypt(actor, next);
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
          accountType: next.accountType,
          walletKind: next.walletKind,
          accountNature: next.nature,
          currencyCode: next.currency.code,
          ...encrypted,
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
        : {
            kind: 'updated' as const,
            account: await toFinancialAccount(row, this.encryption, actor),
          };
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
      // Only the id and the version are selected: a delete has no reason to
      // decrypt the account's name on its way out, and the cheapest way not
      // to leak a value is not to read it.
      const account = await tx.financialAccount.findFirst({
        where: { id, tenantId, userId },
        select: { id: true, version: true },
      });
      if (account === null) return { kind: 'not_found' as const };
      if (account.version !== expectedVersion) return { kind: 'stale' as const };

      // The snapshots go first, explicitly, so the count returned to the
      // caller is a measurement rather than an assumption. The foreign key's
      // ON DELETE CASCADE (migration 0089) is the backstop that makes the
      // erasure correct even if this statement is ever removed. Records owned
      // by other modules are NOT reached from here — no FK crosses a module
      // boundary — and are erased through FinancialRecordEraserPort, which
      // `DeleteOwnAccount` calls before this method runs.
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
