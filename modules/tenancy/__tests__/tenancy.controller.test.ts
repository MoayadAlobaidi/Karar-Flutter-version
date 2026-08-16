import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import { TenancyApiModule } from '../presentation/tenancy-api.module.js';
import type { OperationGate } from '../presentation/http/operation-gate.js';
import type { TenancyPrincipalSource } from '../presentation/http/principal-source.js';
import type { TenancyUseCases } from '../presentation/http/tenancy.controller.js';
import type { PrincipalActor, RedeemerActor } from '../application/principal.js';
import type { GetOwnTenant } from '../application/use-cases/get-own-tenant.js';
import type { ListMembers } from '../application/use-cases/list-members.js';
import type {
  CreateInvitation,
  CreateInvitationInput,
} from '../application/use-cases/create-invitation.js';
import type { RevokeInvitation } from '../application/use-cases/revoke-invitation.js';
import type {
  RedeemInvitation,
  RedeemInvitationInput,
} from '../application/use-cases/redeem-invitation.js';
import type { Tenant, TenantInvitation, TenantMembership } from '../domain/tenancy.js';

// Tenant-override adversarial surface (tenancy.md §6): `?tenantId=`, an
// `x-tenant-id` header, and a body `tenantId` are attacked simultaneously on
// every route; the use cases must receive the SESSION principal untouched.

const SESSION_TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const OTHER_TENANT = 'bbbbbbbb-0000-4000-8000-00000000000b';
const SESSION_USER = UserId.of('11111111-0000-4000-8000-000000000001');
const NOW = new Date('2026-08-16T12:00:00.000Z');

const tenant: Tenant = {
  id: SESSION_TENANT,
  type: 'FIRST_PARTY',
  name: 'Tenant A',
  status: 'ACTIVE',
  defaultOperatingEntityId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const membership: TenantMembership = {
  id: 'member-1',
  tenantId: SESSION_TENANT,
  userId: SESSION_USER,
  roleHint: 'TENANT_ADMIN',
  state: 'ACTIVE',
  effectiveFrom: NOW,
  effectiveTo: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const invitation: TenantInvitation = {
  id: 'dddddddd-0000-4000-8000-0000000000d1',
  tenantId: SESSION_TENANT,
  email: 'new.user@example.com',
  roleHint: 'MEMBER',
  expiresAt: new Date(NOW.getTime() + 3_600_000),
  redeemedAt: null,
  redeemedBy: null,
  revokedAt: null,
  attempts: 0,
  maxAttempts: 5,
  createdBy: SESSION_USER,
  createdAt: NOW,
  updatedAt: NOW,
};

interface Captured {
  actors: (PrincipalActor | RedeemerActor)[];
  createInputs: CreateInvitationInput[];
  redeemInputs: RedeemInvitationInput[];
}

function fakes(captured: Captured, authenticated: boolean) {
  const useCases: TenancyUseCases = {
    getOwnTenant: {
      execute: (actor: PrincipalActor) => {
        captured.actors.push(actor);
        return Promise.resolve(Result.ok({ tenant, membership }));
      },
    } as unknown as GetOwnTenant,
    listMembers: {
      execute: (actor: PrincipalActor) => {
        captured.actors.push(actor);
        return Promise.resolve(Result.ok([membership]));
      },
    } as unknown as ListMembers,
    createInvitation: {
      execute: (input: CreateInvitationInput, actor: PrincipalActor) => {
        captured.actors.push(actor);
        captured.createInputs.push(input);
        return Promise.resolve(
          Result.ok({ invitation, token: 'raw-token-once', auditFailure: null }),
        );
      },
    } as unknown as CreateInvitation,
    revokeInvitation: {
      execute: (_invitationId: string, actor: PrincipalActor) => {
        captured.actors.push(actor);
        return Promise.resolve(
          Result.ok({ invitation: { ...invitation, revokedAt: NOW }, auditFailure: null }),
        );
      },
    } as unknown as RevokeInvitation,
    redeemInvitation: {
      execute: (input: RedeemInvitationInput, actor: RedeemerActor) => {
        captured.actors.push(actor);
        captured.redeemInputs.push(input);
        return Promise.resolve(
          Result.ok({
            tenantId: SESSION_TENANT,
            membership,
            privilegeEvidence: {
              tenantGuc: TenantId.toString(SESSION_TENANT),
              userGuc: UserId.toString(SESSION_USER),
              roleName: 'karar_app',
              bypassRls: false,
              superuser: false,
            },
            auditFailure: null,
          }),
        );
      },
    } as unknown as RedeemInvitation,
  };
  const principalSource: TenancyPrincipalSource = {
    fromRequest: () =>
      authenticated ? { tenantId: SESSION_TENANT, userId: SESSION_USER } : null,
    redeemerFromRequest: () => (authenticated ? { userId: SESSION_USER } : null),
  };
  return { useCases, principalSource };
}

/** Kill-switch fakes for the mounted TENANT_INVITATIONS guard. */
const allowAllKillSwitches: OperationGate = {
  assertOperationAllowed: () => Promise.resolve(Result.ok(undefined)),
};
const restrictedKillSwitches: OperationGate = {
  assertOperationAllowed: (switchId) =>
    Promise.resolve(
      Result.err({
        kind: 'operation_restricted',
        switchId,
        message: 'restricted for the test',
      }),
    ),
};

describe('TenancyController — tenant identity never comes from the request', () => {
  const captured: Captured = { actors: [], createInputs: [], redeemInputs: [] };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const { useCases, principalSource } = fakes(captured, true);
    const moduleRef = await Test.createTestingModule({
      imports: [TenancyApiModule.register({ useCases, principalSource, killSwitches: allowAllKillSwitches })],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const overrideQuery = `tenantId=${OTHER_TENANT}`;
  const overrideHeaders = { 'x-tenant-id': OTHER_TENANT, 'content-type': 'application/json' };

  it('GET /tenancy/tenant and /tenancy/members ignore query and header overrides', async () => {
    captured.actors.length = 0;
    for (const url of [`/tenancy/tenant?${overrideQuery}`, `/tenancy/members?${overrideQuery}`]) {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url, headers: overrideHeaders });
      expect(response.statusCode).toBe(200);
    }
    expect(captured.actors).toHaveLength(2);
    for (const actor of captured.actors) {
      expect((actor as PrincipalActor).tenantId).toBe(SESSION_TENANT);
    }
  });

  it('POST /tenancy/invitations ignores tenant overrides in query, header, and body', async () => {
    captured.actors.length = 0;
    captured.createInputs.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: `/tenancy/invitations?${overrideQuery}`,
        headers: overrideHeaders,
        payload: {
          tenantId: OTHER_TENANT,
          email: 'new.user@example.com',
          roleHint: 'MEMBER',
        },
      });
    expect(response.statusCode).toBe(201);
    expect((captured.actors[0] as PrincipalActor).tenantId).toBe(SESSION_TENANT);
    // The input that crossed the boundary carries NO tenant field at all.
    expect(Object.keys(captured.createInputs[0] ?? {}).sort()).toEqual(['email', 'roleHint']);
    // The raw token is surfaced exactly once, in this response.
    expect(response.json().token).toBe('raw-token-once');
  });

  it('POST /tenancy/invitations/:id/revoke ignores overrides and validates the id shape', async () => {
    captured.actors.length = 0;
    const ok = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: `/tenancy/invitations/${invitation.id}/revoke?${overrideQuery}`,
        headers: overrideHeaders,
        payload: { tenantId: OTHER_TENANT },
      });
    expect(ok.statusCode).toBe(200);
    expect((captured.actors[0] as PrincipalActor).tenantId).toBe(SESSION_TENANT);

    const badId = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/tenancy/invitations/not-a-uuid/revoke',
        headers: overrideHeaders,
        payload: {},
      });
    expect(badId.statusCode).toBe(404);
    expect(badId.json().code).toBe('INVITATION_NOT_FOUND');
  });

  it('POST /tenancy/invitations/redeem uses the redeemer principal and ignores body tenantId', async () => {
    captured.actors.length = 0;
    captured.redeemInputs.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: `/tenancy/invitations/redeem?${overrideQuery}`,
        headers: overrideHeaders,
        payload: { tenantId: OTHER_TENANT, token: 'some-presented-token-material' },
      });
    expect(response.statusCode).toBe(200);
    // Redeemer shape: authenticated user, no tenant taken from anywhere client-side.
    expect(captured.actors[0]).toEqual({ userId: SESSION_USER });
    expect(captured.redeemInputs[0]).toEqual({ token: 'some-presented-token-material' });
    expect(response.json().tenantId).toBe(TenantId.toString(SESSION_TENANT));
  });
});

describe('TenancyController — unauthenticated requests answer 401 and reach no use case', () => {
  it('all five routes', async () => {
    const captured: Captured = { actors: [], createInputs: [], redeemInputs: [] };
    const { useCases, principalSource } = fakes(captured, false);
    const moduleRef = await Test.createTestingModule({
      imports: [TenancyApiModule.register({ useCases, principalSource, killSwitches: allowAllKillSwitches })],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      for (const request of [
        { method: 'GET' as const, url: '/tenancy/tenant' },
        { method: 'GET' as const, url: '/tenancy/members' },
        {
          method: 'POST' as const,
          url: '/tenancy/invitations',
          payload: { email: 'x@example.com' },
        },
        {
          method: 'POST' as const,
          url: `/tenancy/invitations/${invitation.id}/revoke`,
          payload: {},
        },
        { method: 'POST' as const, url: '/tenancy/invitations/redeem', payload: { token: 'x' } },
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

describe('TenancyController — TENANT_INVITATIONS kill switch restricts issue and redeem', () => {
  it('answers 503 OPERATION_RESTRICTED before any use case runs', async () => {
    const captured: Captured = { actors: [], createInputs: [], redeemInputs: [] };
    const { useCases, principalSource } = fakes(captured, true);
    const moduleRef = await Test.createTestingModule({
      imports: [
        TenancyApiModule.register({
          useCases,
          principalSource,
          killSwitches: restrictedKillSwitches,
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      for (const request of [
        {
          method: 'POST' as const,
          url: '/tenancy/invitations',
          payload: { email: 'new.user@example.com', roleHint: 'MEMBER' },
        },
        { method: 'POST' as const, url: '/tenancy/invitations/redeem', payload: { token: 'x' } },
      ]) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({ ...request, headers: { 'content-type': 'application/json' } });
        expect(response.statusCode).toBe(503);
        expect(response.json().code).toBe('OPERATION_RESTRICTED');
        expect(response.json().switchId).toBe('TENANT_INVITATIONS');
      }
      // The switch denies at the guard; no use case and no principal read ran.
      expect(captured.actors).toEqual([]);
      // Reads stay unrestricted: the switch scopes the invitation feature only.
      const read = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url: '/tenancy/tenant' });
      expect(read.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
