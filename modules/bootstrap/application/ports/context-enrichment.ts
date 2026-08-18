/**
 * Context-enrichment ports — the parallel Phase 3.5 workstreams behind typed
 * seams. DECLARED HERE, IN THE CONSUMER; the composition root binds the real
 * implementations (jurisdiction workstream, operating-entity resolution,
 * PolicyPack status, and the capability workstream's CLIENT-SAFE resolver).
 * Tests run against fakes.
 *
 * THE LEAK STANCE, stated once and enforced by the serializer + regression
 * tests (§48): every view here is already the CLIENT-SAFE projection —
 * bootstrap TRUSTS the port's filtering (re-filtering here would duplicate
 * the capability workstream's logic and drift from it) and passes the data
 * through UNENRICHED. What bootstrap adds instead is a structural guarantee:
 * the response serializer emits a CLOSED field set, so extra fields a
 * misbehaving implementation attaches (licence details, pack content, raw
 * evidence, internal ids) are dropped at the edge rather than shipped.
 * Hidden capabilities are the client-safe resolver's contract: they never
 * appear in its output in any state, and therefore never in bootstrap's.
 *
 * THE FAILURE STANCE: every port below returns a TAGGED outcome, never a
 * bare list or a bare null. An implementation whose dependency failed
 * reports `UNAVAILABLE`, which is a different value from "resolved, and the
 * answer is none". Without that distinction an unreachable store reads to
 * the client as a legitimately empty entitlement set — the denial is
 * correct, but the client cannot tell a real absence from an outage and
 * retries nothing. Bootstrap answers 503 for `UNAVAILABLE` and 200 for a
 * resolved-but-empty result.
 */

/** Who the enrichment is for: the authenticated user in their effective tenant context. */
export interface BootstrapSubject {
  readonly userId: string;
  /** The session's effective tenant AFTER the binding decision, or null. */
  readonly tenantId: string | null;
}

/**
 * A resolution that could not be performed: the dependency behind the port
 * failed, so the port has NO answer — as opposed to an answer of "none".
 * Carries no cause, no store detail, and no identifier: the reason is logged
 * server-side by the implementation, never carried toward the edge.
 */
export interface EnrichmentUnavailable {
  readonly kind: 'UNAVAILABLE';
  /** Whether retrying the same request may succeed (a transient store fault). */
  readonly retryable: boolean;
}

/**
 * The jurisdiction assignment as client-safe DATA. A jurisdiction identifier
 * may be carried and displayed; it is never a branch — behaviour differences
 * resolve through the typed state below and through policy packs
 * (architecture test 12).
 */
export interface JurisdictionAssignmentView {
  readonly jurisdictionId: string;
}

/**
 * The typed, FAIL-CLOSED effective-jurisdiction state — structurally the
 * `EffectiveJurisdictionState<T>` that @karar/jurisdiction publishes, so the
 * composition root binds the real derivation (`effectiveJurisdictionState`)
 * to this port mechanically. `NONE` is the unresolved case: there is no null
 * to mistake for "fine", and consumers key on `kind`, never on a code.
 */
export type JurisdictionStateView =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'UNVERIFIED'; readonly assignment: JurisdictionAssignmentView }
  | { readonly kind: 'VERIFIED'; readonly assignment: JurisdictionAssignmentView };

/**
 * NONE is "resolved, and nothing is assigned"; UNAVAILABLE is "the
 * assignment read itself failed". Collapsing the second into the first would
 * report a fail-closed jurisdiction the subject may not actually be in.
 */
export type JurisdictionResolution = JurisdictionStateView | EnrichmentUnavailable;

export interface JurisdictionContextPort {
  /** The effective state, or UNAVAILABLE when the read failed. Never null. */
  stateFor(subject: BootstrapSubject): Promise<JurisdictionResolution>;
}

/**
 * The CLIENT-SAFE operating-entity projection: who the subject contracted
 * with, and how to reach them about it. Reviewed field set — the
 * operating-entity module's read port emits exactly these and the serializer
 * projects exactly these.
 *
 * Deliberately absent, and never to be added here: licence records or
 * evidence references, registration numbers and other register internals,
 * contracting-capacity and controller/processor legal analysis,
 * data-protection role assignments, entity status and administrative
 * timestamps, and anything belonging to an entity the subject is not bound
 * to.
 */
export interface OperatingEntitySummaryView {
  readonly id: string;
  /** The registered legal name — the register holds no separate trading name. */
  readonly name: string;
  /** The regime the entity is registered in, as DATA for display. */
  readonly jurisdictionRef: string | null;
  /** A published role-mailbox reference, where the register carries one. */
  readonly contactReference: string | null;
}

/**
 * Three outcomes, none of which fabricates an entity: the subject is bound
 * to one (ASSIGNED), the subject is bound to none (UNASSIGNED), or the read
 * failed and bootstrap does not know (UNAVAILABLE).
 */
export type OperatingEntityStateView =
  | { readonly kind: 'ASSIGNED'; readonly entity: OperatingEntitySummaryView }
  | { readonly kind: 'UNASSIGNED' }
  | { readonly kind: 'UNAVAILABLE' };

export interface OperatingEntityReferencePort {
  /** The safe summary, an explicit UNASSIGNED, or an explicit UNAVAILABLE. */
  effectiveFor(subject: BootstrapSubject): Promise<OperatingEntityStateView>;
}

export interface PolicyPackStatusView {
  readonly version: string;
  readonly status: string;
}

/**
 * What the enrichment resolvers receive: the subject plus the TYPED
 * jurisdiction state. Passing the state (not an extracted code) is what keeps
 * the fail-closed decision in one place — the resolver keys on `kind`, and
 * the identifier inside it is data for pack selection, never a branch.
 */
export type EnrichmentSubject = BootstrapSubject & {
  readonly jurisdiction: JurisdictionStateView;
};

/**
 * ACTIVE carries the version/status pair; NONE means no pack is active for
 * the resolved jurisdiction; UNAVAILABLE means the activation ledger could
 * not be read. The last is not "no pack": a client told "no pack" stops
 * asking, and an unread ledger is not an answer.
 */
export type PolicyPackResolution =
  | { readonly kind: 'ACTIVE'; readonly status: PolicyPackStatusView }
  | { readonly kind: 'NONE' }
  | EnrichmentUnavailable;

export interface PolicyPackStatusPort {
  /** Version and status only — never pack content. */
  statusFor(subject: EnrichmentSubject): Promise<PolicyPackResolution>;
}

export interface ClientCapabilityRequirementView {
  readonly kind: string;
  readonly detail?: string;
}

/** One client-visible capability, as the CLIENT-SAFE resolver emits it. */
export interface ClientCapabilityView {
  readonly id: string;
  readonly status: string;
  readonly requirements: readonly ClientCapabilityRequirementView[];
}

/**
 * RESOLVED carries the client-safe list, which may legitimately be EMPTY —
 * that is a real answer and the client may act on it. UNAVAILABLE means the
 * resolution did not complete; the two must never share a representation,
 * because an empty list is exactly what a swallowed failure looks like.
 */
export type ClientCapabilitiesResolution =
  | { readonly kind: 'RESOLVED'; readonly capabilities: readonly ClientCapabilityView[] }
  | EnrichmentUnavailable;

export interface ClientCapabilitiesPort {
  /**
   * The already-filtered client view: hidden capabilities NEVER appear in
   * any state; requirements are actionable only. Bootstrap passes this
   * through unenriched (see the leak stance above).
   */
  resolveFor(subject: EnrichmentSubject): Promise<ClientCapabilitiesResolution>;
}
