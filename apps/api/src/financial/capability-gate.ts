/**
 * Whether this surface may execute at all — the port, and the reason its
 * answer has exactly two values.
 *
 * THE GAP THIS CLOSES. Every route on this surface proves the caller's
 * principal and resolves ownership through the modules' own ports, and RLS
 * stands behind both. None of that asks the question the capability registry
 * exists to answer: is this capability AVAILABLE for this principal at all?
 * The client asks it once at bootstrap and hides the navigation when the
 * answer is no — which is a rendering decision, not a control. A deep link, a
 * replayed request, a script, or a client built by somebody else reaches the
 * route without ever having read the bootstrap document.
 *
 * THE ANSWER IS A BOOLEAN BY CONSTRUCTION, NOT BY DISCIPLINE. `AVAILABLE` or
 * `UNAVAILABLE`, and nothing else — no reason, no gate name, no state, no
 * retry hint. Unbuilt code, an undeployed capability, an uncleared
 * jurisdiction, a pack pending legal review, a missing entitlement, a
 * withdrawn consent and a store that could not be read all arrive here as the
 * same value, because there is no field in which they could arrive as
 * anything else. A caller learns that the capability is unavailable; it never
 * learns why in legal, jurisdictional or commercial terms, and this type is
 * what makes that a property of the code rather than a habit of whoever
 * writes the next controller.
 *
 * The collapse happens on the far side of this port, at the composition root,
 * where the resolution is read (see
 * apps/api/src/composition/financial-capability-gate.ts). Nothing in this
 * directory imports the capability registry, names a capability id, or knows
 * that jurisdictions, policy packs or entitlements exist.
 */

import type { FinancialPrincipal } from './principal.js';

/** The whole vocabulary. Two values, deliberately. */
export type FinancialCapabilityDecision = 'AVAILABLE' | 'UNAVAILABLE';

/**
 * The one question this surface asks before it executes anything.
 *
 * The principal is the SESSION-resolved one — the same value the controllers
 * act for. There is no other parameter, so no header, query, body or cookie
 * can reach this decision: there is nowhere to put one.
 */
export interface FinancialCapabilityGate {
  decideFor(principal: FinancialPrincipal): Promise<FinancialCapabilityDecision>;
}

/** The composition root binds this; nothing in this directory constructs one. */
export const FINANCIAL_CAPABILITY_GATE = 'karar.api.financial.capability-gate';
