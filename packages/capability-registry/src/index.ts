/**
 * Compile-time capability registry (capability-registry.md).
 *
 * This package is the shared CONTRACT the Phase 3.5 workstreams build on:
 * the closed CapabilityId union, the three separated state dimensions, the
 * descriptor shape, and the production registry. It is NOT a plugin loader,
 * service locator, DI container, or runtime module registry — wiring remains
 * ordinary module imports, and nothing here loads code.
 *
 * The registry machinery (validation, availability resolution, entitlement
 * gates) lives in the capability workstream's module; this package stays
 * pure types plus the reviewed production registry constant.
 *
 * FUNDRAISING is deliberately NOT in the union: it remains "not planned" and
 * lives only in architecture documentation as a possible future bounded
 * context. Test suites that need a POSITIVE availability fixture construct
 * their own registry over their own id type (every consumer API is generic
 * over `Id extends string`) — a synthetic test capability never enters this
 * union, this registry, production builds, client output, or database rows.
 */

import type { JurisdictionId } from '@karar/jurisdiction-policy';

/** The closed set of real product capabilities. Closed on purpose: adding an
 * id is a reviewed code change, never configuration. */
export const CAPABILITY_IDS = [
  'TRANSACTIONS',
  'BUDGETS',
  'GOALS',
  'INSIGHTS',
  'AI_ADVISOR',
  'ZAKAT',
  'AMANAT',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export function isCapabilityId(value: string): value is CapabilityId {
  return (CAPABILITY_IDS as readonly string[]).includes(value);
}

/** Product lifecycle intent — says nothing about whether code exists. */
export type CapabilityLifecycle = 'PLANNED' | 'ALPHA' | 'BETA' | 'GA' | 'DEPRECATED' | 'RETIRED';

/**
 * Whether the capability's code exists in this repository. Nothing else.
 *
 * It is NOT a claim that the capability is deployed, cleared by a PolicyPack,
 * entitled, navigable, or available — those are separate dimensions on this
 * same descriptor and on the resolver, and each denies on its own. `IMPLEMENTED`
 * GRANTS NOTHING: gate 1 in the resolver reads implementation AND deployment,
 * and the deployment arm refuses by itself.
 *
 * This definition is the one the registry is validated against. A second,
 * stricter reading once lived in `docs/architecture/capability-registry.md`
 * ("code exists as something a deployment could expose"), which contradicted
 * both this comment and that document's own dimension table, and which was used
 * to keep TRANSACTIONS at NOT_IMPLEMENTED while 27 operations answered for it.
 * A registry that answers "does the code exist?" with "no" while the code exists
 * is not being conservative; it is wrong, and it pushes the reader toward
 * trusting deployment state that is recorded elsewhere.
 */
export type CapabilityImplementation = 'NOT_IMPLEMENTED' | 'IMPLEMENTED';

/** Whether the built capability is deployed to an environment. */
export type CapabilityDeployment = 'NOT_DEPLOYED' | 'DEPLOYED';

export type KararEnvironment = 'local' | 'dev' | 'staging' | 'production';

/**
 * A typed static descriptor. The first resolution gate reads ONLY this:
 * a capability can never resolve AVAILABLE unless
 * `implementation === 'IMPLEMENTED'` AND `deployment[env] === 'DEPLOYED'` —
 * no configuration can make missing code available.
 */
export interface CapabilityDescriptor<Id extends string = CapabilityId> {
  readonly id: Id;
  readonly lifecycle: CapabilityLifecycle;
  readonly implementation: CapabilityImplementation;
  /** Per-environment deployment state; absent key = NOT_DEPLOYED. */
  readonly deployment: Readonly<Partial<Record<KararEnvironment, CapabilityDeployment>>>;
  /**
   * Jurisdictions the capability is DECLARED for (a ceiling input, not a
   * grant — clearance still comes from the PolicyPack). Amanat's list is
   * empty and stays empty until a real declaration exists.
   */
  readonly declaredJurisdictions: readonly JurisdictionId[];
  /** True when the capability carries disclosure-bearing behaviour (test 19). */
  readonly disclosureBearing: boolean;
  /**
   * Client exposure of denials: HIDDEN capabilities never appear in client
   * or bootstrap output in any state; ACTIONABLE ones may surface actionable
   * requirements (consent, re-consent, entitlement) when appropriate.
   */
  readonly clientExposure: 'ACTIONABLE' | 'HIDDEN';
  /**
   * Opt-in for explaining a PENDING_PROVIDER denial to clients ("a connection
   * is not yet available"). Absent means NOT explainable — the fail-closed
   * default: without the opt-in, a provider-pending capability is simply
   * omitted from client output rather than advertised with a reason. No
   * production descriptor opts in, because nothing is deployed.
   */
  readonly providerPendingExplainable?: boolean;
}

/**
 * The production registry. Six capabilities are honestly unbuilt; one is built
 * and deployed nowhere; NONE is available anywhere.
 *
 * TRANSACTIONS is `IMPLEMENTED` because its code exists — seven bounded
 * contexts behind migrations 0087-0101, 27 operations mounted from the
 * composition root, and seven Flutter feature folders calling them. That is the
 * only question `implementation` asks.
 *
 * It changes nothing about availability, and the resolver is where that is
 * enforced rather than here: `deployment` is empty, so gate 1 still denies with
 * NOT_DEPLOYED; `declaredJurisdictions` is empty, so the clearance intersection
 * is empty; `qa/v1` declares `clearedCapabilities: []`; and the availability
 * tables ship with no rows. Four independent denials, and flipping this field
 * removes none of them.
 *
 * Zakat additionally carries a non-engineering launch gate (Sharia review) and
 * Amanat declares NO jurisdiction and stays HIDDEN.
 */
export const CAPABILITY_REGISTRY: Readonly<Record<CapabilityId, CapabilityDescriptor>> =
  Object.freeze({
    // The one built capability. Deployed nowhere, declared nowhere, cleared by
    // no pack, available nowhere — each recorded in its own field rather than
    // by understating this one.
    TRANSACTIONS: Object.freeze({
      id: 'TRANSACTIONS',
      lifecycle: 'ALPHA',
      implementation: 'IMPLEMENTED',
      deployment: Object.freeze({}),
      declaredJurisdictions: Object.freeze([]),
      disclosureBearing: false,
      clientExposure: 'ACTIONABLE',
    }),
    BUDGETS: descriptor('BUDGETS'),
    GOALS: descriptor('GOALS'),
    INSIGHTS: descriptor('INSIGHTS'),
    AI_ADVISOR: descriptor('AI_ADVISOR'),
    ZAKAT: descriptor('ZAKAT'),
    // No spread here: `descriptor` already returns AMANAT frozen and HIDDEN,
    // and spreading it would produce an UNFROZEN copy — leaving the one
    // descriptor whose exposure must never change as the only writable one.
    AMANAT: descriptor('AMANAT'),
  });

/** The honest-unbuilt default, for capabilities whose code does not exist. */
function descriptor(id: CapabilityId): CapabilityDescriptor {
  return Object.freeze({
    id,
    lifecycle: 'PLANNED',
    implementation: 'NOT_IMPLEMENTED',
    deployment: Object.freeze({}),
    declaredJurisdictions: Object.freeze([]),
    disclosureBearing: id === 'AMANAT',
    clientExposure: id === 'AMANAT' ? 'HIDDEN' : 'ACTIONABLE',
  });
}

// Registry machinery kept in this package: pure structural validation of the
// invariants above, generic over the id type so test registries validate the
// same way the production one does. (Availability resolution, entitlement
// gates, and persistence live in the capability module, not here.)
export {
  KARAR_ENVIRONMENTS,
  assertValidRegistry,
  isKararEnvironment,
  validateRegistry,
  type RegistryRule,
  type RegistryViolation,
} from './validation';
