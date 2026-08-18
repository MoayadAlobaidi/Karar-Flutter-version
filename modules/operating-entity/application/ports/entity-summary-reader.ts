/**
 * The CLIENT-SAFE read seam onto the entity register (declared inward,
 * architecture test 5).
 *
 * WHY A SEPARATE PORT rather than projecting from `OperatingEntityRepository`
 * in the caller: `findById` returns the whole register row, and a projection
 * applied after the fact is a convention. This port's implementation SELECTs
 * only the reviewed columns, so the unsafe ones never enter the process at
 * all — the same defence in depth the module applies to writes.
 *
 * WHAT THE REVIEW ADMITTED (and why each field is safe to show the subject it
 * concerns):
 *   * `id`                — the reference the subject's own pinned records
 *                           already carry; it identifies nothing else.
 *   * `legalName`         — WHO the subject contracted with. Withholding it
 *                           would make the contracting relationship opaque to
 *                           the party in it. The register holds no separate
 *                           trading/display name, and this module will not
 *                           invent one.
 *   * `registeredJurisdictionRef` — the regime the entity is registered in,
 *                           as reference DATA for display. Never a branch
 *                           (architecture test 12).
 *   * `dataProtectionContact` — a published ROLE MAILBOX reference (MODULE.md:
 *                           "not a person"). It is the address a subject uses
 *                           to exercise their own rights; a data-protection
 *                           contact that the subject cannot see defeats its
 *                           purpose.
 *
 * WHAT IS EXCLUDED, deliberately, and must not be added here:
 *   * `registration_number` — register internals; the subject has no use for
 *     the registry key and it identifies the entity in external systems.
 *   * `contracting_capacity` — stored legal analysis about what the entity may
 *     do, not a fact about the subject's relationship.
 *   * `status` — administrative lifecycle (ACTIVE/SUSPENDED/RETIRED); an
 *     operational signal about the operator, not about the subject.
 *   * `created_at` / `updated_at` — administrative metadata.
 *   * licences and their evidence references (`entity_licences`), jurisdiction
 *     permissions and their basis references, data-protection role
 *     assignments, and entity migrations. None of these are reachable from
 *     this port by construction — it reads ONE table, by id.
 *
 * The id is never supplied by a caller: `GetEffectiveOperatingEntitySummary`
 * resolves it from the principal's own binding first, so this port cannot be
 * used to enumerate or probe the register.
 */

import type { OperatingEntityId } from '../../domain/operating-entity.js';
import type { JurisdictionRef } from '../../domain/refs.js';

/** The reviewed safe projection. Adding a field here is a disclosure decision. */
export interface OperatingEntitySummary {
  readonly id: OperatingEntityId;
  readonly legalName: string;
  readonly registeredJurisdictionRef: JurisdictionRef;
  /** Published role-mailbox reference; NOT NULL in the register. */
  readonly dataProtectionContact: string;
}

export interface OperatingEntitySummaryReader {
  /** The safe projection for ONE entity, or null when no such row exists. */
  findSummaryById(id: OperatingEntityId): Promise<OperatingEntitySummary | null>;
}
