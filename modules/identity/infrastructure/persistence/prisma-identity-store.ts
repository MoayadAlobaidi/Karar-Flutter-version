/**
 * Prisma adapter for accounts, credentials, and one-time codes
 * (AccountRepository, VerificationRepository, ResetRequestRepository).
 * Scope discipline per prisma-scope.ts: pre-auth operations run on the
 * bootstrap client; account mutations run inside `withAccount` transactions.
 */

import { UserId } from '@karar/shared-kernel';

import type { AccountStatus, IdentityAccount } from '../../domain/identity-account.js';
import type {
  AccountRepository,
  NewAccount,
  OneTimeCodeRecord,
  ResetRequestRepository,
  VerificationRepository,
} from '../../application/ports/identity-repositories.js';
import { IdentityPrismaScope, isUniqueViolation } from './prisma-scope.js';

interface AccountRow {
  readonly id: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly status: string;
  readonly disabledReason: string | null;
  readonly mfaRequired: boolean;
  readonly tokenVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toAccount(row: AccountRow): IdentityAccount {
  return {
    id: UserId.of(row.id),
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    status: row.status as AccountStatus,
    disabledReason: row.disabledReason,
    mfaRequired: row.mfaRequired,
    tokenVersion: row.tokenVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaAccountStore implements AccountRepository {
  constructor(private readonly scope: IdentityPrismaScope) {}

  async createWithCredential(account: NewAccount): Promise<'created' | 'duplicate_email'> {
    try {
      await this.scope.bootstrap.$transaction(async (tx) => {
        await tx.identityAccount.create({
          data: {
            id: account.id,
            email: account.email,
            createdAt: account.now,
            updatedAt: account.now,
          },
        });
        await tx.passwordCredential.create({
          data: {
            accountId: account.id,
            passwordHash: account.passwordHash,
            paramsVersion: account.paramsVersion,
            updatedAt: account.now,
          },
        });
      });
      return 'created';
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate_email';
      throw error;
    }
  }

  async findByEmail(normalizedEmail: string): Promise<IdentityAccount | null> {
    const row = await this.scope.bootstrap.identityAccount.findFirst({
      where: { email: normalizedEmail },
    });
    return row === null ? null : toAccount(row);
  }

  async findById(accountId: UserId): Promise<IdentityAccount | null> {
    const row = await this.scope.bootstrap.identityAccount.findUnique({
      where: { id: accountId },
    });
    return row === null ? null : toAccount(row);
  }

  async markEmailVerified(accountId: UserId, now: Date): Promise<void> {
    await this.scope.bootstrap.identityAccount.updateMany({
      where: { id: accountId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now, updatedAt: now },
    });
  }

  async setStatus(input: {
    readonly accountId: UserId;
    readonly status: AccountStatus;
    readonly reason: string | null;
    readonly bumpTokenVersion: boolean;
    readonly now: Date;
  }): Promise<void> {
    await this.scope.withAccount(input.accountId, async (tx) => {
      await tx.identityAccount.update({
        where: { id: input.accountId },
        data: {
          status: input.status,
          disabledReason: input.reason,
          updatedAt: input.now,
          ...(input.bumpTokenVersion ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
    });
  }

  async replacePassword(input: {
    readonly accountId: UserId;
    readonly passwordHash: string;
    readonly paramsVersion: number;
    readonly now: Date;
  }): Promise<void> {
    await this.scope.withAccount(input.accountId, async (tx) => {
      await tx.passwordCredential.upsert({
        where: { accountId: input.accountId },
        create: {
          accountId: input.accountId,
          passwordHash: input.passwordHash,
          paramsVersion: input.paramsVersion,
          updatedAt: input.now,
        },
        update: {
          passwordHash: input.passwordHash,
          paramsVersion: input.paramsVersion,
          updatedAt: input.now,
        },
      });
      // Every password replacement is a token-version boundary.
      await tx.identityAccount.update({
        where: { id: input.accountId },
        data: { tokenVersion: { increment: 1 }, updatedAt: input.now },
      });
    });
  }

  async getCredential(
    accountId: UserId,
  ): Promise<{ passwordHash: string; paramsVersion: number } | null> {
    const row = await this.scope.bootstrap.passwordCredential.findUnique({
      where: { accountId },
    });
    return row === null
      ? null
      : { passwordHash: row.passwordHash, paramsVersion: row.paramsVersion };
  }
}

interface CodeRow {
  readonly id: string;
  readonly accountId: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

function toCodeRecord(row: CodeRow): OneTimeCodeRecord {
  return {
    id: row.id,
    accountId: UserId.of(row.accountId),
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaVerificationStore implements VerificationRepository {
  constructor(private readonly scope: IdentityPrismaScope) {}

  async create(record: OneTimeCodeRecord): Promise<void> {
    await this.scope.bootstrap.emailVerification.create({
      data: {
        id: record.id,
        accountId: record.accountId,
        codeHash: record.codeHash,
        expiresAt: record.expiresAt,
        attempts: record.attempts,
        maxAttempts: record.maxAttempts,
        consumedAt: record.consumedAt,
        createdAt: record.createdAt,
      },
    });
  }

  async latestActive(accountId: UserId, now: Date): Promise<OneTimeCodeRecord | null> {
    const row = await this.scope.bootstrap.emailVerification.findFirst({
      where: { accountId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    return row === null ? null : toCodeRecord(row);
  }

  async latestCreatedAt(accountId: UserId): Promise<Date | null> {
    const row = await this.scope.bootstrap.emailVerification.findFirst({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async recordFailedAttempt(id: string): Promise<void> {
    await this.scope.bootstrap.emailVerification.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async consume(id: string, now: Date): Promise<void> {
    await this.scope.bootstrap.emailVerification.update({
      where: { id },
      data: { consumedAt: now },
    });
  }
}

export class PrismaResetRequestStore implements ResetRequestRepository {
  constructor(private readonly scope: IdentityPrismaScope) {}

  async create(
    record: OneTimeCodeRecord & { readonly requestedIpDigest: string | null },
  ): Promise<void> {
    await this.scope.bootstrap.passwordResetRequest.create({
      data: {
        id: record.id,
        accountId: record.accountId,
        codeHash: record.codeHash,
        expiresAt: record.expiresAt,
        attempts: record.attempts,
        maxAttempts: record.maxAttempts,
        consumedAt: record.consumedAt,
        requestedIpDigest: record.requestedIpDigest,
        createdAt: record.createdAt,
      },
    });
  }

  async findByCodeHash(codeHash: string): Promise<OneTimeCodeRecord | null> {
    const row = await this.scope.bootstrap.passwordResetRequest.findUnique({
      where: { codeHash },
    });
    return row === null ? null : toCodeRecord(row);
  }

  async latestCreatedAt(accountId: UserId): Promise<Date | null> {
    const row = await this.scope.bootstrap.passwordResetRequest.findFirst({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async recordFailedAttempt(id: string): Promise<void> {
    await this.scope.bootstrap.passwordResetRequest.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async consume(id: string, accountId: UserId, now: Date): Promise<void> {
    await this.scope.withAccount(accountId, async (tx) => {
      await tx.passwordResetRequest.update({ where: { id }, data: { consumedAt: now } });
    });
  }
}
