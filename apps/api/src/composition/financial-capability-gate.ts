/**
 * The financial surface's capability gate, bound to the resolution the client
 * bootstrap already answers from.
 *
 * ONE SOURCE OF TRUTH, NOT A SECOND ONE. The object handed in here is the
 * SAME `ResolveCapabilityAvailability` instance the bootstrap endpoint's
 * client view is built over (see phase35-modules.ts). It reads the same eight
 * gates over the same facts — descriptor, environment, jurisdiction and
 * policy pack, availability row, entitlement, consent, licence, provider — so
 * "the client was told this capability is not navigable" and "the route
 * refuses" cannot drift apart. A second availability lookup written for this
 * surface would be exactly the divergence the registry exists to prevent, and
 * it would be discovered by a subject reaching a screen the server would not
 * serve, or by a subject blocked from one the client offered.
 *
 * NOTHING HERE BRANCHES ON A JURISDICTION. The resolver is asked about ONE
 * capability id and answers ALLOWED or DENIED; which jurisdiction the
 * principal is assigned to, which pack governs it, and what that pack says
 * are facts the resolver consumes and this file never sees. There is no
 * country switch here, and there must not be one: jurisdiction-shaped
 * behaviour belongs in a PolicyPack, never in an `if` (architecture test 12).
 *
 * THE REASON IS NEVER READ, SO IT CANNOT LEAK. Only `outcome` is inspected.
 * The resolution's `gate`, its `reason` and its provenance pins — pack
 * version, availability row version, entitlement version — are all present on
 * the value returned to this code, and none of them is touched. That is
 * deliberate: a refusal that carried "POLICY_PACK_NOT_APPROVED" or
 * "PENDING_LEGAL_REVIEW" would advertise a legal-review pipeline and an
 * uncleared jurisdiction to anyone who could send a request.
 *
 * A RESOLUTION THAT FAILED IS NOT A PERMISSION. An error result, a thrown
 * store fault, or an answer that does not mention the capability we asked
 * about all collapse to UNAVAILABLE. The caller cannot tell those from a
 * clean denial, and neither can an attacker probing for the difference.
 */

import type { ResolveCapabilityAvailability } from '@karar/capability';
import type { CapabilityId } from '@karar/capability-registry';

import type {
  FinancialCapabilityDecision,
  FinancialCapabilityGate,
} from '../financial/capability-gate.js';
import type { FinancialPrincipal } from '../financial/principal.js';

/**
 * The one capability this surface is: accounts, transactions, connections,
 * instruments, statement imports and transfer matching are its bounded
 * contexts, not separate capabilities. Named once, here, so the financial
 * directory holds no capability vocabulary at all.
 */
const FINANCIAL_CAPABILITY: CapabilityId = 'TRANSACTIONS';

/** The resolver the bootstrap surface answers from, as this file consumes it. */
export type FinancialCapabilityResolution = ResolveCapabilityAvailability<CapabilityId>;

/**
 * Whether the shared resolver reached a decision, and which one.
 *
 * Three values, and they never leave this file: the financial surface is
 * handed a two-valued gate. The third value exists because a resolution that
 * could not be obtained and a resolution that DENIED are different facts to
 * the local fixture below — and to nobody else.
 */
type ResolutionOutcome = 'ALLOWED' | 'DENIED' | 'UNRESOLVED';

/**
 * Asks the shared resolver about the one capability and collapses the answer
 * to two values.
 *
 * The subject is the SESSION-resolved principal. The resolver takes its
 * environment at construction and has no environment field on its input, so
 * neither this file nor anything upstream of it can supply one from a
 * request.
 */
export class ResolvedCapabilityFinancialGate implements FinancialCapabilityGate {
  constructor(
    private readonly resolution: FinancialCapabilityResolution,
    private readonly clock: { now(): Date },
  ) {}

  async decideFor(principal: FinancialPrincipal): Promise<FinancialCapabilityDecision> {
    return (await this.outcomeFor(principal)) === 'ALLOWED' ? 'AVAILABLE' : 'UNAVAILABLE';
  }

  /**
   * The resolver's own verdict, for the local fixture. Only `outcome` is
   * read: the gate name, the denial reason and the provenance pins are on
   * the value in hand and are deliberately never touched.
   */
  async outcomeFor(principal: FinancialPrincipal): Promise<ResolutionOutcome> {
    const resolved = await this.resolution.execute({
      subject: { tenantId: principal.tenantId, userId: principal.userId },
      now: this.clock.now(),
      // Scoped to the one id: the other six capabilities are not this
      // surface's business, and resolving them would read rows this request
      // has no reason to touch.
      capabilityIds: [FINANCIAL_CAPABILITY],
    });
    if (!resolved.ok) return 'UNRESOLVED';
    const entry = resolved.value.resolutions.find(
      (candidate) => candidate.capabilityId === FINANCIAL_CAPABILITY,
    );
    // An answer that does not mention the capability asked about is not an
    // answer: another capability being ALLOWED opens nothing here.
    if (entry === undefined) return 'UNRESOLVED';
    return entry.outcome === 'ALLOWED' ? 'ALLOWED' : 'DENIED';
  }
}

export class LocalSyntheticCapabilityAvailabilityEnvironmentError extends Error {
  override readonly name = 'LocalSyntheticCapabilityAvailabilityEnvironmentError';

  constructor(env: string) {
    super(
      `LocalSyntheticFinancialCapabilityAvailability is local-development-only and refuses to ` +
        `exist in KARAR_ENV='${env}' — it is a labelled fixture with no legal effect, and a ` +
        `deployment that used it would be serving a capability no policy pack has cleared and no ` +
        `deployment record says exists. Bind the resolved gate instead`,
    );
  }
}

/**
 * The LOCAL/TEST availability fixture, and the exact line it does not cross.
 *
 * ## Why it exists
 *
 * Every capability in the reviewed registry is `NOT_IMPLEMENTED` and deployed
 * nowhere, and `qa/v1` clears nothing at all. The resolver is therefore
 * correct to deny this surface in every environment, including `local` —
 * which would leave twenty-seven operations, their conformance suite and a
 * developer's own machine with no reachable surface to exercise. This fixture
 * makes the surface reachable in local development. It has NO LEGAL EFFECT,
 * it is not a clearance, and it is not a deployment record.
 *
 * ## What it substitutes for, and what it never substitutes for
 *
 * It substitutes for a DECISION NOBODY HAS TAKEN — the registry row that says
 * the code is built and deployed, and the pack entry that would clear it. It
 * never substitutes for an ANSWER NOBODY COULD OBTAIN: the real resolver runs
 * first on every request, and a resolution that FAILED or threw refuses here
 * exactly as it would in a deployed environment. That is the same distinction
 * the bootstrap surface draws between "you have no jurisdiction" and "nobody
 * could look", and it keeps the store-failure arm of this gate live in local
 * rather than papered over.
 *
 * ## How it is kept out of a deployed process
 *
 * 1. The constructor throws outside `KARAR_ENV=local`, so constructing it in
 *    staging is an immediate boot failure rather than a subtle one.
 * 2. `resolveFinancialCapabilityGate` never substitutes it: a non-local
 *    environment gets the resolved gate and nothing else, with no flag, no
 *    override and no third branch.
 * 3. The instance re-checks its own environment when asked, so even an
 *    instance that somehow survived (1) and (2) denies rather than permits.
 *
 * ## What is deliberately NOT here
 *
 * - **No change to `qa/v1`.** The Qatar pack is DRAFT, PENDING_LEGAL_REVIEW
 *   and clears nothing (`packages/jurisdiction-policy/src/packs/qa-v1.ts`).
 *   Editing it to unblock a route would forge the clearance rather than
 *   obtain it; this file neither imports it nor touches it.
 * - **No descriptor claim.** Nothing here says the capability is IMPLEMENTED
 *   or DEPLOYED anywhere. The reviewed registry keeps saying it is neither,
 *   the bootstrap document keeps telling clients so, and this fixture
 *   corresponds to no deployment that exists.
 * - **No availability row, no entitlement, no consent.** It writes nothing
 *   and grants nothing; it is an in-process answer for one process's own
 *   local requests.
 */
export class LocalSyntheticFinancialCapabilityAvailability implements FinancialCapabilityGate {
  readonly #env: string;

  constructor(
    private readonly resolved: ResolvedCapabilityFinancialGate,
    options: { readonly env: string },
  ) {
    if (options.env !== 'local') {
      throw new LocalSyntheticCapabilityAvailabilityEnvironmentError(options.env);
    }
    this.#env = options.env;
  }

  async decideFor(principal: FinancialPrincipal): Promise<FinancialCapabilityDecision> {
    // Mechanism three. The constructor already made this unreachable; it is
    // written anyway, because "unreachable" is a property of today's call
    // graph and this one must not depend on that.
    if (this.#env !== 'local') return 'UNAVAILABLE';

    // The real resolution runs on every local request, so the gate's own
    // machinery is genuinely exercised here rather than skipped — and a
    // resolution that could not be obtained still refuses. A throw is not
    // caught: it reaches the guard, which fails closed on it.
    const outcome = await this.resolved.outcomeFor(principal);
    if (outcome === 'UNRESOLVED') return 'UNAVAILABLE';

    // ALLOWED, or a resolved denial over a capability nothing has cleared and
    // nothing has deployed. The second is the synthetic answer, and it has no
    // legal effect whatsoever.
    return 'AVAILABLE';
  }
}

/**
 * The single seam a composition root uses to obtain the gate.
 *
 * Every environment gets the resolved gate over the shared resolver.
 * `local` additionally gets the labelled fixture in front of it, and nothing
 * else does — there is no flag that turns it on elsewhere, and no fallback
 * that would produce one. A deployed environment with no cleared, deployed
 * capability serves no financial route, which is exactly what the registry
 * and the pack already say.
 */
export function resolveFinancialCapabilityGate(options: {
  readonly env: string;
  readonly resolution: FinancialCapabilityResolution;
  readonly clock: { now(): Date };
}): FinancialCapabilityGate {
  const resolved = new ResolvedCapabilityFinancialGate(options.resolution, options.clock);
  if (options.env !== 'local') return resolved;
  return new LocalSyntheticFinancialCapabilityAvailability(resolved, { env: options.env });
}
