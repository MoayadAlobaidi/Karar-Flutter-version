/**
 * Kill-switch mounts on the authentication surface. The phase requirement is
 * that NEW_REGISTRATIONS, PASSWORD_LOGIN, and SESSION_REFRESH guard the
 * register/login/refresh routes; these tests prove the guards are actually
 * MOUNTED (an active restriction answers 503 before any use case runs, an
 * inactive switch changes nothing) — the switch semantics themselves are the
 * control-plane module's tests.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';

import { Result } from '@karar/shared-kernel';
import { TrustedProxyPolicy } from '@karar/platform/dist/http/index.js';

import { IdentityApiModule } from '../presentation/http/identity-api.module.js';
import type { OperationGate } from '../presentation/http/operation-gate.js';
import type { IdentityRuntime } from '../infrastructure/composition/create-identity-runtime.js';

const allowAll: OperationGate = {
  assertOperationAllowed: () => Promise.resolve(Result.ok(undefined)),
};

const restrictAll: OperationGate = {
  assertOperationAllowed: (switchId) =>
    Promise.resolve(
      Result.err({
        kind: 'operation_restricted',
        switchId,
        message: 'restricted for the test',
      }),
    ),
};

/**
 * A runtime whose use cases only COUNT invocations: the restricted paths must
 * never reach them, and the register allow-path proves the guard passes an
 * unrestricted request through. Presentation reads nothing else off the
 * runtime except the digester.
 */
function countingRuntime(): { runtime: IdentityRuntime; calls: Record<string, number> } {
  const calls: Record<string, number> = { register: 0, login: 0, refresh: 0 };
  const runtime = {
    deps: { digester: { ipDigest: () => 'ip-digest-for-tests' } },
    useCases: {
      registerAccount: {
        execute: () => {
          calls['register'] = (calls['register'] ?? 0) + 1;
          return Promise.resolve(Result.ok({}));
        },
      },
      login: {
        execute: () => {
          calls['login'] = (calls['login'] ?? 0) + 1;
          return Promise.resolve(Result.err({ kind: 'invalid_credentials' }));
        },
      },
      refreshSession: {
        execute: () => {
          calls['refresh'] = (calls['refresh'] ?? 0) + 1;
          return Promise.resolve(Result.err({ kind: 'invalid_refresh_token' }));
        },
      },
    },
  } as unknown as IdentityRuntime;
  return { runtime, calls };
}

async function bootApp(killSwitches: OperationGate) {
  const { runtime, calls } = countingRuntime();
  const moduleRef = await Test.createTestingModule({
    imports: [
      IdentityApiModule.forRoot({
        runtime,
        trustedProxies: new TrustedProxyPolicy([]),
        killSwitches,
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, calls };
}

const guardedRequests = [
  {
    name: 'register',
    switchId: 'NEW_REGISTRATIONS',
    url: '/auth/register',
    payload: { email: 'someone@example.com', password: 'a-long-enough-password' },
  },
  {
    name: 'login',
    switchId: 'PASSWORD_LOGIN',
    url: '/auth/login',
    payload: { email: 'someone@example.com', password: 'a-long-enough-password' },
  },
  {
    name: 'refresh',
    switchId: 'SESSION_REFRESH',
    url: '/auth/refresh',
    payload: { refreshToken: 'not-a-real-token' },
  },
] as const;

describe('identity kill-switch mounts', () => {
  it('an active restriction answers 503 OPERATION_RESTRICTED and reaches no use case', async () => {
    const { app, calls } = await bootApp(restrictAll);
    try {
      for (const request of guardedRequests) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: request.url,
            headers: { 'content-type': 'application/json' },
            payload: request.payload,
          });
        expect(response.statusCode).toBe(503);
        expect(response.json().code).toBe('OPERATION_RESTRICTED');
        expect(response.json().switchId).toBe(request.switchId);
      }
      expect(calls).toEqual({ register: 0, login: 0, refresh: 0 });
    } finally {
      await app.close();
    }
  });

  it('with no restriction the guarded routes reach their use cases', async () => {
    const { app, calls } = await bootApp(allowAll);
    try {
      const register = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/register',
          headers: { 'content-type': 'application/json' },
          payload: guardedRequests[0].payload,
        });
      expect(register.statusCode).toBe(202);
      const login = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/login',
          headers: { 'content-type': 'application/json' },
          payload: guardedRequests[1].payload,
        });
      expect(login.statusCode).toBe(401);
      expect(calls['register']).toBe(1);
      expect(calls['login']).toBe(1);
    } finally {
      await app.close();
    }
  });
});
