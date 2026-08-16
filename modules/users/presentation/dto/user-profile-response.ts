/**
 * Wire shapes for the users surface (mirrored by
 * packages/api-contracts/openapi/paths/users.yaml). Dates travel as ISO-8601
 * strings; identifiers as plain UUID strings.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import type { UserProfile, UserStatusChange } from '../../domain/user-profile.js';

export interface UserProfileResponse {
  readonly userId: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly locale: string;
  readonly status: string;
  readonly residencyJurisdictionRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toUserProfileResponse(profile: UserProfile): UserProfileResponse {
  return {
    userId: UserId.toString(profile.userId),
    tenantId: TenantId.toString(profile.tenantId),
    displayName: profile.displayName,
    locale: profile.locale,
    status: profile.status,
    residencyJurisdictionRef: profile.residencyJurisdictionRef,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export interface DisableRequestedResponse {
  readonly status: string;
  readonly requestedAt: string;
  /** False when the state change committed but the audit append failed. */
  readonly auditRecorded: boolean;
}

export function toDisableRequestedResponse(
  change: UserStatusChange,
  auditRecorded: boolean,
): DisableRequestedResponse {
  return {
    status: change.toStatus,
    requestedAt: change.occurredAt.toISOString(),
    auditRecorded,
  };
}
