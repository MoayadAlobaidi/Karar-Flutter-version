/**
 * Expected failure shapes of the bootstrap use cases (backend.md §9). Every
 * kind is machine-readable for RFC 7807 mapping; membership denials are
 * uniform — an arbitrary tenant, a revoked membership, an expired
 * membership, and a disabled tenant all answer `membership_required`.
 */

export interface Unauthenticated {
  readonly kind: 'unauthenticated';
  readonly message: string;
}

export interface ContextUnavailable {
  readonly kind: 'context_unavailable';
  readonly message: string;
}

/**
 * A context-enrichment dependency (jurisdiction assignments, the PolicyPack
 * activation ledger, the capability resolver) did not answer. Distinct from
 * a resolution that answered "none": this one has no answer at all, so the
 * request fails rather than returning a context whose empty sections would
 * be indistinguishable from a legitimate absence.
 *
 * `message` is for logs and tests. It never reaches the caller — the problem
 * mapper emits the code alone (see presentation/http/problems.ts).
 */
export interface ResolutionUnavailable {
  readonly kind: 'resolution_unavailable';
  readonly message: string;
  /** Whether retrying the same request may succeed. */
  readonly retryable: boolean;
}

export interface InvalidTenantSelection {
  readonly kind: 'invalid_tenant_selection';
  readonly message: string;
}

export interface MembershipRequired {
  readonly kind: 'membership_required';
  readonly message: string;
}

export interface BindingConflict {
  readonly kind: 'binding_conflict';
  readonly message: string;
}

export interface MembershipRevokedConcurrently {
  readonly kind: 'membership_revoked_concurrently';
  readonly message: string;
}

export type GetBootstrapError = Unauthenticated | ContextUnavailable | ResolutionUnavailable;

export type SetTenantBindingError =
  | Unauthenticated
  | InvalidTenantSelection
  | MembershipRequired
  | BindingConflict
  | MembershipRevokedConcurrently
  | ContextUnavailable;
