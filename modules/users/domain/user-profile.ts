/**
 * The user profile aggregate: presentation identity (display name, locale)
 * and account-status intent. Deliberately minimal PII — Phase 3 approves
 * exactly two subject-editable fields, display name and locale; everything
 * else (names, phones, addresses) is deferred until a capability needs it and
 * declares its lifecycle. No speculative fields.
 *
 * `userId` IS the platform `UserId` — the identity module's account id
 * (Phase 3 contract). `residencyJurisdictionRef` is a typed UNRESOLVED
 * reference: Phase 3.5's policy machinery resolves it; nothing here
 * interprets it.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';
import { Result } from '@karar/shared-kernel';

export const USER_STATUSES = [
  'ACTIVE',
  'DISABLE_REQUESTED',
  'DISABLED',
  'DELETION_REQUESTED',
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * The status machine of the disable/deletion-request FOUNDATION. Phase 3
 * records intent (ACTIVE → *_REQUESTED) and nothing acts on it yet: the
 * machinery that disables sessions, runs erasure, or restores an account is a
 * later phase, and it will move through these same transitions — never around
 * them. Terminal-for-now states have no outgoing edges on purpose.
 */
const STATUS_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = Object.freeze({
  ACTIVE: ['DISABLE_REQUESTED', 'DELETION_REQUESTED'],
  DISABLE_REQUESTED: ['DISABLED', 'ACTIVE'],
  DISABLED: [],
  DELETION_REQUESTED: [],
});

export function canTransitionUserStatus(from: UserStatus, to: UserStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export interface UserProfile {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly displayName: string;
  readonly locale: string;
  readonly status: UserStatus;
  readonly residencyJurisdictionRef: string | null;
  readonly contractingOperatingEntityId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One recorded status transition (append-only evidence). */
export interface UserStatusChange {
  readonly id: string;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly fromStatus: UserStatus;
  readonly toStatus: UserStatus;
  readonly reason: string | null;
  readonly actor: string;
  readonly occurredAt: Date;
}

export interface ProfileFieldViolation {
  readonly field: 'displayName' | 'locale';
  readonly message: string;
}

const MAX_DISPLAY_NAME_LENGTH = 120;
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const LOCALE_SHAPE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;

/** Trims and validates a display name; the trimmed value is what is stored. */
export function parseDisplayName(raw: string): Result<string, ProfileFieldViolation> {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return Result.err({ field: 'displayName', message: 'display name must not be empty' });
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return Result.err({
      field: 'displayName',
      message: `display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
    });
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return Result.err({
      field: 'displayName',
      message: 'display name must not contain control characters',
    });
  }
  return Result.ok(trimmed);
}

/** BCP-47-shaped language tag, primary subtag lowercase: 'ar', 'ar-QA', 'en-US'. */
export function parseLocale(raw: string): Result<string, ProfileFieldViolation> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!LOCALE_SHAPE.test(value)) {
    return Result.err({
      field: 'locale',
      message: "locale must be a BCP-47-shaped tag such as 'ar', 'ar-QA', or 'en-US'",
    });
  }
  return Result.ok(value);
}
