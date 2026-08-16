/**
 * RequestAccountDisable — the disable/deletion-request FOUNDATION. Records
 * the subject's intent (ACTIVE → DISABLE_REQUESTED, with the append-only
 * status-history row in the same transaction) and emits an audit event.
 * NOTHING acts on the intent in Phase 3: session revocation, the disable
 * itself, and deletion machinery are later phases that will consume the
 * recorded intent through these same states — the record comes first so no
 * request is ever lost while the machinery is being built.
 *
 * The audit append happens after the committed transition; if the trail
 * cannot be written the use case still reports success of the state change
 * but carries the audit failure in its output — the caller (and its alerts)
 * see it; nothing is swallowed (legacy AZ5).
 */

import type { Clock } from '@karar/shared-kernel';
import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { RequestAccountDisableError } from '../errors.js';
import type { UserProfileRepository } from '../ports/user-profile-repository.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import { canTransitionUserStatus, type UserStatusChange } from '../../domain/user-profile.js';

export interface RequestAccountDisableInput {
  readonly reason?: string;
}

export interface AccountDisableRequested {
  readonly change: UserStatusChange;
  /** Non-null when the state change committed but the audit append failed. */
  readonly auditFailure: AuditTrailFailure | null;
}

const MAX_REASON_LENGTH = 500;

export class RequestAccountDisable {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RequestAccountDisableInput,
    actor: PrincipalActor,
  ): Promise<Result<AccountDisableRequested, RequestAccountDisableError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }

    let profile;
    try {
      profile = await this.profiles.findOwn(principal.value);
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `profile read failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (profile === null) {
      return Result.err({
        kind: 'profile_not_found',
        message: 'no profile exists for the authenticated principal in their tenant',
      });
    }
    if (!canTransitionUserStatus(profile.status, 'DISABLE_REQUESTED')) {
      return Result.err({
        kind: 'invalid_status_transition',
        message: `a disable request is not valid from status '${profile.status}'`,
      });
    }

    const occurredAt = this.clock.now();
    const reason =
      input.reason === undefined || input.reason.trim() === ''
        ? null
        : input.reason.trim().slice(0, MAX_REASON_LENGTH);

    let outcome;
    try {
      outcome = await this.profiles.transitionOwnStatus(principal.value, {
        expectedFrom: profile.status,
        toStatus: 'DISABLE_REQUESTED',
        reason,
        occurredAt,
      });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `disable request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (outcome === null) {
      // The profile moved between read and write (lost race) — report it as
      // an invalid transition rather than pretending the request applied.
      return Result.err({
        kind: 'invalid_status_transition',
        message: 'the account status changed concurrently; re-read and retry if still wanted',
      });
    }

    const audit = await this.auditTrail.record({
      occurredAt,
      actorRef: `user:${UserId.toString(principal.value.userId)}`,
      tenantRef: `tenant:${TenantId.toString(principal.value.tenantId)}`,
      action: 'users.account.disable_requested',
      resourceType: 'user_profile',
      resourceId: UserId.toString(principal.value.userId),
      reason,
      requestId: principal.value.requestId ?? null,
      beforeMetadata: { status: outcome.change.fromStatus },
      afterMetadata: { status: outcome.change.toStatus },
      outcome: 'SUCCESS',
    });

    return Result.ok({
      change: outcome.change,
      auditFailure: audit.ok ? null : audit.error,
    });
  }
}
