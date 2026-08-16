/**
 * GrantFirstPartyMembership — the EXPLICIT mechanism that enrols a user into
 * the first-party tenant (MEMBER role hint). This use case exists so that
 * first-party enrolment is a visible, audited operation — never a side
 * effect buried inside identity registration.
 *
 * The tenant id arrives from CONFIGURATION at composition time
 * (KARAR_FIRST_PARTY_TENANT_ID via the platform config; local default is the
 * documented synthetic tenant the local seed creates) — no magic UUID lives
 * in domain or application code, and no caller input ever names the tenant.
 *
 * Callers today: the local/dev seed path and tests. Production wiring
 * (invoking this after registration/e-mail verification) is documented
 * Phase 4 entry work in MODULE.md.
 *
 * The INSERT runs under the FULL principal context (first-party tenant +
 * the user), so the 0042 policy binds the row to the authenticated principal
 * at the RLS layer — the same guarantee redemption relies on. Idempotent:
 * an existing membership answers 'already_member' and changes nothing.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { requireAuthenticated, type AuthenticatedActor } from '../principal.js';
import type { GrantFirstPartyMembershipError } from '../errors.js';
import type { OwnMembershipRepository } from '../ports/membership-repository.js';
import type { TenantRepository } from '../ports/tenant-repository.js';
import type { AuditTrail } from '../ports/audit-trail.js';
import type { TenantMembership } from '../../domain/tenancy.js';

export const FIRST_PARTY_MEMBER_ROLE_HINT = 'MEMBER';

export interface FirstPartyMembershipGranted {
  readonly kind: 'created' | 'already_member';
  readonly tenantId: string;
  readonly membership: TenantMembership | null;
}

export class GrantFirstPartyMembership {
  constructor(
    private readonly memberships: OwnMembershipRepository,
    private readonly tenants: TenantRepository,
    private readonly auditTrail: AuditTrail,
    private readonly clock: { now(): Date },
    /** From typed configuration — never a literal in code, never client input. */
    private readonly firstPartyTenantId: TenantId,
  ) {}

  async execute(
    actor: AuthenticatedActor,
  ): Promise<Result<FirstPartyMembershipGranted, GrantFirstPartyMembershipError>> {
    const authenticated = requireAuthenticated(actor);
    if (!authenticated.ok) {
      return authenticated;
    }
    const caller = authenticated.value;
    const tenantId = this.firstPartyTenantId;

    try {
      // The configured tenant must exist, be ACTIVE, and actually be the
      // first-party tenant — a misconfiguration fails loudly, never half-way.
      const tenant = await this.tenants.findOwn({ tenantId, userId: caller.userId });
      if (tenant === null || tenant.status !== 'ACTIVE' || tenant.type !== 'FIRST_PARTY') {
        return Result.err({
          kind: 'first_party_tenant_unavailable',
          message:
            'the configured first-party tenant does not resolve to an ACTIVE FIRST_PARTY tenant — check KARAR_FIRST_PARTY_TENANT_ID and the seed',
        });
      }

      const occurredAt = this.clock.now();
      const outcome = await this.memberships.createOwnMembership({
        userId: caller.userId,
        tenantId,
        roleHint: FIRST_PARTY_MEMBER_ROLE_HINT,
        occurredAt,
        ...(caller.sessionId !== undefined ? { sessionId: caller.sessionId } : {}),
        ...(caller.requestId !== undefined ? { requestId: caller.requestId } : {}),
      });

      if (outcome.kind === 'created') {
        await this.auditTrail.record({
          occurredAt,
          actorRef: `user:${UserId.toString(caller.userId)}`,
          tenantRef: `tenant:${TenantId.toString(tenantId)}`,
          action: 'tenancy.membership.first_party_granted',
          resourceType: 'tenant_membership',
          resourceId: outcome.membership.id,
          requestId: caller.requestId ?? null,
          afterMetadata: { roleHint: FIRST_PARTY_MEMBER_ROLE_HINT },
          outcome: 'SUCCESS',
        });
      }

      return Result.ok({
        kind: outcome.kind,
        tenantId: TenantId.toString(tenantId),
        membership: outcome.membership,
      });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `first-party enrolment failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
