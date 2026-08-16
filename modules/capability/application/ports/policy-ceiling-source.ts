/**
 * PolicyCeilingSource — the seam onto the jurisdiction-policy workstream's
 * `resolveEffectivePolicy` (in flight in parallel; the composition root
 * binds the real resolver behind this port when it lands).
 *
 * The port answers ONE question for the resolver: what is the effective
 * capability ceiling for this subject — the effective jurisdiction and its
 * verification status, the approved pack version, and the pack's cleared
 * capability ids (PLAIN STRINGS by design: package-cycle avoidance plus
 * synthetic test packs; an id the registry does not recognise is simply
 * never AVAILABLE) with their per-capability resolution strategy,
 * processing basis, and required licence/provider declarations.
 *
 * The result vocabulary is the CLOSED `CeilingFacts` union from the domain.
 * An adapter that meets a policy state it cannot map onto these MUST throw
 * (a `PolicyCeilingUnresolvableError`) rather than guess — the use case
 * fails the whole resolution closed. Silent coercion of an unknown state
 * into a passing gate is the failure mode this port exists to prevent.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { CeilingFacts } from '../../domain/resolution.js';

export interface PolicyCeilingQuery {
  readonly tenantId: TenantId;
  readonly userId: UserId | null;
  /** Server-side environment identity — never client input. */
  readonly environment: string;
  readonly at: Date;
}

export interface PolicyCeilingSource {
  effectivePolicyFor(query: PolicyCeilingQuery): Promise<CeilingFacts>;
}

/** Thrown by adapters on states outside the closed vocabulary — fails the resolution closed. */
export class PolicyCeilingUnresolvableError extends Error {
  override readonly name = 'PolicyCeilingUnresolvableError';

  constructor(message: string) {
    super(message);
  }
}
