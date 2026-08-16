/**
 * User jurisdiction assignment use cases. Operator/system/seed-side this
 * phase: every mutation authorizes jurisdiction.assignment.manage through
 * the PolicyService port (unseeded in 3.5 — the real service denies until
 * the operator surface arrives), validates against the jurisdiction
 * register, writes under the TARGET subject's principal context (the
 * assignment tables are RLS-FORCEd), and lands in the audit trail.
 *
 * Assigning supersedes: any open assignment is ended at the new one's
 * effective_from inside the same principal context, so the history stays a
 * chain of windows rather than an overlap. The read side never mutates and
 * runs as the subject's own principal — a subject can always learn its own
 * effective state; the typed result exposes verification explicitly so the
 * capability resolver fails closed on UNVERIFIED.
 */

import { Result } from '@karar/shared-kernel';
import type { TenantId, UserId } from '@karar/shared-kernel';
import { jurisdictionId } from '@karar/jurisdiction-policy';

import {
  effectiveJurisdictionState,
  verificationPermittedForSource,
  type AssignmentSource,
  type EffectiveJurisdictionState,
  type UserJurisdictionAssignment,
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
  UserAssignmentPrincipal,
  UserJurisdictionAssignmentRepository,
} from '../ports/repositories.js';
import {
  JURISDICTION_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export interface AssignUserJurisdictionInput {
  readonly principal: PolicyPrincipal;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly jurisdictionCode: string;
  readonly source: AssignmentSource;
  readonly verificationStatus: VerificationStatus;
  readonly effectiveFrom: Date;
  readonly reason: string;
  readonly now: Date;
}

export type AssignUserJurisdictionError =
  | AuthorizationDenied
  | UnknownJurisdiction
  | VerificationSourceMismatch
  | StoreFailure
  | AuditAppendFailed;

export class AssignUserJurisdiction {
  constructor(
    private readonly assignments: UserJurisdictionAssignmentRepository,
    private readonly directory: JurisdictionDirectory,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: AssignUserJurisdictionInput,
  ): Promise<Result<UserJurisdictionAssignment, AssignUserJurisdictionError>> {
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

    const target: UserAssignmentPrincipal = { tenantId: input.tenantId, userId: input.userId };
    const assignment: UserJurisdictionAssignment = Object.freeze({
      id: this.ids.nextId(),
      userId: input.userId,
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
      action: 'jurisdiction.user_assignment.recorded',
      resourceType: 'user_jurisdiction_assignment',
      resourceId: assignment.id,
      reason: assignment.reason,
      afterMetadata: {
        userId: input.userId,
        jurisdictionCode: assignment.jurisdictionCode,
        source: assignment.source,
        verificationStatus: assignment.verificationStatus,
        supersededAssignmentIds: endedIds.join(',') || 'none',
      },
    });
    return audited.ok ? Result.ok(assignment) : audited;
  }
}

export interface EndUserJurisdictionAssignmentInput {
  readonly principal: PolicyPrincipal;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly endsAt: Date;
  readonly reason: string;
  readonly now: Date;
}

export type EndUserJurisdictionAssignmentError =
  | AuthorizationDenied
  | NotFound
  | StoreFailure
  | AuditAppendFailed;

export class EndUserJurisdictionAssignment {
  constructor(
    private readonly assignments: UserJurisdictionAssignmentRepository,
    private readonly policy: PolicyService,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: EndUserJurisdictionAssignmentInput,
  ): Promise<Result<readonly string[], EndUserJurisdictionAssignmentError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      JURISDICTION_PERMISSIONS.manageAssignment,
    );
    if (!authorized.ok) {
      return authorized;
    }
    requireNonEmpty('reason', input.reason);
    const target: UserAssignmentPrincipal = { tenantId: input.tenantId, userId: input.userId };
    let endedIds: readonly string[];
    try {
      endedIds = await this.assignments.endOpen(target, input.endsAt);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (endedIds.length === 0) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'user_jurisdiction_assignment',
        id: `open assignment for user ${input.userId}`,
      });
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      tenantRef: input.tenantId,
      action: 'jurisdiction.user_assignment.ended',
      resourceType: 'user_jurisdiction_assignment',
      resourceId: endedIds.join(','),
      reason: input.reason,
      afterMetadata: { userId: input.userId, endsAt: input.endsAt.toISOString() },
    });
    return audited.ok ? Result.ok(endedIds) : audited;
  }
}

export interface GetEffectiveUserJurisdictionInput {
  /** The SUBJECT whose state is read; the repository runs under this
   * principal's own RLS context. */
  readonly principal: UserAssignmentPrincipal;
  readonly at: Date;
}

export type GetEffectiveUserJurisdictionError = StoreFailure;

export class GetEffectiveUserJurisdiction {
  constructor(private readonly assignments: UserJurisdictionAssignmentRepository) {}

  async execute(
    input: GetEffectiveUserJurisdictionInput,
  ): Promise<
    Result<EffectiveJurisdictionState<UserJurisdictionAssignment>, GetEffectiveUserJurisdictionError>
  > {
    try {
      const rows = await this.assignments.listForPrincipal(input.principal);
      return Result.ok(effectiveJurisdictionState(rows, input.at));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}
