/**
 * Session and refresh-token shapes. Sessions are server-side state, revocable
 * and never held in process memory (access-control.md §7; legacy AUTHN-16).
 * Refresh tokens are one-time: rotation marks the presented row used and
 * mints a successor linked through `supersededBy`, so a family's lineage is
 * reconstructible and a replayed token is recognizable as theft evidence.
 */

import type { UserId } from '@karar/shared-kernel';

export type SessionId = string & { readonly __brand: 'SessionId' };
export type RefreshTokenFamilyId = string & { readonly __brand: 'RefreshTokenFamilyId' };
export type RefreshTokenId = string & { readonly __brand: 'RefreshTokenId' };

export interface Session {
  readonly id: SessionId;
  readonly accountId: UserId;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly absoluteExpiresAt: Date;
  /** Null = idle expiry disabled (the default). */
  readonly idleExpiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
  /** HMAC digest of the client address — never a raw address. */
  readonly ipDigest: string | null;
  /** Coarse family/os summary — never a raw user agent. */
  readonly userAgentSummary: string | null;
  readonly tenantBinding: string | null;
}

export interface RefreshTokenFamily {
  readonly id: RefreshTokenFamilyId;
  readonly sessionId: SessionId;
  readonly accountId: UserId;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
}

export interface RefreshTokenRecord {
  readonly id: RefreshTokenId;
  readonly familyId: RefreshTokenFamilyId;
  /** SHA-256 hex of the presented token — the raw token never persists. */
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly supersededBy: RefreshTokenId | null;
}

/** Why a session or family stopped being valid; stored in revoked_reason. */
export const REVOCATION_REASONS = [
  'logout',
  'revoked_by_owner',
  'revoked_other_sessions',
  'password_changed',
  'password_reset',
  'refresh_reuse_detected',
  'account_disabled',
  'global_revocation',
] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number];

export function isSessionLive(session: Session, now: Date): boolean {
  if (session.revokedAt !== null) return false;
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) return false;
  if (session.idleExpiresAt !== null && session.idleExpiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}
