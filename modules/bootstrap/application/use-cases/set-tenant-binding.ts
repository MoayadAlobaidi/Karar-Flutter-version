/**
 * SetTenantBinding — POST /platform/tenant-binding: explicit tenant
 * selection. The body's tenantId is a CHOICE among the caller's own
 * server-verified active memberships, never a principal:
 *
 * - UNBOUND session → FIRST BIND: verify the target is a usable choice
 *   (active membership, active tenant — resolution's business), bind with NO
 *   token rotation, verify AGAIN, and compensate (revoke the session) if the
 *   membership vanished in the race window.
 * - BOUND session → SWITCH: delegated to the tenancy seam, which verifies
 *   the target, atomically revokes the old session + refresh families,
 *   issues the replacement bound to the target, re-verifies, and compensates
 *   on the concurrent-revocation race. The response carries the NEW tokens;
 *   every prior token is dead.
 *
 * Membership denials are uniform (`membership_required`): an arbitrary
 * tenant, a revoked membership, an expired membership, and a disabled tenant
 * all answer identically.
 *
 * AUDIT POSTURE (fail closed, matching identity's `auditOrFail` and the
 * capability module's AUDIT_APPEND_FAILED stance): the accountability record
 * is part of the operation. Every audit write is inspected; when the record
 * for a completed bind or switch cannot be written, the session carrying that
 * binding is REVOKED and the caller is failed with `context_unavailable`
 * (503). Binding is a security-relevant state change that HAS a clean undo,
 * so it fails closed by reversing rather than by leaving a live, unrecorded
 * tenant scope behind.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import type { BootstrapPrincipal } from '../principal.js';
import type { SetTenantBindingError } from '../errors.js';
import { choiceFor, type BindingStateView } from '../binding-state.js';
import type {
  BindSessionPort,
  BindingClientContext,
  ResolveTenantContextPort,
  RevokeSessionPort,
  SwitchTenantPort,
  SwitchedSessionView,
  TenantContextActor,
} from '../ports/tenant-context.js';
import type { AuditTrail } from '../ports/audit-trail.js';

export type SetTenantBindingResult =
  | { readonly kind: 'bound'; readonly binding: BindingStateView }
  | {
      readonly kind: 'switched';
      readonly binding: BindingStateView;
      /** The NEW session's tokens — every prior token is dead. */
      readonly session: SwitchedSessionView;
    };

export interface SetTenantBindingDependencies {
  readonly resolveTenantContext: ResolveTenantContextPort;
  readonly bindSession: BindSessionPort;
  readonly revokeSession: RevokeSessionPort;
  readonly switchTenant: SwitchTenantPort;
  readonly auditTrail: AuditTrail;
  readonly clock: { now(): Date };
}

const membershipRequired = (): SetTenantBindingError => ({
  kind: 'membership_required',
  message: 'the principal holds no active membership in the requested tenant',
});

/** The fail-closed answer when accountability could not be written. */
const auditUnavailable = (): SetTenantBindingError => ({
  kind: 'context_unavailable',
  message:
    'the tenant binding could not be recorded in the audit trail; the request was not completed and any binding it made was reversed',
});

export class SetTenantBinding {
  constructor(private readonly deps: SetTenantBindingDependencies) {}

  async execute(
    input: { readonly tenantId: unknown },
    principal: BootstrapPrincipal,
    client: BindingClientContext,
  ): Promise<Result<SetTenantBindingResult, SetTenantBindingError>> {
    if (typeof input.tenantId !== 'string' || !TenantId.parse(input.tenantId).ok) {
      return Result.err({
        kind: 'invalid_tenant_selection',
        message: 'tenantId must be a UUID naming one of the caller’s own tenants',
      });
    }
    const target = input.tenantId;
    const actor: TenantContextActor = {
      userId: principal.userId,
      sessionId: principal.sessionId,
      ...(principal.requestId !== undefined ? { requestId: principal.requestId } : {}),
    };

    try {
      const resolved = await this.deps.resolveTenantContext.execute(actor);
      if (!resolved.ok) {
        return Result.err({
          kind: 'context_unavailable',
          message: 'tenant-context resolution is unavailable',
        });
      }
      const targetChoice = choiceFor(resolved.value, target);
      if (targetChoice === null) {
        // Uniform denial: arbitrary, revoked, expired, disabled — identical.
        return Result.err(membershipRequired());
      }

      if (principal.tenantId === null) {
        return this.firstBind(principal, actor, client, target, targetChoice);
      }
      return this.switch(principal, actor, client, target, targetChoice);
    } catch (error) {
      return Result.err({
        kind: 'context_unavailable',
        message: `tenant binding failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async firstBind(
    principal: BootstrapPrincipal,
    actor: TenantContextActor,
    client: BindingClientContext,
    target: string,
    targetChoice: { readonly tenantId: string; readonly name: string; readonly roleHint: string },
  ): Promise<Result<SetTenantBindingResult, SetTenantBindingError>> {
    const parsed = TenantId.parse(target);
    if (!parsed.ok) {
      return Result.err({ kind: 'invalid_tenant_selection', message: 'tenantId must be a UUID' });
    }
    const bound = await this.deps.bindSession.execute({
      accountId: principal.userId,
      sessionId: principal.sessionId,
      tenantId: parsed.value,
      client,
    });
    if (!bound.ok) {
      return Result.err({
        kind: 'binding_conflict',
        message: `the session could not be bound (${bound.error.kind}) — retry bootstrap`,
      });
    }

    // Verify AGAIN; compensate when the membership vanished in the window.
    const recheck = await this.deps.resolveTenantContext.execute(actor);
    const still = recheck.ok ? choiceFor(recheck.value, target) : null;
    if (still === null) {
      await this.deps.revokeSession.execute({
        accountId: principal.userId,
        sessionId: principal.sessionId,
        client,
      });
      const denialAudited = await this.audit(
        principal,
        target,
        'platform.tenant_binding.bound',
        'DENIED',
        { reason: 'membership_revoked_concurrently' },
      );
      // Already denied and compensated — nothing to reverse, but an
      // unrecorded event never returns a settled answer.
      if (!denialAudited) return Result.err(auditUnavailable());
      return Result.err({
        kind: 'membership_revoked_concurrently',
        message:
          'the target membership was revoked while binding was in flight; the session was revoked — sign in again',
      });
    }

    const audited = await this.audit(
      principal,
      target,
      'platform.tenant_binding.bound',
      'SUCCESS',
      { previousTenantId: null },
    );
    if (!audited) {
      // FAIL CLOSED: reverse the binding we cannot account for.
      await this.deps.revokeSession.execute({
        accountId: principal.userId,
        sessionId: principal.sessionId,
        client,
      });
      return Result.err(auditUnavailable());
    }
    return Result.ok({ kind: 'bound', binding: { kind: 'BOUND', tenant: targetChoice } });
  }

  private async switch(
    principal: BootstrapPrincipal,
    actor: TenantContextActor,
    client: BindingClientContext,
    target: string,
    targetChoice: { readonly tenantId: string; readonly name: string; readonly roleHint: string },
  ): Promise<Result<SetTenantBindingResult, SetTenantBindingError>> {
    const switched = await this.deps.switchTenant.execute(
      { targetTenantId: target, client },
      actor,
    );
    if (!switched.ok) {
      switch (switched.error.kind) {
        case 'missing_principal_context':
          return Result.err({
            kind: 'unauthenticated',
            message: 'the switch requires an authenticated session',
          });
        case 'membership_not_found':
          return Result.err(membershipRequired());
        case 'membership_revoked_concurrently':
          return Result.err({
            kind: 'membership_revoked_concurrently',
            message:
              'the target membership was revoked while the switch was in flight; the replacement session was revoked — sign in again',
          });
        case 'binding_failed':
          return Result.err({
            kind: 'binding_conflict',
            message: 'the session could not be switched — retry bootstrap',
          });
        default:
          return Result.err({
            kind: 'context_unavailable',
            message: 'the tenant switch is unavailable',
          });
      }
    }

    const audited = await this.audit(
      principal,
      target,
      'platform.tenant_binding.switched',
      'SUCCESS',
      { previousTenantId: switched.value.previousTenantId },
    );
    if (!audited) {
      // FAIL CLOSED: the tenancy seam already recorded and completed the
      // switch, but this surface's record is missing — revoke the NEW
      // session so no live binding outlives its accountability record. The
      // caller signs in again; the old session is already dead by design.
      await this.deps.revokeSession.execute({
        accountId: principal.userId,
        sessionId: switched.value.session.sessionId,
        client,
      });
      return Result.err(auditUnavailable());
    }
    return Result.ok({
      kind: 'switched',
      binding: { kind: 'BOUND', tenant: targetChoice },
      session: switched.value.session,
    });
  }

  /** False when the record could not be written — never swallowed. */
  private async audit(
    principal: BootstrapPrincipal,
    tenantId: string,
    action: string,
    outcome: 'SUCCESS' | 'DENIED',
    detail: { readonly previousTenantId?: string | null; readonly reason?: string },
  ): Promise<boolean> {
    const written = await this.deps.auditTrail.record({
      occurredAt: this.deps.clock.now(),
      actorRef: `user:${UserId.toString(principal.userId)}`,
      tenantRef: `tenant:${tenantId}`,
      action,
      resourceType: 'identity_session',
      resourceId: principal.sessionId,
      reason: detail.reason ?? null,
      requestId: principal.requestId ?? null,
      ...(outcome === 'SUCCESS'
        ? {
            beforeMetadata: { tenantId: detail.previousTenantId ?? '' },
            afterMetadata: { tenantId },
          }
        : {}),
      outcome,
    });
    return written.ok;
  }
}
