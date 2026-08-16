/**
 * Wire shapes for the tenancy surface (mirrored by
 * packages/api-contracts/openapi/paths/tenancy.yaml). Dates are ISO-8601
 * strings; identifiers plain UUID strings. Invitation responses never carry
 * the token hash; the raw token appears exactly once, in the creation
 * response.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import type { Tenant, TenantInvitation, TenantMembership } from '../../domain/tenancy.js';

export interface TenantResponse {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly status: string;
  readonly createdAt: string;
}

export function toTenantResponse(tenant: Tenant): TenantResponse {
  return {
    id: TenantId.toString(tenant.id),
    type: tenant.type,
    name: tenant.name,
    status: tenant.status,
    createdAt: tenant.createdAt.toISOString(),
  };
}

export interface MembershipResponse {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly roleHint: string;
  readonly state: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export function toMembershipResponse(membership: TenantMembership): MembershipResponse {
  return {
    id: membership.id,
    tenantId: TenantId.toString(membership.tenantId),
    userId: UserId.toString(membership.userId),
    roleHint: membership.roleHint,
    state: membership.state,
    effectiveFrom: membership.effectiveFrom.toISOString(),
    effectiveTo: membership.effectiveTo === null ? null : membership.effectiveTo.toISOString(),
  };
}

export interface InvitationResponse {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly roleHint: string;
  readonly expiresAt: string;
  readonly redeemedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export function toInvitationResponse(invitation: TenantInvitation): InvitationResponse {
  return {
    id: invitation.id,
    tenantId: TenantId.toString(invitation.tenantId),
    email: invitation.email,
    roleHint: invitation.roleHint,
    expiresAt: invitation.expiresAt.toISOString(),
    redeemedAt: invitation.redeemedAt === null ? null : invitation.redeemedAt.toISOString(),
    revokedAt: invitation.revokedAt === null ? null : invitation.revokedAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}
