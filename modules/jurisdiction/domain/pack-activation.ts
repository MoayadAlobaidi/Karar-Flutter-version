/**
 * The PolicyPack activation ledger's domain view (migration 0075): append-
 * only events naming which code-resident pack VERSION is operative per
 * (jurisdiction, environment). Metadata only — pack content is code and
 * never enters a row, so no database write can alter what a pack says.
 *
 * The active version is DERIVED from history: the latest event, active only
 * if that event is an ACTIVATED one. Deriving instead of storing keeps the
 * ledger the single record and makes "why was this version in force in
 * March" a query, not archaeology.
 */

import type { JurisdictionId, PackLifecycle, PolicyEnvironment } from '@karar/jurisdiction-policy';

export const ACTIVATION_ACTIONS = ['ACTIVATED', 'RETIRED'] as const;
export type ActivationAction = (typeof ACTIVATION_ACTIONS)[number];

export interface PackActivationRecord {
  readonly id: string;
  readonly jurisdictionCode: JurisdictionId;
  readonly packVersion: string;
  readonly packLifecycleAtActivation: PackLifecycle;
  readonly environment: PolicyEnvironment;
  readonly action: ActivationAction;
  readonly occurredAt: Date;
  readonly actor: string;
  readonly reason: string;
  readonly createdAt: Date;
}

export type ActivePackState =
  | { readonly active: false }
  | {
      readonly active: true;
      readonly packVersion: string;
      readonly packLifecycleAtActivation: PackLifecycle;
      readonly activatedAt: Date;
    };

/** Derives the active state from ledger events ordered or not — the latest
 * occurred_at wins; a RETIRED latest event means nothing is active. */
export function deriveActivePack(events: readonly PackActivationRecord[]): ActivePackState {
  if (events.length === 0) return { active: false };
  const latest = events.reduce((newest, candidate) =>
    candidate.occurredAt.getTime() > newest.occurredAt.getTime() ? candidate : newest,
  );
  if (latest.action !== 'ACTIVATED') return { active: false };
  return {
    active: true,
    packVersion: latest.packVersion,
    packLifecycleAtActivation: latest.packLifecycleAtActivation,
    activatedAt: latest.occurredAt,
  };
}
