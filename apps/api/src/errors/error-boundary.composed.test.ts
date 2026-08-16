/**
 * The composed error seam: module guards + the GlobalExceptionFilter, wired
 * exactly as AppModule composes them. The independent review proved this
 * seam can drift from the module-isolated tests (guards alone answered 503;
 * the composed filter genericized them to 500) — these tests pin the
 * composed truth: kill-switch denials leave as coded 503 problem documents,
 * and framework 401s carry AUTHENTICATION_REQUIRED, never a validation code.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';

import { Result } from '@karar/shared-kernel';
import { TrustedProxyPolicy } from '@karar/platform/dist/http/index.js';
import { IdentityApiModule, type IdentityRuntime } from '@karar/identity';

import { APP_LOGGER } from '../di-tokens.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';

type Gate = Parameters<typeof IdentityApiModule.forRoot>[0]['killSwitches'];

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const runtime = {
  deps: { digester: { ipDigest: () => 'ip-digest-for-tests' } },
  useCases: {
    login: {
      execute: () => Promise.resolve(Result.err({ kind: 'invalid_credentials' })),
    },
  },
} as unknown as IdentityRuntime;

function gate(outcome: 'allow' | 'restricted' | 'outage'): Gate {
  return {
    assertOperationAllowed: (switchId) => {
      if (outcome === 'allow') return Promise.resolve(Result.ok(undefined));
      return Promise.resolve(
        Result.err(
          outcome === 'restricted'
            ? { kind: 'operation_restricted', switchId, message: 'restricted for the test' }
            : { kind: 'dependency_unavailable', switchId, message: 'store unreadable (test)' },
        ),
      );
    },
  };
}

async function bootComposed(killSwitches: Gate): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      IdentityApiModule.forRoot({
        runtime,
        trustedProxies: new TrustedProxyPolicy([]),
        killSwitches,
      }),
    ],
    providers: [
      { provide: APP_LOGGER, useValue: silentLogger },
      { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function postLogin(app: NestFastifyApplication) {
  return app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'someone@example.com', password: 'a-long-enough-password' },
    });
}

describe('composed error boundary (guards + GlobalExceptionFilter)', () => {
  it('an active kill-switch restriction leaves as a 503 OPERATION_RESTRICTED problem', async () => {
    const app = await bootComposed(gate('restricted'));
    try {
      const response = await postLogin(app);
      expect(response.statusCode).toBe(503);
      expect(response.headers['content-type']).toContain('application/problem+json');
      const problem = response.json();
      expect(problem.code).toBe('OPERATION_RESTRICTED');
      expect(problem.type).toBe('urn:karar:error:OPERATION_RESTRICTED');
      expect(problem.status).toBe(503);
      expect(problem.details).toEqual({ switchId: 'PASSWORD_LOGIN' });
    } finally {
      await app.close();
    }
  });

  it('a kill-switch store outage leaves as a 503 DEPENDENCY_UNAVAILABLE problem', async () => {
    const app = await bootComposed(gate('outage'));
    try {
      const response = await postLogin(app);
      expect(response.statusCode).toBe(503);
      const problem = response.json();
      expect(problem.code).toBe('DEPENDENCY_UNAVAILABLE');
      expect(problem.status).toBe(503);
      expect(problem.details).toEqual({ switchId: 'PASSWORD_LOGIN' });
      // The safe message never carries store/driver detail beyond what the
      // gate authored.
      expect(problem.detail).toBe('store unreadable (test)');
    } finally {
      await app.close();
    }
  });

  it('a framework 401 carries AUTHENTICATION_REQUIRED, not a validation code', async () => {
    const app = await bootComposed(gate('allow'));
    try {
      const response = await postLogin(app);
      expect(response.statusCode).toBe(401);
      const problem = response.json();
      expect(problem.code).toBe('AUTHENTICATION_REQUIRED');
      expect(problem.type).toBe('urn:karar:error:AUTHENTICATION_REQUIRED');
      expect(problem.title).toBe('Authentication required');
    } finally {
      await app.close();
    }
  });
});
