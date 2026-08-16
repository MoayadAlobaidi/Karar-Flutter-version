/**
 * Expected failure shapes of the authorization use cases (backend.md §9).
 * Every kind is machine-readable; refusal is a value the caller must visibly
 * handle, never an exception.
 */

import type { InvalidActor } from './actor.js';

export interface NotAuthorized {
  readonly kind: 'not_authorized';
  readonly permission: string;
  /** The PolicyService's machine-readable denial reason. */
  readonly reason: string;
  readonly message: string;
}

export interface InvalidAssignmentInput {
  readonly kind: 'invalid_assignment_input';
  readonly message: string;
}

export interface RoleNotFound {
  readonly kind: 'role_not_found';
  readonly message: string;
}

export interface RoleScopeMismatch {
  readonly kind: 'role_scope_mismatch';
  readonly message: string;
}

/**
 * The delegation rule refused the grant: PLATFORM_ADMIN is grantable only by
 * a PLATFORM_ADMIN peer (see AssignRole's header for the full rule).
 */
export interface DelegationDenied {
  readonly kind: 'delegation_denied';
  readonly message: string;
}

export interface AlreadyAssigned {
  readonly kind: 'already_assigned';
  readonly message: string;
}

export interface AssignmentNotFound {
  readonly kind: 'assignment_not_found';
  readonly message: string;
}

export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
}

export type AssignRoleError =
  | InvalidActor
  | InvalidAssignmentInput
  | RoleNotFound
  | RoleScopeMismatch
  | NotAuthorized
  | DelegationDenied
  | AlreadyAssigned
  | StoreFailure;

export type RevokeRoleError =
  | InvalidActor
  | InvalidAssignmentInput
  | RoleNotFound
  | NotAuthorized
  | AssignmentNotFound
  | StoreFailure;
