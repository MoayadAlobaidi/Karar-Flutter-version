/**
 * Expected failure shapes of the tenancy use cases (backend.md §9). Every
 * kind is machine-readable for RFC 7807 mapping; denial kinds avoid oracles —
 * an unknown token and a token in someone else's tenant both answer
 * `invitation_not_found`.
 */

import type { MissingPrincipalContext } from './principal.js';
import type { TenancyPermission } from './ports/policy-service.js';
import type { RedemptionDenialReason } from '../domain/tenancy.js';

export interface NotAuthorized {
  readonly kind: 'not_authorized';
  readonly permission: TenancyPermission;
  readonly message: string;
}

export interface TenantNotFound {
  readonly kind: 'tenant_not_found';
  readonly message: string;
}

export interface MembershipNotFound {
  readonly kind: 'membership_not_found';
  readonly message: string;
}

export interface InvitationNotFound {
  readonly kind: 'invitation_not_found';
  readonly message: string;
}

export interface InvitationNotRedeemable {
  readonly kind: 'invitation_not_redeemable';
  readonly reason: RedemptionDenialReason;
  readonly message: string;
}

export interface AlreadyMember {
  readonly kind: 'already_member';
  readonly message: string;
}

export interface InvalidInvitationInput {
  readonly kind: 'invalid_invitation_input';
  readonly message: string;
}

export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
}

/** The identity-side binding seam refused or failed (Phase 3.5 switch path). */
export interface BindingFailed {
  readonly kind: 'binding_failed';
  readonly message: string;
}

/**
 * The target membership vanished while the switch was in flight; the
 * compensating check revoked the replacement session — the caller ends
 * unbound/denied, never bound without membership.
 */
export interface MembershipRevokedConcurrently {
  readonly kind: 'membership_revoked_concurrently';
  readonly message: string;
}

/** The configured first-party tenant is absent, inactive, or not first-party. */
export interface FirstPartyTenantUnavailable {
  readonly kind: 'first_party_tenant_unavailable';
  readonly message: string;
}

export type GetOwnTenantError =
  | MissingPrincipalContext
  | TenantNotFound
  | MembershipNotFound
  | StoreFailure;

export type ListOwnMembershipsError = MissingPrincipalContext | StoreFailure;

export type ResolveTenantContextError = MissingPrincipalContext | StoreFailure;

export type SwitchTenantError =
  | MissingPrincipalContext
  | MembershipNotFound
  | BindingFailed
  | MembershipRevokedConcurrently
  | StoreFailure;

export type GrantFirstPartyMembershipError =
  | MissingPrincipalContext
  | FirstPartyTenantUnavailable
  | StoreFailure;

export type ListMembersError =
  | MissingPrincipalContext
  | MembershipNotFound
  | NotAuthorized
  | StoreFailure;

export type CreateInvitationError =
  | MissingPrincipalContext
  | MembershipNotFound
  | NotAuthorized
  | InvalidInvitationInput
  | StoreFailure;

export type RevokeInvitationError =
  | MissingPrincipalContext
  | MembershipNotFound
  | NotAuthorized
  | InvitationNotFound
  | StoreFailure;

export type RedeemInvitationError =
  | MissingPrincipalContext
  | InvitationNotFound
  | InvitationNotRedeemable
  | AlreadyMember
  | StoreFailure;
