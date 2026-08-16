/**
 * Persistence ports (declared inward, architecture test 5). The assignment
 * repositories take an explicit principal because their tables are
 * RLS-FORCEd on principal GUCs: every statement runs inside a
 * withPrincipalContext transaction bound to that principal — for
 * operator/seed-side writes that is the TARGET subject's context,
 * established by the use case, never ambient. The reference, settings, and
 * ledger ports read deliberately-global tables (allow-listed with
 * compensating grants) and take no principal.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';
import type { JurisdictionId, PolicyEnvironment } from '@karar/jurisdiction-policy';

import type {
  TenantJurisdictionAssignment,
  UserJurisdictionAssignment,
} from '../../domain/assignment.js';
import type { PackActivationRecord } from '../../domain/pack-activation.js';
import type {
  CountryRecord,
  JurisdictionRecord,
  JurisdictionSettingsRecord,
} from '../../domain/reference.js';

export interface UserAssignmentPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

export interface TenantAssignmentPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

export interface UserJurisdictionAssignmentRepository {
  insert(
    principal: UserAssignmentPrincipal,
    assignment: UserJurisdictionAssignment,
  ): Promise<void>;
  /** Ends every open assignment for the principal at `endsAt`; returns the
   * ended ids. The schema trigger permits exactly this UPDATE shape. */
  endOpen(principal: UserAssignmentPrincipal, endsAt: Date): Promise<readonly string[]>;
  listForPrincipal(
    principal: UserAssignmentPrincipal,
  ): Promise<readonly UserJurisdictionAssignment[]>;
}

export interface TenantJurisdictionAssignmentRepository {
  insert(
    principal: TenantAssignmentPrincipal,
    assignment: TenantJurisdictionAssignment,
  ): Promise<void>;
  endOpen(principal: TenantAssignmentPrincipal, endsAt: Date): Promise<readonly string[]>;
  listForTenant(
    principal: TenantAssignmentPrincipal,
  ): Promise<readonly TenantJurisdictionAssignment[]>;
}

/** Reads of the migration-seeded reference registers (0070/0071). */
export interface JurisdictionDirectory {
  findJurisdiction(code: string): Promise<JurisdictionRecord | null>;
  listJurisdictions(): Promise<readonly JurisdictionRecord[]>;
  listCountries(): Promise<readonly CountryRecord[]>;
}

/** Restrict-only settings reads (0074); null = no restriction exists. */
export interface JurisdictionSettingsReader {
  findSettings(code: JurisdictionId): Promise<JurisdictionSettingsRecord | null>;
}

/** The append-only activation ledger (0075). */
export interface PackActivationLedger {
  append(record: PackActivationRecord): Promise<void>;
  listFor(
    code: JurisdictionId,
    environment: PolicyEnvironment,
  ): Promise<readonly PackActivationRecord[]>;
}
