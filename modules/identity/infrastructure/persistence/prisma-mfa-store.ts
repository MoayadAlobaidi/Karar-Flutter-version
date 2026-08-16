/**
 * Prisma adapter for MFA enrolments and recovery codes (MfaRepository).
 * Everything is owner-scoped — the tables carry no bootstrap arm. Recovery
 * consumption is the same atomic one-time claim shape as refresh rotation.
 */

import { UserId } from '@karar/shared-kernel';

import type { MfaEnrolment } from '../../domain/mfa.js';
import type { MfaRepository } from '../../application/ports/identity-repositories.js';
import { IdentityPrismaScope } from './prisma-scope.js';

export class PrismaMfaStore implements MfaRepository {
  constructor(private readonly scope: IdentityPrismaScope) {}

  async getEnrolment(accountId: UserId): Promise<MfaEnrolment | null> {
    return this.scope.withAccount(accountId, async (tx) => {
      const row = await tx.mfaEnrolment.findUnique({ where: { accountId } });
      if (row === null) return null;
      return {
        accountId: UserId.of(row.accountId),
        type: 'totp' as const,
        secretCiphertext: new Uint8Array(row.secretCiphertext),
        keyVersion: row.keyVersion,
        createdAt: row.createdAt,
        confirmedAt: row.confirmedAt,
        disabledAt: row.disabledAt,
      };
    });
  }

  async saveEnrolment(enrolment: MfaEnrolment): Promise<void> {
    // Re-back the bytes on a plain ArrayBuffer — Prisma's Bytes input type
    // rejects views over SharedArrayBuffer.
    const ciphertext = Uint8Array.from(enrolment.secretCiphertext);
    await this.scope.withAccount(enrolment.accountId, async (tx) => {
      await tx.mfaEnrolment.upsert({
        where: { accountId: enrolment.accountId },
        create: {
          accountId: enrolment.accountId,
          type: enrolment.type,
          secretCiphertext: ciphertext,
          keyVersion: enrolment.keyVersion,
          createdAt: enrolment.createdAt,
          confirmedAt: enrolment.confirmedAt,
          disabledAt: enrolment.disabledAt,
        },
        update: {
          secretCiphertext: ciphertext,
          keyVersion: enrolment.keyVersion,
          createdAt: enrolment.createdAt,
          confirmedAt: enrolment.confirmedAt,
          disabledAt: enrolment.disabledAt,
        },
      });
      // A fresh enrolment invalidates any earlier recovery codes.
      await tx.mfaRecoveryCode.deleteMany({ where: { accountId: enrolment.accountId } });
    });
  }

  async confirmEnrolment(accountId: UserId, now: Date): Promise<void> {
    await this.scope.withAccount(accountId, async (tx) => {
      await tx.mfaEnrolment.update({
        where: { accountId },
        data: { confirmedAt: now, disabledAt: null },
      });
    });
  }

  async disableEnrolment(accountId: UserId, now: Date): Promise<void> {
    await this.scope.withAccount(accountId, async (tx) => {
      await tx.mfaEnrolment.update({ where: { accountId }, data: { disabledAt: now } });
      await tx.mfaRecoveryCode.deleteMany({ where: { accountId } });
    });
  }

  async replaceRecoveryCodes(
    accountId: UserId,
    codes: ReadonlyArray<{
      readonly id: string;
      readonly codeHash: string;
      readonly createdAt: Date;
    }>,
  ): Promise<void> {
    await this.scope.withAccount(accountId, async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { accountId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({
          id: code.id,
          accountId,
          codeHash: code.codeHash,
          createdAt: code.createdAt,
        })),
      });
    });
  }

  async consumeRecoveryCode(accountId: UserId, codeHash: string, now: Date): Promise<boolean> {
    return this.scope.withAccount(accountId, async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.mfa_recovery_codes
           SET used_at = ${now}
         WHERE account_id = ${accountId}::uuid
           AND code_hash = ${codeHash}
           AND used_at IS NULL
        RETURNING id`;
      return claimed.length === 1;
    });
  }

  async countUnusedRecoveryCodes(accountId: UserId): Promise<number> {
    return this.scope.withAccount(accountId, (tx) =>
      tx.mfaRecoveryCode.count({ where: { accountId, usedAt: null } }),
    );
  }
}
