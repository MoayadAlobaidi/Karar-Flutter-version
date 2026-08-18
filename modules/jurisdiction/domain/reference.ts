/**
 * Runtime views of the jurisdiction reference tables (migrations 0070/0071).
 * Rows mirror the typed source of truth in @karar/jurisdiction-policy; the
 * database copies exist for referential integrity (assignments, settings,
 * and the activation ledger all FK to jurisdictions) and are SELECT-only for
 * the application role — the register changes by reviewed migration.
 */

import type {
  CountryStatus,
  JurisdictionId,
  JurisdictionLifecycle,
  JurisdictionType,
  ReviewStatus,
} from '@karar/jurisdiction-policy';

export interface CountryRecord {
  readonly code: string;
  readonly displayNameKey: string;
  readonly defaultCurrency: string;
  readonly status: CountryStatus;
}

export interface JurisdictionRecord {
  readonly code: JurisdictionId;
  readonly countryCode: string;
  readonly type: JurisdictionType;
  readonly status: JurisdictionLifecycle;
  readonly reviewStatus: ReviewStatus;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly provenance: string;
}

/**
 * Why a register entry may not be declared into. Pure vocabulary — the reason
 * exists so the refusal can be reported honestly rather than as a bare false.
 */
export type DeclarabilityRefusal =
  | { readonly reason: 'RETIRED'; readonly message: string }
  | { readonly reason: 'OUTSIDE_EFFECTIVE_WINDOW'; readonly message: string };

/**
 * THE ONE declarability rule, stated once so the write path and any listing
 * of declarable entries cannot drift apart: a listing that offered something
 * the declaration would refuse would be a lie the client acts on, and one
 * that hid something the declaration accepts would strand a subject.
 *
 * Retired regimes take no new assignment. An entry whose reviewed effective
 * window has not opened, or has closed, is likewise not declarable NOW —
 * seeded entries carry no window at all (effective dates stay NULL until a
 * reviewed decision supplies them), so this arm changes nothing today and
 * fails closed the moment a window exists.
 *
 * Declarable is NOT approved. Nothing here reads the review lifecycle beyond
 * retirement, because a declaration asserts no legal fact: it records an
 * UNVERIFIED, USER_DECLARED assignment that widens nothing. Requiring
 * approval here would leave every subject with no declarable jurisdiction at
 * all — the register holds no approved entry, by design — and onboarding
 * would deadlock rather than fail closed.
 */
export function declarabilityRefusalAt(
  record: Pick<JurisdictionRecord, 'code' | 'status' | 'effectiveFrom' | 'effectiveTo'>,
  at: Date,
): DeclarabilityRefusal | null {
  if (record.status === 'RETIRED') {
    return {
      reason: 'RETIRED',
      message: `jurisdiction ${String(record.code)} is retired; no new assignment may be made into it`,
    };
  }
  if (record.effectiveFrom !== null && record.effectiveFrom.getTime() > at.getTime()) {
    return {
      reason: 'OUTSIDE_EFFECTIVE_WINDOW',
      message: `jurisdiction ${String(record.code)} has no effect yet at the evaluation instant`,
    };
  }
  if (record.effectiveTo !== null && record.effectiveTo.getTime() <= at.getTime()) {
    return {
      reason: 'OUTSIDE_EFFECTIVE_WINDOW',
      message: `jurisdiction ${String(record.code)} ceased to have effect at the evaluation instant`,
    };
  }
  return null;
}

/**
 * Whether the platform's OWN register records a completed legal approval for
 * an entry. Both axes must agree: a lifecycle claiming APPROVED without a
 * completed review is not an approval, and neither is a completed review that
 * never reached the approved stage. Absence of evidence is not approval.
 */
export function approvalRecorded(
  record: Pick<JurisdictionRecord, 'status' | 'reviewStatus'>,
): boolean {
  return record.status === 'APPROVED' && record.reviewStatus === 'REVIEW_COMPLETE';
}

/** Restrict-only runtime settings row (migration 0074) in the exact shape
 * the pure resolver consumes. An absent row restricts nothing. */
export interface JurisdictionSettingsRecord {
  readonly jurisdictionCode: JurisdictionId;
  readonly disabledCapabilityIds: readonly string[];
  readonly aiProcessingSuspended: boolean;
  readonly version: number;
  readonly reason: string;
  readonly updatedBy: string;
}
