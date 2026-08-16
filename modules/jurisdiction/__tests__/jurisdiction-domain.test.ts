import { describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import { jurisdictionId, QA_V1 } from '@karar/jurisdiction-policy';

import {
  effectiveJurisdictionState,
  pickEffectiveAssignment,
  verificationPermittedForSource,
  type UserJurisdictionAssignment,
} from '../domain/assignment.js';
import { deriveActivePack, type PackActivationRecord } from '../domain/pack-activation.js';
import { ActivatePackVersion } from '../application/use-cases/pack-activation.js';
import { AssignUserJurisdiction } from '../application/use-cases/user-assignments.js';
import { JurisdictionAuditTrail } from '../application/audit-trail.js';
import type {
  JurisdictionDirectory,
  PackActivationLedger,
  UserJurisdictionAssignmentRepository,
} from '../application/ports/repositories.js';
import { DenyAllPolicyService } from './fakes/policy-services.js';

const T1 = TenantId.of('11111111-1111-4111-8111-111111111111');
const U1 = UserId.of('22222222-2222-4222-8222-222222222222');

function assignment(
  overrides: Partial<UserJurisdictionAssignment> = {},
): UserJurisdictionAssignment {
  return {
    id: 'a-1',
    userId: U1,
    tenantId: T1,
    jurisdictionCode: jurisdictionId('QA'),
    source: 'OPERATOR_ASSIGNED',
    verificationStatus: 'UNVERIFIED',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    reason: 'test',
    assignedBy: 'staff:test',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('verification/source axes', () => {
  it('a user declaration is never verified by itself; provider verification is what VERIFIED means', () => {
    expect(verificationPermittedForSource('USER_DECLARED', 'UNVERIFIED')).toBe(true);
    expect(verificationPermittedForSource('USER_DECLARED', 'VERIFIED')).toBe(false);
    expect(verificationPermittedForSource('PROVIDER_VERIFIED', 'VERIFIED')).toBe(true);
    expect(verificationPermittedForSource('PROVIDER_VERIFIED', 'UNVERIFIED')).toBe(false);
    expect(verificationPermittedForSource('OPERATOR_ASSIGNED', 'UNVERIFIED')).toBe(true);
    expect(verificationPermittedForSource('OPERATOR_ASSIGNED', 'VERIFIED')).toBe(true);
    expect(verificationPermittedForSource('CONTRACT_DERIVED', 'VERIFIED')).toBe(true);
  });
});

describe('temporal effective-assignment resolution', () => {
  const first = assignment({
    id: 'a-1',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-03-01T00:00:00.000Z'),
  });
  const second = assignment({
    id: 'a-2',
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
    verificationStatus: 'VERIFIED',
    source: 'PROVIDER_VERIFIED',
  });
  const history = [first, second];

  it('resolves by instant: window boundaries are [from, to)', () => {
    expect(pickEffectiveAssignment(history, new Date('2026-02-01T00:00:00.000Z'))?.id).toBe('a-1');
    expect(pickEffectiveAssignment(history, new Date('2026-03-01T00:00:00.000Z'))?.id).toBe('a-2');
    expect(pickEffectiveAssignment(history, new Date('2025-12-31T23:59:59.000Z'))).toBeNull();
  });

  it('exposes verification as a typed three-arm state — NONE and UNVERIFIED are denials', () => {
    expect(effectiveJurisdictionState([], new Date('2026-02-01T00:00:00.000Z')).kind).toBe('NONE');
    const early = effectiveJurisdictionState(history, new Date('2026-02-01T00:00:00.000Z'));
    expect(early.kind).toBe('UNVERIFIED');
    const late = effectiveJurisdictionState(history, new Date('2026-04-01T00:00:00.000Z'));
    expect(late.kind).toBe('VERIFIED');
    if (late.kind === 'VERIFIED') {
      expect(late.assignment.id).toBe('a-2');
    }
  });
});

describe('activation ledger derivation', () => {
  function event(overrides: Partial<PackActivationRecord>): PackActivationRecord {
    return {
      id: 'e-1',
      jurisdictionCode: jurisdictionId('QA'),
      packVersion: 'qa/v1',
      packLifecycleAtActivation: 'DRAFT',
      environment: 'local',
      action: 'ACTIVATED',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      actor: 'staff:test',
      reason: 'test',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('derives active from the latest event; RETIRED latest means nothing active', () => {
    expect(deriveActivePack([]).active).toBe(false);
    const activated = event({ id: 'e-1', occurredAt: new Date('2026-01-01T00:00:00.000Z') });
    const retired = event({
      id: 'e-2',
      action: 'RETIRED',
      occurredAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const reActivated = event({ id: 'e-3', occurredAt: new Date('2026-03-01T00:00:00.000Z') });

    expect(deriveActivePack([activated])).toMatchObject({ active: true, packVersion: 'qa/v1' });
    expect(deriveActivePack([activated, retired]).active).toBe(false);
    expect(deriveActivePack([retired, reActivated, activated])).toMatchObject({
      active: true,
      activatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
  });
});

describe('deny-by-default posture (permissions unseeded in 3.5)', () => {
  const denyAll = new DenyAllPolicyService();
  const failingAudit = new JurisdictionAuditTrail(
    {
      execute: () => {
        throw new Error('audit must not be reached when authorization denies');
      },
    } as never,
    'local-test',
  );
  const unreachableDirectory: JurisdictionDirectory = {
    findJurisdiction: () => {
      throw new Error('directory must not be reached when authorization denies');
    },
    listJurisdictions: () => {
      throw new Error('unreachable');
    },
    listCountries: () => {
      throw new Error('unreachable');
    },
  };

  it('refuses assignment and activation before touching any store', async () => {
    const assign = new AssignUserJurisdiction(
      {} as UserJurisdictionAssignmentRepository,
      unreachableDirectory,
      denyAll,
      { nextId: () => 'unused' },
      failingAudit,
    );
    const refusedAssign = await assign.execute({
      principal: { principalRef: 'staff:nobody', tenantRef: null },
      userId: U1,
      tenantId: T1,
      jurisdictionCode: 'QA',
      source: 'OPERATOR_ASSIGNED',
      verificationStatus: 'UNVERIFIED',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      reason: 'test',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(!refusedAssign.ok && refusedAssign.error.kind).toBe('AUTHORIZATION_DENIED');
    if (!refusedAssign.ok && refusedAssign.error.kind === 'AUTHORIZATION_DENIED') {
      expect(refusedAssign.error.permission).toBe('jurisdiction.assignment.manage');
    }

    const activate = new ActivatePackVersion(
      {} as PackActivationLedger,
      unreachableDirectory,
      denyAll,
      { nextId: () => 'unused' },
      failingAudit,
    );
    const refusedActivate = await activate.execute({
      principal: { principalRef: 'staff:nobody', tenantRef: null },
      pack: QA_V1,
      environment: 'local',
      reason: 'test',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(!refusedActivate.ok && refusedActivate.error.kind).toBe('AUTHORIZATION_DENIED');
    if (!refusedActivate.ok && refusedActivate.error.kind === 'AUTHORIZATION_DENIED') {
      expect(refusedActivate.error.permission).toBe('jurisdiction.pack.activate');
    }
  });
});
