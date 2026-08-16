/**
 * The subject-policy flows: record OWN selection, withdraw OWN selection,
 * read OWN selection at an instant, and the pinned-version reader the
 * capability workstream's resolver consumes.
 *
 * OWN means own: every flow takes the authenticated principal, the
 * repository runs under that principal's RLS context, and there is
 * deliberately NO admin-elects-for-customer path in this module — absent by
 * design, recorded in MODULE.md (permissions deliberately absent).
 *
 * Restrict-only (jurisdiction-policy.md §2 invariant, fourth dimension §7):
 * recording validates the elected option against the APPLICABLE pack option
 * set through the SubjectOptionSource port — a selection may only NARROW
 * among pack-permitted options. Denied, each with its own typed arm: an
 * option outside the set, a capability outside the production registry, a
 * capability that declares no subject policy, a stale or concurrently
 * changed pack version, and an unresolvable option set (fail closed).
 *
 * Version pinning (provenance): every recording pins jurisdiction, the
 * applicable PolicyPack version, and the elected profile version. The port
 * supplies the applicable version; the use case validates against it, then
 * RE-CHECKS it immediately before the insert and refuses on change — a
 * concurrent pack flip is a typed PACK_VERSION_MISMATCH, never a silently
 * mis-pinned row. The row pins exactly what was validated, and reads replay
 * pinned versions, so history never depends on the race.
 *
 * Generics: every class is generic over `Id extends string`, defaulting to
 * the production registry's CapabilityId; the constructor takes the
 * membership predicate (production: `isCapabilityId`). Synthetic test
 * capabilities exist only through this genericity — they never enter the
 * production union, and integration rows carry real ids only.
 */

import { Result } from '@karar/shared-kernel';
import type { CapabilityId } from '@karar/capability-registry';

import {
  resolveSelectionAt,
  type SubjectPolicySelection,
} from '../../domain/selection.js';
import { optionPermitted, type SubjectOptionSet } from '../../domain/option-set.js';
import { JurisdictionRef, ProfileRef } from '../../domain/refs.js';
import {
  InvalidSelectionInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type CapabilityUnknown,
  type NoSubjectPolicyDeclared,
  type NotFound,
  type OptionNotPermitted,
  type OptionSetUnresolved,
  type PackVersionMismatch,
  type SelectionNotActive,
  type StoreFailure,
} from '../errors.js';
import { SubjectPolicyAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  SubjectPolicyPrincipal,
  SubjectPolicySelectionRepository,
} from '../ports/selection-repository.js';
import type {
  OptionSetResolution,
  SubjectOptionSource,
} from '../ports/subject-option-source.js';

/** Membership predicate for the pinned capability-id set (production: isCapabilityId). */
export type CapabilityIdPredicate<Id extends string> = (value: string) => value is Id;

/** The only Phase 3.5 provenance source: the subject's own election. */
export const SELECTION_SOURCE_SUBJECT_ELECTION = 'subject-election';

function capabilityUnknown(capabilityId: string): CapabilityUnknown {
  return {
    kind: 'CAPABILITY_UNKNOWN',
    capabilityId,
    message: `capability '${capabilityId}' is not in the capability registry; selections exist only for registered capabilities`,
  };
}

function noSubjectPolicyDeclared(capabilityId: string): NoSubjectPolicyDeclared {
  return {
    kind: 'NO_SUBJECT_POLICY_DECLARED',
    capabilityId,
    message: `capability '${capabilityId}' declares no subject policy; a selection cannot be recorded for it (absence is the common case and costs nothing)`,
  };
}

function optionSetUnresolved(capabilityId: string, reason: string): OptionSetUnresolved {
  return {
    kind: 'OPTION_SET_UNRESOLVED',
    capabilityId,
    reason,
    message: `the option set for capability '${capabilityId}' could not be resolved (${reason}); recording fails closed — an unresolvable set is a denial, never an empty set`,
  };
}

export interface RecordSubjectPolicySelectionInput {
  readonly principal: SubjectPolicyPrincipal;
  readonly capabilityId: string;
  readonly jurisdictionRef: string;
  /**
   * The pack version the subject elected under (resolved when the options
   * were shown). Recording refuses when it is not the applicable version —
   * an election made against a superseded pack is re-made, never re-pinned.
   */
  readonly expectedPolicyPackVersion: string;
  readonly profileRef: string;
  readonly profileVersion: string;
  /** Optional fixed-term election; must lie after `now`. */
  readonly effectiveTo?: Date | null;
  /** Hash reference to the owning capability's content snapshot — never content. */
  readonly profileSnapshotHash?: string | null;
  readonly now: Date;
}

export type RecordSubjectPolicySelectionError =
  | CapabilityUnknown
  | NoSubjectPolicyDeclared
  | OptionSetUnresolved
  | OptionNotPermitted
  | PackVersionMismatch
  | StoreFailure
  | AuditAppendFailed;

export class RecordSubjectPolicySelection<Id extends string = CapabilityId> {
  constructor(
    private readonly selections: SubjectPolicySelectionRepository,
    private readonly options: SubjectOptionSource<Id>,
    private readonly isKnownCapability: CapabilityIdPredicate<Id>,
    private readonly ids: IdSource,
    private readonly audit: SubjectPolicyAuditTrail,
  ) {}

  async execute(
    input: RecordSubjectPolicySelectionInput,
  ): Promise<Result<SubjectPolicySelection<Id>, RecordSubjectPolicySelectionError>> {
    const scopeRef = JurisdictionRef.of(input.jurisdictionRef);
    const profileRef = ProfileRef.of(input.profileRef);
    requireNonEmpty('profileVersion', input.profileVersion);
    requireNonEmpty('expectedPolicyPackVersion', input.expectedPolicyPackVersion);
    if (input.profileSnapshotHash != null) {
      requireNonEmpty('profileSnapshotHash', input.profileSnapshotHash);
    }
    if (input.effectiveTo != null && input.effectiveTo.getTime() <= input.now.getTime()) {
      throw new InvalidSelectionInputError(
        `'effectiveTo' must lie after 'now' — a window that never covers an instant elects nothing`,
      );
    }

    if (!this.isKnownCapability(input.capabilityId)) {
      return Result.err(capabilityUnknown(input.capabilityId));
    }
    const capabilityId = input.capabilityId;

    const resolved = await this.options.optionSetFor(capabilityId, scopeRef, input.now);
    if (resolved.kind === 'NO_SUBJECT_POLICY') {
      return Result.err(noSubjectPolicyDeclared(capabilityId));
    }
    if (resolved.kind === 'UNRESOLVED') {
      return Result.err(optionSetUnresolved(capabilityId, resolved.reason));
    }
    const optionSet = resolved.optionSet;
    // Port-contract defence: a set for another capability or scope is a
    // wiring defect, not an outcome. Locals stay neutral by design
    // (architecture test 12: no business branching on regime identifiers —
    // this is an echo check on the port, not behaviour selection).
    const declaredScope: string = optionSet.jurisdictionRef;
    const requestedScope: string = scopeRef;
    if (optionSet.capabilityId !== capabilityId || declaredScope !== requestedScope) {
      throw new InvalidSelectionInputError(
        `SubjectOptionSource returned a set for ('${optionSet.capabilityId}', '${declaredScope}') when ('${capabilityId}', '${requestedScope}') was requested — port contract violated`,
      );
    }

    if (optionSet.policyPackVersion !== input.expectedPolicyPackVersion) {
      return Result.err(this.packVersionMismatch(capabilityId, input, optionSet, 'AT_RESOLUTION'));
    }
    if (!optionPermitted(optionSet, profileRef, input.profileVersion)) {
      return Result.err({
        kind: 'OPTION_NOT_PERMITTED',
        capabilityId,
        profileRef,
        profileVersion: input.profileVersion,
        message: `option ('${profileRef}', '${input.profileVersion}') is outside the pack-permitted set for capability '${capabilityId}'; a selection may only narrow among permitted options (restrict-only)`,
      });
    }

    // Pin re-check: the applicable pack version is read AGAIN immediately
    // before the insert. A concurrent pack change between validation and
    // pinning is a typed refusal — the row must pin exactly the version the
    // option was validated against.
    const recheck = await this.options.optionSetFor(capabilityId, scopeRef, input.now);
    if (recheck.kind === 'NO_SUBJECT_POLICY') {
      return Result.err(noSubjectPolicyDeclared(capabilityId));
    }
    if (recheck.kind === 'UNRESOLVED') {
      return Result.err(optionSetUnresolved(capabilityId, recheck.reason));
    }
    if (recheck.optionSet.policyPackVersion !== optionSet.policyPackVersion) {
      return Result.err(this.packVersionMismatch(capabilityId, input, recheck.optionSet, 'AT_PIN'));
    }

    const selection: SubjectPolicySelection<Id> = Object.freeze({
      id: this.ids.nextId(),
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      capabilityId,
      profileRef,
      profileVersion: input.profileVersion,
      jurisdictionRef: scopeRef, // pinned at recording, forever
      policyPackVersion: optionSet.policyPackVersion, // pinned at recording
      effectiveFrom: input.now,
      effectiveTo: input.effectiveTo ?? null,
      status: 'ACTIVE' as const,
      selectionSource: SELECTION_SOURCE_SUBJECT_ELECTION,
      recordedBy: input.principal.userId,
      profileSnapshotHash: input.profileSnapshotHash ?? null,
      withdrawnAt: null,
    });

    let supersededIds: ReadonlyArray<string>;
    try {
      ({ supersededIds } = await this.selections.recordSelection(input.principal, selection));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    // REFERENCE-ONLY metadata: the selection id, capability id, and version
    // pins — never profileRef, never the snapshot hash, never option values
    // (jurisdiction-policy.md §7 rule 5; leak-regression tested).
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.userId,
      tenantRef: input.principal.tenantId,
      action: 'subjectpolicy.selection.recorded',
      resourceType: 'subject_policy_selection',
      resourceId: selection.id,
      beforeMetadata: { supersededSelectionIds: supersededIds.join(',') || null },
      afterMetadata: {
        capabilityId: selection.capabilityId,
        jurisdictionRef: selection.jurisdictionRef,
        policyPackVersion: selection.policyPackVersion,
        profileVersion: selection.profileVersion,
        effectiveFrom: selection.effectiveFrom.toISOString(),
        status: selection.status,
      },
    });
    return audited.ok ? Result.ok(selection) : audited;
  }

  private packVersionMismatch(
    capabilityId: string,
    input: RecordSubjectPolicySelectionInput,
    applicable: SubjectOptionSet<Id>,
    detected: 'AT_RESOLUTION' | 'AT_PIN',
  ): PackVersionMismatch {
    return {
      kind: 'PACK_VERSION_MISMATCH',
      capabilityId,
      expectedPackVersion: input.expectedPolicyPackVersion,
      applicablePackVersion: applicable.policyPackVersion,
      detected,
      message:
        detected === 'AT_RESOLUTION'
          ? `the election was made under pack version '${input.expectedPolicyPackVersion}' but '${applicable.policyPackVersion}' is applicable; re-elect under the applicable version — a stale election is never re-pinned`
          : `the applicable pack version changed to '${applicable.policyPackVersion}' while recording against '${input.expectedPolicyPackVersion}'; nothing was recorded — re-elect under the applicable version`,
    };
  }
}

export interface WithdrawOwnSelectionInput {
  readonly principal: SubjectPolicyPrincipal;
  readonly selectionId: string;
  readonly now: Date;
}

export type WithdrawOwnSelectionError =
  | NotFound
  | SelectionNotActive
  | StoreFailure
  | AuditAppendFailed;

export class WithdrawOwnSelection {
  constructor(
    private readonly selections: SubjectPolicySelectionRepository,
    private readonly audit: SubjectPolicyAuditTrail,
  ) {}

  async execute(
    input: WithdrawOwnSelectionInput,
  ): Promise<Result<SubjectPolicySelection, WithdrawOwnSelectionError>> {
    let selection;
    try {
      // RLS scopes the lookup to the principal's own rows: another subject's
      // selection id resolves to NOT_FOUND, indistinguishable from absence.
      selection = await this.selections.findById(input.principal, input.selectionId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (selection === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'subject_policy_selection',
        id: input.selectionId,
      });
    }
    if (selection.status !== 'ACTIVE') {
      return Result.err({
        kind: 'SELECTION_NOT_ACTIVE',
        selectionId: selection.id,
        status: selection.status,
        message: `selection ${selection.id} is ${selection.status}; only an ACTIVE selection can be withdrawn (re-electing creates a new row)`,
      });
    }
    try {
      await this.selections.withdraw(input.principal, input.selectionId, input.now);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.userId,
      tenantRef: input.principal.tenantId,
      action: 'subjectpolicy.selection.withdrawn',
      resourceType: 'subject_policy_selection',
      resourceId: selection.id,
      beforeMetadata: { status: 'ACTIVE' },
      afterMetadata: {
        status: 'WITHDRAWN',
        withdrawnAt: input.now.toISOString(),
        capabilityId: selection.capabilityId,
      },
    });
    return audited.ok
      ? Result.ok({ ...selection, status: 'WITHDRAWN' as const, withdrawnAt: input.now })
      : audited;
  }
}

export interface GetOwnSelectionInput {
  readonly principal: SubjectPolicyPrincipal;
  readonly capabilityId: string;
  readonly jurisdictionRef: string;
  /** The instant the selection must be effective AT (temporal read). */
  readonly at: Date;
}

/**
 * The typed read result. `NO_SELECTION_APPLICABLE` is an OUTCOME, not an
 * error: where the capability declares no subject policy, absence is the
 * designed common case and costs nothing. `SELECTION_EXPIRED` is the
 * fail-closed refusal for an election whose window has closed — never
 * silently served, never conflated with plain absence.
 */
export type OwnSelectionView<Id extends string = CapabilityId> =
  | { readonly kind: 'SELECTION'; readonly selection: SubjectPolicySelection<Id> }
  | { readonly kind: 'SELECTION_EXPIRED'; readonly selectionId: string; readonly expiredAt: Date }
  | { readonly kind: 'NO_SELECTION' }
  | { readonly kind: 'NO_SELECTION_APPLICABLE' };

export type GetOwnSelectionError = CapabilityUnknown | OptionSetUnresolved | StoreFailure;

export class GetOwnSelection<Id extends string = CapabilityId> {
  constructor(
    private readonly selections: SubjectPolicySelectionRepository,
    private readonly options: SubjectOptionSource<Id>,
    private readonly isKnownCapability: CapabilityIdPredicate<Id>,
  ) {}

  async execute(
    input: GetOwnSelectionInput,
  ): Promise<Result<OwnSelectionView<Id>, GetOwnSelectionError>> {
    const scopeRef = JurisdictionRef.of(input.jurisdictionRef);
    if (!this.isKnownCapability(input.capabilityId)) {
      return Result.err(capabilityUnknown(input.capabilityId));
    }
    const capabilityId = input.capabilityId;

    let rows: ReadonlyArray<SubjectPolicySelection>;
    try {
      rows = await this.selections.listSelections(input.principal, capabilityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    // Rows were recorded through the validated path for exactly this
    // capability id; the narrowing is the predicate's, re-stated for rows.
    const resolved = resolveSelectionAt(
      rows as ReadonlyArray<SubjectPolicySelection<Id>>,
      input.at,
    );
    if (resolved.kind === 'EFFECTIVE') {
      return Result.ok({ kind: 'SELECTION', selection: resolved.selection });
    }
    if (resolved.kind === 'EXPIRED') {
      return Result.ok({
        kind: 'SELECTION_EXPIRED',
        selectionId: resolved.selectionId,
        expiredAt: resolved.expiredAt,
      });
    }

    // Nothing effective: distinguish "the capability has no subject policy
    // here" (absence by design) from "electable but unelected".
    let declaration: OptionSetResolution<Id>;
    try {
      declaration = await this.options.optionSetFor(capabilityId, scopeRef, input.at);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (declaration.kind === 'NO_SUBJECT_POLICY') {
      return Result.ok({ kind: 'NO_SELECTION_APPLICABLE' });
    }
    if (declaration.kind === 'UNRESOLVED') {
      return Result.err(optionSetUnresolved(capabilityId, declaration.reason));
    }
    return Result.ok({ kind: 'NO_SELECTION' });
  }
}

export interface GetSelectionVersionForResolutionInput {
  readonly principal: SubjectPolicyPrincipal;
  readonly capabilityId: string;
  /** The instant resolution is running FOR — past instants replay history. */
  readonly at: Date;
}

/**
 * What resolution output carries: the pinned versions, or the typed
 * NO_SELECTION_APPLICABLE. `profileRef` appears HERE and only here — the
 * consumer is the owning capability's purpose-limited resolver, which needs
 * the reference to load its own profile content; the reference still never
 * enters audit metadata, logs, or bootstrap output.
 */
export type SelectionVersionResolution<Id extends string = CapabilityId> =
  | {
      readonly kind: 'PINNED_VERSIONS';
      readonly selectionId: string;
      readonly capabilityId: Id;
      readonly jurisdictionRef: string;
      readonly policyPackVersion: string;
      readonly profileRef: string;
      readonly profileVersion: string;
      readonly effectiveFrom: Date;
    }
  | {
      readonly kind: 'NO_SELECTION_APPLICABLE';
      readonly cause: 'NO_SELECTION' | 'SELECTION_EXPIRED';
    };

export type GetSelectionVersionForResolutionError = CapabilityUnknown | StoreFailure;

export class GetSelectionVersionForResolution<Id extends string = CapabilityId> {
  constructor(
    private readonly selections: SubjectPolicySelectionRepository,
    private readonly isKnownCapability: CapabilityIdPredicate<Id>,
  ) {}

  async execute(
    input: GetSelectionVersionForResolutionInput,
  ): Promise<Result<SelectionVersionResolution<Id>, GetSelectionVersionForResolutionError>> {
    if (!this.isKnownCapability(input.capabilityId)) {
      return Result.err(capabilityUnknown(input.capabilityId));
    }
    const capabilityId = input.capabilityId;

    let rows: ReadonlyArray<SubjectPolicySelection>;
    try {
      rows = await this.selections.listSelections(input.principal, capabilityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const resolved = resolveSelectionAt(
      rows as ReadonlyArray<SubjectPolicySelection<Id>>,
      input.at,
    );
    if (resolved.kind === 'EFFECTIVE') {
      const selection = resolved.selection;
      return Result.ok({
        kind: 'PINNED_VERSIONS',
        selectionId: selection.id,
        capabilityId: selection.capabilityId,
        jurisdictionRef: selection.jurisdictionRef,
        policyPackVersion: selection.policyPackVersion,
        profileRef: selection.profileRef,
        profileVersion: selection.profileVersion,
        effectiveFrom: selection.effectiveFrom,
      });
    }
    return Result.ok({
      kind: 'NO_SELECTION_APPLICABLE',
      cause: resolved.kind === 'EXPIRED' ? 'SELECTION_EXPIRED' : 'NO_SELECTION',
    });
  }
}

/** Re-exported so consumers of these flows name the same principal shape. */
export type { SubjectPolicyPrincipal };
