/**
 * Bridges the capability module's client-safe entries onto the shape the
 * bootstrap module's port declares. Two workstreams named the same concept
 * differently; the translation belongs at the composition root rather than in
 * either module.
 *
 * This adapter performs NO filtering. Hidden capabilities and hidden denial
 * reasons are already absent from the client-safe view by the time they
 * arrive here — re-filtering would duplicate that logic and drift from it.
 * The only thing added is shape.
 */

import type { ClientCapabilityEntry } from '@karar/capability';

/** The bootstrap port's per-capability shape (see its context-enrichment.ts). */
export interface BootstrapClientCapability {
  readonly id: string;
  readonly status: string;
  readonly requirements: readonly { readonly kind: string; readonly detail?: string }[];
}

/**
 * An entry that resolved is reported with its allowing state and no
 * requirements; one that did not carries the single actionable reason that
 * would change the answer. A denial that reached the client view is
 * actionable by construction — the client-safe projection drops the rest.
 */
export function toBootstrapCapability(
  entry: ClientCapabilityEntry<string>,
): BootstrapClientCapability {
  return entry.available
    ? { id: entry.capabilityId, status: entry.state, requirements: [] }
    : { id: entry.capabilityId, status: 'UNAVAILABLE', requirements: [{ kind: entry.reason }] };
}
