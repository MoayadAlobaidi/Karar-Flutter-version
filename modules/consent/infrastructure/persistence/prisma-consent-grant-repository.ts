/**
 * ConsentGrantRepository over Prisma — every statement inside the platform's
 * `withPrincipalContext` transaction (packages/platform/src/db/
 * principal-context.ts): RLS on consent_grants requires BOTH principal GUCs
 * (app.tenant_id, app.user_id), so a call without them returns and affects
 * nothing — the policy fails closed. The repository still WHERE-filters by
 * user/tenant — defence in depth that catches honest mistakes early; RLS is
 * the boundary.
 *
 * Transitions ride UPDATEs the schema trigger bounds to exactly
 * ACTIVE->WITHDRAWN and ACTIVE->SUPERSEDED; there is no delete method.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { TenantId, UserId } from '@karar/shared-kernel';

import type {
  ConsentGrant,
  ConsentGrantStatus,
  PolicyPackPinState,
  SubjectPolicySelectionPinState,
} from '../../domain/consent-grant.js';
import type { JurisdictionRef, OperatingEntityRef, PurposeRef } from '../../domain/refs.js';
import type {
  ConsentGrantRepository,
  ConsentPrincipal,
} from '../../application/ports/consent-grant-repository.js';

export class PrismaConsentGrantRepository implements ConsentGrantRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private run<T>(
    principal: ConsentPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async recordAcceptance(
    principal: ConsentPrincipal,
    grant: ConsentGrant,
  ): Promise<{ readonly supersededIds: ReadonlyArray<string> }> {
    return this.run(principal, async (tx) => {
      const priorActive = await tx.consentGrant.findMany({
        where: {
          userId: principal.userId,
          tenantId: principal.tenantId,
          operatingEntityId: grant.operatingEntityId,
          purposeRef: grant.purposeRef,
          jurisdictionRef: grant.jurisdictionRef,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const supersededIds = priorActive.map((row) => row.id);
      if (supersededIds.length > 0) {
        await tx.consentGrant.updateMany({
          where: { id: { in: supersededIds } },
          data: { status: 'SUPERSEDED' },
        });
      }
      await tx.consentGrant.create({
        data: {
          id: grant.id,
          userId: grant.userId,
          tenantId: grant.tenantId,
          operatingEntityId: grant.operatingEntityId,
          jurisdictionRef: grant.jurisdictionRef,
          purposeRef: grant.purposeRef,
          consentVersion: grant.consentVersion,
          legalDocumentVersionId: grant.legalDocumentVersionId,
          grantedAt: grant.grantedAt,
          withdrawnAt: grant.withdrawnAt,
          status: grant.status,
          evidenceReference: grant.evidenceReference,
          policyPackVersion: grant.policyPackVersion,
          policyPackPinState: grant.policyPackPinState,
          subjectPolicySelectionVersion: grant.subjectPolicySelectionVersion,
          subjectPolicySelectionPinState: grant.subjectPolicySelectionPinState,
        },
      });
      return { supersededIds };
    });
  }

  async findById(principal: ConsentPrincipal, id: string): Promise<ConsentGrant | null> {
    return this.run(principal, async (tx) => {
      const row = await tx.consentGrant.findUnique({ where: { id } });
      return row === null ? null : toGrant(row);
    });
  }

  async latestResolutionGrant(
    principal: ConsentPrincipal,
    entityId: OperatingEntityRef,
    purposeRef: PurposeRef,
    jurisdictionRef: JurisdictionRef,
  ): Promise<ConsentGrant | null> {
    return this.run(principal, async (tx) => {
      const row = await tx.consentGrant.findFirst({
        where: {
          userId: principal.userId,
          tenantId: principal.tenantId,
          operatingEntityId: entityId,
          purposeRef,
          jurisdictionRef,
          status: { in: ['ACTIVE', 'WITHDRAWN'] },
        },
        orderBy: [{ grantedAt: 'desc' }, { createdAt: 'desc' }],
      });
      return row === null ? null : toGrant(row);
    });
  }

  async listGrants(principal: ConsentPrincipal): Promise<ReadonlyArray<ConsentGrant>> {
    return this.run(principal, async (tx) => {
      const rows = await tx.consentGrant.findMany({
        where: { userId: principal.userId, tenantId: principal.tenantId },
        orderBy: { grantedAt: 'asc' },
      });
      return rows.map(toGrant);
    });
  }

  async withdraw(principal: ConsentPrincipal, id: string, at: Date): Promise<void> {
    await this.run(principal, async (tx) => {
      await tx.consentGrant.update({
        where: { id },
        data: { status: 'WITHDRAWN', withdrawnAt: at },
      });
    });
  }
}

function toGrant(row: {
  id: string;
  userId: string;
  tenantId: string;
  operatingEntityId: string;
  jurisdictionRef: string;
  purposeRef: string;
  consentVersion: string;
  legalDocumentVersionId: string;
  grantedAt: Date;
  withdrawnAt: Date | null;
  status: string;
  evidenceReference: string;
  policyPackVersion: string | null;
  policyPackPinState: string;
  subjectPolicySelectionVersion: string | null;
  subjectPolicySelectionPinState: string;
}): ConsentGrant {
  return {
    id: row.id,
    userId: row.userId as UserId,
    tenantId: row.tenantId as TenantId,
    operatingEntityId: row.operatingEntityId as OperatingEntityRef,
    jurisdictionRef: row.jurisdictionRef as JurisdictionRef,
    purposeRef: row.purposeRef as PurposeRef,
    consentVersion: row.consentVersion,
    legalDocumentVersionId: row.legalDocumentVersionId,
    grantedAt: row.grantedAt,
    withdrawnAt: row.withdrawnAt,
    status: row.status as ConsentGrantStatus,
    evidenceReference: row.evidenceReference,
    policyPackVersion: row.policyPackVersion,
    policyPackPinState: row.policyPackPinState as PolicyPackPinState,
    subjectPolicySelectionVersion: row.subjectPolicySelectionVersion,
    subjectPolicySelectionPinState:
      row.subjectPolicySelectionPinState as SubjectPolicySelectionPinState,
  };
}
