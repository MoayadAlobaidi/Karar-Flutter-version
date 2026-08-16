/**
 * The bootstrap HTTP surface: tenant identity NEVER comes from the request.
 *
 * Both routes are attacked simultaneously with `?tenantId=`, an
 * `x-tenant-id` header, and (on POST) a body carrying extra identity-shaped
 * fields; the use cases must receive the SESSION principal untouched, and
 * POST must forward exactly ONE body field — the selection — and nothing
 * else. Unauthenticated requests answer 401 with no fallback principal, and
 * every typed denial maps to its documented problem code.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Result, TenantId } from '@karar/shared-kernel';

import { BootstrapApiModule } from '../presentation/bootstrap-api.module.js';
import type { BootstrapPrincipalSource } from '../presentation/http/principal-source.js';
import type { BootstrapUseCases } from '../presentation/http/bootstrap.controller.js';
import type { GetBootstrap } from '../application/use-cases/get-bootstrap.js';
import type { SetTenantBinding } from '../application/use-cases/set-tenant-binding.js';
import type { SetTenantBindingError } from '../application/errors.js';
import type { BootstrapPrincipal } from '../application/principal.js';
import {
  CHOICE_A,
  ENTITY,
  JURISDICTION,
  NEW_SESSION,
  POLICY_PACK,
  SESSION,
  TENANT_A,
  USER,
  CAPABILITIES,
} from './helpers/fakes.js';

const OTHER_TENANT = 'bbbbbbbb-0000-4000-8000-00000000000b';

interface Captured {
  principals: BootstrapPrincipal[];
  bindingInputs: Array<{ readonly tenantId: unknown }>;
}

function fakes(
  captured: Captured,
  options: {
    authenticated: boolean;
    boundTenant?: TenantId | null;
    bindingDenial?: SetTenantBindingError;
    switched?: boolean;
  },
) {
  const useCases: BootstrapUseCases = {
    getBootstrap: {
      execute: (principal: BootstrapPrincipal) => {
        captured.principals.push(principal);
        return Promise.resolve(
          Result.ok({
            user: { userId: USER, emailVerified: true },
            session: { sessionId: SESSION },
            binding: { kind: 'BOUND' as const, tenant: CHOICE_A },
            jurisdiction: JURISDICTION,
            operatingEntity: ENTITY,
            policyPack: POLICY_PACK,
            capabilities: { state: 'RESOLVED' as const, items: CAPABILITIES },
          }),
        );
      },
    } as unknown as GetBootstrap,
    setTenantBinding: {
      execute: (input: { readonly tenantId: unknown }, principal: BootstrapPrincipal) => {
        captured.principals.push(principal);
        captured.bindingInputs.push(input);
        if (options.bindingDenial !== undefined) {
          return Promise.resolve(Result.err(options.bindingDenial));
        }
        return Promise.resolve(
          Result.ok(
            options.switched === true
              ? {
                  kind: 'switched' as const,
                  binding: { kind: 'BOUND' as const, tenant: CHOICE_A },
                  session: NEW_SESSION,
                }
              : { kind: 'bound' as const, binding: { kind: 'BOUND' as const, tenant: CHOICE_A } },
          ),
        );
      },
    } as unknown as SetTenantBinding,
  };

  const principalSource: BootstrapPrincipalSource = {
    fromRequest: () =>
      options.authenticated
        ? {
            userId: USER,
            sessionId: SESSION,
            tenantId: options.boundTenant ?? null,
            emailVerified: true,
          }
        : null,
    clientContextOf: () => ({ ipDigest: 'digest-1', userAgentSummary: 'test' }),
  };
  return { useCases, principalSource };
}

async function appWith(useCases: BootstrapUseCases, principalSource: BootstrapPrincipalSource) {
  const moduleRef = await Test.createTestingModule({
    imports: [BootstrapApiModule.register({ useCases, principalSource })],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

const overrideQuery = `tenantId=${OTHER_TENANT}`;
const overrideHeaders = { 'x-tenant-id': OTHER_TENANT, 'content-type': 'application/json' };

describe('BootstrapController — tenant identity never comes from the request', () => {
  const captured: Captured = { principals: [], bindingInputs: [] };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const { useCases, principalSource } = fakes(captured, { authenticated: true });
    app = await appWith(useCases, principalSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /platform/bootstrap ignores query and header tenant overrides', async () => {
    captured.principals.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/platform/bootstrap?${overrideQuery}`,
        headers: overrideHeaders,
      });

    expect(response.statusCode).toBe(200);
    expect(captured.principals).toHaveLength(1);
    // The principal the use case saw is the SESSION's, unbound — not the
    // tenant the request tried to assert.
    expect(captured.principals[0]?.tenantId).toBeNull();
    expect(response.json().binding).toEqual({ kind: 'BOUND', tenant: CHOICE_A });
  });

  it('POST /platform/tenant-binding ignores query and header overrides, and forwards ONLY the selection field', async () => {
    captured.principals.length = 0;
    captured.bindingInputs.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: `/platform/tenant-binding?${overrideQuery}`,
        headers: overrideHeaders,
        payload: {
          tenantId: TenantId.toString(TENANT_A),
          // Identity-shaped smuggling attempts on the body:
          userId: '00000000-0000-4000-8000-000000000000',
          sessionId: 'attacker-session',
          emailVerified: true,
          roleHint: 'PLATFORM_ADMIN',
        },
      });

    expect(response.statusCode).toBe(200);
    expect(captured.principals[0]?.userId).toBe(USER);
    expect(captured.principals[0]?.sessionId).toBe(SESSION);
    expect(captured.principals[0]?.tenantId).toBeNull();
    // Exactly one field crossed the boundary.
    expect(Object.keys(captured.bindingInputs[0] ?? {})).toEqual(['tenantId']);
    expect(captured.bindingInputs[0]?.tenantId).toBe(TenantId.toString(TENANT_A));
  });

  it('a switch response carries the NEW tokens; a first bind carries none', async () => {
    const local: Captured = { principals: [], bindingInputs: [] };
    const switched = fakes(local, {
      authenticated: true,
      boundTenant: TENANT_A,
      switched: true,
    });
    const switchApp = await appWith(switched.useCases, switched.principalSource);
    try {
      const response = await switchApp
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/platform/tenant-binding',
          headers: { 'content-type': 'application/json' },
          payload: { tenantId: OTHER_TENANT },
        });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.kind).toBe('SWITCHED');
      expect(body.tokens.accessToken).toBe(NEW_SESSION.accessToken);
      expect(body.tokens.refreshToken).toBe(NEW_SESSION.refreshToken);
      expect(body.tokens.sessionId).toBe(NEW_SESSION.sessionId);
    } finally {
      await switchApp.close();
    }

    const bindResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/platform/tenant-binding',
        headers: { 'content-type': 'application/json' },
        payload: { tenantId: TenantId.toString(TENANT_A) },
      });
    const bindBody = bindResponse.json();
    expect(bindBody.kind).toBe('BOUND');
    expect(bindBody).not.toHaveProperty('tokens');
  });
});

describe('BootstrapController — unauthenticated and denial mapping', () => {
  it('answers 401 on both routes with no fallback principal', async () => {
    const captured: Captured = { principals: [], bindingInputs: [] };
    const { useCases, principalSource } = fakes(captured, { authenticated: false });
    const app = await appWith(useCases, principalSource);
    try {
      for (const [method, url] of [
        ['GET', '/platform/bootstrap'],
        ['POST', '/platform/tenant-binding'],
      ] as const) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({ method, url, headers: { 'content-type': 'application/json' }, payload: {} });
        expect(response.statusCode).toBe(401);
        expect(response.json().code).toBe('AUTHENTICATION_REQUIRED');
      }
      // No use case was reached at all.
      expect(captured.principals).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it.each([
    [
      { kind: 'invalid_tenant_selection', message: 'bad' } as SetTenantBindingError,
      400,
      'INVALID_TENANT_SELECTION',
    ],
    [
      { kind: 'membership_required', message: 'no' } as SetTenantBindingError,
      403,
      'MEMBERSHIP_REQUIRED',
    ],
    [
      { kind: 'binding_conflict', message: 'race' } as SetTenantBindingError,
      409,
      'BINDING_CONFLICT',
    ],
    [
      { kind: 'membership_revoked_concurrently', message: 'gone' } as SetTenantBindingError,
      409,
      'MEMBERSHIP_REVOKED_CONCURRENTLY',
    ],
    [
      { kind: 'context_unavailable', message: 'down' } as SetTenantBindingError,
      503,
      'BOOTSTRAP_UNAVAILABLE',
    ],
  ])('maps %o to %i %s', async (denial, status, code) => {
    const captured: Captured = { principals: [], bindingInputs: [] };
    const { useCases, principalSource } = fakes(captured, {
      authenticated: true,
      bindingDenial: denial,
    });
    const app = await appWith(useCases, principalSource);
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/platform/tenant-binding',
          headers: { 'content-type': 'application/json' },
          payload: { tenantId: OTHER_TENANT },
        });
      expect(response.statusCode).toBe(status);
      expect(response.json().code).toBe(code);
      // The 503 answer carries no internal store detail.
      if (status === 503) expect(response.json().detail).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
