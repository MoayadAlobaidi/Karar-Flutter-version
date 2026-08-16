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
 */

/** Who the enrichment is for: the authenticated user in their effective tenant context. */
export interface BootstrapSubject {
  readonly userId: string;
  /** The session's effective tenant AFTER the binding decision, or null. */
  readonly tenantId: string | null;
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

export interface JurisdictionContextPort {
  /** The effective state; NONE when nothing resolves (never null). */
  stateFor(subject: BootstrapSubject): Promise<JurisdictionStateView>;
}

export interface OperatingEntityReferenceView {
  readonly id: string;
  readonly name: string;
}

export interface OperatingEntityReferencePort {
  /** Safe id/name reference only — never licence or register detail. */
  effectiveFor(subject: BootstrapSubject): Promise<OperatingEntityReferenceView | null>;
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

export interface PolicyPackStatusPort {
  /** Version and status only — never pack content. */
  statusFor(subject: EnrichmentSubject): Promise<PolicyPackStatusView | null>;
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

export interface ClientCapabilitiesPort {
  /**
   * The already-filtered client view: hidden capabilities NEVER appear in
   * any state; requirements are actionable only. Bootstrap passes this
   * through unenriched (see the leak stance above).
   */
  resolveFor(subject: EnrichmentSubject): Promise<readonly ClientCapabilityView[]>;
}
