/**
 * TenantCapabilityEntitlementRepository over Prisma — every statement inside
 * the platform's `withPrincipalContext` transaction: RLS on
 * tenant_capability_entitlements is ENABLEd + FORCEd on the tenant GUC, so a
 * call without a bound principal returns and affects nothing (fail closed).
 * The repository still WHERE-filters by tenant — defence in depth that
 * catches honest mistakes early; RLS is the boundary.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { TenantId } from '@karar/shared-kernel';

import {
  isEntitlementStatus,
  type EntitlementStatus,
  type TenantCapabilityEntitlement,
} from '../../domain/entitlement.js';
import type { EntitlementFacts } from '../../domain/resolution.js';
import type {
  EntitlementPrincipal,
  TenantCapabilityEntitlementRepository,
} from '../../application/ports/entitlement-repository.js';

interface EntitlementRow {
  readonly id: string;
  readonly tenantId: string;
  readonly capabilityId: string;
  readonly status: string;
  readonly sourceRef: string;
  readonly reason: string;
  readonly actorRef: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly version: number;
}

export class PrismaTenantCapabilityEntitlementRepository
  implements TenantCapabilityEntitlementRepository
{
  constructor(private readonly handle: PrismaHandle) {}

  private run<T>(
    principal: EntitlementPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async factsFor(
    principal: EntitlementPrincipal,
    capabilityId: string,
  ): Promise<EntitlementFacts> {
    const entitlement = await this.findByCapability(principal, capabilityId);
    if (entitlement === null) return { kind: 'NONE' };
    return {
      kind: 'ROW',
      rowId: entitlement.id,
      status: entitlement.status,
      effectiveFrom: entitlement.effectiveFrom,
      effectiveTo: entitlement.effectiveTo,
      version: entitlement.version,
    };
  }

  async findByCapability(
    principal: EntitlementPrincipal,
    capabilityId: string,
  ): Promise<TenantCapabilityEntitlement | null> {
    return this.run(principal, async (tx) => {
      const row: EntitlementRow | null = await tx.tenantCapabilityEntitlement.findFirst({
        where: { tenantId: principal.tenantId, capabilityId },
      });
      return row === null ? null : toEntitlement(row);
    });
  }

  async insert(
    principal: EntitlementPrincipal,
    entitlement: TenantCapabilityEntitlement,
    at: Date,
  ): Promise<void> {
    await this.run(principal, async (tx) => {
      await tx.tenantCapabilityEntitlement.create({
        data: {
          id: entitlement.id,
          tenantId: entitlement.tenantId,
          capabilityId: entitlement.capabilityId,
          status: entitlement.status,
          sourceRef: entitlement.sourceRef,
          reason: entitlement.reason,
          actorRef: entitlement.actorRef,
          effectiveFrom: entitlement.effectiveFrom,
          effectiveTo: entitlement.effectiveTo,
          version: entitlement.version,
          updatedAt: at,
        },
      });
    });
  }

  async transition(
    principal: EntitlementPrincipal,
    id: string,
    expectedVersion: number,
    change: {
      readonly status: EntitlementStatus;
      readonly sourceRef: string;
      readonly reason: string;
      readonly actorRef: string;
      readonly effectiveFrom: Date;
      readonly effectiveTo: Date | null;
    },
    at: Date,
  ): Promise<'UPDATED' | 'VERSION_CONFLICT'> {
    void at; // updated_at is maintained by the schema's guard trigger
    return this.run(principal, async (tx) => {
      const updated = await tx.tenantCapabilityEntitlement.updateMany({
        where: { id, tenantId: principal.tenantId, version: expectedVersion },
        data: {
          status: change.status,
          sourceRef: change.sourceRef,
          reason: change.reason,
          actorRef: change.actorRef,
          effectiveFrom: change.effectiveFrom,
          effectiveTo: change.effectiveTo,
          version: expectedVersion + 1,
        },
      });
      return updated.count === 1 ? 'UPDATED' : 'VERSION_CONFLICT';
    });
  }
}

function toEntitlement(row: EntitlementRow): TenantCapabilityEntitlement {
  return {
    id: row.id,
    tenantId: row.tenantId as TenantId,
    capabilityId: row.capabilityId,
    status: parseStatus(row.status),
    sourceRef: row.sourceRef,
    reason: row.reason,
    actorRef: row.actorRef,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    version: row.version,
  };
}

function parseStatus(value: string): EntitlementStatus {
  if (!isEntitlementStatus(value)) {
    // CHECK-constrained; fail closed to REVOKED (denies) if ever violated.
    return 'REVOKED';
  }
  return value;
}
