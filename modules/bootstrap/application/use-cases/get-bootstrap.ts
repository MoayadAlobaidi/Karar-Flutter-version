/**
 * GetBootstrap — the authenticated client's one-call context: who am I,
 * which tenant am I bound to (or must I select one), and the client-safe
 * jurisdiction / operating-entity / PolicyPack / capability view.
 *
 * AUTO-BIND (the documented GET side effect): when the session is UNBOUND
 * and resolution finds EXACTLY ONE usable membership, the session is bound
 * to it through the identity seam — NO token rotation, existing tokens keep
 * working and per-request server-side re-reads pick the binding up. The
 * bind is verified AGAIN after it lands (resolution re-run); if the
 * membership vanished in the race window the session is revoked
 * (fail closed — never bound without membership) and the response reports
 * UNBOUND. Both outcomes are audited.
 *
 * A BOUND session whose tenant no longer resolves (disabled tenant, revoked
 * membership) reports UNBOUND / TENANT_SELECTION_REQUIRED — a stale binding
 * is surfaced as the need to (re)select. Enforcement does not live here:
 * binding is ROUTING; every tenant-bound endpoint re-checks membership and
 * RLS bounds the rows regardless of what this view says.
 *
 * ENRICHMENT FAILURE POSTURE: a jurisdiction, PolicyPack, or capability
 * resolution that could not be PERFORMED fails the call
 * (`resolution_unavailable` -> 503). Returning a 200 whose sections are empty
 * would be a correct denial reported as a legitimate absence, which is the
 * one answer a client cannot act on: it would stop asking and retry nothing.
 * The operating-entity section is the deliberate exception — its read failure
 * degrades that section alone to UNAVAILABLE, because the rest of the context
 * is complete without it and the state says so explicitly.
 *
 * AUDIT POSTURE (fail closed, matching identity's `auditOrFail` and the
 * capability module's AUDIT_APPEND_FAILED stance): the accountability record
 * is part of the operation, not a side effect. Every audit write is
 * inspected; when the record for a SUCCESSFUL auto-bind cannot be written,
 * the session is REVOKED (the same compensation the membership race uses) and
 * the call fails with `context_unavailable` — a live tenant binding with no
 * accountability record is exactly what the audit design exists to prevent,
 * and binding, unlike a password change, has a clean undo. On a denial path
 * nothing is bound, so there is nothing to reverse; the failure is still
 * returned rather than swallowed.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import type { BootstrapPrincipal } from '../principal.js';
import type { GetBootstrapError } from '../errors.js';
import {
  choiceFor,
  choicesOf,
  stateForChoices,
  type BindingStateView,
} from '../binding-state.js';
import type {
  BindSessionPort,
  BindingClientContext,
  ResolveTenantContextPort,
  RevokeSessionPort,
  TenantContextActor,
} from '../ports/tenant-context.js';
import type {
  ClientCapabilitiesPort,
  ClientCapabilityView,
  JurisdictionContextPort,
  JurisdictionStateView,
  OperatingEntityReferencePort,
  OperatingEntityStateView,
  PolicyPackStatusPort,
  PolicyPackStatusView,
} from '../ports/context-enrichment.js';
import type { AuditTrail } from '../ports/audit-trail.js';

/**
 * The capability section as the client receives it: the resolution STATE and
 * the list, structurally inseparable. A 200 therefore always states that the
 * resolution succeeded, so an empty `items` is a real answer rather than
 * something the client has to infer from the status line alone. A failed
 * resolution never reaches here — it fails the request.
 */
export interface ResolvedCapabilitiesView {
  readonly state: 'RESOLVED';
  readonly items: readonly ClientCapabilityView[];
}

export interface BootstrapView {
  readonly user: { readonly userId: string; readonly emailVerified: boolean };
  readonly session: { readonly sessionId: string };
  readonly binding: BindingStateView;
  /** Typed state, never null — NONE is the unresolved case (fail closed). */
  readonly jurisdiction: JurisdictionStateView;
  /** Tagged state, never null — the entity is never fabricated. */
  readonly operatingEntity: OperatingEntityStateView;
  readonly policyPack: PolicyPackStatusView | null;
  readonly capabilities: ResolvedCapabilitiesView;
}

export interface GetBootstrapDependencies {
  readonly resolveTenantContext: ResolveTenantContextPort;
  readonly bindSession: BindSessionPort;
  readonly revokeSession: RevokeSessionPort;
  readonly jurisdiction: JurisdictionContextPort;
  readonly operatingEntity: OperatingEntityReferencePort;
  readonly policyPack: PolicyPackStatusPort;
  readonly capabilities: ClientCapabilitiesPort;
  readonly auditTrail: AuditTrail;
  readonly clock: { now(): Date };
}

export class GetBootstrap {
  constructor(private readonly deps: GetBootstrapDependencies) {}

  async execute(
    principal: BootstrapPrincipal,
    client: BindingClientContext,
  ): Promise<Result<BootstrapView, GetBootstrapError>> {
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
      const resolution = resolved.value;

      let binding: BindingStateView;
      if (principal.tenantId !== null) {
        // Bound already: valid only while the tenant is still a usable choice.
        const bound = TenantId.toString(principal.tenantId);
        const choice = choiceFor(resolution, bound);
        binding =
          choice !== null ? { kind: 'BOUND', tenant: choice } : stateForChoices(choicesOf(resolution));
      } else if (resolution.kind === 'AUTO_BIND') {
        const outcome = await this.autoBind(principal, actor, client, resolution.tenantId);
        if (!outcome.ok) return Result.err(outcome.error);
        binding = outcome.binding;
      } else {
        binding = stateForChoices(choicesOf(resolution));
      }

      const effectiveTenantId = binding.kind === 'BOUND' ? binding.tenant.tenantId : null;
      const subject = { userId: UserId.toString(principal.userId), tenantId: effectiveTenantId };
      // The TYPED state travels onward as a whole: nothing here inspects a
      // jurisdiction identifier to decide anything (architecture test 12) —
      // downstream resolvers key on `kind` and fail closed on NONE.
      const governing = await this.deps.jurisdiction.stateFor(subject);
      if (governing.kind === 'UNAVAILABLE') {
        // Everything downstream keys on this state. Reporting NONE here would
        // publish a fail-closed jurisdiction the subject may not be in, and
        // would drag the pack and capability sections down with it silently.
        return Result.err(
          this.resolutionUnavailable('the governing assignment could not be read', governing.retryable),
        );
      }
      const jurisdiction = governing;
      const enrichmentSubject = { ...subject, jurisdiction };
      const [operatingEntity, policyPack, capabilities] = await Promise.all([
        this.deps.operatingEntity.effectiveFor(subject),
        this.deps.policyPack.statusFor(enrichmentSubject),
        this.deps.capabilities.resolveFor(enrichmentSubject),
      ]);

      if (policyPack.kind === 'UNAVAILABLE') {
        return Result.err(
          this.resolutionUnavailable(
            'the active policy pack could not be read',
            policyPack.retryable,
          ),
        );
      }
      if (capabilities.kind === 'UNAVAILABLE') {
        // The whole point of the port change: an empty list here would deny
        // correctly and lie about why. The request fails instead.
        return Result.err(
          this.resolutionUnavailable(
            'capability resolution did not complete',
            capabilities.retryable,
          ),
        );
      }

      return Result.ok({
        user: {
          userId: UserId.toString(principal.userId),
          emailVerified: principal.emailVerified,
        },
        session: { sessionId: principal.sessionId },
        binding,
        jurisdiction,
        // An entity read failure degrades this ONE section to UNAVAILABLE
        // rather than failing the call: the binding, jurisdiction, and
        // capability answers above are complete and useful without it, and
        // the state says plainly that the reference is not known.
        operatingEntity,
        policyPack: policyPack.kind === 'ACTIVE' ? policyPack.status : null,
        capabilities: { state: 'RESOLVED', items: capabilities.capabilities },
      });
    } catch (error) {
      return Result.err({
        kind: 'context_unavailable',
        message: `bootstrap assembly failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * One usable membership: bind, verify again, compensate on the race — and
   * treat the accountability record as part of the operation (see the audit
   * posture in the file header): an auto-bind that cannot be recorded is
   * reversed and the call fails, never returned as a clean BOUND context.
   */
  private async autoBind(
    principal: BootstrapPrincipal,
    actor: TenantContextActor,
    client: BindingClientContext,
    tenantId: string,
  ): Promise<
    | { readonly ok: true; readonly binding: BindingStateView }
    | { readonly ok: false; readonly error: GetBootstrapError }
  > {
    const target = TenantId.parse(tenantId);
    if (!target.ok) {
      // Resolution handed back a malformed id — a defect, not a state.
      throw new Error('tenant resolution produced a malformed tenant id');
    }

    const bound = await this.deps.bindSession.execute({
      accountId: principal.userId,
      sessionId: principal.sessionId,
      tenantId: target.value,
      client,
    });
    if (!bound.ok) {
      // Concurrent bind/revocation: report the unbound truth; the next
      // bootstrap call sees the settled state.
      const audited = await this.auditAutoBind(principal, tenantId, 'DENIED', bound.error.kind);
      if (!audited) return { ok: false, error: this.auditUnavailable() };
      return { ok: true, binding: { kind: 'UNBOUND' } };
    }

    // Verify AGAIN: the membership must still be usable after the bind.
    const recheck = await this.deps.resolveTenantContext.execute(actor);
    const choice = recheck.ok ? choiceFor(recheck.value, tenantId) : null;
    if (choice === null) {
      // The membership vanished (or resolution failed) in the race window:
      // revoke the freshly bound session — fail closed, never bound without
      // membership — and report UNBOUND (the caller signs in again).
      await this.deps.revokeSession.execute({
        accountId: principal.userId,
        sessionId: principal.sessionId,
        client,
      });
      const audited = await this.auditAutoBind(
        principal,
        tenantId,
        'DENIED',
        'membership_revoked_concurrently',
      );
      if (!audited) return { ok: false, error: this.auditUnavailable() };
      return { ok: true, binding: { kind: 'UNBOUND' } };
    }

    const audited = await this.auditAutoBind(principal, tenantId, 'SUCCESS', null);
    if (!audited) {
      // FAIL CLOSED: revoke the session that would otherwise carry an
      // unaccountable tenant binding, then fail the call.
      await this.deps.revokeSession.execute({
        accountId: principal.userId,
        sessionId: principal.sessionId,
        client,
      });
      return { ok: false, error: this.auditUnavailable() };
    }
    return { ok: true, binding: { kind: 'BOUND', tenant: choice } };
  }

  /** The message stays server-side; the edge emits the code alone. */
  private resolutionUnavailable(message: string, retryable: boolean): GetBootstrapError {
    return { kind: 'resolution_unavailable', message, retryable };
  }

  private auditUnavailable(): GetBootstrapError {
    return {
      kind: 'context_unavailable',
      message:
        'the tenant binding could not be recorded in the audit trail; the request was not completed and any binding it made was reversed',
    };
  }

  /** False when the record could not be written — never swallowed. */
  private async auditAutoBind(
    principal: BootstrapPrincipal,
    tenantId: string,
    outcome: 'SUCCESS' | 'DENIED',
    reason: string | null,
  ): Promise<boolean> {
    const written = await this.deps.auditTrail.record({
      occurredAt: this.deps.clock.now(),
      actorRef: `user:${UserId.toString(principal.userId)}`,
      tenantRef: `tenant:${tenantId}`,
      action: 'platform.bootstrap.auto_bind',
      resourceType: 'identity_session',
      resourceId: principal.sessionId,
      reason,
      requestId: principal.requestId ?? null,
      ...(outcome === 'SUCCESS' ? { afterMetadata: { tenantId } } : {}),
      outcome,
    });
    return written.ok;
  }
}
