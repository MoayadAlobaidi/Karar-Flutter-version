import { describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
// The PolicyService PORTS the consuming modules declared inward — imported
// from their public APIs so this test breaks loudly if any consumer reshapes
// its port without reconciling here (the module provides ONE real
// implementation satisfying every declared shape).
import type {
  PolicyActor as TenancyPolicyActor,
  PolicyService as TenancyPolicyService,
} from '@karar/tenancy';
import type { PolicyService as EntityPolicyService } from '@karar/operating-entity';
import type { PolicyService as ConsentPolicyService } from '@karar/consent';

import { RbacPolicyService } from '../application/policy-service.js';
import { PrincipalRefPolicyService } from '../application/principal-ref-policy-service.js';
import type { PolicyActor } from '../application/actor.js';
import type {
  RoleAssignmentGrant,
  RoleAssignmentRepository,
  RoleAssignmentRevocation,
  WriteContext,
} from '../application/ports/role-assignment-repository.js';
import type { RoleAssignment } from '../domain/role-assignment.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const ALICE = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');

class InMemoryAssignments implements RoleAssignmentRepository {
  rows: RoleAssignment[] = [];

  async listOwnActive(actor: PolicyActor, at: Date): Promise<RoleAssignment[]> {
    void at;
    return this.rows.filter(
      (row) =>
        UserId.toString(row.userId) === UserId.toString(actor.userId) &&
        (row.tenantId === null ||
          (actor.tenantId !== undefined &&
            TenantId.toString(row.tenantId) === TenantId.toString(actor.tenantId))),
    );
  }
  async create(grant: RoleAssignmentGrant, context: WriteContext): Promise<RoleAssignment> {
    void grant;
    void context;
    throw new Error('unused');
  }
  async revokeActive(
    revocation: RoleAssignmentRevocation,
    context: WriteContext,
  ): Promise<RoleAssignment | null> {
    void revocation;
    void context;
    throw new Error('unused');
  }
}

function build() {
  const store = new InMemoryAssignments();
  const service = new RbacPolicyService(store, new Clock.Fixed(NOW));
  return { store, service, facade: new PrincipalRefPolicyService(service) };
}

describe('port reconciliation — one real PolicyService, every declared shape', () => {
  it('RbacPolicyService satisfies the tenancy port at compile time and behaves under it', async () => {
    const { store, service } = build();
    // COMPILE-TIME assertion: assignability to the tenancy-declared port.
    const port: TenancyPolicyService = service;

    store.rows = [
      {
        id: '00000000-0000-7000-8000-000000000001',
        userId: ALICE,
        roleId: 'TENANT_ADMIN',
        tenantId: TENANT_A,
        status: 'ACTIVE',
        grantedBy: ALICE,
        reason: 'seed',
        effectiveFrom: new Date(NOW.getTime() - 1000),
        effectiveTo: null,
        revokedAt: null,
        revokedBy: null,
        createdAt: new Date(NOW.getTime() - 1000),
      },
    ];
    const actor: TenancyPolicyActor = { tenantId: TENANT_A, userId: ALICE };
    const allowed = await port.authorize(actor, 'tenancy.member.read', { roleHint: 'MEMBER' });
    expect(allowed).toEqual({ allowed: true, reason: 'granted:TENANT_ADMIN' });

    const denied = await port.authorize(actor, 'tenancy.invitation.create', {});
    expect(denied.allowed).toBe(true); // TENANT_ADMIN holds all three tenancy permissions
    const outsider = await port.authorize(
      { tenantId: TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b'), userId: ALICE },
      'tenancy.member.read',
    );
    expect(outsider.allowed).toBe(false);
    expect(typeof outsider.reason).toBe('string');
  });

  it('PrincipalRefPolicyService satisfies the operating-entity AND consent ports; refusal is a Result value', async () => {
    const { store, facade } = build();
    // COMPILE-TIME assertions: one facade, both declared shapes.
    const entityPort: EntityPolicyService = facade;
    const consentPort: ConsentPolicyService = facade;

    store.rows = [
      {
        id: '00000000-0000-7000-8000-000000000002',
        userId: ALICE,
        roleId: 'PLATFORM_ADMIN',
        tenantId: null,
        status: 'ACTIVE',
        grantedBy: ALICE,
        reason: 'seed',
        effectiveFrom: new Date(NOW.getTime() - 1000),
        effectiveTo: null,
        revokedAt: null,
        revokedBy: null,
        createdAt: new Date(NOW.getTime() - 1000),
      },
    ];

    const principal = { principalRef: UserId.toString(ALICE), tenantRef: null };
    expect((await entityPort.authorize(principal, 'entity.entity.manage')).ok).toBe(true);
    expect((await consentPort.authorize(principal, 'consent.document.publish')).ok).toBe(true);

    const refused = await entityPort.authorize(principal, 'entity.migration.approve.everything');
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('AUTHORIZATION_DENIED');
      expect(refused.error.permission).toBe('entity.migration.approve.everything');
      expect(refused.error.message).toContain('unknown_permission');
    }
  });

  it('the facade fails closed on unparseable refs — an unreadable principal is not a principal', async () => {
    const { facade } = build();
    const badPrincipal = await facade.authorize(
      { principalRef: 'staff:root', tenantRef: null },
      'entity.entity.manage',
    );
    expect(!badPrincipal.ok && badPrincipal.error.kind === 'AUTHORIZATION_DENIED').toBe(true);

    const badTenant = await facade.authorize(
      { principalRef: UserId.toString(ALICE), tenantRef: 'not-a-tenant' },
      'consent.status.read',
    );
    expect(!badTenant.ok && badTenant.error.kind === 'AUTHORIZATION_DENIED').toBe(true);
  });
});
