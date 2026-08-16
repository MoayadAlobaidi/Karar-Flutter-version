/**
 * SubjectPolicySelection — the immutable record that a subject elected one
 * pack-permitted profile option for a capability, pinning jurisdiction,
 * PolicyPack version, and profile version at creation (jurisdiction-
 * policy.md §7). The row carries REFERENCES only; the profile's content
 * belongs to the owning capability's bounded context and never enters this
 * module.
 *
 * Temporal truth lives in the dated columns, not the status marker:
 * `resolveSelectionAt` answers "which selection was effective AT this
 * instant" purely from effective windows, withdrawal instants, and
 * insertion order — so a stale ACTIVE marker on a past-dated row never
 * leaks a dead election (fail closed), and a SUPERSEDED row still answers
 * historical questions with the versions it pinned.
 *
 * The domain is deliberately capability-agnostic: `Id extends string`
 * everywhere. Production call sites pin `Id` to the registry's
 * CapabilityId in the application layer; synthetic test capabilities exist
 * only through this genericity and never reach production types or rows.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { JurisdictionRef, ProfileRef } from './refs.js';

export const SELECTION_STATUSES = ['ACTIVE', 'SUPERSEDED', 'EXPIRED', 'WITHDRAWN'] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export interface SubjectPolicySelection<Id extends string = string> {
  readonly id: string;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly capabilityId: Id;
  /** Opaque reference into the OWNING capability's bounded context. */
  readonly profileRef: ProfileRef;
  /** The elected profile version, pinned at recording. */
  readonly profileVersion: string;
  /** Pinned at recording (provenance; jurisdiction-policy.md §7 rule 2). */
  readonly jurisdictionRef: JurisdictionRef;
  /** The applicable PolicyPack version at recording, pinned. */
  readonly policyPackVersion: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly status: SelectionStatus;
  /** Provenance: which path recorded the election. */
  readonly selectionSource: string;
  /** Provenance: the acting principal (the subject; no other path exists). */
  readonly recordedBy: string;
  /** Hash reference to a capability-owned content snapshot — never content. */
  readonly profileSnapshotHash: string | null;
  readonly withdrawnAt: Date | null;
}

/** The answer to "which selection was effective AT `at`". */
export type SelectionAtInstant<Id extends string = string> =
  | { readonly kind: 'EFFECTIVE'; readonly selection: SubjectPolicySelection<Id> }
  /** A selection existed but its effective window had closed by `at`. */
  | {
      readonly kind: 'EXPIRED';
      readonly selectionId: string;
      readonly expiredAt: Date;
    }
  /** No selection bore on `at` (none recorded, none yet effective, or withdrawn). */
  | { readonly kind: 'NONE' };

function wasWithdrawnBy<Id extends string>(row: SubjectPolicySelection<Id>, at: Date): boolean {
  return row.withdrawnAt !== null && row.withdrawnAt.getTime() <= at.getTime();
}

function windowCovers<Id extends string>(row: SubjectPolicySelection<Id>, at: Date): boolean {
  if (row.effectiveFrom.getTime() > at.getTime()) return false;
  return row.effectiveTo === null || at.getTime() < row.effectiveTo.getTime();
}

/**
 * Pure temporal resolution over one subject's rows for one capability.
 * Later elections shadow earlier ones from their own effective_from onward
 * (supersession inserts, never edits), so replaying a PAST instant returns
 * the row — and therefore the pinned versions — that governed it.
 */
export function resolveSelectionAt<Id extends string>(
  rows: ReadonlyArray<SubjectPolicySelection<Id>>,
  at: Date,
): SelectionAtInstant<Id> {
  const candidates = rows.filter((row) => windowCovers(row, at) && !wasWithdrawnBy(row, at));
  if (candidates.length > 0) {
    let winner = candidates[0] as SubjectPolicySelection<Id>;
    for (const row of candidates) {
      if (
        row.effectiveFrom.getTime() > winner.effectiveFrom.getTime() ||
        (row.effectiveFrom.getTime() === winner.effectiveFrom.getTime() && row.id > winner.id)
      ) {
        winner = row;
      }
    }
    return { kind: 'EFFECTIVE', selection: winner };
  }

  // No effective selection: distinguish an election that RAN OUT (expired —
  // a state the caller must deny on, visibly) from plain absence.
  let expired: SubjectPolicySelection<Id> | null = null;
  for (const row of rows) {
    if (row.effectiveTo === null) continue;
    if (row.effectiveFrom.getTime() > at.getTime()) continue;
    if (row.effectiveTo.getTime() > at.getTime()) continue;
    if (wasWithdrawnBy(row, at)) continue;
    if (
      expired === null ||
      row.effectiveTo.getTime() > (expired.effectiveTo as Date).getTime() ||
      (row.effectiveTo.getTime() === (expired.effectiveTo as Date).getTime() &&
        row.id > expired.id)
    ) {
      expired = row;
    }
  }
  if (expired !== null) {
    return {
      kind: 'EXPIRED',
      selectionId: expired.id,
      expiredAt: expired.effectiveTo as Date,
    };
  }
  return { kind: 'NONE' };
}
