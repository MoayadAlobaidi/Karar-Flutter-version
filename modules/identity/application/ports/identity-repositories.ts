/**
 * Persistence ports, declared inward (clean-architecture.md; architecture
 * test 5). One file because the ports share the module's domain vocabulary;
 * the Prisma adapter under infrastructure/persistence implements them all.
 *
 * TRANSACTION-SCOPE CONTRACT (the RLS half of every signature): methods
 * taking an `accountId` scope run inside a transaction whose `app.user_id`
 * GUC is set to that account — the FORCEd policies of migrations 0030-0033
 * make an unscoped touch return nothing rather than something wrong. Methods
 * documented "bootstrap" run without a principal context and exist only for
 * the pre-authentication window (see db/rls-allow-list.json).
 */

import type { UserId } from '@karar/shared-kernel';

import type { AccountStatus, IdentityAccount } from '../../domain/identity-account.js';
import type { MfaEnrolment } from '../../domain/mfa.js';
import type {
  RefreshTokenFamily,
  RefreshTokenRecord,
  RevocationReason,
  Session,
  SessionId,
} from '../../domain/session.js';

// --- accounts and credentials ---------------------------------------------

export interface NewAccount {
  readonly id: UserId;
  readonly email: string;
  readonly passwordHash: string;
  readonly paramsVersion: number;
  readonly now: Date;
}

export interface AccountRepository {
  /** Bootstrap. Duplicate e-mail is an EXPECTED outcome (enumeration resistance). */
  createWithCredential(account: NewAccount): Promise<'created' | 'duplicate_email'>;
  /** Bootstrap: the lookup that begins login/verification/reset. */
  findByEmail(normalizedEmail: string): Promise<IdentityAccount | null>;
  /** Owner-scoped. */
  findById(accountId: UserId): Promise<IdentityAccount | null>;
  /** Bootstrap (verification is pre-auth). Idempotent. */
  markEmailVerified(accountId: UserId, now: Date): Promise<void>;
  /** Owner-scoped. Also bumps token_version when `bumpTokenVersion`. */
  setStatus(input: {
    readonly accountId: UserId;
    readonly status: AccountStatus;
    readonly reason: string | null;
    readonly bumpTokenVersion: boolean;
    readonly now: Date;
  }): Promise<void>;
  /** Owner-scoped (or bootstrap during reset): replace hash, bump token_version. */
  replacePassword(input: {
    readonly accountId: UserId;
    readonly passwordHash: string;
    readonly paramsVersion: number;
    readonly now: Date;
  }): Promise<void>;
  /** Bootstrap (login). Null when the account has no password credential. */
  getCredential(accountId: UserId): Promise<{ passwordHash: string; paramsVersion: number } | null>;
}

// --- one-time codes --------------------------------------------------------

export interface OneTimeCodeRecord {
  readonly id: string;
  readonly accountId: UserId;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

export interface VerificationRepository {
  /** Bootstrap. */
  create(record: OneTimeCodeRecord): Promise<void>;
  /** Bootstrap: newest unconsumed, unexpired code for the account. */
  latestActive(accountId: UserId, now: Date): Promise<OneTimeCodeRecord | null>;
  /** Bootstrap: newest created_at regardless of state (resend cooldown). */
  latestCreatedAt(accountId: UserId): Promise<Date | null>;
  /** Bootstrap. */
  recordFailedAttempt(id: string): Promise<void>;
  /** Bootstrap. */
  consume(id: string, now: Date): Promise<void>;
}

export interface ResetRequestRepository {
  /** Bootstrap. */
  create(record: OneTimeCodeRecord & { readonly requestedIpDigest: string | null }): Promise<void>;
  /** Bootstrap: exact lookup by HMAC digest of the presented token. */
  findByCodeHash(codeHash: string): Promise<OneTimeCodeRecord | null>;
  /** Bootstrap. */
  latestCreatedAt(accountId: UserId): Promise<Date | null>;
  /** Bootstrap. */
  recordFailedAttempt(id: string): Promise<void>;
  /** Account-scoped (runs inside the reset transaction). */
  consume(id: string, accountId: UserId, now: Date): Promise<void>;
}

// --- sessions and refresh tokens ------------------------------------------

export interface NewSessionBundle {
  readonly session: Session;
  readonly family: RefreshTokenFamily;
  readonly firstToken: RefreshTokenRecord;
}

/** The pre-auth view a presented refresh token resolves to. */
export interface PresentedRefreshToken {
  readonly token: RefreshTokenRecord;
  readonly family: RefreshTokenFamily;
  readonly session: Session;
}

export interface SessionRepository {
  /** Owner-scoped: one transaction inserting session + family + first token. */
  createSession(bundle: NewSessionBundle): Promise<void>;
  /** Owner-scoped. */
  findSession(accountId: UserId, sessionId: SessionId): Promise<Session | null>;
  /** Owner-scoped: active-first listing for the session surface. */
  listSessions(accountId: UserId): Promise<readonly Session[]>;
  /** Owner-scoped: last_seen (+ rolling idle expiry when configured). */
  touchSession(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly now: Date;
    readonly idleExpiresAt: Date | null;
  }): Promise<void>;
  /** Owner-scoped: revoke one session and its families. False when no live match. */
  revokeSession(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly reason: RevocationReason;
    readonly now: Date;
  }): Promise<boolean>;
  /** Owner-scoped: revoke all live sessions (+families), optionally sparing one. Returns revoked count. */
  revokeAllSessions(input: {
    readonly accountId: UserId;
    readonly reason: RevocationReason;
    readonly now: Date;
    readonly exceptSessionId?: SessionId;
  }): Promise<number>;
  /** Bootstrap: resolve a presented token hash to its token+family+session. */
  findByTokenHash(tokenHash: string): Promise<PresentedRefreshToken | null>;
  /**
   * Owner-scoped, ATOMIC one-time claim: marks the token used and records its
   * successor iff it was still unused (`UPDATE … WHERE used_at IS NULL`).
   * 'already_used' is the reuse-detection signal — of two concurrent
   * presentations exactly one gets 'rotated'.
   */
  rotateToken(input: {
    readonly accountId: UserId;
    readonly presentedTokenId: string;
    readonly successor: RefreshTokenRecord;
    readonly now: Date;
  }): Promise<'rotated' | 'already_used'>;
  /** Owner-scoped: revoke a family and its session (reuse response). */
  revokeFamilyAndSession(input: {
    readonly accountId: UserId;
    readonly familyId: string;
    readonly sessionId: SessionId;
    readonly reason: RevocationReason;
    readonly now: Date;
  }): Promise<void>;
}

// --- MFA -------------------------------------------------------------------

export interface MfaRepository {
  /** Owner-scoped. */
  getEnrolment(accountId: UserId): Promise<MfaEnrolment | null>;
  /** Owner-scoped: create or replace the (single) enrolment row, unconfirmed. */
  saveEnrolment(enrolment: MfaEnrolment): Promise<void>;
  /** Owner-scoped. */
  confirmEnrolment(accountId: UserId, now: Date): Promise<void>;
  /** Owner-scoped: disable and delete every recovery code. */
  disableEnrolment(accountId: UserId, now: Date): Promise<void>;
  /** Owner-scoped: replace the full recovery-code set. */
  replaceRecoveryCodes(
    accountId: UserId,
    codes: ReadonlyArray<{ readonly id: string; readonly codeHash: string; readonly createdAt: Date }>,
  ): Promise<void>;
  /** Owner-scoped, ATOMIC one-time claim of a recovery code by hash. */
  consumeRecoveryCode(accountId: UserId, codeHash: string, now: Date): Promise<boolean>;
  /** Owner-scoped. */
  countUnusedRecoveryCodes(accountId: UserId): Promise<number>;
}
