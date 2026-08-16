/**
 * EntityLicence — a licence as a TYPED REFERENCE (ADR-0024): a row records
 * that someone claimed or evidenced a licence reference; it NEVER implies a
 * legal fact, and Karar's documentation claims no licence anywhere. The
 * status vocabulary carries provenance in the value itself, so no reader can
 * mistake a claim for a regulator's word. Capability/licence RESOLUTION is
 * Phase 3.5 — nothing enables on free text.
 */

import type { OperatingEntityId } from './operating-entity.js';

export const ENTITY_LICENCE_STATUSES = [
  /** Asserted by an operator or partner; no evidence held. */
  'CLAIMED_UNVERIFIED',
  /** An evidence reference is on file — a record of evidence, not approval. */
  'EVIDENCED',
  /** The recorded expiry has passed, per our record. */
  'EXPIRED',
  /** We recorded a revocation; the evidence reference says by whom. */
  'REVOKED',
] as const;
export type EntityLicenceStatus = (typeof ENTITY_LICENCE_STATUSES)[number];

/**
 * The honesty rule the schema also enforces by CHECK: EVIDENCED without
 * evidence on file is a contradiction.
 */
export function licenceStatusRequiresEvidence(status: EntityLicenceStatus): boolean {
  return status === 'EVIDENCED';
}

export interface EntityLicence {
  readonly id: string;
  readonly entityId: OperatingEntityId;
  readonly licenceTypeRef: string;
  readonly status: EntityLicenceStatus;
  /** Who asserted this row — an operator or partner-document reference. */
  readonly sourceProvenance: string;
  readonly effectiveDate: Date | null;
  readonly expiryDate: Date | null;
  /** The named owner accountable for reviewing this claim. */
  readonly reviewOwner: string;
  readonly evidenceReference: string | null;
}
