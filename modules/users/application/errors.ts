/**
 * Expected failure shapes of this module's use cases (backend.md §9: expected
 * outcomes are `Result`, exceptions are for defects). Every kind is
 * machine-readable so presentation can map it to an honest RFC 7807 problem.
 */

import type { MissingPrincipalContext } from './principal.js';
import type { ProfileFieldViolation } from '../domain/user-profile.js';

export interface ProfileNotFound {
  readonly kind: 'profile_not_found';
  readonly message: string;
}

export interface InvalidProfileField {
  readonly kind: 'invalid_profile_field';
  readonly violation: ProfileFieldViolation;
  readonly message: string;
}

export interface NoApprovedFieldChanges {
  readonly kind: 'no_approved_field_changes';
  readonly message: string;
}

export interface InvalidStatusTransition {
  readonly kind: 'invalid_status_transition';
  readonly message: string;
}

export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
}

export type GetOwnProfileError = MissingPrincipalContext | ProfileNotFound | StoreFailure;

export type UpdateOwnProfileError =
  | MissingPrincipalContext
  | ProfileNotFound
  | InvalidProfileField
  | NoApprovedFieldChanges
  | StoreFailure;

export type RequestAccountDisableError =
  | MissingPrincipalContext
  | ProfileNotFound
  | InvalidStatusTransition
  | StoreFailure;
