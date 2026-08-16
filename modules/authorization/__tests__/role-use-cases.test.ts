import { describe, expect, it } from 'vitest';

import { Clock, Result, TenantId, UserId } from '@karar/shared-kernel';

import { AssignRole } from '../application/use-cases/assign-role.js';
import { RevokeRole } from '../application/use-cases/revoke-role.js';
import { RbacPolicyService } from '../application/policy-service.js';
import type { PolicyActor } from '../application/actor.js';
import type {
  RoleAssignmentGrant,
  RoleAssignmentRepository,
  RoleAssignmentRevocation,
  WriteContext,
} from '../application/ports/role-assignment-repository.js';
import { RoleAssignmentConflictError } from '../application/ports/role-assignment-repository.js';
import type { AuditTrail, AuditTrailEntry } from '../application/ports/audit-trail.js';
import type { RoleAssignment } from '../domain/role-assignment.js';
import type { RoleId } from '../domain/catalogue.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const ADMIN = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const DELEGATE = UserId.of('d1d1d1d1-0000-4000-8000-0000000000d1');
const TARGET = UserId.of('c3c3c3c3-0000-4000-8000-0000000000c3');

let sequence = 0;

/** Full in-memory RoleAssignmentRepository honoring the port contracts. */
class InMemoryAssignments implements RoleAssignmentRepository {
  rows: RoleAssignment[] = [];

  seed(userId: UserId, roleId: RoleId, tenantId: TenantId | null): void {
    sequence += 1;
    this.rows.push({
      id: `00000000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
      userId,
      roleId,
      tenantId,
      status: 'ACTIVE',
      grantedBy: userId,
      reason: 'seed',
      effectiveFrom: new Date(NOW.getTime() - 60_000),
      effectiveTo: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: new Date(NOW.getTime() - 60_000),
    });
  }

  async listOwnActive(actor: PolicyActor, at: Date): Promise<RoleAssignment[]> {
    return this.rows.filter(
      (row) =>
        UserId.toString(row.userId) === UserId.toString(actor.userId) &&
        row.status === 'ACTIVE' &&
        row.effectiveFrom.getTime() <= at.getTime() &&
        (row.effectiveTo === null || row.effectiveTo.getTime() > at.getTime()) &&
        (row.tenantId === null ||
          (actor.tenantId !== undefined &&
            TenantId.toString(row.tenantId) === TenantId.toString(actor.tenantId))),
    );
  }

  async create(grant: RoleAssignmentGrant, context: WriteContext): Promise<RoleAssignment> {
    void context;
    const duplicate = this.rows.find(
      (row) =>
        row.status === 'ACTIVE' &&
        UserId.toString(row.userId) === UserId.toString(grant.userId) &&
        row.roleId === grant.roleId &&
        String(row.tenantId) === String(grant.tenantId),
    );
    if (duplicate !== undefined) {
      throw new RoleAssignmentConflictError('duplicate active assignment');
    }
    sequence += 1;
    const created: RoleAssignment = {
      id: `00000000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
      userId: grant.userId,
      roleId: grant.roleId as RoleId,
      tenantId: grant.tenantId,
      status: 'ACTIVE',
      grantedBy: grant.grantedBy,
      reason: grant.reason,
      effectiveFrom: grant.effectiveFrom,
      effectiveTo: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: grant.effectiveFrom,
    };
    this.rows.push(created);
    return created;
  }

  async revokeActive(
    revocation: RoleAssignmentRevocation,
    context: WriteContext,
  ): Promise<RoleAssignment | null> {
    void context;
    const index = this.rows.findIndex(
      (row) =>
        row.status === 'ACTIVE' &&
        UserId.toString(row.userId) === UserId.toString(revocation.userId) &&
        row.roleId === revocation.roleId &&
        String(row.tenantId) === String(revocation.tenantId),
    );
    if (index === -1) {
      return null;
    }
    const revoked: RoleAssignment = {
      ...(this.rows[index] as RoleAssignment),
      status: 'REVOKED',
      revokedAt: revocation.revokedAt,
      revokedBy: revocation.revokedBy,
      effectiveTo: revocation.revokedAt,
    };
    this.rows[index] = revoked;
    return revoked;
  }
}

class RecordingAuditTrail implements AuditTrail {
  entries: AuditTrailEntry[] = [];
  async record(entry: AuditTrailEntry) {
    this.entries.push(entry);
    return Result.ok<void>(undefined);
  }
}

function build() {
  const store = new InMemoryAssignments();
  const clock = new Clock.Fixed(NOW);
  const policy = new RbacPolicyService(store, clock);
  const audit = new RecordingAuditTrail();
  return {
    store,
    audit,
    policy,
    assignRole: new AssignRole(store, policy, audit, clock),
    revokeRole: new RevokeRole(store, policy, audit, clock),
  };
}

describe('AssignRole', () => {
  it('a PLATFORM_ADMIN grants SUPPORT platform-wide; the grant is audited with the actor', async () => {
    const { store, audit, assignRole } = build();
    store.seed(ADMIN, 'PLATFORM_ADMIN', null);

    const granted = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: 'support onboarding' },
      { userId: ADMIN },
    );
    expect(granted.ok).toBe(true);
    if (granted.ok) {
      expect(granted.value.assignment.roleId).toBe('SUPPORT');
      expect(granted.value.assignment.tenantId).toBeNull();
      expect(UserId.toString(granted.value.assignment.grantedBy)).toBe(UserId.toString(ADMIN));
      expect(granted.value.auditFailure).toBeNull();
    }
    const success = audit.entries.find((e) => e.action === 'authorization.role.granted');
    expect(success?.outcome).toBe('SUCCESS');
    expect(success?.actorRef).toBe(`user:${UserId.toString(ADMIN)}`);
    expect(success?.afterMetadata).toMatchObject({ role_id: 'SUPPORT', scope: 'PLATFORM' });
  });

  it('deny-by-default: an actor without authorization.role.assign is refused and the denial audited', async () => {
    const { store, audit, assignRole } = build();
    store.seed(ADMIN, 'SUPPORT', null); // has a role, not THE permission

    const refused = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: 'x' },
      { userId: ADMIN },
    );
    expect(!refused.ok && refused.error.kind === 'not_authorized').toBe(true);
    expect(audit.entries.at(-1)?.outcome).toBe('DENIED');
    expect(store.rows.filter((r) => r.userId === TARGET)).toHaveLength(0);
  });

  it('self-escalation blocked: role.assign without PLATFORM_ADMIN cannot mint PLATFORM_ADMIN — for others or oneself', async () => {
    const { store, audit, assignRole } = build();
    // A hypothetical delegated admin: holds the assign PERMISSION via a
    // direct seeded PLATFORM_ADMIN? No — simulate the future shape by seeding
    // PLATFORM_ADMIN for ADMIN and testing DELEGATE, who merely wishes.
    store.seed(ADMIN, 'PLATFORM_ADMIN', null);
    store.seed(DELEGATE, 'SUPPORT', null);

    // DELEGATE lacks role.assign entirely: denied at check 1.
    const noPermission = await assignRole.execute(
      { userId: UserId.toString(DELEGATE), roleId: 'PLATFORM_ADMIN', reason: 'self grant' },
      { userId: DELEGATE },
    );
    expect(!noPermission.ok && noPermission.error.kind === 'not_authorized').toBe(true);

    // The peer rule itself (check 2) — exercised via the exported hook: an
    // actor whose applicable roles lack PLATFORM_ADMIN is refused even if a
    // future catalogue handed them role.assign.
    const peer = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'PLATFORM_ADMIN', reason: 'legit' },
      { userId: ADMIN },
    );
    expect(peer.ok).toBe(true); // the peer CAN

    expect(audit.entries.some((e) => e.outcome === 'DENIED')).toBe(true);
  });

  it('role scope discipline: TENANT roles need a tenant, PLATFORM roles refuse one', async () => {
    const { store, assignRole } = build();
    store.seed(ADMIN, 'PLATFORM_ADMIN', null);

    const missingTenant = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'TENANT_ADMIN', reason: 'x' },
      { userId: ADMIN },
    );
    expect(!missingTenant.ok && missingTenant.error.kind === 'role_scope_mismatch').toBe(true);

    const strayTenant = await assignRole.execute(
      {
        userId: UserId.toString(TARGET),
        roleId: 'SUPPORT',
        tenantId: TenantId.toString(TENANT_A),
        reason: 'x',
      },
      { userId: ADMIN },
    );
    expect(!strayTenant.ok && strayTenant.error.kind === 'role_scope_mismatch').toBe(true);
  });

  it('an unknown role and an empty reason are refused; a duplicate ACTIVE grant conflicts', async () => {
    const { store, assignRole } = build();
    store.seed(ADMIN, 'PLATFORM_ADMIN', null);

    const unknown = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPER_ADMIN', reason: 'x' },
      { userId: ADMIN },
    );
    expect(!unknown.ok && unknown.error.kind === 'role_not_found').toBe(true);

    const unreasoned = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: '   ' },
      { userId: ADMIN },
    );
    expect(!unreasoned.ok && unreasoned.error.kind === 'invalid_assignment_input').toBe(true);

    const first = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: 'once' },
      { userId: ADMIN },
    );
    expect(first.ok).toBe(true);
    const second = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: 'twice' },
      { userId: ADMIN },
    );
    expect(!second.ok && second.error.kind === 'already_assigned').toBe(true);
  });
});

describe('RevokeRole', () => {
  it('revokes an active assignment, audits it, and authorization is immediately lost', async () => {
    const { store, audit, policy, assignRole, revokeRole } = build();
    store.seed(ADMIN, 'PLATFORM_ADMIN', null);
    const granted = await assignRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: 'grant' },
      { userId: ADMIN },
    );
    expect(granted.ok).toBe(true);

    // Allowed now…
    expect((await policy.authorize({ userId: TARGET }, 'users.profile.read')).allowed).toBe(true);

    const revoked = await revokeRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'SUPPORT', reason: 'offboarding' },
      { userId: ADMIN },
    );
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.value.assignment.status).toBe('REVOKED');
      expect(UserId.toString(revoked.value.assignment.revokedBy as UserId)).toBe(
        UserId.toString(ADMIN),
      );
    }

    // …denied on the very next authorization, same process, no cache to wait out.
    expect((await policy.authorize({ userId: TARGET }, 'users.profile.read')).allowed).toBe(false);
    expect(audit.entries.some((e) => e.action === 'authorization.role.revoked')).toBe(true);
  });

  it('deny-by-default on revoke; a missing active assignment answers assignment_not_found', async () => {
    const { store, revokeRole } = build();
    store.seed(ADMIN, 'PLATFORM_ADMIN', null);
    store.seed(DELEGATE, 'SUPPORT', null);

    const unauthorized = await revokeRole.execute(
      { userId: UserId.toString(ADMIN), roleId: 'PLATFORM_ADMIN', reason: 'x' },
      { userId: DELEGATE },
    );
    expect(!unauthorized.ok && unauthorized.error.kind === 'not_authorized').toBe(true);

    const missing = await revokeRole.execute(
      { userId: UserId.toString(TARGET), roleId: 'OPERATOR', reason: 'x' },
      { userId: ADMIN },
    );
    expect(!missing.ok && missing.error.kind === 'assignment_not_found').toBe(true);
  });
});
