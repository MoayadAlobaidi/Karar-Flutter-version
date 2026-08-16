import { describe, expect, it } from 'vitest';

import { Clock, Result, TenantId, UserId } from '@karar/shared-kernel';

import type { PrincipalActor } from '../application/principal.js';
import type {
  CreateOwnProfileInput,
  OwnProfileFieldChanges,
  OwnStatusTransition,
  StatusTransitionOutcome,
  UserProfileRepository,
} from '../application/ports/user-profile-repository.js';
import type { AuditTrail, AuditTrailEntry } from '../application/ports/audit-trail.js';
import type { UserProfile, UserStatus, UserStatusChange } from '../domain/user-profile.js';
import { GetOwnProfile } from '../application/use-cases/get-own-profile.js';
import { UpdateOwnProfile } from '../application/use-cases/update-own-profile.js';
import { RequestAccountDisable } from '../application/use-cases/request-account-disable.js';

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER_1 = UserId.of('11111111-0000-4000-8000-000000000001');
const NOW = new Date('2026-08-16T09:00:00.000Z');

const actor: PrincipalActor = { tenantId: TENANT_A, userId: USER_1, requestId: 'req-users' };

function profileOf(status: UserStatus = 'ACTIVE'): UserProfile {
  return {
    userId: USER_1,
    tenantId: TENANT_A,
    displayName: 'Karar Dev',
    locale: 'ar-QA',
    status,
    residencyJurisdictionRef: null,
    contractingOperatingEntityId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** In-memory repository fake tracking calls; every mutation must arrive pre-validated. */
class FakeProfiles implements UserProfileRepository {
  profile: UserProfile | null = profileOf();
  calls: string[] = [];
  lastChanges: OwnProfileFieldChanges | null = null;
  lastTransition: OwnStatusTransition | null = null;

  findOwn(): Promise<UserProfile | null> {
    this.calls.push('findOwn');
    return Promise.resolve(this.profile);
  }

  createOwn(_actor: PrincipalActor, input: CreateOwnProfileInput): Promise<UserProfile> {
    this.calls.push('createOwn');
    this.profile = { ...profileOf(), displayName: input.displayName, locale: input.locale };
    return Promise.resolve(this.profile);
  }

  updateOwnFields(
    _actor: PrincipalActor,
    changes: OwnProfileFieldChanges,
  ): Promise<UserProfile | null> {
    this.calls.push('updateOwnFields');
    this.lastChanges = changes;
    if (this.profile === null) return Promise.resolve(null);
    this.profile = {
      ...this.profile,
      ...(changes.displayName !== undefined ? { displayName: changes.displayName } : {}),
      ...(changes.locale !== undefined ? { locale: changes.locale } : {}),
      updatedAt: changes.occurredAt,
    };
    return Promise.resolve(this.profile);
  }

  transitionOwnStatus(
    _actor: PrincipalActor,
    transition: OwnStatusTransition,
  ): Promise<StatusTransitionOutcome | null> {
    this.calls.push('transitionOwnStatus');
    this.lastTransition = transition;
    if (this.profile === null || this.profile.status !== transition.expectedFrom) {
      return Promise.resolve(null);
    }
    this.profile = { ...this.profile, status: transition.toStatus };
    const change: UserStatusChange = {
      id: 'change-1',
      userId: USER_1,
      tenantId: TENANT_A,
      fromStatus: transition.expectedFrom,
      toStatus: transition.toStatus,
      reason: transition.reason,
      actor: `user:${UserId.toString(USER_1)}`,
      occurredAt: transition.occurredAt,
    };
    return Promise.resolve({ profile: this.profile, change });
  }

  listOwnStatusHistory(): Promise<UserStatusChange[]> {
    this.calls.push('listOwnStatusHistory');
    return Promise.resolve([]);
  }
}

class FakeAuditTrail implements AuditTrail {
  entries: AuditTrailEntry[] = [];
  record(entry: AuditTrailEntry) {
    this.entries.push(entry);
    return Promise.resolve(Result.ok<void>(undefined));
  }
}

const clock = new Clock.Fixed(NOW);

describe('deny on missing principal context (fail closed, before any port call)', () => {
  it.each([
    ['null actor', null],
    ['missing tenant', { userId: USER_1 }],
    ['missing user', { tenantId: TENANT_A }],
    ['non-uuid tenant cast through the type', { tenantId: 'own-all-tenants', userId: USER_1 }],
  ])('GetOwnProfile denies %s', async (_name, badActor) => {
    const profiles = new FakeProfiles();
    const result = await new GetOwnProfile(profiles).execute(
      badActor as unknown as PrincipalActor,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing_principal_context');
    }
    expect(profiles.calls).toEqual([]); // the repository was never touched
  });

  it('UpdateOwnProfile and RequestAccountDisable deny the same way', async () => {
    const profiles = new FakeProfiles();
    const audit = new FakeAuditTrail();
    const update = await new UpdateOwnProfile(profiles, clock).execute(
      { displayName: 'X' },
      undefined as unknown as PrincipalActor,
    );
    const disable = await new RequestAccountDisable(profiles, audit, clock).execute(
      {},
      { tenantId: '' } as unknown as PrincipalActor,
    );
    expect(update.ok).toBe(false);
    expect(disable.ok).toBe(false);
    expect(profiles.calls).toEqual([]);
    expect(audit.entries).toEqual([]);
  });
});

describe('GetOwnProfile', () => {
  it('returns the profile for a complete principal', async () => {
    const result = await new GetOwnProfile(new FakeProfiles()).execute(actor);
    expect(result.ok && result.value.displayName === 'Karar Dev').toBe(true);
  });

  it('maps a missing profile to profile_not_found', async () => {
    const profiles = new FakeProfiles();
    profiles.profile = null;
    const result = await new GetOwnProfile(profiles).execute(actor);
    expect(!result.ok && result.error.kind === 'profile_not_found').toBe(true);
  });
});

describe('UpdateOwnProfile — approved fields only', () => {
  it('updates displayName and locale after domain validation (trimmed)', async () => {
    const profiles = new FakeProfiles();
    const result = await new UpdateOwnProfile(profiles, clock).execute(
      { displayName: '  New Name ', locale: 'en-US' },
      actor,
    );
    expect(result.ok).toBe(true);
    expect(profiles.lastChanges).toEqual({
      displayName: 'New Name',
      locale: 'en-US',
      occurredAt: NOW,
    });
  });

  it('the input type carries ONLY the approved fields — anything else does not reach the repository', async () => {
    const profiles = new FakeProfiles();
    // A hostile caller smuggles extra properties past the type system.
    const hostile = {
      displayName: 'Fine Name',
      status: 'DISABLED',
      tenantId: 'bbbbbbbb-0000-4000-8000-00000000000b',
      residencyJurisdictionRef: 'qa',
    } as unknown as { displayName: string };
    const result = await new UpdateOwnProfile(profiles, clock).execute(hostile, actor);
    expect(result.ok).toBe(true);
    // The repository received exactly the two approved keys plus the instant.
    expect(Object.keys(profiles.lastChanges ?? {}).sort()).toEqual([
      'displayName',
      'occurredAt',
    ]);
  });

  it('rejects invalid values and an empty change set without touching the store', async () => {
    const profiles = new FakeProfiles();
    const useCase = new UpdateOwnProfile(profiles, clock);
    const badName = await useCase.execute({ displayName: '' }, actor);
    const badLocale = await useCase.execute({ locale: 'NOT A LOCALE' }, actor);
    const empty = await useCase.execute({}, actor);
    expect(!badName.ok && badName.error.kind === 'invalid_profile_field').toBe(true);
    expect(!badLocale.ok && badLocale.error.kind === 'invalid_profile_field').toBe(true);
    expect(!empty.ok && empty.error.kind === 'no_approved_field_changes').toBe(true);
    expect(profiles.calls).toEqual([]);
  });
});

describe('RequestAccountDisable — records intent and emits audit', () => {
  it('transitions ACTIVE -> DISABLE_REQUESTED, records history, and audits', async () => {
    const profiles = new FakeProfiles();
    const audit = new FakeAuditTrail();
    const result = await new RequestAccountDisable(profiles, audit, clock).execute(
      { reason: 'closing my account' },
      actor,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.change.toStatus).toBe('DISABLE_REQUESTED');
      expect(result.value.auditFailure).toBeNull();
    }
    expect(profiles.lastTransition?.expectedFrom).toBe('ACTIVE');
    expect(audit.entries).toHaveLength(1);
    const entry = audit.entries[0];
    expect(entry?.action).toBe('users.account.disable_requested');
    expect(entry?.outcome).toBe('SUCCESS');
    expect(entry?.beforeMetadata).toEqual({ status: 'ACTIVE' });
    expect(entry?.afterMetadata).toEqual({ status: 'DISABLE_REQUESTED' });
  });

  it('denies a second request (invalid transition) without writing', async () => {
    const profiles = new FakeProfiles();
    profiles.profile = profileOf('DISABLE_REQUESTED');
    const audit = new FakeAuditTrail();
    const result = await new RequestAccountDisable(profiles, audit, clock).execute({}, actor);
    expect(!result.ok && result.error.kind === 'invalid_status_transition').toBe(true);
    expect(profiles.lastTransition).toBeNull();
    expect(audit.entries).toEqual([]);
  });

  it('reports a lost race as invalid_status_transition instead of pretending success', async () => {
    const profiles = new FakeProfiles();
    // The fake refuses the transition when expectedFrom mismatches; simulate
    // a concurrent move by mutating status between read and write.
    const original = profiles.findOwn.bind(profiles);
    profiles.findOwn = () => {
      const result = original();
      profiles.profile = profileOf('DELETION_REQUESTED');
      return result;
    };
    const audit = new FakeAuditTrail();
    const result = await new RequestAccountDisable(profiles, audit, clock).execute({}, actor);
    expect(!result.ok && result.error.kind === 'invalid_status_transition').toBe(true);
  });

  it('surfaces an audit failure while keeping the committed state change visible', async () => {
    const profiles = new FakeProfiles();
    const failingAudit: AuditTrail = {
      record: () =>
        Promise.resolve(
          Result.err({ kind: 'audit_unavailable' as const, message: 'audit store down' }),
        ),
    };
    const result = await new RequestAccountDisable(profiles, failingAudit, clock).execute(
      {},
      actor,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.auditFailure?.kind).toBe('audit_unavailable');
    }
  });
});
