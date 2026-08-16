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

export type GetBootstrapError = Unauthenticated | ContextUnavailable;

export type SetTenantBindingError =
  | Unauthenticated
  | InvalidTenantSelection
  | MembershipRequired
  | BindingConflict
  | MembershipRevokedConcurrently
  | ContextUnavailable;
