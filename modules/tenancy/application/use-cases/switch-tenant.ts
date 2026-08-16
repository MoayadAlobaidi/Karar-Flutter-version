/**
 * SwitchTenant — a bound principal moves their session to ANOTHER tenant they
 * actively belong to. The dangerous operation of Phase 3.5, built on three
 * rules:
 *
 * 1. SERVER-SIDE VERIFICATION FIRST: the target must be the caller's OWN
 *    ACTIVE membership (0080 self-arm — an arbitrary, revoked, expired, or
 *    foreign tenant id reads back nothing) in an ACTIVE tenant (0081 arm —
 *    a disabled tenant is not a target). The denial is uniform
 *    (`membership_not_found`): an unknown tenant and a tenant the caller was
 *    removed from answer identically.
 *
 * 2. FULL REBIND, NEVER AN UPDATE-IN-PLACE: the identity port atomically
 *    revokes the current session AND its refresh-token families and issues a
 *    brand-new session carrying the new binding. Old access tokens die with
 *    the revoked sid on their next per-request re-validation; old refresh
 *    tokens die with the family. The response carries the NEW tokens.
 *
 * 3. RACE-SAFE BY COMPENSATION: after issuance the membership is verified
 *    AGAIN; if it vanished concurrently the replacement session is revoked
 *    (fail closed — the caller ends signed out/denied, never bound without
 *    membership) and the denial is audited. The residual window between the
 *    re-verification and a later revocation is covered by the platform's
 *    standing rule that binding is ROUTING, not authority: every tenant-bound
 *    request re-checks membership/permissions and RLS bounds the rows.
 *
 * 4. ACCOUNTABILITY IS PART OF THE OPERATION (audit posture, matching
 *    identity's `auditOrFail` and the capability module's AUDIT_APPEND_FAILED
 *    stance): every audit write is INSPECTED. If the SUCCESS record cannot be
 *    written the switch does not stand — the replacement session is revoked
 *    by the same compensation rule 3 uses, and the caller is failed. Binding
 *    is one of the few security-relevant state changes that HAS a clean undo,
 *    so it fails closed by reversing rather than by leaving a live,
 *    unrecorded tenant scope behind. On a denial path (nothing bound, session
 *    already revoked) there is nothing to reverse, but the failure is still
 *    surfaced rather than swallowed.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { requireSessionActor, type AuthenticatedActor } from '../principal.js';
import type { SwitchTenantError } from '../errors.js';
import type { OwnMembershipRepository } from '../ports/membership-repository.js';
import type { MemberTenantRepository } from '../ports/tenant-repository.js';
import type {
  BindingClientContext,
  RebindSessionTenantPort,
  ReboundSessionView,
  RevokeSessionPort,
} from '../ports/session-binding.js';
import type { AuditTrail } from '../ports/audit-trail.js';
import { membershipActiveAt } from './list-own-memberships.js';

export interface SwitchTenantInput {
  /** The requested target — verified against the caller's OWN memberships. */
  readonly targetTenantId: string;
  readonly client: BindingClientContext;
}

export interface TenantSwitched {
  readonly kind: 'switched';
  /** Brand-new session (new sid, new refresh family) bound to the target. */
  readonly session: ReboundSessionView;
  readonly previousTenantId: string | null;
  readonly tenantId: string;
}

export class SwitchTenant {
  constructor(
    private readonly memberships: OwnMembershipRepository,
    private readonly tenants: MemberTenantRepository,
    private readonly rebindSession: RebindSessionTenantPort,
    private readonly revokeSession: RevokeSessionPort,
    private readonly auditTrail: AuditTrail,
    private readonly clock: { now(): Date },
  ) {}

  async execute(
    input: SwitchTenantInput,
    actor: AuthenticatedActor,
  ): Promise<Result<TenantSwitched, SwitchTenantError>> {
    const sessionActor = requireSessionActor(actor);
    if (!sessionActor.ok) {
      return sessionActor;
    }
    const caller = sessionActor.value;

    const notAMember = Result.err<SwitchTenantError>({
      kind: 'membership_not_found',
      message: 'the principal holds no active membership in the requested tenant',
    });
    const parsed = TenantId.parse(input.targetTenantId);
    if (!parsed.ok) {
      // Malformed ids answer exactly like unknown tenants — no shape oracle.
      return notAMember;
    }
    const target = parsed.value;

    try {
      // 1. Verify: the caller's own ACTIVE membership in an ACTIVE tenant.
      const verified = await this.verifyTarget(caller, target);
      if (!verified) return notAMember;

      // 2. Full rebind through the identity seam.
      const rebound = await this.rebindSession.execute({
        accountId: caller.userId,
        sessionId: caller.sessionId,
        newTenantId: target,
        client: input.client,
      });
      if (!rebound.ok) {
        return Result.err({
          kind: 'binding_failed',
          message: `the session could not be rebound (${rebound.error.kind})`,
        });
      }
      const { session, previousBinding } = rebound.value;

      // 3. Verify AGAIN after issuance; compensate when membership vanished.
      const stillMember = await this.verifyTarget(caller, target);
      if (!stillMember) {
        await this.revokeSession.execute({
          accountId: caller.userId,
          sessionId: session.sessionId,
          client: input.client,
        });
        const denialAudited = await this.auditTrail.record({
          occurredAt: this.clock.now(),
          actorRef: `user:${UserId.toString(caller.userId)}`,
          tenantRef: `tenant:${TenantId.toString(target)}`,
          action: 'tenancy.tenant.switch',
          resourceType: 'tenant_membership',
          resourceId: TenantId.toString(target),
          reason: 'membership_revoked_concurrently',
          requestId: caller.requestId ?? null,
          outcome: 'DENIED',
        });
        if (!denialAudited.ok) {
          // Already denied and already compensated, so there is nothing left
          // to undo — but the caller is still told the request did not
          // complete rather than receiving a clean answer for an unrecorded
          // event (rule 4 above).
          return Result.err({
            kind: 'store_failure',
            message: `the switch was denied and the replacement session revoked, but the accountability record could not be written (${denialAudited.error.kind})`,
          });
        }
        return Result.err({
          kind: 'membership_revoked_concurrently',
          message:
            'the target membership was revoked while the switch was in flight; the replacement session was revoked — sign in again',
        });
      }

      const audited = await this.auditTrail.record({
        occurredAt: this.clock.now(),
        actorRef: `user:${UserId.toString(caller.userId)}`,
        tenantRef: `tenant:${TenantId.toString(target)}`,
        action: 'tenancy.tenant.switch',
        resourceType: 'tenant_membership',
        resourceId: TenantId.toString(target),
        requestId: caller.requestId ?? null,
        beforeMetadata: { tenantId: previousBinding ?? '' },
        afterMetadata: { tenantId: TenantId.toString(target) },
        outcome: 'SUCCESS',
      });
      if (!audited.ok) {
        // FAIL CLOSED (rule 4): a binding nobody can account for does not
        // stand. The same compensation the membership race uses applies —
        // revoke the replacement session, so the switch leaves no live
        // unaudited tenant scope behind.
        await this.revokeSession.execute({
          accountId: caller.userId,
          sessionId: session.sessionId,
          client: input.client,
        });
        return Result.err({
          kind: 'store_failure',
          message: `the switch could not be recorded (${audited.error.kind}); the replacement session was revoked — sign in again`,
        });
      }

      return Result.ok({
        kind: 'switched',
        session,
        previousTenantId: previousBinding,
        tenantId: TenantId.toString(target),
      });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `tenant switch failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /** DB truth only: own ACTIVE membership row + ACTIVE tenant row (RLS-bounded). */
  private async verifyTarget(actor: AuthenticatedActor, target: TenantId): Promise<boolean> {
    const membership = await this.memberships.findOwnInTenant(actor, target);
    if (membership === null || !membershipActiveAt(membership, this.clock.now())) {
      return false;
    }
    const tenant = await this.tenants.findForMember(actor, target);
    return tenant !== null && tenant.status === 'ACTIVE';
  }
}
