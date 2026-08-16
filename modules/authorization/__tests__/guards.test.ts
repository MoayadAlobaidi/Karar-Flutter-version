import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import { UserId } from '@karar/shared-kernel';

import {
  PermissionGuard,
  requirePermission,
  type AuthorizationPrincipalSource,
} from '../presentation/http/permission.guard.js';
import type { PolicyActor } from '../application/actor.js';
import type { PolicyDecision, PolicyService } from '../application/policy-service.js';

// The controller-side enforcement point (capability-registry.md §6 — one of
// the two, never the only one). Constructed directly with doubles; the DI
// mixin from requirePermission(...) is asserted to extend the same guard.

const ALICE = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');

function contextFor(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function stubPolicy(decision: PolicyDecision): PolicyService {
  return { authorize: async () => decision };
}

const principalPresent: AuthorizationPrincipalSource = {
  fromRequest: () => ({ userId: ALICE }) as PolicyActor,
};
const principalAbsent: AuthorizationPrincipalSource = { fromRequest: () => null };

describe('PermissionGuard', () => {
  it('passes when the policy allows', async () => {
    const guard = new PermissionGuard(
      stubPolicy({ allowed: true, reason: 'granted:SUPPORT' }),
      principalPresent,
      'users.profile.read',
    );
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('answers 401 when no authenticated principal is attached', async () => {
    const guard = new PermissionGuard(
      stubPolicy({ allowed: true, reason: 'granted:SUPPORT' }),
      principalAbsent,
      'users.profile.read',
    );
    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('answers 403 with the machine-readable reason when denied', async () => {
    const guard = new PermissionGuard(
      stubPolicy({ allowed: false, reason: 'permission_not_held' }),
      principalPresent,
      'users.status.update',
    );
    const failure = await guard.canActivate(contextFor({})).then(
      () => null,
      (error: unknown) => error as { status: number; getResponse(): unknown },
    );
    expect(failure?.status).toBe(403);
    expect(failure?.getResponse()).toMatchObject({
      permission: 'users.status.update',
      reason: 'permission_not_held',
    });
  });

  it('requirePermission(...) mints DI guards that extend PermissionGuard', () => {
    const Minted = requirePermission('tenancy.member.read');
    expect(Object.getPrototypeOf(Minted)).toBe(PermissionGuard);
  });
});
