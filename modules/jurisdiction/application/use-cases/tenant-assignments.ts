/**
 * Tenant operating-jurisdiction use cases — the organizational counterpart
 * of user-assignments.ts, with the same authorization, register validation,
 * supersede-on-assign discipline, audit trail, and typed verification-aware
 * read. Writes run under a principal context carrying the target tenant (the
 * table's RLS policy keys on the tenant GUC).
 */

import { Result } from '@karar/shared-kernel';
import type { TenantId, UserId } from '@karar/shared-kernel';
import { jurisdictionId } from '@karar/jurisdiction-policy';

import {
  effectiveJurisdictionState,
  verificationPermittedForSource,
  type AssignmentSource,
  type EffectiveJurisdictionState,
  type TenantJurisdictionAssignment,
  type VerificationStatus,
  ASSIGNMENT_SOURCES,
  VERIFICATION_STATUSES,
} from '../../domain/assignment.js';
import {
  InvalidJurisdictionInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type NotFound,
  type StoreFailure,
  type UnknownJurisdiction,
  type VerificationSourceMismatch,
} from '../errors.js';
import { JurisdictionAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  JurisdictionDirectory,
  TenantAssignmentPrincipal,
  TenantJurisdictionAssignmentRepository,
} from '../ports/repositories.js';
import {
  JURISDICTION_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export interface AssignTenantJurisdictionInput {
  readonly principal: PolicyPrincipal;
  readonly tenantId: TenantId;
  /** The acting member whose principal context carries the write (RLS binds
   * both GUCs; the policy keys on the tenant one). */
  readonly actingUserId: UserId;
  readonly jurisdictionCode: string;
  readonly source: AssignmentSource;
  readonly verificationStatus: VerificationStatus;
  readonly effectiveFrom: Date;
  readonly reason: string;
  readonly now: Date;
}

export type AssignTenantJurisdictionError =
  | AuthorizationDenied
  | UnknownJurisdiction
  | VerificationSourceMismatch
  | StoreFailure
  | AuditAppendFailed;

export class AssignTenantJurisdiction {
  constructor(
    private readonly assignments: TenantJurisdictionAssignmentRepository,
    private readonly directory: JurisdictionDirectory,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: AssignTenantJurisdictionInput,
  ): Promise<Result<TenantJurisdictionAssignment, AssignTenantJurisdictionError>> {
    if (!ASSIGNMENT_SOURCES.includes(input.source)) {
      throw new InvalidJurisdictionInputError(
        `source must be one of ${ASSIGNMENT_SOURCES.join(', ')}, got '${String(input.source)}'`,
      );
    }
    if (!VERIFICATION_STATUSES.includes(input.verificationStatus)) {
      throw new InvalidJurisdictionInputError(
        `verificationStatus must be one of ${VERIFICATION_STATUSES.join(', ')}, got '${String(input.verificationStatus)}'`,
      );
    }
    const authorized = await this.policy.authorize(
      input.principal,
      JURISDICTION_PERMISSIONS.manageAssignment,
    );
    if (!authorized.ok) {
      return authorized;
    }
    if (!verificationPermittedForSource(input.source, input.verificationStatus)) {
      return Result.err({
        kind: 'VERIFICATION_SOURCE_MISMATCH',
        source: input.source,
        verificationStatus: input.verificationStatus,
        message:
          `source ${input.source} cannot carry verification status ` +
          `${input.verificationStatus} — a self-declaration is never verified by itself, ` +
          `and a provider verification is what VERIFIED means`,
      });
    }
    let register;
    try {
      register = await this.directory.findJurisdiction(input.jurisdictionCode);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (register === null) {
      return Result.err({ kind: 'UNKNOWN_JURISDICTION', code: input.jurisdictionCode });
    }

    const target: TenantAssignmentPrincipal = {
      tenantId: input.tenantId,
      userId: input.actingUserId,
    };
    const assignment: TenantJurisdictionAssignment = Object.freeze({
      id: this.ids.nextId(),
      tenantId: input.tenantId,
      jurisdictionCode: jurisdictionId(register.code),
      source: input.source,
      verificationStatus: input.verificationStatus,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      reason: requireNonEmpty('reason', input.reason),
      assignedBy: input.principal.principalRef,
      createdAt: input.now,
    });
    let endedIds: readonly string[];
    try {
      endedIds = await this.assignments.endOpen(target, input.effectiveFrom);
      await this.assignments.insert(target, assignment);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      tenantRef: input.tenantId,
      action: 'jurisdiction.tenant_assignment.recorded',
      resourceType: 'tenant_jurisdiction_assignment',
      resourceId: assignment.id,
      reason: assignment.reason,
      afterMetadata: {
        jurisdictionCode: assignment.jurisdictionCode,
        source: assignment.source,
        verificationStatus: assignment.verificationStatus,
        supersededAssignmentIds: endedIds.join(',') || 'none',
      },
    });
    return audited.ok ? Result.ok(assignment) : audited;
  }
}

export interface EndTenantJurisdictionAssignmentInput {
  readonly principal: PolicyPrincipal;
  readonly tenantId: TenantId;
  readonly actingUserId: UserId;
  readonly endsAt: Date;
  readonly reason: string;
  readonly now: Date;
}

export type EndTenantJurisdictionAssignmentError =
  | AuthorizationDenied
  | NotFound
  | StoreFailure
  | AuditAppendFailed;

export class EndTenantJurisdictionAssignment {
  constructor(
    private readonly assignments: TenantJurisdictionAssignmentRepository,
    private readonly policy: PolicyService,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: EndTenantJurisdictionAssignmentInput,
  ): Promise<Result<readonly string[], EndTenantJurisdictionAssignmentError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      JURISDICTION_PERMISSIONS.manageAssignment,
    );
    if (!authorized.ok) {
      return authorized;
    }
    requireNonEmpty('reason', input.reason);
    const target: TenantAssignmentPrincipal = {
      tenantId: input.tenantId,
      userId: input.actingUserId,
    };
    let endedIds: readonly string[];
    try {
      endedIds = await this.assignments.endOpen(target, input.endsAt);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (endedIds.length === 0) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'tenant_jurisdiction_assignment',
        id: `open assignment for tenant ${input.tenantId}`,
      });
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      tenantRef: input.tenantId,
      action: 'jurisdiction.tenant_assignment.ended',
      resourceType: 'tenant_jurisdiction_assignment',
      resourceId: endedIds.join(','),
      reason: input.reason,
      afterMetadata: { endsAt: input.endsAt.toISOString() },
    });
    return audited.ok ? Result.ok(endedIds) : audited;
  }
}

export interface GetEffectiveTenantJurisdictionInput {
  readonly principal: TenantAssignmentPrincipal;
  readonly at: Date;
}

export type GetEffectiveTenantJurisdictionError = StoreFailure;

export class GetEffectiveTenantJurisdiction {
  constructor(private readonly assignments: TenantJurisdictionAssignmentRepository) {}

  async execute(
    input: GetEffectiveTenantJurisdictionInput,
  ): Promise<
    Result<
      EffectiveJurisdictionState<TenantJurisdictionAssignment>,
      GetEffectiveTenantJurisdictionError
    >
  > {
    try {
      const rows = await this.assignments.listForTenant(input.principal);
      return Result.ok(effectiveJurisdictionState(rows, input.at));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}
