/**
 * SubjectPolicySelectionRepository over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction (packages/platform/src/db/
 * principal-context.ts): RLS on subject_policy_selections requires BOTH
 * principal GUCs (app.tenant_id, app.user_id), so a call without them
 * returns and affects nothing — the policy fails closed. The repository
 * still WHERE-filters by user/tenant — defence in depth that catches honest
 * mistakes early; RLS is the boundary.
 *
 * Transitions ride UPDATEs the schema trigger bounds to exactly
 * ACTIVE->SUPERSEDED, ACTIVE->WITHDRAWN, and ACTIVE->EXPIRED; there is no
 * delete method, and content columns are never updated.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { TenantId, UserId } from '@karar/shared-kernel';

import type {
  SelectionStatus,
  SubjectPolicySelection,
} from '../../domain/selection.js';
import type { JurisdictionRef, ProfileRef } from '../../domain/refs.js';
import type {
  SubjectPolicyPrincipal,
  SubjectPolicySelectionRepository,
} from '../../application/ports/selection-repository.js';

export class PrismaSubjectPolicySelectionRepository implements SubjectPolicySelectionRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private run<T>(
    principal: SubjectPolicyPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async recordSelection(
    principal: SubjectPolicyPrincipal,
    selection: SubjectPolicySelection,
  ): Promise<{ readonly supersededIds: ReadonlyArray<string> }> {
    return this.run(principal, async (tx) => {
      const priorActive = await tx.subjectPolicySelection.findMany({
        where: {
          userId: principal.userId,
          tenantId: principal.tenantId,
          capabilityId: selection.capabilityId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const supersededIds = priorActive.map((row) => row.id);
      if (supersededIds.length > 0) {
        await tx.subjectPolicySelection.updateMany({
          where: { id: { in: supersededIds } },
          data: { status: 'SUPERSEDED' },
        });
      }
      await tx.subjectPolicySelection.create({
        data: {
          id: selection.id,
          userId: selection.userId,
          tenantId: selection.tenantId,
          capabilityId: selection.capabilityId,
          profileRef: selection.profileRef,
          profileVersion: selection.profileVersion,
          jurisdictionRef: selection.jurisdictionRef,
          policyPackVersion: selection.policyPackVersion,
          effectiveFrom: selection.effectiveFrom,
          effectiveTo: selection.effectiveTo,
          status: selection.status,
          selectionSource: selection.selectionSource,
          recordedBy: selection.recordedBy,
          profileSnapshotHash: selection.profileSnapshotHash,
          withdrawnAt: selection.withdrawnAt,
        },
      });
      return { supersededIds };
    });
  }

  async findById(
    principal: SubjectPolicyPrincipal,
    id: string,
  ): Promise<SubjectPolicySelection | null> {
    return this.run(principal, async (tx) => {
      const row = await tx.subjectPolicySelection.findUnique({ where: { id } });
      return row === null ? null : toSelection(row);
    });
  }

  async listSelections(
    principal: SubjectPolicyPrincipal,
    capabilityId: string,
  ): Promise<ReadonlyArray<SubjectPolicySelection>> {
    return this.run(principal, async (tx) => {
      const rows = await tx.subjectPolicySelection.findMany({
        where: {
          userId: principal.userId,
          tenantId: principal.tenantId,
          capabilityId,
        },
        orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map(toSelection);
    });
  }

  async withdraw(principal: SubjectPolicyPrincipal, id: string, at: Date): Promise<void> {
    await this.run(principal, async (tx) => {
      await tx.subjectPolicySelection.update({
        where: { id },
        data: { status: 'WITHDRAWN', withdrawnAt: at },
      });
    });
  }
}

function toSelection(row: {
  id: string;
  userId: string;
  tenantId: string;
  capabilityId: string;
  profileRef: string;
  profileVersion: string;
  jurisdictionRef: string;
  policyPackVersion: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: string;
  selectionSource: string;
  recordedBy: string;
  profileSnapshotHash: string | null;
  withdrawnAt: Date | null;
}): SubjectPolicySelection {
  return {
    id: row.id,
    userId: row.userId as UserId,
    tenantId: row.tenantId as TenantId,
    capabilityId: row.capabilityId,
    profileRef: row.profileRef as ProfileRef,
    profileVersion: row.profileVersion,
    jurisdictionRef: row.jurisdictionRef as JurisdictionRef,
    policyPackVersion: row.policyPackVersion,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: row.status as SelectionStatus,
    selectionSource: row.selectionSource,
    recordedBy: row.recordedBy,
    profileSnapshotHash: row.profileSnapshotHash,
    withdrawnAt: row.withdrawnAt,
  };
}
