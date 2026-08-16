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
