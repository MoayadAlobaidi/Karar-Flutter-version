/**
 * Prisma adapter for sessions, families, and refresh tokens
 * (SessionRepository). The one-time rotation claim is raw SQL on purpose:
 * `UPDATE … WHERE used_at IS NULL RETURNING id` is the atomic statement the
 * concurrency guarantee rests on — of two concurrent presentations, the
 * loser blocks on the row lock, re-evaluates, matches zero rows, and lands
 * on the reuse path.
 */

import { UserId } from '@karar/shared-kernel';

import type {
  RefreshTokenFamily,
  RefreshTokenFamilyId,
  RefreshTokenId,
  RefreshTokenRecord,
  RevocationReason,
  Session,
  SessionId,
} from '../../domain/session.js';
import type {
  NewSessionBundle,
  PresentedRefreshToken,
  SessionRepository,
} from '../../application/ports/identity-repositories.js';
import { IdentityPrismaScope, type PrismaTx } from './prisma-scope.js';

interface SessionRow {
  readonly id: string;
  readonly accountId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly idleExpiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
  readonly ipDigest: string | null;
  readonly userAgentSummary: string | null;
  readonly tenantBinding: string | null;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id as SessionId,
    accountId: UserId.of(row.accountId),
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    idleExpiresAt: row.idleExpiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    ipDigest: row.ipDigest,
    userAgentSummary: row.userAgentSummary,
    tenantBinding: row.tenantBinding,
  };
}

export class PrismaSessionStore implements SessionRepository {
  constructor(private readonly scope: IdentityPrismaScope) {}

  async createSession(bundle: NewSessionBundle): Promise<void> {
    const { session, family, firstToken } = bundle;
    await this.scope.withAccount(session.accountId, async (tx) => {
      await tx.session.create({
        data: {
          id: session.id,
          accountId: session.accountId,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          idleExpiresAt: session.idleExpiresAt,
          ipDigest: session.ipDigest,
          userAgentSummary: session.userAgentSummary,
          tenantBinding: session.tenantBinding,
        },
      });
      await tx.refreshTokenFamily.create({
        data: {
          id: family.id,
          sessionId: family.sessionId,
          accountId: family.accountId,
          createdAt: family.createdAt,
        },
      });
      await tx.refreshToken.create({
        data: {
          id: firstToken.id,
          familyId: firstToken.familyId,
          tokenHash: firstToken.tokenHash,
          createdAt: firstToken.createdAt,
          expiresAt: firstToken.expiresAt,
        },
      });
    });
  }

  async findSession(accountId: UserId, sessionId: SessionId): Promise<Session | null> {
    return this.scope.withAccount(accountId, async (tx) => {
      const row = await tx.session.findUnique({ where: { id: sessionId } });
      return row === null ? null : toSession(row);
    });
  }

  async listSessions(accountId: UserId): Promise<readonly Session[]> {
    return this.scope.withAccount(accountId, async (tx) => {
      const rows = await tx.session.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toSession);
    });
  }

  async touchSession(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly now: Date;
    readonly idleExpiresAt: Date | null;
  }): Promise<void> {
    await this.scope.withAccount(input.accountId, async (tx) => {
      await tx.session.updateMany({
        where: { id: input.sessionId, revokedAt: null },
        data: { lastSeenAt: input.now, idleExpiresAt: input.idleExpiresAt },
      });
    });
  }

  async revokeSession(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly reason: RevocationReason;
    readonly now: Date;
  }): Promise<boolean> {
    return this.scope.withAccount(input.accountId, async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: input.sessionId, accountId: input.accountId, revokedAt: null },
        data: { revokedAt: input.now, revokedReason: input.reason },
      });
      if (revoked.count === 0) return false;
      await this.revokeFamiliesOfSessions(tx, [input.sessionId], input.reason, input.now);
      return true;
    });
  }

  async revokeAllSessions(input: {
    readonly accountId: UserId;
    readonly reason: RevocationReason;
    readonly now: Date;
    readonly exceptSessionId?: SessionId;
  }): Promise<number> {
    return this.scope.withAccount(input.accountId, async (tx) => {
      const targets = await tx.session.findMany({
        where: {
          accountId: input.accountId,
          revokedAt: null,
          ...(input.exceptSessionId !== undefined ? { id: { not: input.exceptSessionId } } : {}),
        },
        select: { id: true },
      });
      if (targets.length === 0) return 0;
      const ids = targets.map((row) => row.id);
      await tx.session.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: input.now, revokedReason: input.reason },
      });
      await this.revokeFamiliesOfSessions(tx, ids, input.reason, input.now);
      return ids.length;
    });
  }

  async setTenantBinding(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly tenantBinding: string;
    readonly now: Date;
  }): Promise<'bound' | 'not_bindable'> {
    return this.scope.withAccount(input.accountId, async (tx) => {
      // Atomic first-bind claim: only a LIVE, still-unbound row matches — of
      // two concurrent binds exactly one sees a row; a bound or revoked
      // session matches zero (switch is the other path).
      const claimed = await tx.session.updateMany({
        where: {
          id: input.sessionId,
          accountId: input.accountId,
          revokedAt: null,
          tenantBinding: null,
        },
        data: { tenantBinding: input.tenantBinding },
      });
      return claimed.count === 1 ? 'bound' : 'not_bindable';
    });
  }

  async rebindSession(input: {
    readonly accountId: UserId;
    readonly oldSessionId: SessionId;
    readonly reason: RevocationReason;
    readonly bundle: NewSessionBundle;
    readonly now: Date;
  }): Promise<'rebound' | 'stale_session'> {
    const { session, family, firstToken } = input.bundle;
    return this.scope.withAccount(input.accountId, async (tx) => {
      // ONE transaction: revoke the old session (guarded — a concurrently
      // revoked session writes nothing at all), revoke its families, insert
      // the replacement bundle. No interleaving observes two live sessions
      // or a live session with a half-switched binding.
      const revoked = await tx.session.updateMany({
        where: { id: input.oldSessionId, accountId: input.accountId, revokedAt: null },
        data: { revokedAt: input.now, revokedReason: input.reason },
      });
      if (revoked.count === 0) return 'stale_session';
      await this.revokeFamiliesOfSessions(tx, [input.oldSessionId], input.reason, input.now);
      await tx.session.create({
        data: {
          id: session.id,
          accountId: session.accountId,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          idleExpiresAt: session.idleExpiresAt,
          ipDigest: session.ipDigest,
          userAgentSummary: session.userAgentSummary,
          tenantBinding: session.tenantBinding,
        },
      });
      await tx.refreshTokenFamily.create({
        data: {
          id: family.id,
          sessionId: family.sessionId,
          accountId: family.accountId,
          createdAt: family.createdAt,
        },
      });
      await tx.refreshToken.create({
        data: {
          id: firstToken.id,
          familyId: firstToken.familyId,
          tokenHash: firstToken.tokenHash,
          createdAt: firstToken.createdAt,
          expiresAt: firstToken.expiresAt,
        },
      });
      return 'rebound';
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PresentedRefreshToken | null> {
    // Bootstrap read: token and family carry pre-auth SELECT arms; the
    // session does NOT, so it is read afterwards inside the account scope
    // the family names (rls-allow-list.json).
    const row = await this.scope.bootstrap.refreshToken.findUnique({
      where: { tokenHash },
      include: { family: true },
    });
    if (row === null) return null;
    const family: RefreshTokenFamily = {
      id: row.family.id as RefreshTokenFamilyId,
      sessionId: row.family.sessionId as SessionId,
      accountId: UserId.of(row.family.accountId),
      createdAt: row.family.createdAt,
      revokedAt: row.family.revokedAt,
      revokedReason: row.family.revokedReason,
    };
    const token: RefreshTokenRecord = {
      id: row.id as RefreshTokenId,
      familyId: row.familyId as RefreshTokenFamilyId,
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      supersededBy: (row.supersededBy as RefreshTokenId | null) ?? null,
    };
    const session = await this.findSession(family.accountId, family.sessionId);
    if (session === null) return null;
    return { token, family, session };
  }

  async rotateToken(input: {
    readonly accountId: UserId;
    readonly presentedTokenId: string;
    readonly successor: RefreshTokenRecord;
    readonly now: Date;
  }): Promise<'rotated' | 'already_used'> {
    return this.scope.withAccount(input.accountId, async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.refresh_tokens
           SET used_at = ${input.now}
         WHERE id = ${input.presentedTokenId}::uuid
           AND used_at IS NULL
        RETURNING id`;
      if (claimed.length === 0) return 'already_used';
      await tx.refreshToken.create({
        data: {
          id: input.successor.id,
          familyId: input.successor.familyId,
          tokenHash: input.successor.tokenHash,
          createdAt: input.successor.createdAt,
          expiresAt: input.successor.expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: input.presentedTokenId },
        data: { supersededBy: input.successor.id },
      });
      return 'rotated';
    });
  }

  async revokeFamilyAndSession(input: {
    readonly accountId: UserId;
    readonly familyId: string;
    readonly sessionId: SessionId;
    readonly reason: RevocationReason;
    readonly now: Date;
  }): Promise<void> {
    await this.scope.withAccount(input.accountId, async (tx) => {
      await tx.refreshTokenFamily.updateMany({
        where: { id: input.familyId, revokedAt: null },
        data: { revokedAt: input.now, revokedReason: input.reason },
      });
      await tx.session.updateMany({
        where: { id: input.sessionId, revokedAt: null },
        data: { revokedAt: input.now, revokedReason: input.reason },
      });
    });
  }

  private async revokeFamiliesOfSessions(
    tx: PrismaTx,
    sessionIds: readonly string[],
    reason: RevocationReason,
    now: Date,
  ): Promise<void> {
    await tx.refreshTokenFamily.updateMany({
      where: { sessionId: { in: [...sessionIds] }, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }
}
