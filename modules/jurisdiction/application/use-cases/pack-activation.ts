/**
 * Pack activation use cases over the append-only ledger (migration 0075).
 *
 * The pure predicates from @karar/jurisdiction-policy decide what MAY
 * happen; these use cases decide what DID: an activation validates the pack
 * structurally (an invalid pack never activates), passes the lifecycle
 * predicate (DRAFT and unapproved packs cannot activate outside local
 * environments — canActivate fails closed), authorizes through the
 * PolicyService port (jurisdiction.pack.activate, unseeded in 3.5), appends
 * the event, and audits it. Retirement is symmetric and only ever retires
 * the version that is actually active.
 *
 * The pack arrives as a VALUE (the code-resident constant); the ledger
 * stores only its version and lifecycle metadata, never its content.
 */

import { Result } from '@karar/shared-kernel';
import {
  canActivate,
  validatePack,
  type PolicyEnvironment,
  type PolicyPack,
} from '@karar/jurisdiction-policy';

import { deriveActivePack, type ActivePackState, type PackActivationRecord } from '../../domain/pack-activation.js';
import {
  requireNonEmpty,
  toStoreFailure,
  type ActivationDenied,
  type AlreadyActive,
  type AuditAppendFailed,
  type NotActive,
  type PackInvalid,
  type StoreFailure,
  type UnknownJurisdiction,
} from '../errors.js';
import { JurisdictionAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type { JurisdictionDirectory, PackActivationLedger } from '../ports/repositories.js';
import {
  JURISDICTION_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export interface ActivatePackVersionInput {
  readonly principal: PolicyPrincipal;
  readonly pack: PolicyPack<string>;
  readonly environment: PolicyEnvironment;
  /** Disclosure-bearing capability ids for structural validation — supplied
   * by the composition root from the capability registry (data, no cycle). */
  readonly disclosureBearingCapabilityIds?: readonly string[];
  readonly reason: string;
  readonly now: Date;
}

export type ActivatePackVersionError =
  | AuthorizationDenied
  | UnknownJurisdiction
  | PackInvalid
  | ActivationDenied
  | AlreadyActive
  | StoreFailure
  | AuditAppendFailed;

export class ActivatePackVersion {
  constructor(
    private readonly ledger: PackActivationLedger,
    private readonly directory: JurisdictionDirectory,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: ActivatePackVersionInput,
  ): Promise<Result<PackActivationRecord, ActivatePackVersionError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      JURISDICTION_PERMISSIONS.activatePack,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const findings = validatePack(input.pack, {
      ...(input.disclosureBearingCapabilityIds === undefined
        ? {}
        : { disclosureBearingCapabilityIds: input.disclosureBearingCapabilityIds }),
    });
    if (findings.length > 0) {
      return Result.err({ kind: 'PACK_INVALID', packVersion: input.pack.version, findings });
    }
    const activation = canActivate(input.pack, input.environment);
    if (!activation.allowed) {
      return Result.err({
        kind: 'ACTIVATION_DENIED',
        packVersion: input.pack.version,
        environment: input.environment,
        reasons: activation.reasons,
      });
    }
    let register;
    try {
      register = await this.directory.findJurisdiction(input.pack.jurisdiction);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (register === null) {
      return Result.err({ kind: 'UNKNOWN_JURISDICTION', code: String(input.pack.jurisdiction) });
    }

    let current: ActivePackState;
    try {
      current = deriveActivePack(await this.ledger.listFor(register.code, input.environment));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (current.active && current.packVersion === input.pack.version) {
      return Result.err({ kind: 'ALREADY_ACTIVE', packVersion: input.pack.version });
    }

    const record: PackActivationRecord = Object.freeze({
      id: this.ids.nextId(),
      jurisdictionCode: register.code,
      packVersion: input.pack.version,
      packLifecycleAtActivation: input.pack.lifecycle,
      environment: input.environment,
      action: 'ACTIVATED',
      occurredAt: input.now,
      actor: input.principal.principalRef,
      reason: requireNonEmpty('reason', input.reason),
      createdAt: input.now,
    });
    try {
      await this.ledger.append(record);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'jurisdiction.pack.activated',
      resourceType: 'policy_pack_activation',
      resourceId: record.id,
      reason: record.reason,
      afterMetadata: {
        jurisdictionCode: record.jurisdictionCode,
        packVersion: record.packVersion,
        packLifecycleAtActivation: record.packLifecycleAtActivation,
        environment: record.environment,
        supersededVersion: current.active ? current.packVersion : 'none',
      },
    });
    return audited.ok ? Result.ok(record) : audited;
  }
}

export interface RetirePackVersionInput {
  readonly principal: PolicyPrincipal;
  readonly pack: PolicyPack<string>;
  readonly environment: PolicyEnvironment;
  readonly reason: string;
  readonly now: Date;
}

export type RetirePackVersionError =
  | AuthorizationDenied
  | UnknownJurisdiction
  | NotActive
  | StoreFailure
  | AuditAppendFailed;

export class RetirePackVersion {
  constructor(
    private readonly ledger: PackActivationLedger,
    private readonly directory: JurisdictionDirectory,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: JurisdictionAuditTrail,
  ) {}

  async execute(
    input: RetirePackVersionInput,
  ): Promise<Result<PackActivationRecord, RetirePackVersionError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      JURISDICTION_PERMISSIONS.activatePack,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let register;
    try {
      register = await this.directory.findJurisdiction(input.pack.jurisdiction);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (register === null) {
      return Result.err({ kind: 'UNKNOWN_JURISDICTION', code: String(input.pack.jurisdiction) });
    }
    let current: ActivePackState;
    try {
      current = deriveActivePack(await this.ledger.listFor(register.code, input.environment));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (!current.active || current.packVersion !== input.pack.version) {
      return Result.err({
        kind: 'NOT_ACTIVE',
        packVersion: input.pack.version,
        activeVersion: current.active ? current.packVersion : null,
      });
    }

    const record: PackActivationRecord = Object.freeze({
      id: this.ids.nextId(),
      jurisdictionCode: register.code,
      packVersion: input.pack.version,
      packLifecycleAtActivation: input.pack.lifecycle,
      environment: input.environment,
      action: 'RETIRED',
      occurredAt: input.now,
      actor: input.principal.principalRef,
      reason: requireNonEmpty('reason', input.reason),
      createdAt: input.now,
    });
    try {
      await this.ledger.append(record);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'jurisdiction.pack.retired',
      resourceType: 'policy_pack_activation',
      resourceId: record.id,
      reason: record.reason,
      afterMetadata: {
        jurisdictionCode: record.jurisdictionCode,
        packVersion: record.packVersion,
        environment: record.environment,
      },
    });
    return audited.ok ? Result.ok(record) : audited;
  }
}

export interface GetActivePackVersionInput {
  readonly jurisdictionCode: string;
  readonly environment: PolicyEnvironment;
}

export type GetActivePackVersionError = UnknownJurisdiction | StoreFailure;

export class GetActivePackVersion {
  constructor(
    private readonly ledger: PackActivationLedger,
    private readonly directory: JurisdictionDirectory,
  ) {}

  async execute(
    input: GetActivePackVersionInput,
  ): Promise<Result<ActivePackState, GetActivePackVersionError>> {
    let register;
    try {
      register = await this.directory.findJurisdiction(input.jurisdictionCode);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (register === null) {
      return Result.err({ kind: 'UNKNOWN_JURISDICTION', code: input.jurisdictionCode });
    }
    try {
      const events = await this.ledger.listFor(register.code, input.environment);
      return Result.ok(deriveActivePack(events));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}
