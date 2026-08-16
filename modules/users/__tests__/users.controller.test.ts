import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { UsersApiModule } from '../presentation/users-api.module.js';
import type { PrincipalSource } from '../presentation/http/principal-source.js';
import type { UsersUseCases } from '../presentation/http/users.controller.js';
import type { PrincipalActor } from '../application/principal.js';
import type { GetOwnProfile } from '../application/use-cases/get-own-profile.js';
import type {
  UpdateOwnProfile,
  UpdateOwnProfileInput,
} from '../application/use-cases/update-own-profile.js';
import type { RequestAccountDisable } from '../application/use-cases/request-account-disable.js';
import type { UserProfile } from '../domain/user-profile.js';

// The tenant-override adversarial surface (tenancy.md §6): the controller
// derives its principal EXCLUSIVELY from the injected PrincipalSource. These
// tests attack via query string, header, and body simultaneously and assert
// the use case saw the session tenant, not the attacker-chosen one.

const SESSION_TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const OTHER_TENANT = 'bbbbbbbb-0000-4000-8000-00000000000b';
const SESSION_USER = UserId.of('11111111-0000-4000-8000-000000000001');
const NOW = new Date('2026-08-16T09:00:00.000Z');

const profile: UserProfile = {
  userId: SESSION_USER,
  tenantId: SESSION_TENANT,
  displayName: 'Session User',
  locale: 'ar-QA',
  status: 'ACTIVE',
  residencyJurisdictionRef: null,
  contractingOperatingEntityId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

interface Captured {
  actors: PrincipalActor[];
  inputs: UpdateOwnProfileInput[];
}

function fakes(captured: Captured, principal: PrincipalActor | null) {
  const useCases: UsersUseCases = {
    getOwnProfile: {
      execute: (actor: PrincipalActor) => {
        captured.actors.push(actor);
        return Promise.resolve(Result.ok(profile));
      },
    } as unknown as GetOwnProfile,
    updateOwnProfile: {
      execute: (input: UpdateOwnProfileInput, actor: PrincipalActor) => {
        captured.actors.push(actor);
        captured.inputs.push(input);
        return Promise.resolve(Result.ok(profile));
      },
    } as unknown as UpdateOwnProfile,
    requestAccountDisable: {
      execute: (_input: unknown, actor: PrincipalActor) => {
        captured.actors.push(actor);
        return Promise.resolve(
          Result.ok({
            change: {
              id: 'change-1',
              userId: SESSION_USER,
              tenantId: SESSION_TENANT,
              fromStatus: 'ACTIVE' as const,
              toStatus: 'DISABLE_REQUESTED' as const,
              reason: null,
              actor: 'user:x',
              occurredAt: NOW,
            },
            auditFailure: null,
          }),
        );
      },
    } as unknown as RequestAccountDisable,
  };
  const principalSource: PrincipalSource = { fromRequest: () => principal };
  return { useCases, principalSource };
}

describe('UsersController — tenant identity never comes from the request', () => {
  const captured: Captured = { actors: [], inputs: [] };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const { useCases, principalSource } = fakes(captured, {
      tenantId: SESSION_TENANT,
      userId: SESSION_USER,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [UsersApiModule.register({ useCases, principalSource })],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/me ignores ?tenantId= and x-tenant-id', async () => {
    captured.actors.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/users/me?tenantId=${OTHER_TENANT}&userId=99999999-0000-4000-8000-000000000009`,
        headers: { 'x-tenant-id': OTHER_TENANT },
      });
    expect(response.statusCode).toBe(200);
    expect(captured.actors).toHaveLength(1);
    expect(captured.actors[0]?.tenantId).toBe(SESSION_TENANT);
    expect(captured.actors[0]?.userId).toBe(SESSION_USER);
    expect(response.json().tenantId).toBe(TenantId.toString(SESSION_TENANT));
  });

  it('PATCH /users/me ignores tenant override in query, header, AND body — and drops unapproved fields', async () => {
    captured.actors.length = 0;
    captured.inputs.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'PATCH',
        url: `/users/me?tenantId=${OTHER_TENANT}`,
        headers: { 'x-tenant-id': OTHER_TENANT, 'content-type': 'application/json' },
        payload: {
          tenantId: OTHER_TENANT,
          userId: '99999999-0000-4000-8000-000000000009',
          status: 'DISABLED',
          residencyJurisdictionRef: 'anywhere',
          displayName: 'Renamed',
          locale: 'en-US',
        },
      });
    expect(response.statusCode).toBe(200);
    expect(captured.actors[0]?.tenantId).toBe(SESSION_TENANT);
    // Only the approved fields crossed into the application layer.
    expect(captured.inputs[0]).toEqual({ displayName: 'Renamed', locale: 'en-US' });
  });

  it('POST /users/me/disable-request ignores body tenant and answers 202', async () => {
    captured.actors.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/users/me/disable-request',
        headers: { 'content-type': 'application/json' },
        payload: { tenantId: OTHER_TENANT, reason: 'done' },
      });
    expect(response.statusCode).toBe(202);
    expect(captured.actors[0]?.tenantId).toBe(SESSION_TENANT);
    expect(response.json().status).toBe('DISABLE_REQUESTED');
  });
});

describe('UsersController — unauthenticated requests', () => {
  it('answers 401 AUTHENTICATION_REQUIRED and never calls a use case', async () => {
    const captured: Captured = { actors: [], inputs: [] };
    const { useCases, principalSource } = fakes(captured, null);
    const moduleRef = await Test.createTestingModule({
      imports: [UsersApiModule.register({ useCases, principalSource })],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      for (const request of [
        { method: 'GET' as const, url: '/users/me' },
        { method: 'PATCH' as const, url: '/users/me', payload: { displayName: 'X' } },
        { method: 'POST' as const, url: '/users/me/disable-request', payload: {} },
      ]) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({ ...request, headers: { 'content-type': 'application/json' } });
        expect(response.statusCode).toBe(401);
        expect(response.json().code).toBe('AUTHENTICATION_REQUIRED');
      }
      expect(captured.actors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
