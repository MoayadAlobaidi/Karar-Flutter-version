/**
 * Tenancy domain: tenant kinds, membership states, and the invitation
 * redemption rules. Pure — time arrives as an argument, randomness (token
 * generation) lives behind an infrastructure port.
 *
 * The invitation's token NEVER appears here: the domain reasons about an
 * invitation's lifecycle, not its bearer secret. Only sha256(token) exists at
 * rest, and only infrastructure touches either form.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';
import { Result } from '@karar/shared-kernel';

export const TENANT_TYPES = ['FIRST_PARTY', 'WHITE_LABEL', 'INTERNAL'] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_STATES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export interface Tenant {
  readonly id: TenantId;
  readonly type: TenantType;
  readonly name: string;
  readonly status: TenantStatus;
  readonly defaultOperatingEntityId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TenantMembership {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** Informational only — authoritative roles live in the authorization module. */
  readonly roleHint: string;
  readonly state: MembershipState;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** An invitation as the domain sees it — the token hash deliberately absent. */
export interface TenantInvitation {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly email: string;
  readonly roleHint: string;
  readonly expiresAt: Date;
  readonly redeemedAt: Date | null;
  readonly redeemedBy: UserId | null;
  readonly revokedAt: Date | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Invitations match on the normalized form; storage holds the same. */
export function normalizeInvitationEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,24}$/;

export function isValidInvitationEmail(normalized: string): boolean {
  return normalized.length <= 320 && EMAIL_SHAPE.test(normalized);
}

/** role_hint vocabulary accepted at creation (informational; Layer 1 is authoritative). */
const ROLE_HINT_SHAPE = /^[A-Z][A-Z_]{0,39}$/;

export function isValidRoleHint(value: string): boolean {
  return ROLE_HINT_SHAPE.test(value);
}

export type RedemptionDenialReason =
  | 'revoked'
  | 'already_redeemed'
  | 'expired'
  | 'attempts_exhausted'
  | 'email_mismatch';

/**
 * The redemption gate, in denial-priority order. `redeemerEmail` is the
 * AUTHENTICATED redeemer's verified email as identity reports it — never a
 * client-supplied claim; null (no verified email) can match nothing.
 */
export function evaluateRedeemability(
  invitation: TenantInvitation,
  at: Date,
  redeemerEmail: string | null,
): Result<void, RedemptionDenialReason> {
  if (invitation.revokedAt !== null) {
    return Result.err('revoked');
  }
  if (invitation.redeemedAt !== null) {
    return Result.err('already_redeemed');
  }
  if (invitation.expiresAt.getTime() <= at.getTime()) {
    return Result.err('expired');
  }
  if (invitation.attempts >= invitation.maxAttempts) {
    return Result.err('attempts_exhausted');
  }
  if (redeemerEmail === null || normalizeInvitationEmail(redeemerEmail) !== invitation.email) {
    return Result.err('email_mismatch');
  }
  return Result.ok(undefined);
}
