/**
 * The client-safe projection — hidden filtering lives HERE, in one place
 * (capability-registry.md §5; disclosure.md). The bootstrap surface and any
 * future client channel consume THIS projection; nothing else may re-derive
 * client visibility.
 *
 * Rules, in force together:
 *  - a HIDDEN capability (descriptor clientExposure) is OMITTED in every
 *    state, including ALLOWED — it never appears, not even as
 *    `available: false`;
 *  - a denial whose reason is not client-surfaceable is OMITTED entirely
 *    (the five mandated hidden reasons, and every other internal state —
 *    deny-by-default on exposure itself);
 *  - actionable denials surface with their reason; PENDING_PROVIDER
 *    surfaces only where the descriptor opts in.
 */

import type { AllowingState } from './availability-state.js';
import { clientReasonFor, type ClientDenialReason } from './denial-reason.js';
import type { CapabilityResolution } from './resolution.js';

export type ClientCapabilityEntry<Id extends string = string> =
  | { readonly capabilityId: Id; readonly available: true; readonly state: AllowingState }
  | { readonly capabilityId: Id; readonly available: false; readonly reason: ClientDenialReason };

/** Per-capability exposure facts, read from the descriptor by the caller. */
export interface ClientExposureFacts {
  readonly hidden: boolean;
  readonly providerPendingExplainable: boolean;
}

export function toClientView<Id extends string>(
  resolutions: ReadonlyArray<CapabilityResolution<Id>>,
  exposureFor: (capabilityId: Id) => ClientExposureFacts,
): ReadonlyArray<ClientCapabilityEntry<Id>> {
  const entries: ClientCapabilityEntry<Id>[] = [];
  for (const resolution of resolutions) {
    const exposure = exposureFor(resolution.capabilityId);
    if (exposure.hidden) continue;
    if (resolution.outcome === 'ALLOWED') {
      entries.push({
        capabilityId: resolution.capabilityId,
        available: true,
        state: resolution.state,
      });
      continue;
    }
    const clientReason = clientReasonFor(
      resolution.reason,
      exposure.providerPendingExplainable,
    );
    if (clientReason === null) continue;
    entries.push({
      capabilityId: resolution.capabilityId,
      available: false,
      reason: clientReason,
    });
  }
  return entries;
}
