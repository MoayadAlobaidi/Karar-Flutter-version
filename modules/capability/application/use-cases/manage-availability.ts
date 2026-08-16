/**
 * SetCapabilityAvailability — the ONLY write path onto
 * capability_availability rows. Operator work, permission-gated
 * (capability.availability.manage — declared-but-unseeded this phase:
 * absence denies), audited, and optimistically versioned (the DB guard
 * additionally enforces +1 increments and appends the history ledger).
 *
 * Two refusals are structural, not validation niceties:
 *
 *  - ids are validated against the registry view the use case was
 *    constructed with — composition binds the PRODUCTION registry, so a
 *    synthetic test id can never reach a row (the migration's CHECK
 *    constraint enforces the same closed set below us);
 *  - an ALLOWING state (AVAILABLE/BETA) for a capability that is
 *    NOT_IMPLEMENTED, not deployed in the target environment, or not
 *    declared for the target jurisdiction is refused as ABOVE_CEILING and
 *    the refusal is audited with outcome DENIED — configuration must never
 *    even CLAIM more than the code ceiling permits, and an attempted
 *    expansion is a security-relevant event. Restrictive states are always
 *    writable: restricting needs no clearance.
 */

import { Result } from '@karar/shared-kernel';
import { isKararEnvironment } from '@karar/capability-registry';

import {
  isAllowingState,
  type AvailabilityState,
  type CapabilityAvailabilityRecord,
} from '../../domain/availability-state.js';
import {
  InvalidCapabilityInputError,
  requireNonEmpty,
  toStoreFailure,
  type AboveCeiling,
  type AlreadyExists,
  type AuditAppendFailed,
  type StoreFailure,
  type UnknownCapability,
  type VersionConflict,
} from '../errors.js';
import { CapabilityAuditTrail } from '../audit-trail.js';
import type { CapabilityRegistryView } from '../registry-view.js';
import type { CapabilityAvailabilityRepository } from '../ports/availability-repository.js';
import type {
  AuthorizationDenied,
  PolicyPrincipal,
  PolicyService,
} from '../ports/policy-service.js';
import { CAPABILITY_PERMISSIONS } from '../ports/policy-service.js';
import type { IdSource } from '../ports/id-source.js';

export interface SetCapabilityAvailabilityInput {
  readonly principal: PolicyPrincipal;
  readonly environment: string;
  /** Null = environment-wide row; a ref narrows to one jurisdiction. */
  readonly jurisdictionRef: string | null;
  readonly capabilityId: string;
  readonly state: AvailabilityState;
  readonly reason: string;
  /** Required when the row already exists (optimistic concurrency). */
  readonly expectedVersion?: number;
  readonly now: Date;
}

export type SetCapabilityAvailabilityError =
  | AuthorizationDenied
  | UnknownCapability
  | AboveCeiling
  | AlreadyExists
  | VersionConflict
  | StoreFailure
  | AuditAppendFailed;

export class SetCapabilityAvailability<Id extends string> {
  constructor(
    private readonly registry: CapabilityRegistryView<Id>,
    private readonly rows: CapabilityAvailabilityRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: CapabilityAuditTrail,
  ) {}

  async execute(
    input: SetCapabilityAvailabilityInput,
  ): Promise<Result<CapabilityAvailabilityRecord, SetCapabilityAvailabilityError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      CAPABILITY_PERMISSIONS.manageAvailability,
    );
    if (!authorized.ok) return authorized;

    requireNonEmpty('reason', input.reason);
    if (!isKararEnvironment(input.environment)) {
      throw new InvalidCapabilityInputError(
        `'${input.environment}' is not a known environment`,
      );
    }
    const scopeRef = input.jurisdictionRef;
    if (scopeRef !== null) requireNonEmpty('jurisdictionRef', scopeRef);

    const descriptor = this.descriptorFor(input.capabilityId);
    if (descriptor === null) {
      const refusal: UnknownCapability = {
        kind: 'UNKNOWN_CAPABILITY',
        capabilityId: input.capabilityId,
        message:
          `'${input.capabilityId}' is not a registered capability — availability rows exist ` +
          `only for the reviewed production registry`,
      };
      return Result.err(refusal);
    }

    if (isAllowingState(input.state)) {
      const ceilingBreach = this.ceilingBreachFor(descriptor, input.environment, scopeRef);
      if (ceilingBreach !== null) {
        const denied = await this.audit.record({
          occurredAt: input.now,
          actorRef: input.principal.principalRef,
          tenantRef: input.principal.tenantRef,
          action: 'capability.availability.set',
          resourceType: 'capability_availability',
          resourceId: `${input.environment}:${scopeRef ?? '*'}:${input.capabilityId}`,
          outcome: 'DENIED',
          reason: ceilingBreach,
          afterMetadata: { requestedState: input.state, capabilityId: input.capabilityId },
        });
        if (!denied.ok) return denied;
        return Result.err({
          kind: 'ABOVE_CEILING',
          capabilityId: input.capabilityId,
          message: ceilingBreach,
        });
      }
    }

    let existing: CapabilityAvailabilityRecord | null;
    try {
      existing = await this.rows.findExact(input.environment, scopeRef, input.capabilityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    if (existing === null) {
      const record: CapabilityAvailabilityRecord = Object.freeze({
        id: this.ids.nextId(),
        environment: input.environment,
        jurisdictionRef: scopeRef,
        capabilityId: input.capabilityId,
        state: input.state,
        reason: input.reason,
        actorRef: input.principal.principalRef,
        version: 1,
      });
      try {
        await this.rows.insert(record, input.now);
      } catch (error) {
        return Result.err(toStoreFailure(error));
      }
      const audited = await this.recordChange(input, null, record);
      if (!audited.ok) return audited;
      return Result.ok(record);
    }

    if (input.expectedVersion === undefined) {
      return Result.err({
        kind: 'ALREADY_EXISTS',
        resource: 'capability_availability',
        id: existing.id,
        message:
          `a row for (${input.environment}, ${scopeRef ?? '*'}, ${input.capabilityId}) ` +
          `already exists at version ${existing.version}; pass expectedVersion to change it`,
      });
    }

    let updated: 'UPDATED' | 'VERSION_CONFLICT';
    try {
      updated = await this.rows.updateState(
        existing.id,
        input.expectedVersion,
        input.state,
        input.reason,
        input.principal.principalRef,
        input.now,
      );
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (updated === 'VERSION_CONFLICT') {
      return Result.err({
        kind: 'VERSION_CONFLICT',
        resource: 'capability_availability',
        id: existing.id,
        expectedVersion: input.expectedVersion,
        message: `capability_availability ${existing.id} moved past version ${input.expectedVersion}`,
      });
    }
    const record: CapabilityAvailabilityRecord = Object.freeze({
      ...existing,
      state: input.state,
      reason: input.reason,
      actorRef: input.principal.principalRef,
      version: input.expectedVersion + 1,
    });
    const audited = await this.recordChange(input, existing, record);
    if (!audited.ok) return audited;
    return Result.ok(record);
  }

  private descriptorFor(
    capabilityId: string,
  ): CapabilityRegistryView<Id>['descriptors'][Id] | null {
    const known = (this.registry.ids as readonly string[]).includes(capabilityId);
    if (!known) return null;
    return this.registry.descriptors[capabilityId as Id] ?? null;
  }

  /** Why an allowing state would exceed the code ceiling, or null when it would not. */
  private ceilingBreachFor(
    descriptor: NonNullable<CapabilityRegistryView<Id>['descriptors'][Id]>,
    environment: string,
    scopeRef: string | null,
  ): string | null {
    if (descriptor.implementation !== 'IMPLEMENTED') {
      return `capability '${descriptor.id}' is NOT_IMPLEMENTED — an allowing availability state cannot be configured for missing code`;
    }
    if (descriptor.deployment[environment as keyof typeof descriptor.deployment] !== 'DEPLOYED') {
      return `capability '${descriptor.id}' is not DEPLOYED in '${environment}' — an allowing availability state cannot precede deployment`;
    }
    if (scopeRef !== null) {
      const declared = (descriptor.declaredJurisdictions as readonly string[]).includes(scopeRef);
      if (!declared) {
        return `capability '${descriptor.id}' does not declare '${scopeRef}' — an allowing availability state cannot exceed the declared jurisdictions`;
      }
    }
    return null;
  }

  private async recordChange(
    input: SetCapabilityAvailabilityInput,
    before: CapabilityAvailabilityRecord | null,
    after: CapabilityAvailabilityRecord,
  ): Promise<Result<void, AuditAppendFailed>> {
    return this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      tenantRef: input.principal.tenantRef,
      action: 'capability.availability.set',
      resourceType: 'capability_availability',
      resourceId: after.id,
      outcome: 'SUCCESS',
      reason: input.reason,
      beforeMetadata:
        before === null ? null : { state: before.state, version: before.version },
      afterMetadata: {
        capabilityId: after.capabilityId,
        environment: after.environment,
        state: after.state,
        version: after.version,
      },
    });
  }
}
