/**
 * CapabilityAvailabilityRepository — persistence port for the global
 * capability_availability rows (migration 0076). Reads produce the domain's
 * `AvailabilityFacts` snapshot (one read per resolution — the §44 pin);
 * writes are reachable only through the operator use case, which validates
 * ids against the PRODUCTION registry before any row exists (the canonical
 * migration additionally CHECK-constrains the closed id set).
 */

import type {
  AvailabilityState,
  CapabilityAvailabilityRecord,
} from '../../domain/availability-state.js';
import type { AvailabilityFacts } from '../../domain/resolution.js';

export interface CapabilityAvailabilityRepository {
  /**
   * The effective row for (environment, scope, capability) as facts:
   * a jurisdiction-specific row wins over an environment-wide (null-scope)
   * row; no row at all reports whether rows exist for OTHER environments
   * (gate 2's WRONG_ENVIRONMENT input). One call, one snapshot.
   */
  factsFor(
    environment: string,
    scopeRef: string | null,
    capabilityId: string,
  ): Promise<AvailabilityFacts>;

  /** The exact row for the triple (no fallback), for operator writes. */
  findExact(
    environment: string,
    scopeRef: string | null,
    capabilityId: string,
  ): Promise<CapabilityAvailabilityRecord | null>;

  insert(record: CapabilityAvailabilityRecord, at: Date): Promise<void>;

  /**
   * Optimistic state change: succeeds only when the stored version still
   * equals `expectedVersion` (the DB guard additionally enforces +1
   * increments and appends the history ledger).
   */
  updateState(
    id: string,
    expectedVersion: number,
    state: AvailabilityState,
    reason: string,
    actorRef: string,
    at: Date,
  ): Promise<'UPDATED' | 'VERSION_CONFLICT'>;
}
