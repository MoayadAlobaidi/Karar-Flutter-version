/**
 * Tenant capability entitlements — grant and revoke, the ONLY write paths
 * onto tenant_capability_entitlements. Operator work, permission-gated
 * (capability.entitlement.manage — declared-but-unseeded this phase:
 * absence denies), audited, versioned, and run under a principal context
 * carrying the TARGET tenant (RLS is FORCEd; an unbound statement affects
 * nothing).
 *
 * Restrict-only by placement: an entitlement satisfies gate 5 and nothing
 * else — granting one for a capability that is unbuilt, undeployed,
 * uncleared, or disabled changes NO resolution outcome (gates 1-4 run
 * first), which the property harness proves. `sourceRef` is the port seam a
 * future subscription module fills; no plan or pricing concept exists here.
 *
 * Ids are validated against the registry view bound at construction — the
 * production registry in composition — and the migration CHECK-constrains
 * the same closed set, so a synthetic test id can never reach a row.
 */

import { Result } from '@karar/shared-kernel';

import type { TenantCapabilityEntitlement } from '../../domain/entitlement.js';
import {
  InvalidCapabilityInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type NotFound,
  type StoreFailure,
  type UnknownCapability,
  type VersionConflict,
} from '../errors.js';
import { CapabilityAuditTrail } from '../audit-trail.js';
import type { CapabilityRegistryView } from '../registry-view.js';
import type {
  EntitlementPrincipal,
  TenantCapabilityEntitlementRepository,
} from '../ports/entitlement-repository.js';
import type {
  AuthorizationDenied,
  PolicyPrincipal,
  PolicyService,
} from '../ports/policy-service.js';
import { CAPABILITY_PERMISSIONS } from '../ports/policy-service.js';
import type { IdSource } from '../ports/id-source.js';

export interface GrantTenantCapabilityEntitlementInput {
  readonly principal: PolicyPrincipal;
  /** The context the statements run under: target tenant + acting user. */
  readonly context: EntitlementPrincipal;
  readonly capabilityId: string;
  readonly sourceRef: string;
  readonly reason: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
  readonly now: Date;
}

export type GrantTenantCapabilityEntitlementError =
  | AuthorizationDenied
  | UnknownCapability
  | VersionConflict
  | StoreFailure
  | AuditAppendFailed;

export class GrantTenantCapabilityEntitlement<Id extends string> {
  constructor(
    private readonly registry: CapabilityRegistryView<Id>,
    private readonly entitlements: TenantCapabilityEntitlementRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: CapabilityAuditTrail,
  ) {}

  async execute(
    input: GrantTenantCapabilityEntitlementInput,
  ): Promise<Result<TenantCapabilityEntitlement, GrantTenantCapabilityEntitlementError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      CAPABILITY_PERMISSIONS.manageEntitlement,
    );
    if (!authorized.ok) return authorized;

    requireNonEmpty('sourceRef', input.sourceRef);
    requireNonEmpty('reason', input.reason);
    const effectiveTo = input.effectiveTo ?? null;
    if (effectiveTo !== null && effectiveTo.getTime() <= input.effectiveFrom.getTime()) {
      throw new InvalidCapabilityInputError('effectiveTo must be after effectiveFrom');
    }
    const unknown = this.unknownCapability(input.capabilityId);
    if (unknown !== null) return Result.err(unknown);

    let existing: TenantCapabilityEntitlement | null;
    try {
      existing = await this.entitlements.findByCapability(input.context, input.capabilityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    const change = {
      status: 'ACTIVE' as const,
      sourceRef: input.sourceRef,
      reason: input.reason,
      actorRef: input.principal.principalRef,
      effectiveFrom: input.effectiveFrom,
      effectiveTo,
    };

    if (existing === null) {
      const entitlement: TenantCapabilityEntitlement = Object.freeze({
        id: this.ids.nextId(),
        tenantId: input.context.tenantId,
        capabilityId: input.capabilityId,
        version: 1,
        ...change,
      });
      try {
        await this.entitlements.insert(input.context, entitlement, input.now);
      } catch (error) {
        return Result.err(toStoreFailure(error));
      }
      const audited = await this.recordChange(input, 'capability.entitlement.grant', null, entitlement);
      if (!audited.ok) return audited;
      return Result.ok(entitlement);
    }

    let updated: 'UPDATED' | 'VERSION_CONFLICT';
    try {
      updated = await this.entitlements.transition(
        input.context,
        existing.id,
        existing.version,
        change,
        input.now,
      );
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (updated === 'VERSION_CONFLICT') {
      return Result.err({
        kind: 'VERSION_CONFLICT',
        resource: 'tenant_capability_entitlements',
        id: existing.id,
        expectedVersion: existing.version,
        message: `entitlement ${existing.id} moved past version ${existing.version}; re-read and retry`,
      });
    }
    const entitlement: TenantCapabilityEntitlement = Object.freeze({
      ...existing,
      ...change,
      version: existing.version + 1,
    });
    const audited = await this.recordChange(
      input,
      'capability.entitlement.grant',
      existing,
      entitlement,
    );
    if (!audited.ok) return audited;
    return Result.ok(entitlement);
  }

  private unknownCapability(capabilityId: string): UnknownCapability | null {
    if ((this.registry.ids as readonly string[]).includes(capabilityId)) return null;
    return {
      kind: 'UNKNOWN_CAPABILITY',
      capabilityId,
      message:
        `'${capabilityId}' is not a registered capability — entitlements exist only for ` +
        `the reviewed production registry`,
    };
  }

  private recordChange(
    input: GrantTenantCapabilityEntitlementInput,
    action: string,
    before: TenantCapabilityEntitlement | null,
    after: TenantCapabilityEntitlement,
  ): Promise<Result<void, AuditAppendFailed>> {
    return this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      tenantRef: after.tenantId,
      action,
      resourceType: 'tenant_capability_entitlement',
      resourceId: after.id,
      outcome: 'SUCCESS',
      reason: input.reason,
      beforeMetadata:
        before === null ? null : { status: before.status, version: before.version },
      afterMetadata: {
        capabilityId: after.capabilityId,
        status: after.status,
        sourceRef: after.sourceRef,
        version: after.version,
      },
    });
  }
}

export interface RevokeTenantCapabilityEntitlementInput {
  readonly principal: PolicyPrincipal;
  readonly context: EntitlementPrincipal;
  readonly capabilityId: string;
  readonly reason: string;
  readonly now: Date;
}

export type RevokeTenantCapabilityEntitlementError =
  | AuthorizationDenied
  | UnknownCapability
  | NotFound
  | VersionConflict
  | StoreFailure
  | AuditAppendFailed;

export class RevokeTenantCapabilityEntitlement<Id extends string> {
  constructor(
    private readonly registry: CapabilityRegistryView<Id>,
    private readonly entitlements: TenantCapabilityEntitlementRepository,
    private readonly policy: PolicyService,
    private readonly audit: CapabilityAuditTrail,
  ) {}

  async execute(
    input: RevokeTenantCapabilityEntitlementInput,
  ): Promise<Result<TenantCapabilityEntitlement, RevokeTenantCapabilityEntitlementError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      CAPABILITY_PERMISSIONS.manageEntitlement,
    );
    if (!authorized.ok) return authorized;

    requireNonEmpty('reason', input.reason);
    if (!(this.registry.ids as readonly string[]).includes(input.capabilityId)) {
      return Result.err({
        kind: 'UNKNOWN_CAPABILITY',
        capabilityId: input.capabilityId,
        message: `'${input.capabilityId}' is not a registered capability`,
      });
    }

    let existing: TenantCapabilityEntitlement | null;
    try {
      existing = await this.entitlements.findByCapability(input.context, input.capabilityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (existing === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'tenant_capability_entitlements',
        id: input.capabilityId,
      });
    }

    // Revocation ends the window: an already-ended window keeps its end;
    // otherwise it ends now — or AT effectiveFrom for a not-yet-started
    // grant, leaving an empty window (the schema permits to == from).
    const alreadyEnded =
      existing.effectiveTo !== null && existing.effectiveTo.getTime() <= input.now.getTime();
    const change = {
      status: 'REVOKED' as const,
      sourceRef: existing.sourceRef,
      reason: input.reason,
      actorRef: input.principal.principalRef,
      effectiveFrom: existing.effectiveFrom,
      effectiveTo: alreadyEnded
        ? existing.effectiveTo
        : new Date(Math.max(input.now.getTime(), existing.effectiveFrom.getTime())),
    };
    let updated: 'UPDATED' | 'VERSION_CONFLICT';
    try {
      updated = await this.entitlements.transition(
        input.context,
        existing.id,
        existing.version,
        change,
        input.now,
      );
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (updated === 'VERSION_CONFLICT') {
      return Result.err({
        kind: 'VERSION_CONFLICT',
        resource: 'tenant_capability_entitlements',
        id: existing.id,
        expectedVersion: existing.version,
        message: `entitlement ${existing.id} moved past version ${existing.version}; re-read and retry`,
      });
    }

    const entitlement: TenantCapabilityEntitlement = Object.freeze({
      ...existing,
      ...change,
      version: existing.version + 1,
    });
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      tenantRef: entitlement.tenantId,
      action: 'capability.entitlement.revoke',
      resourceType: 'tenant_capability_entitlement',
      resourceId: entitlement.id,
      outcome: 'SUCCESS',
      reason: input.reason,
      beforeMetadata: { status: existing.status, version: existing.version },
      afterMetadata: {
        capabilityId: entitlement.capabilityId,
        status: entitlement.status,
        version: entitlement.version,
      },
    });
    if (!audited.ok) return audited;
    return Result.ok(entitlement);
  }
}
