/**
 * OperatingEntity — the legal person providing the service (ADR-0024;
 * docs/architecture/operating-entity.md). Not where (country), not under
 * which regime (jurisdiction): WHO is liable, who contracts, who is the data
 * controller, who holds the licence, who releases disclosed data.
 *
 * Deliberately absent from this aggregate: a `dataProtectionRole` column
 * (the role is per relationship — `DataProtectionRoleAssignment`), and any
 * claim about a regulator (licences are typed references —
 * `EntityLicence`). The entity record itself is a register entry, nothing
 * more.
 */

import type { JurisdictionRef } from './refs.js';

declare const operatingEntityIdBrand: unique symbol;
export type OperatingEntityId = string & {
  readonly [operatingEntityIdBrand]: 'OperatingEntityId';
};

export const OPERATING_ENTITY_STATUSES = ['ACTIVE', 'SUSPENDED', 'RETIRED'] as const;
export type OperatingEntityStatus = (typeof OPERATING_ENTITY_STATUSES)[number];

export interface OperatingEntity {
  readonly id: OperatingEntityId;
  readonly legalName: string;
  readonly registrationNumber: string;
  readonly registeredJurisdictionRef: JurisdictionRef;
  /** May this entity hold consumer contracts? */
  readonly contractingCapacity: boolean;
  readonly dataProtectionContact: string;
  readonly status: OperatingEntityStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EntityJurisdictionPermission {
  readonly id: string;
  readonly entityId: OperatingEntityId;
  readonly jurisdictionRef: JurisdictionRef;
  readonly permittedFrom: Date;
  readonly permittedTo: Date | null;
  /** The contract, legal opinion, or registration carrying the actual claim. */
  readonly basisReference: string;
}

/**
 * Reference-key equality. Matching a window to the reference it was granted
 * for is a LOOKUP, not a behaviour branch — behaviour differences resolve
 * through policy packs (architecture test 12), and this helper keeps the
 * lookup visibly distinct from branching.
 */
function sameRef(a: string, b: string): boolean {
  return a === b;
}

/** Whether any permission window covers `jurisdictionRef` at instant `at`. */
export function isPermittedInJurisdiction(
  permissions: ReadonlyArray<EntityJurisdictionPermission>,
  jurisdictionRef: JurisdictionRef,
  at: Date,
): boolean {
  return permissions.some(
    (p) =>
      sameRef(p.jurisdictionRef, jurisdictionRef) &&
      p.permittedFrom.getTime() <= at.getTime() &&
      (p.permittedTo === null || p.permittedTo.getTime() > at.getTime()),
  );
}
