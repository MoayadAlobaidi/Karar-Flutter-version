/**
 * DeclareOwnJurisdiction — the ONE subject-facing write this module exposes.
 *
 * WHY IT EXISTS. Every other write here is operator/system work gated on
 * `jurisdiction.assignment.manage`, a permission deliberately unseeded until
 * the control plane arrives. That is correct for operator assignment and
 * wrong as the ONLY path: with no assignment a subject has no governing
 * jurisdiction, so no PolicyPack resolves, so consent acceptance can pin no
 * provenance and refuses. Onboarding needs the subject to be able to say
 * where they are before anything downstream can resolve at all.
 *
 * WHY IT CANNOT WIDEN ANYTHING — the property that makes it safe to expose:
 *   * `source` is USER_DECLARED and `verificationStatus` is UNVERIFIED, both
 *     fixed HERE, not parameters. The schema CHECKs the pair independently
 *     (migration 0072) and the domain predicate re-validates it.
 *   * An UNVERIFIED effective state is a first-class DENIAL in the capability
 *     ceiling (`UNVERIFIED_ASSIGNMENT` -> JURISDICTION_UNVERIFIED). Declaring
 *     changes the denial REASON a subject sees; it clears nothing. Anything
 *     requiring a verified jurisdiction stays denied, and verification arrives
 *     only as a new PROVIDER_VERIFIED row this use case cannot write.
 *   * It creates no legal approval: the register's lifecycle and review status
 *     are untouched, no pack is activated, and no approval evidence exists in
 *     this path to create.
 *   * A VERIFIED assignment is never superseded — a subject cannot erase its
 *     own verification by declaring something else.
 *
 * OWN MEANS OWN. There is no subject parameter: the principal IS the target,
 * it comes from the authenticated session, and the repository runs every
 * statement inside that principal's RLS context (the table is FORCEd on both
 * principal GUCs). There is deliberately no permission check — this is not
 * the operator operation, and requiring the operator permission would make
 * the path permanently dead rather than safely narrow. The same posture the
 * consent module takes for `RecordOwnAcceptance`.
 *
 * HISTORY IS PRESERVED. Declaring ends any open assignment at the new one's
 * effective instant and inserts a successor; the schema trigger permits
 * exactly that one UPDATE shape and refuses DELETE outright, so a declaration
 * can add to the record but never rewrite it. Re-declaring the SAME
 * jurisdiction is a no-op that returns the existing row rather than churning
 * a new window for an unchanged fact.
 */

import { Result } from '@karar/shared-kernel';
import { jurisdictionId } from '@karar/jurisdiction-policy';

import {
  effectiveJurisdictionState,
  type UserJurisdictionAssignment,
} from '../../domain/assignment.js';
import {
  toStoreFailure,
  type AuditAppendFailed,
  type DeclarationNotPermitted,
  type StoreFailure,
  type UnknownJurisdiction,
} from '../errors.js';
import { JurisdictionAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  JurisdictionDirectory,
  UserAssignmentPrincipal,
  UserJurisdictionAssignmentRepository,
} from '../ports/repositories.js';

/** Fixed by this use case, never by its caller. */
const DECLARED_SOURCE = 'USER_DECLARED' as const;
const DECLARED_VERIFICATION = 'UNVERIFIED' as const;
const DECLARED_REASON =
  'subject self-declaration during onboarding; unverified by construction — verification is a separate provider-sourced assignment';

export interface DeclareOwnJurisdictionInput {
  /** The AUTHENTICATED caller. Also the target: there is no other subject. */
  readonly principal: UserAssignmentPrincipal;
  /** Client-supplied; validated against the register and rejected if unknown. */
  readonly jurisdictionCode: string;
  readonly now: Date;
}

export type DeclareOwnJurisdictionError =
  | UnknownJurisdiction
  | DeclarationNotPermitted
  | StoreFailure
  | AuditAppendFailed;

export interface DeclaredJurisdiction {
  readonly assignment: UserJurisdictionAssignment;
  /** False when the caller re-declared what was already in effect. */
  readonly recorded: boolean;
}

export class DeclareOwnJurisdiction {
  constructor(
    private readonly assignments: UserJurisdictionAssignmentRepository,
    private readonly directory: JurisdictionDirectory,
    private readonly ids: IdSource,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: DeclareOwnJurisdictionInput,
  ): Promise<Result<DeclaredJurisdiction, DeclareOwnJurisdictionError>> {
    let register;
    try {
      register = await this.directory.findJurisdiction(input.jurisdictionCode);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (register === null) {
      // An unknown identifier is refused outright — never coerced, never
      // stored as free text, never treated as "some jurisdiction".
      return Result.err({ kind: 'UNKNOWN_JURISDICTION', code: input.jurisdictionCode });
    }
    if (register.status === 'RETIRED') {
      return Result.err({
        kind: 'DECLARATION_NOT_PERMITTED',
        reason: 'JURISDICTION_NOT_DECLARABLE',
        message: `jurisdiction ${register.code} is retired; no new assignment may be made into it`,
      });
    }

    let existing: readonly UserJurisdictionAssignment[];
    try {
      existing = await this.assignments.listForPrincipal(input.principal);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const effective = effectiveJurisdictionState(existing, input.now);
    if (effective.kind === 'VERIFIED') {
      return Result.err({
        kind: 'DECLARATION_NOT_PERMITTED',
        reason: 'VERIFIED_ASSIGNMENT_EXISTS',
        message:
          'a verified jurisdiction assignment is in effect; a self-declaration never supersedes one — changing it is a provider or operator action',
      });
    }
    if (
      effective.kind === 'UNVERIFIED' &&
      String(effective.assignment.jurisdictionCode) === String(register.code)
    ) {
      // Nothing changed: return the standing row rather than opening a new
      // window that records the same fact twice.
      return Result.ok({ assignment: effective.assignment, recorded: false });
    }

    const assignment: UserJurisdictionAssignment = Object.freeze({
      id: this.ids.nextId(),
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      jurisdictionCode: jurisdictionId(register.code),
      source: DECLARED_SOURCE,
      verificationStatus: DECLARED_VERIFICATION,
      effectiveFrom: input.now,
      effectiveTo: null,
      reason: DECLARED_REASON,
      // The subject's own principal ref: migration 0072 names exactly this
      // case for USER_DECLARED rows.
      assignedBy: `user:${String(input.principal.userId)}`,
      createdAt: input.now,
    });

    let endedIds: readonly string[];
    try {
      endedIds = await this.assignments.endOpen(input.principal, input.now);
      await this.assignments.insert(input.principal, assignment);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: assignment.assignedBy,
      tenantRef: String(input.principal.tenantId),
      action: 'jurisdiction.user_assignment.self_declared',
      resourceType: 'user_jurisdiction_assignment',
      resourceId: assignment.id,
      reason: assignment.reason,
      afterMetadata: {
        jurisdictionCode: assignment.jurisdictionCode,
        source: assignment.source,
        verificationStatus: assignment.verificationStatus,
        supersededAssignmentIds: endedIds.join(',') || 'none',
      },
    });
    return audited.ok ? Result.ok({ assignment, recorded: true }) : audited;
  }
}
