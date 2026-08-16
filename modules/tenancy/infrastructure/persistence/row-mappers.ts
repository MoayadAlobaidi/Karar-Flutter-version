/**
 * Row → domain mapping for the tenancy tables. Prisma rows stay in
 * infrastructure; unknown enum values are a store defect and throw. The
 * invitation mapper DROPS token_hash — the hash never leaves persistence
 * code, and the raw token never entered it.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  MEMBERSHIP_STATES,
  TENANT_STATUSES,
  TENANT_TYPES,
  type MembershipState,
  type Tenant,
  type TenantInvitation,
  type TenantMembership,
  type TenantStatus,
  type TenantType,
} from '../../domain/tenancy.js';

export class TenancyStoreError extends Error {
  override readonly name = 'TenancyStoreError';
}

function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new TenancyStoreError(`${what} holds unknown value '${value}'`);
  }
  return value as T;
}

interface TenantRow {
  id: string;
  type: string;
  name: string;
  status: string;
  defaultOperatingEntityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toTenant(row: TenantRow): Tenant {
  return Object.freeze({
    id: TenantId.of(row.id),
    type: oneOf<TenantType>(row.type, TENANT_TYPES, 'tenants.type'),
    name: row.name,
    status: oneOf<TenantStatus>(row.status, TENANT_STATUSES, 'tenants.status'),
    defaultOperatingEntityId: row.defaultOperatingEntityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

interface MemberRow {
  id: string;
  tenantId: string;
  userId: string;
  roleHint: string;
  state: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toMembership(row: MemberRow): TenantMembership {
  return Object.freeze({
    id: row.id,
    tenantId: TenantId.of(row.tenantId),
    userId: UserId.of(row.userId),
    roleHint: row.roleHint,
    state: oneOf<MembershipState>(row.state, MEMBERSHIP_STATES, 'tenant_members.state'),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

interface InvitationRow {
  id: string;
  tenantId: string;
  email: string;
  roleHint: string;
  expiresAt: Date;
  redeemedAt: Date | null;
  redeemedBy: string | null;
  revokedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toInvitation(row: InvitationRow): TenantInvitation {
  return Object.freeze({
    id: row.id,
    tenantId: TenantId.of(row.tenantId),
    email: row.email,
    roleHint: row.roleHint,
    expiresAt: row.expiresAt,
    redeemedAt: row.redeemedAt,
    redeemedBy: row.redeemedBy === null ? null : UserId.of(row.redeemedBy),
    revokedAt: row.revokedAt,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    createdBy: UserId.of(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
