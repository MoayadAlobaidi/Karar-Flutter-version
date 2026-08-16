/**
 * CreateInvitation — an ACTIVE member with the `tenancy.invitation.create`
 * permission (checked via the PolicyService port, with the requested
 * role_hint as resource context) invites an email into their OWN tenant.
 *
 * Token discipline: the raw 32-byte token is issued by the token source and
 * returned ONCE in this use case's output; only sha256(token) reaches the
 * repository. The raw token never appears in audit metadata or logs.
 */

import type { Clock } from '@karar/shared-kernel';
import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { CreateInvitationError } from '../errors.js';
import type { InvitationRepository } from '../ports/invitation-repository.js';
import type { MembershipRepository } from '../ports/membership-repository.js';
import type { PolicyService } from '../ports/policy-service.js';
import type { InvitationTokenSource } from '../ports/invitation-token-source.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import {
  isValidInvitationEmail,
  isValidRoleHint,
  normalizeInvitationEmail,
  type TenantInvitation,
} from '../../domain/tenancy.js';

export interface CreateInvitationInput {
  readonly email: string;
  readonly roleHint?: string;
  readonly expiresInHours?: number;
}

export interface InvitationCreated {
  readonly invitation: TenantInvitation;
  /** Shown once; never retrievable again. */
  readonly token: string;
  readonly auditFailure: AuditTrailFailure | null;
}

const DEFAULT_EXPIRES_IN_HOURS = 72;
const MAX_EXPIRES_IN_HOURS = 24 * 30;
const DEFAULT_MAX_ATTEMPTS = 5;
const HOUR_MS = 3_600_000;

export class CreateInvitation {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly memberships: MembershipRepository,
    private readonly policy: PolicyService,
    private readonly tokens: InvitationTokenSource,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateInvitationInput,
    actor: PrincipalActor,
  ): Promise<Result<InvitationCreated, CreateInvitationError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }

    const email = normalizeInvitationEmail(typeof input.email === 'string' ? input.email : '');
    if (!isValidInvitationEmail(email)) {
      return Result.err({
        kind: 'invalid_invitation_input',
        message: 'a valid invitee email address is required',
      });
    }
    const roleHint = input.roleHint ?? 'MEMBER';
    if (!isValidRoleHint(roleHint)) {
      return Result.err({
        kind: 'invalid_invitation_input',
        message: 'roleHint must be an UPPER_SNAKE_CASE label of at most 40 characters',
      });
    }
    const expiresInHours = input.expiresInHours ?? DEFAULT_EXPIRES_IN_HOURS;
    if (
      !Number.isInteger(expiresInHours) ||
      expiresInHours < 1 ||
      expiresInHours > MAX_EXPIRES_IN_HOURS
    ) {
      return Result.err({
        kind: 'invalid_invitation_input',
        message: `expiresInHours must be an integer between 1 and ${MAX_EXPIRES_IN_HOURS}`,
      });
    }

    try {
      const own = await this.memberships.findOwn(principal.value);
      if (own === null || own.state !== 'ACTIVE') {
        return Result.err({
          kind: 'membership_not_found',
          message: 'creating an invitation requires an active membership in the bound tenant',
        });
      }
      const decision = await this.policy.authorize(
        { tenantId: principal.value.tenantId, userId: principal.value.userId },
        'tenancy.invitation.create',
        { roleHint },
      );
      if (!decision.allowed) {
        return Result.err({
          kind: 'not_authorized',
          permission: 'tenancy.invitation.create',
          message: decision.reason,
        });
      }

      const occurredAt = this.clock.now();
      const issued = this.tokens.issue();
      const invitation = await this.invitations.createForTenant(principal.value, {
        email,
        tokenHash: issued.tokenHash,
        roleHint,
        expiresAt: new Date(occurredAt.getTime() + expiresInHours * HOUR_MS),
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        occurredAt,
      });

      const audit = await this.auditTrail.record({
        occurredAt,
        actorRef: `user:${UserId.toString(principal.value.userId)}`,
        tenantRef: `tenant:${TenantId.toString(principal.value.tenantId)}`,
        action: 'tenancy.invitation.created',
        resourceType: 'tenant_invitation',
        resourceId: invitation.id,
        requestId: principal.value.requestId ?? null,
        // Identifier-shaped metadata only: never the email, never the token.
        afterMetadata: { roleHint, expiresAt: invitation.expiresAt.toISOString() },
        outcome: 'SUCCESS',
      });

      return Result.ok({
        invitation,
        token: issued.rawToken,
        auditFailure: audit.ok ? null : audit.error,
      });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `invitation creation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
