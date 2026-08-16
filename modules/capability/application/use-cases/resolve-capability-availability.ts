/**
 * ResolveCapabilityAvailability — the deny-by-default availability resolver
 * (capability-registry.md §4). Assembles ONE immutable facts snapshot per
 * capability from the ports (one read per dimension — the §44 TOCTOU
 * discipline), hands it to the pure domain gate engine, and returns every
 * resolution WITH its provenance pins (pack version, availability row
 * version, entitlement version).
 *
 * This is the FULL INTERNAL view: every denial carries its real reason.
 * Client channels never consume it directly — they go through
 * `ResolveClientCapabilityView`, where hidden capabilities and hidden
 * reasons are filtered in one place.
 *
 * The environment is bound at CONSTRUCTION from server-side configuration.
 * There is no environment field on the input, so a client cannot supply one
 * — structurally, not by validation.
 *
 * Security-relevant denials are audited: a denial at the ceiling gates
 * (descriptor / environment / jurisdiction / availability) while a
 * grant-like row exists (an allowing availability state, or a satisfying
 * entitlement) is an attempted expansion above the ceiling that the merge
 * refused, and that refusal must be accountable.
 */

import { Result, type TenantId, type UserId } from '@karar/shared-kernel';
import type { KararEnvironment } from '@karar/capability-registry';

import {
  resolveCapabilityGates,
  type AvailabilityFacts,
  type CapabilityResolution,
  type CeilingFacts,
  type ClearedCapabilityFacts,
  type ConsentFacts,
  type EntitlementFacts,
  type GateInputs,
  type LicensingFacts,
  type ProviderFacts,
} from '../../domain/resolution.js';
import { entitlementSatisfiesAt } from '../../domain/entitlement.js';
import { isAllowingState } from '../../domain/availability-state.js';
import {
  toResolutionFailed,
  type AuditAppendFailed,
  type ResolutionFailed,
  type UnknownCapability,
} from '../errors.js';
import { CapabilityAuditTrail } from '../audit-trail.js';
import { descriptorFactsFor, type CapabilityRegistryView } from '../registry-view.js';
import type { PolicyCeilingSource } from '../ports/policy-ceiling-source.js';
import type { CapabilityAvailabilityRepository } from '../ports/availability-repository.js';
import type {
  EntitlementPrincipal,
  TenantCapabilityEntitlementRepository,
} from '../ports/entitlement-repository.js';
import type { ConsentGate } from '../ports/consent-gate.js';
import type { LicenceDirectory } from '../ports/licence-directory.js';
import type { ProviderAvailabilitySource } from '../ports/provider-availability-source.js';

export interface ResolutionSubject {
  readonly tenantId: TenantId;
  /** Null for principal-less contexts; consent and entitlement then fail closed. */
  readonly userId: UserId | null;
}

export interface ResolveCapabilityAvailabilityInput<Id extends string> {
  readonly subject: ResolutionSubject;
  readonly now: Date;
  /** Restrict to these ids; default is every id in the registry view. */
  readonly capabilityIds?: readonly Id[];
}

export interface CapabilityResolutionSet<Id extends string> {
  readonly environment: KararEnvironment;
  readonly resolvedAt: Date;
  readonly resolutions: ReadonlyArray<CapabilityResolution<Id>>;
}

export type ResolveCapabilityAvailabilityError =
  | ResolutionFailed
  | UnknownCapability
  | AuditAppendFailed;

/** The gates whose denial, in the face of a grant-like row, is audited. */
const CEILING_GATES = new Set(['DESCRIPTOR', 'ENVIRONMENT', 'JURISDICTION', 'AVAILABILITY']);

export class ResolveCapabilityAvailability<Id extends string> {
  constructor(
    private readonly registry: CapabilityRegistryView<Id>,
    private readonly environment: KararEnvironment,
    private readonly ceilingSource: PolicyCeilingSource,
    private readonly availability: CapabilityAvailabilityRepository,
    private readonly entitlements: TenantCapabilityEntitlementRepository,
    private readonly consent: ConsentGate,
    private readonly licences: LicenceDirectory,
    private readonly providers: ProviderAvailabilitySource,
    private readonly audit: CapabilityAuditTrail,
  ) {}

  async execute(
    input: ResolveCapabilityAvailabilityInput<Id>,
  ): Promise<Result<CapabilityResolutionSet<Id>, ResolveCapabilityAvailabilityError>> {
    const ids = input.capabilityIds ?? this.registry.ids;
    for (const id of ids) {
      if (!this.registry.ids.includes(id)) {
        return Result.err({
          kind: 'UNKNOWN_CAPABILITY',
          capabilityId: id,
          message: `capability '${id}' is not in the registry this resolver was constructed with`,
        });
      }
    }

    let ceiling: CeilingFacts;
    try {
      ceiling = await this.ceilingSource.effectivePolicyFor({
        tenantId: input.subject.tenantId,
        userId: input.subject.userId,
        environment: this.environment,
        at: input.now,
      });
    } catch (error) {
      return Result.err(toResolutionFailed(error));
    }

    const resolutions: CapabilityResolution<Id>[] = [];
    for (const id of ids) {
      const descriptor = this.registry.descriptors[id];
      if (descriptor === undefined) {
        return Result.err({
          kind: 'UNKNOWN_CAPABILITY',
          capabilityId: id,
          message: `capability '${id}' has no descriptor in the registry view`,
        });
      }

      let inputs: GateInputs<Id>;
      try {
        inputs = await this.snapshotFor(id, descriptor, ceiling, input);
      } catch (error) {
        return Result.err(toResolutionFailed(error));
      }

      const resolution = resolveCapabilityGates(inputs, input.now);
      resolutions.push(resolution);

      const audited = await this.auditAboveCeilingDenial(resolution, inputs, input);
      if (!audited.ok) return audited;
    }

    return Result.ok({
      environment: this.environment,
      resolvedAt: input.now,
      resolutions,
    });
  }

  private async snapshotFor(
    id: Id,
    descriptor: CapabilityRegistryView<Id>['descriptors'][Id],
    ceiling: CeilingFacts,
    input: ResolveCapabilityAvailabilityInput<Id>,
  ): Promise<GateInputs<Id>> {
    const scopeRef = ceiling.kind === 'RESOLVED' ? ceiling.scopeRef : null;
    const availability: AvailabilityFacts = await this.availability.factsFor(
      this.environment,
      scopeRef,
      id,
    );

    // Entitlements are read under the subject's own principal context; a
    // principal-less resolution has no context to bind, so the dimension
    // reports NONE and gate 5 denies — fail closed, never fail open.
    let entitlement: EntitlementFacts = { kind: 'NONE' };
    if (input.subject.userId !== null) {
      const principal: EntitlementPrincipal = {
        tenantId: input.subject.tenantId,
        userId: input.subject.userId,
      };
      entitlement = await this.entitlements.factsFor(principal, id);
    }

    const cleared: ClearedCapabilityFacts | undefined =
      ceiling.kind === 'RESOLVED'
        ? ceiling.cleared.find((c) => c.capabilityId === id)
        : undefined;

    let consent: ConsentFacts = { kind: 'NOT_EVALUATED' };
    if (
      cleared !== undefined &&
      cleared.processingBasis.kind === 'CONSENT' &&
      scopeRef !== null &&
      input.subject.userId !== null
    ) {
      consent = await this.consent.statusFor(
        { tenantId: input.subject.tenantId, userId: input.subject.userId },
        cleared.processingBasis.purposeRef,
        scopeRef,
        input.now,
      );
    }

    let licensing: LicensingFacts = { kind: 'NOT_EVALUATED' };
    if (cleared !== undefined && cleared.requiredLicenceTypeRefs.length > 0 && scopeRef !== null) {
      licensing = await this.licences.licensingContextFor(
        { tenantId: input.subject.tenantId, userId: input.subject.userId },
        scopeRef,
        input.now,
      );
    }

    let providers: ProviderFacts = { kind: 'NOT_EVALUATED' };
    if (cleared !== undefined && cleared.requiredProviderKinds.length > 0) {
      const statuses = [];
      for (const providerKind of cleared.requiredProviderKinds) {
        statuses.push({
          providerKind,
          status: await this.providers.statusFor(providerKind, this.environment),
        });
      }
      providers = { kind: 'STATUSES', statuses };
    }

    return {
      capabilityId: id,
      environment: this.environment,
      descriptor: descriptorFactsFor(descriptor, this.environment),
      ceiling,
      availability,
      entitlement,
      consent,
      licensing,
      providers,
    };
  }

  /**
   * A ceiling-gate denial while a grant-like row exists is an attempted
   * expansion the merge refused — recorded with outcome DENIED so the
   * refusal is accountable (and so a misconfigured grant is discoverable).
   */
  private async auditAboveCeilingDenial(
    resolution: CapabilityResolution<Id>,
    inputs: GateInputs<Id>,
    input: ResolveCapabilityAvailabilityInput<Id>,
  ): Promise<Result<void, AuditAppendFailed>> {
    if (resolution.outcome !== 'DENIED' || !CEILING_GATES.has(resolution.gate)) {
      return Result.ok(undefined);
    }
    const allowingRow =
      inputs.availability.kind === 'ROW' && isAllowingState(inputs.availability.state);
    const satisfiedEntitlement =
      inputs.entitlement.kind === 'ROW' && entitlementSatisfiesAt(inputs.entitlement, input.now);
    const rowBeyondDescriptorGates =
      allowingRow && resolution.gate !== 'AVAILABILITY' && resolution.gate !== 'ENVIRONMENT';
    if (!rowBeyondDescriptorGates && !satisfiedEntitlement) {
      return Result.ok(undefined);
    }
    return this.audit.record({
      occurredAt: input.now,
      actorRef: input.subject.userId ?? 'system:resolver',
      tenantRef: input.subject.tenantId,
      action: 'capability.resolution.denied_above_ceiling',
      resourceType: 'capability',
      resourceId: resolution.capabilityId,
      outcome: 'DENIED',
      reason: `${resolution.gate} gate denied with ${resolution.reason} while a grant-like row exists`,
      afterMetadata: {
        gate: resolution.gate,
        denialReason: resolution.reason,
        availabilityState: inputs.availability.kind === 'ROW' ? inputs.availability.state : null,
        entitlementStatus: inputs.entitlement.kind === 'ROW' ? inputs.entitlement.status : null,
      },
    });
  }
}
