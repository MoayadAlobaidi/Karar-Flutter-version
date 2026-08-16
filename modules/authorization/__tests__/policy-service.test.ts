import { describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';

import { RbacPolicyService, POLICY_DENIAL_REASONS } from '../application/policy-service.js';
import { RequestScopedPolicyService } from '../application/request-scoped-policy-service.js';
import { authorize } from '../application/authorize.js';
import type { PolicyActor } from '../application/actor.js';
import type {
  RoleAssignmentGrant,
  RoleAssignmentRepository,
  RoleAssignmentRevocation,
  WriteContext,
} from '../application/ports/role-assignment-repository.js';
import type { RoleAssignment } from '../domain/role-assignment.js';
import type { RoleId } from '../domain/catalogue.js';

// Unit coverage of the resolution semantics over an in-memory assignment
// store: deny-by-default in every direction, scope discipline, fail-closed
// store outages, and the per-request memo contract.

const NOW = new Date('2026-08-16T12:00:00.000Z');
const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
const ALICE = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const BILAL = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');

let sequence = 0;

function assignment(
  userId: UserId,
  roleId: RoleId,
  tenantId: TenantId | null,
  overrides: Partial<RoleAssignment> = {},
): RoleAssignment {
  sequence += 1;
  return {
    id: `00000000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    userId,
    roleId,
    tenantId,
    status: 'ACTIVE',
    grantedBy: ALICE,
    reason: 'test grant',
    effectiveFrom: new Date(NOW.getTime() - 60_000),
    effectiveTo: null,
    revokedAt: null,
    revokedBy: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  };
}

/** In-memory port double honoring the self-read contract (caller's rows only). */
class InMemoryAssignments implements RoleAssignmentRepository {
  rows: RoleAssignment[] = [];
  calls = 0;
  failNext = false;

  async listOwnActive(actor: PolicyActor, at: Date): Promise<RoleAssignment[]> {
    this.calls += 1;
    if (this.failNext) {
      throw new Error('connection refused');
    }
    return this.rows.filter(
      (row) =>
        UserId.toString(row.userId) === UserId.toString(actor.userId) &&
        row.status === 'ACTIVE' &&
        row.effectiveFrom.getTime() <= at.getTime() &&
        (row.effectiveTo === null || row.effectiveTo.getTime() > at.getTime()) &&
        // Mirrors the 0052 SELECT arms: own-tenant rows + own platform rows.
        (row.tenantId === null ||
          (actor.tenantId !== undefined &&
            TenantId.toString(row.tenantId) === TenantId.toString(actor.tenantId))),
    );
  }

  async create(grant: RoleAssignmentGrant, context: WriteContext): Promise<RoleAssignment> {
    void grant;
    void context;
    throw new Error('not used in these tests');
  }

  async revokeActive(
    revocation: RoleAssignmentRevocation,
    context: WriteContext,
  ): Promise<RoleAssignment | null> {
    void revocation;
    void context;
    throw new Error('not used in these tests');
  }
}

function build(): { service: RbacPolicyService; store: InMemoryAssignments } {
  const store = new InMemoryAssignments();
  return { service: new RbacPolicyService(store, new Clock.Fixed(NOW)), store };
}

describe('RbacPolicyService — deny by default', () => {
  it('denies an unknown permission, a wildcard, and a future-capability name', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'PLATFORM_ADMIN', null)];
    for (const permission of ['amanat.record.create', '*', 'tenancy.*', 'made.up.permission']) {
      const decision = await service.authorize({ userId: ALICE }, permission);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe(POLICY_DENIAL_REASONS.unknownPermission);
    }
  });

  it('denies a principal with no assignments at all', async () => {
    const { service } = build();
    const decision = await service.authorize({ userId: ALICE }, 'users.profile.read');
    expect(decision).toEqual({ allowed: false, reason: POLICY_DENIAL_REASONS.noApplicableAssignment });
  });

  it('denies a held role that simply lacks the permission (reason: permission_not_held)', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'SUPPORT', null)];
    const decision = await service.authorize({ userId: ALICE }, 'users.status.update');
    expect(decision).toEqual({ allowed: false, reason: POLICY_DENIAL_REASONS.permissionNotHeld });
  });

  it('denies an invalid principal before touching the store (fail closed)', async () => {
    const { service, store } = build();
    const decision = await service.authorize(
      { userId: 'not-a-uuid' as never },
      'users.profile.read',
    );
    expect(decision.reason).toBe(POLICY_DENIAL_REASONS.invalidActor);
    expect(store.calls).toBe(0);
  });

  it('a store outage DENIES (assignment_store_unavailable), never throws an allow past the caller', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'PLATFORM_ADMIN', null)];
    store.failNext = true;
    const decision = await service.authorize({ userId: ALICE }, 'authorization.role.assign');
    expect(decision).toEqual({ allowed: false, reason: POLICY_DENIAL_REASONS.storeUnavailable });
  });

  it('expired and not-yet-effective assignments do not authorize', async () => {
    const { service, store } = build();
    store.rows = [
      assignment(ALICE, 'SUPPORT', null, { effectiveTo: new Date(NOW.getTime() - 1) }),
      assignment(ALICE, 'OPERATOR', null, { effectiveFrom: new Date(NOW.getTime() + 60_000) }),
    ];
    expect((await service.authorize({ userId: ALICE }, 'users.profile.read')).allowed).toBe(false);
    expect(
      (await service.authorize({ userId: ALICE }, 'controlplane.killswitch.operate')).allowed,
    ).toBe(false);
  });
});

describe('RbacPolicyService — scope discipline', () => {
  it('a tenant-scoped role works in its tenant and NOWHERE else', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'TENANT_ADMIN', TENANT_A)];

    const inA = await service.authorize({ userId: ALICE, tenantId: TENANT_A }, 'tenancy.member.read');
    expect(inA).toEqual({ allowed: true, reason: 'granted:TENANT_ADMIN' });

    // Same credentials, tenant B context: the assignment does not apply.
    const inB = await service.authorize({ userId: ALICE, tenantId: TENANT_B }, 'tenancy.member.read');
    expect(inB.allowed).toBe(false);

    // No tenant context at all: the tenant role grants nothing.
    const platform = await service.authorize({ userId: ALICE }, 'tenancy.member.read');
    expect(platform.allowed).toBe(false);
  });

  it('a tenant role never implies a platform permission', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'TENANT_ADMIN', TENANT_A)];
    for (const permission of [
      'authorization.role.assign',
      'users.status.update',
      'entity.entity.manage',
      'controlplane.killswitch.operate',
    ]) {
      const decision = await service.authorize(
        { userId: ALICE, tenantId: TENANT_A },
        permission,
      );
      expect({ permission, allowed: decision.allowed }).toEqual({ permission, allowed: false });
    }
  });

  it('a platform-scoped role works across tenant contexts — as a permission decision only', async () => {
    const { service, store } = build();
    store.rows = [assignment(BILAL, 'PLATFORM_ADMIN', null)];
    for (const tenantId of [TENANT_A, TENANT_B, undefined]) {
      const decision = await service.authorize(
        tenantId === undefined ? { userId: BILAL } : { userId: BILAL, tenantId },
        'entity.entity.manage',
      );
      expect(decision).toEqual({ allowed: true, reason: 'granted:PLATFORM_ADMIN' });
    }
    // …and holding it grants nothing outside its mapping.
    expect((await service.authorize({ userId: BILAL }, 'tenancy.member.read')).allowed).toBe(false);
  });
});

describe('authorize() helper (the use-case enforcement point)', () => {
  it('maps a denial to a not_authorized Result the caller must handle', async () => {
    const { service } = build();
    const result = await authorize(service, { userId: ALICE }, 'users.profile.read');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_authorized');
      expect(result.error.permission).toBe('users.profile.read');
      expect(result.error.reason).toBe(POLICY_DENIAL_REASONS.noApplicableAssignment);
    }
  });

  it('passes an allow through as ok(void)', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'SUPPORT', null)];
    const result = await authorize(service, { userId: ALICE }, 'users.profile.read');
    expect(result.ok).toBe(true);
  });
});

describe('RequestScopedPolicyService — the only sanctioned memo', () => {
  it('memoizes within its own lifetime and re-derives across instances (revocation stays immediate)', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'SUPPORT', null)];

    const requestOne = new RequestScopedPolicyService(service);
    expect((await requestOne.authorize({ userId: ALICE }, 'users.profile.read')).allowed).toBe(true);
    expect((await requestOne.authorize({ userId: ALICE }, 'users.profile.read')).allowed).toBe(true);
    expect(store.calls).toBe(1); // second check served from the request memo

    // "Revocation" lands; a NEW request sees it immediately — no TTL to wait out.
    store.rows = [];
    const requestTwo = new RequestScopedPolicyService(service);
    expect((await requestTwo.authorize({ userId: ALICE }, 'users.profile.read')).allowed).toBe(false);
    expect(store.calls).toBe(2);
  });

  it('memo keys include the resource context', async () => {
    const { service, store } = build();
    store.rows = [assignment(ALICE, 'SUPPORT', null)];
    const request = new RequestScopedPolicyService(service);
    await request.authorize({ userId: ALICE }, 'users.profile.read', { subject: 'x' });
    await request.authorize({ userId: ALICE }, 'users.profile.read', { subject: 'y' });
    expect(store.calls).toBe(2);
  });
});
