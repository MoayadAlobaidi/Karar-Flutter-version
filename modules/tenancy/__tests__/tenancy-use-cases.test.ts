import { describe, expect, it } from 'vitest';

import { Clock, Result, TenantId, UserId } from '@karar/shared-kernel';

import type { PrincipalActor, RedeemerActor } from '../application/principal.js';
import type { TenantRepository } from '../application/ports/tenant-repository.js';
import type { MembershipRepository } from '../application/ports/membership-repository.js';
import type {
  CreateInvitationRecord,
  InvitationRepository,
  RedemptionOutcome,
} from '../application/ports/invitation-repository.js';
import type { InvitationTokenSource } from '../application/ports/invitation-token-source.js';
import type { RedeemerEmailSource } from '../application/ports/redeemer-email-source.js';
import type { AuditTrail, AuditTrailEntry } from '../application/ports/audit-trail.js';
import {
  DenyAllForTestsPolicyService,
  PermissiveForTestsPolicyService,
} from '../application/testing/permissive-policy-service.js';
import type { Tenant, TenantInvitation, TenantMembership } from '../domain/tenancy.js';
import { GetOwnTenant } from '../application/use-cases/get-own-tenant.js';
import { ListMembers } from '../application/use-cases/list-members.js';
import { CreateInvitation } from '../application/use-cases/create-invitation.js';
import { RevokeInvitation } from '../application/use-cases/revoke-invitation.js';
import { RedeemInvitation } from '../application/use-cases/redeem-invitation.js';

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const USER_NEW = UserId.of('c3c3c3c3-0000-4000-8000-0000000000c3');
const NOW = new Date('2026-08-16T12:00:00.000Z');
const clock = new Clock.Fixed(NOW);

const actor: PrincipalActor = { tenantId: TENANT_A, userId: USER_A1 };
const redeemer: RedeemerActor = { userId: USER_NEW };

const tenant: Tenant = {
  id: TENANT_A,
  type: 'FIRST_PARTY',
  name: 'Tenant A',
  status: 'ACTIVE',
  defaultOperatingEntityId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function membership(overrides: Partial<TenantMembership> = {}): TenantMembership {
  return {
    id: 'member-a1',
    tenantId: TENANT_A,
    userId: USER_A1,
    roleHint: 'TENANT_ADMIN',
    state: 'ACTIVE',
    effectiveFrom: NOW,
    effectiveTo: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function invitation(overrides: Partial<TenantInvitation> = {}): TenantInvitation {
  return {
    id: 'dddddddd-0000-4000-8000-0000000000d1',
    tenantId: TENANT_A,
    email: 'new.user@example.com',
    roleHint: 'MEMBER',
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    redeemedAt: null,
    redeemedBy: null,
    revokedAt: null,
    attempts: 0,
    maxAttempts: 5,
    createdBy: USER_A1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

class FakeTenants implements TenantRepository {
  findOwn(): Promise<Tenant | null> {
    return Promise.resolve(tenant);
  }
}

class FakeMemberships implements MembershipRepository {
  own: TenantMembership | null = membership();
  roster: TenantMembership[] = [membership(), membership({ id: 'member-a2' })];
  calls: string[] = [];

  findOwn(): Promise<TenantMembership | null> {
    this.calls.push('findOwn');
    return Promise.resolve(this.own);
  }

  listForTenant(): Promise<TenantMembership[]> {
    this.calls.push('listForTenant');
    return Promise.resolve(this.roster);
  }
}

class FakeInvitations implements InvitationRepository {
  calls: string[] = [];
  created: CreateInvitationRecord | null = null;
  stored: TenantInvitation | null = invitation();
  failedAttempts = 0;
  redemption: RedemptionOutcome = {
    kind: 'redeemed',
    membership: membership({ id: 'member-new', userId: USER_NEW, roleHint: 'MEMBER' }),
    privilegeEvidence: {
      tenantGuc: TenantId.toString(TENANT_A),
      userGuc: UserId.toString(USER_NEW),
      roleName: 'karar_app',
      bypassRls: false,
      superuser: false,
    },
  };

  createForTenant(_actor: PrincipalActor, record: CreateInvitationRecord) {
    this.calls.push('createForTenant');
    this.created = record;
    return Promise.resolve(invitation({ roleHint: record.roleHint, email: record.email }));
  }

  revoke(_actor: PrincipalActor, invitationId: string) {
    this.calls.push('revoke');
    if (this.stored === null || this.stored.id !== invitationId) return Promise.resolve(null);
    return Promise.resolve(invitation({ revokedAt: NOW }));
  }

  findByTokenHash() {
    this.calls.push('findByTokenHash');
    return Promise.resolve(this.stored);
  }

  recordFailedAttempt() {
    this.calls.push('recordFailedAttempt');
    this.failedAttempts += 1;
    return Promise.resolve(true);
  }

  redeem() {
    this.calls.push('redeem');
    return Promise.resolve(this.redemption);
  }

  findRedeemedBy() {
    return Promise.resolve(null);
  }
}

const tokens: InvitationTokenSource = {
  issue: () => ({ rawToken: 'raw-token-0123456789-0123456789', tokenHash: 'hash-of-raw' }),
  hashOf: (raw) => `hash:${raw}`,
};

class FakeAudit implements AuditTrail {
  entries: AuditTrailEntry[] = [];
  record(entry: AuditTrailEntry) {
    this.entries.push(entry);
    return Promise.resolve(Result.ok<void>(undefined));
  }
}

const emailOf =
  (email: string | null): RedeemerEmailSource => ({ verifiedEmailOf: () => Promise.resolve(email) });

const permissive = new PermissiveForTestsPolicyService();
const denyAll = new DenyAllForTestsPolicyService();

describe('deny on missing principal context — every use case, before any port call', () => {
  it('denies incomplete principals everywhere', async () => {
    const memberships = new FakeMemberships();
    const invitations = new FakeInvitations();
    const audit = new FakeAudit();
    const bad = { userId: USER_A1 } as unknown as PrincipalActor;

    const own = await new GetOwnTenant(new FakeTenants(), memberships).execute(bad);
    const list = await new ListMembers(memberships, permissive).execute(bad);
    const create = await new CreateInvitation(
      invitations,
      memberships,
      permissive,
      tokens,
      audit,
      clock,
    ).execute({ email: 'x@example.com' }, bad);
    const revoke = await new RevokeInvitation(
      invitations,
      memberships,
      permissive,
      audit,
      clock,
    ).execute(invitation().id, bad);
    const redeem = await new RedeemInvitation(
      invitations,
      tokens,
      emailOf('new.user@example.com'),
      audit,
      clock,
    ).execute({ token: 'a'.repeat(32) }, {} as unknown as RedeemerActor);

    for (const result of [own, list, create, revoke, redeem]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing_principal_context');
      }
    }
    expect(memberships.calls).toEqual([]);
    expect(invitations.calls).toEqual([]);
    expect(audit.entries).toEqual([]);
  });
});

describe('GetOwnTenant', () => {
  it('returns tenant + own membership', async () => {
    const result = await new GetOwnTenant(new FakeTenants(), new FakeMemberships()).execute(actor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tenant.name).toBe('Tenant A');
      expect(result.value.membership.userId).toBe(USER_A1);
    }
  });

  it('a principal without a membership row is refused', async () => {
    const memberships = new FakeMemberships();
    memberships.own = null;
    const result = await new GetOwnTenant(new FakeTenants(), memberships).execute(actor);
    expect(!result.ok && result.error.kind === 'membership_not_found').toBe(true);
  });
});

describe('ListMembers — Layer 1 ordering', () => {
  it('returns the NON-EMPTY roster when membership is active and policy allows', async () => {
    const result = await new ListMembers(new FakeMemberships(), permissive).execute(actor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('denies without an ACTIVE membership, before consulting policy', async () => {
    const memberships = new FakeMemberships();
    memberships.own = membership({ state: 'SUSPENDED' });
    const result = await new ListMembers(memberships, permissive).execute(actor);
    expect(!result.ok && result.error.kind === 'membership_not_found').toBe(true);
    expect(memberships.calls).toEqual(['findOwn']); // roster never read
  });

  it('denies when the PolicyService denies (deny-by-default posture)', async () => {
    const memberships = new FakeMemberships();
    const result = await new ListMembers(memberships, denyAll).execute(actor);
    expect(!result.ok && result.error.kind === 'not_authorized').toBe(true);
    expect(memberships.calls).toEqual(['findOwn']);
  });
});

describe('CreateInvitation', () => {
  it('requires membership, policy allow, and valid input; stores the HASH, returns the raw token once', async () => {
    const invitations = new FakeInvitations();
    const audit = new FakeAudit();
    const result = await new CreateInvitation(
      invitations,
      new FakeMemberships(),
      permissive,
      tokens,
      audit,
      clock,
    ).execute({ email: '  New.User@Example.COM ', roleHint: 'MEMBER' }, actor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.token).toBe('raw-token-0123456789-0123456789');
    }
    expect(invitations.created?.email).toBe('new.user@example.com'); // normalized
    expect(invitations.created?.tokenHash).toBe('hash-of-raw'); // hash, not raw
    expect(audit.entries[0]?.action).toBe('tenancy.invitation.created');
    // The audit record carries identifiers only — no email, no token material.
    expect(JSON.stringify(audit.entries[0])).not.toContain('new.user@example.com');
    expect(JSON.stringify(audit.entries[0])).not.toContain('raw-token');
  });

  it('rejects invalid email, role hint, and expiry without touching the store', async () => {
    const invitations = new FakeInvitations();
    const useCase = new CreateInvitation(
      invitations,
      new FakeMemberships(),
      permissive,
      tokens,
      new FakeAudit(),
      clock,
    );
    for (const input of [
      { email: 'nonsense' },
      { email: 'x@example.com', roleHint: 'drop table' },
      { email: 'x@example.com', expiresInHours: 0 },
      { email: 'x@example.com', expiresInHours: 100_000 },
    ]) {
      const result = await useCase.execute(input, actor);
      expect(!result.ok && result.error.kind === 'invalid_invitation_input').toBe(true);
    }
    expect(invitations.calls).toEqual([]);
  });

  it('denies when policy denies', async () => {
    const result = await new CreateInvitation(
      new FakeInvitations(),
      new FakeMemberships(),
      denyAll,
      tokens,
      new FakeAudit(),
      clock,
    ).execute({ email: 'x@example.com' }, actor);
    expect(!result.ok && result.error.kind === 'not_authorized').toBe(true);
  });
});

describe('RevokeInvitation', () => {
  it('revokes one-time and audits', async () => {
    const audit = new FakeAudit();
    const result = await new RevokeInvitation(
      new FakeInvitations(),
      new FakeMemberships(),
      permissive,
      audit,
      clock,
    ).execute(invitation().id, actor);
    expect(result.ok).toBe(true);
    expect(audit.entries[0]?.action).toBe('tenancy.invitation.revoked');
  });

  it('answers invitation_not_found for unknown, cross-tenant, or already-terminal ids alike', async () => {
    const result = await new RevokeInvitation(
      new FakeInvitations(),
      new FakeMemberships(),
      permissive,
      new FakeAudit(),
      clock,
    ).execute('eeeeeeee-0000-4000-8000-0000000000ee', actor);
    expect(!result.ok && result.error.kind === 'invitation_not_found').toBe(true);
  });
});

describe('RedeemInvitation', () => {
  const goodToken = 'a'.repeat(32);

  it('redeems for the authenticated redeemer with a matching verified email', async () => {
    const invitations = new FakeInvitations();
    const audit = new FakeAudit();
    const result = await new RedeemInvitation(
      invitations,
      tokens,
      emailOf('New.User@example.com'),
      audit,
      clock,
    ).execute({ token: goodToken }, redeemer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.membership.userId).toBe(USER_NEW);
      expect(result.value.privilegeEvidence.roleName).toBe('karar_app');
    }
    expect(audit.entries[0]?.outcome).toBe('SUCCESS');
  });

  it('rejects malformed tokens without any lookup (no oracle)', async () => {
    const invitations = new FakeInvitations();
    const result = await new RedeemInvitation(
      invitations,
      tokens,
      emailOf('new.user@example.com'),
      new FakeAudit(),
      clock,
    ).execute({ token: 'short' }, redeemer);
    expect(!result.ok && result.error.kind === 'invitation_not_found').toBe(true);
    expect(invitations.calls).toEqual([]);
  });

  it('counts a failed attempt and audits DENIED on email mismatch', async () => {
    const invitations = new FakeInvitations();
    const audit = new FakeAudit();
    const result = await new RedeemInvitation(
      invitations,
      tokens,
      emailOf('somebody.else@example.com'),
      audit,
      clock,
    ).execute({ token: goodToken }, redeemer);
    expect(!result.ok && result.error.kind === 'invitation_not_redeemable').toBe(true);
    if (!result.ok && result.error.kind === 'invitation_not_redeemable') {
      expect(result.error.reason).toBe('email_mismatch');
    }
    expect(invitations.failedAttempts).toBe(1);
    expect(audit.entries[0]?.outcome).toBe('DENIED');
    expect(audit.entries[0]?.reason).toBe('email_mismatch');
  });

  it('maps repository outcomes: already_member and lost_race', async () => {
    const invitations = new FakeInvitations();
    invitations.redemption = { kind: 'already_member' };
    const already = await new RedeemInvitation(
      invitations,
      tokens,
      emailOf('new.user@example.com'),
      new FakeAudit(),
      clock,
    ).execute({ token: goodToken }, redeemer);
    expect(!already.ok && already.error.kind === 'already_member').toBe(true);

    invitations.redemption = { kind: 'lost_race' };
    const raced = await new RedeemInvitation(
      invitations,
      tokens,
      emailOf('new.user@example.com'),
      new FakeAudit(),
      clock,
    ).execute({ token: goodToken }, redeemer);
    expect(!raced.ok && raced.error.kind === 'invitation_not_redeemable').toBe(true);
  });
});
