/**
 * InvitationRepository — invitation persistence, split across the two
 * privilege contexts the flow legitimately has (the RLS-04 lesson;
 * migration 0044):
 *
 * - Tenant context (`PrincipalActor`): create and revoke, inside the
 *   creator's own tenant, under the 0043 tenant policies.
 * - Redeemer context (`RedeemerActor` + token hash): lookup and
 *   attempt-counting for an authenticated NON-member. Implementations bind
 *   sha256(presented token) into the transaction-local
 *   `app.invitation_token_hash` GUC, and the 0044 policies expose exactly
 *   the one row that token identifies — no tenant context, no elevation.
 * - `redeem` runs in the redeemer's principal context with the tenant taken
 *   from the INVITATION ROW, performs exactly the writes redemption needs
 *   (the one-time conditional UPDATE and the membership INSERT), and returns
 *   privilege evidence — the transaction's actual GUCs and role — which
 *   implementations MUST verify (fail closed) and tests assert.
 */

import type { UserId } from '@karar/shared-kernel';

import type { PrincipalActor, RedeemerActor } from '../principal.js';
import type { TenantInvitation, TenantMembership } from '../../domain/tenancy.js';

export interface CreateInvitationRecord {
  readonly email: string;
  readonly tokenHash: string;
  readonly roleHint: string;
  readonly expiresAt: Date;
  readonly maxAttempts: number;
  readonly occurredAt: Date;
}

/** What the redemption transaction actually ran as — asserted, never assumed. */
export interface RedemptionPrivilegeEvidence {
  readonly tenantGuc: string;
  readonly userGuc: string;
  readonly roleName: string;
  readonly bypassRls: boolean;
  readonly superuser: boolean;
}

export type RedemptionOutcome =
  | {
      readonly kind: 'redeemed';
      readonly membership: TenantMembership;
      readonly privilegeEvidence: RedemptionPrivilegeEvidence;
    }
  | { readonly kind: 'already_member' }
  /** The one-time UPDATE matched nothing — redeemed/revoked/expired meanwhile. */
  | { readonly kind: 'lost_race' };

/** Thrown (defect, fail closed) when the redemption transaction's actual GUCs or role are not the narrow ones. */
export class RedemptionPrivilegeViolation extends Error {
  override readonly name = 'RedemptionPrivilegeViolation';
}

export interface InvitationRepository {
  /** Tenant context: create an invitation in the creator's own tenant. */
  createForTenant(
    actor: PrincipalActor,
    record: CreateInvitationRecord,
  ): Promise<TenantInvitation>;

  /**
   * Tenant context: one-time revocation (UPDATE ... WHERE revoked_at IS NULL
   * AND redeemed_at IS NULL). Null when nothing matched — unknown id, another
   * tenant's invitation, or already terminal; indistinguishable on purpose.
   */
  revoke(actor: PrincipalActor, invitationId: string, at: Date): Promise<TenantInvitation | null>;

  /** Redeemer context: the single invitation the presented token identifies, or null. */
  findByTokenHash(redeemer: RedeemerActor, tokenHash: string): Promise<TenantInvitation | null>;

  /** Redeemer context: count a failed redemption attempt on that row. */
  recordFailedAttempt(redeemer: RedeemerActor, tokenHash: string, at: Date): Promise<boolean>;

  /**
   * Redeemer principal context (tenant from the invitation row): the one-time
   * redemption UPDATE plus the membership INSERT binding `redeemedBy`/the new
   * membership to the AUTHENTICATED redeemer, atomically.
   */
  redeem(
    redeemer: RedeemerActor,
    invitation: TenantInvitation,
    params: { readonly occurredAt: Date },
  ): Promise<RedemptionOutcome>;

  /** Tenant context: redemption evidence read-back (redeemed_by must be a member the caller can see). */
  findRedeemedBy(actor: PrincipalActor, invitationId: string): Promise<UserId | null>;
}
