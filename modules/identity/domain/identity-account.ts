/**
 * The identity aggregate's shapes. `IdentityAccount.id` IS the platform
 * `UserId` (shared kernel): the contract with every other module is that no
 * second user identifier exists — audit actor refs, tenancy memberships, and
 * ownership columns all carry this value.
 */

import type { UserId } from '@karar/shared-kernel';

export const ACCOUNT_STATUSES = ['active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface IdentityAccount {
  readonly id: UserId;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly status: AccountStatus;
  readonly disabledReason: string | null;
  /** Admin-policy flag: this account MUST have MFA to authenticate fully. */
  readonly mfaRequired: boolean;
  /**
   * Monotone counter carried in access tokens as `tv`; bumping it makes every
   * outstanding access token stale at the next guard check. Bumped on
   * password change/reset, global revocation, and disable.
   */
  readonly tokenVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
