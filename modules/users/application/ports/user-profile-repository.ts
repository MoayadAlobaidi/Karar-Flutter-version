/**
 * UserProfileRepository — the persistence port for profiles and status
 * history. Implementations run every method inside ONE principal-context
 * transaction (`withPrincipalContext`), so PostgreSQL RLS is the boundary on
 * every path; any explicit tenant/user filter an implementation adds is
 * Layer-2 convenience, not the isolation mechanism (tenancy.md §2).
 *
 * "Own" in every method name is literal: the port can only read and write the
 * acting principal's rows. There is no cross-user or cross-tenant surface to
 * misuse — staff paths arrive in a later phase with their own audited port.
 */

import type { PrincipalActor } from '../principal.js';
import type { UserProfile, UserStatus, UserStatusChange } from '../../domain/user-profile.js';

export interface CreateOwnProfileInput {
  readonly displayName: string;
  readonly locale: string;
  readonly occurredAt: Date;
}

export interface OwnProfileFieldChanges {
  readonly displayName?: string;
  readonly locale?: string;
  readonly occurredAt: Date;
}

export interface OwnStatusTransition {
  /** The status the row must still be in for the transition to apply (race-safe conditional write). */
  readonly expectedFrom: UserStatus;
  readonly toStatus: UserStatus;
  readonly reason: string | null;
  readonly occurredAt: Date;
}

export interface StatusTransitionOutcome {
  readonly profile: UserProfile;
  readonly change: UserStatusChange;
}

export class ProfileStoreError extends Error {
  override readonly name = 'ProfileStoreError';
}

export interface UserProfileRepository {
  /** The acting principal's profile, or null when none exists in their tenant. */
  findOwn(actor: PrincipalActor): Promise<UserProfile | null>;

  /** Creates the acting principal's profile (registration foundation / fixtures). */
  createOwn(actor: PrincipalActor, input: CreateOwnProfileInput): Promise<UserProfile>;

  /**
   * Applies approved-field changes to the acting principal's profile.
   * Returns null when the profile does not exist (in the caller's tenant).
   */
  updateOwnFields(
    actor: PrincipalActor,
    changes: OwnProfileFieldChanges,
  ): Promise<UserProfile | null>;

  /**
   * Atomically (one transaction): conditional status UPDATE guarded by
   * `expectedFrom` plus the append-only history INSERT. Returns null when the
   * profile is missing OR the status already moved — the caller distinguishes
   * by re-reading.
   */
  transitionOwnStatus(
    actor: PrincipalActor,
    transition: OwnStatusTransition,
  ): Promise<StatusTransitionOutcome | null>;

  /** The acting principal's status history, oldest first. */
  listOwnStatusHistory(actor: PrincipalActor): Promise<UserStatusChange[]>;
}
