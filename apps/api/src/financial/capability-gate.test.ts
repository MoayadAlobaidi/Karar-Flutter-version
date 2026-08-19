/**
 * THE GATE, EXERCISED THROUGH THE REAL ROUTER.
 *
 * This suite boots the actual `FinancialApiModule` behind a real Fastify
 * adapter and drives real HTTP requests at all twenty-seven mounted
 * operations. Nothing calls the guard directly, because the property under
 * test is not "the guard returns false" — it is "no financial route executes
 * for a principal the capability is unavailable to", and that is a claim
 * about the composed router, the guard, the error boundary and the media type
 * together.
 *
 * THE USE-CASE BUNDLE IS A TRAP, NOT A FAKE. Every property access on it
 * throws. A request that reached a handler therefore fails with a message
 * this file can recognise, so "the route refused" and "the route ran and
 * happened to return an error" can never be confused — and the AVAILABLE case
 * proves the guard is not simply refusing everything, because the trap is
 * what answers when the gate lets a request through.
 *
 * WHY EVERY ROUTE RATHER THAN A SAMPLE. The defect this closes is a route
 * mounted without the gate. A sample proves the sampled routes; the table
 * below is generated from the same eight controllers the module registers,
 * and `capability-mounting.test.ts` holds the other half — that the module's
 * controller list and the guard cannot drift apart.
 */

import 'reflect-metadata';

import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { TenantId, UserId } from '@karar/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { APP_LOGGER } from '../di-tokens.js';
import { GlobalExceptionFilter } from '../errors/global-exception.filter.js';
import { PROBLEM_JSON_CONTENT_TYPE } from '../errors/problem-response.js';
import type { FinancialCapabilityDecision, FinancialCapabilityGate } from './capability-gate.js';
import { FinancialApiModule } from './financial.module.js';
import type { FinancialPrincipal, FinancialPrincipalSource } from './principal.js';
import type { FinancialUseCases } from './use-cases.js';

const TENANT = TenantId.of('11111111-1111-4111-8111-111111111111');
const SUBJECT = UserId.of('22222222-2222-4222-8222-222222222222');
const RESOURCE = '33333333-3333-4333-8333-333333333333';

const PRINCIPAL: FinancialPrincipal = { tenantId: TENANT, userId: SUBJECT };

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/**
 * Every key a handler could ask this bundle for. The trap fires on these and
 * only these: the container also probes a provider value for thenability and
 * for lifecycle hooks, and those are the framework looking at the object
 * rather than a handler using it. Listing the real keys rather than
 * allow-listing the framework's probes keeps the trap armed when a future
 * Nest version invents a new probe name.
 */
const USE_CASE_KEYS: ReadonlySet<string> = new Set([
  'institutions',
  'categories',
  'listOwnAccounts',
  'readOwnAccount',
  'createManualAccount',
  'updateOwnAccount',
  'listOwnBalanceSnapshots',
  'listOwnTransactions',
  'createManualTransaction',
  'readOwnTransaction',
  'updateOwnTransaction',
  'deleteOwnTransaction',
  'assignCategory',
  'listOwnConnections',
  'listOwnAccountSourceLinks',
  'listOwnPaymentInstruments',
  'startStatementImport',
  'storeImportSource',
  'parseStatementSource',
  'previewStatementImport',
  'commitStatementImport',
  'eraseStatementImport',
  'listOwnTransferMatches',
  'confirmTransferMatch',
  'rejectTransferMatch',
]);

/**
 * A bundle that detonates on use. A handler that ran is therefore loud, and a
 * handler that never ran is silent — exactly the distinction this suite needs,
 * and the one a hand-written stub would blur.
 */
function trapUseCases(): FinancialUseCases {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === 'string' && USE_CASE_KEYS.has(property)) {
          throw new Error(`handler reached the use-case bundle ('${property}')`);
        }
        return undefined;
      },
    },
  ) as FinancialUseCases;
}

/** The session-resolved principal, as the composition root would bind it. */
const boundPrincipal: FinancialPrincipalSource = { fromRequest: () => PRINCIPAL };

function gateAnswering(decision: FinancialCapabilityDecision): FinancialCapabilityGate {
  return { decideFor: () => Promise.resolve(decision) };
}

interface BootOptions {
  readonly gate: FinancialCapabilityGate;
  readonly principalSource?: FinancialPrincipalSource;
}

async function boot(options: BootOptions): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      FinancialApiModule.register({
        useCases: trapUseCases(),
        clock: { now: () => new Date('2026-08-19T09:00:00.000Z') },
        capabilityGate: options.gate,
        principalSource: options.principalSource ?? boundPrincipal,
      }),
    ],
    providers: [
      { provide: APP_LOGGER, useValue: silentLogger },
      { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

interface Route {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly url: string;
}

/** Every operation the module mounts, by controller. */
const ROUTES: readonly Route[] = [
  // financial-catalogue
  { method: 'GET', url: '/financial/institutions' },
  { method: 'GET', url: '/financial/categories' },
  // financial-accounts
  { method: 'GET', url: '/financial/accounts' },
  { method: 'POST', url: '/financial/accounts' },
  { method: 'GET', url: `/financial/accounts/${RESOURCE}` },
  { method: 'PATCH', url: `/financial/accounts/${RESOURCE}` },
  // financial-views
  { method: 'GET', url: `/financial/accounts/${RESOURCE}/balances` },
  { method: 'GET', url: `/financial/accounts/${RESOURCE}/source-links` },
  { method: 'GET', url: `/financial/accounts/${RESOURCE}/payment-instruments` },
  { method: 'GET', url: '/financial/connections' },
  // financial-transactions
  { method: 'GET', url: '/financial/transactions' },
  { method: 'POST', url: '/financial/transactions' },
  { method: 'GET', url: `/financial/transactions/${RESOURCE}` },
  { method: 'PATCH', url: `/financial/transactions/${RESOURCE}` },
  { method: 'DELETE', url: `/financial/transactions/${RESOURCE}` },
  // financial-transaction-detail
  { method: 'PUT', url: `/financial/transactions/${RESOURCE}/category` },
  { method: 'GET', url: `/financial/transactions/${RESOURCE}/provenance` },
  // statement-imports
  { method: 'POST', url: '/financial/statement-imports' },
  { method: 'GET', url: `/financial/statement-imports/${RESOURCE}` },
  { method: 'GET', url: `/financial/statement-imports/${RESOURCE}/preview` },
  { method: 'DELETE', url: `/financial/statement-imports/${RESOURCE}` },
  // statement-import-source
  { method: 'POST', url: `/financial/statement-imports/${RESOURCE}/source` },
  { method: 'POST', url: `/financial/statement-imports/${RESOURCE}/parse` },
  { method: 'POST', url: `/financial/statement-imports/${RESOURCE}/commit` },
  // transfer-matches
  { method: 'GET', url: '/financial/transfer-matches' },
  { method: 'POST', url: `/financial/transfer-matches/${RESOURCE}/confirmation` },
  { method: 'POST', url: `/financial/transfer-matches/${RESOURCE}/rejection` },
];

const BODY_METHODS = new Set(['POST', 'PATCH', 'PUT']);

async function call(
  app: NestFastifyApplication,
  route: Route,
  extra: { headers?: Record<string, string>; query?: string; payload?: unknown } = {},
) {
  const headers: Record<string, string> = { ...(extra.headers ?? {}) };
  const carriesBody = BODY_METHODS.has(route.method);
  if (carriesBody) headers['content-type'] = 'application/json';
  return app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: route.method,
      url: route.url + (extra.query ?? ''),
      headers,
      ...(carriesBody ? { payload: (extra.payload ?? {}) as object } : {}),
    });
}

describe('every mounted financial operation refuses when the capability is unavailable', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await boot({ gate: gateAnswering('UNAVAILABLE') });
  });

  afterAll(async () => {
    await app.close();
  });

  it('mounts the twenty-seven operations this table names', () => {
    // A table that silently shrank would make the sweep below prove less
    // every time somebody deleted a line from it.
    expect(ROUTES).toHaveLength(27);
  });

  for (const route of ROUTES) {
    it(`${route.method} ${route.url} answers 403 CAPABILITY_UNAVAILABLE`, async () => {
      const response = await call(app, route);
      expect(response.statusCode).toBe(403);
      expect(response.headers['content-type']).toBe(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.json()).toEqual({
        type: 'about:blank',
        title: 'Capability unavailable',
        status: 403,
        code: 'CAPABILITY_UNAVAILABLE',
        detail: 'this capability is not available for this principal',
      });
      // The trap bundle is what a reached handler touches. Its message must
      // appear nowhere: the refusal happened BEFORE the handler.
      expect(response.body).not.toContain('use-case bundle');
    });
  }
});

describe('the refusal carries no reason, and no reason can be told from another', () => {
  /**
   * Six internal conditions the resolver distinguishes and the caller must
   * not. Each is modelled as the gate failing in its own way — a decided
   * denial, and a throw carrying text that names the internal cause. If any
   * of them produced a different status, a different code, or a different
   * byte, an unauthenticated prober could enumerate the platform's legal and
   * commercial posture one request at a time.
   */
  const CONDITIONS: ReadonlyArray<{
    readonly name: string;
    readonly gate: FinancialCapabilityGate;
  }> = [
    { name: 'a decided denial', gate: gateAnswering('UNAVAILABLE') },
    {
      name: 'the capability is not implemented',
      gate: {
        decideFor: () => Promise.reject(new Error('NOT_IMPLEMENTED at the DESCRIPTOR gate')),
      },
    },
    {
      name: 'the capability is deployed nowhere',
      gate: { decideFor: () => Promise.reject(new Error('NOT_DEPLOYED in staging')) },
    },
    {
      name: 'no policy pack clears the jurisdiction',
      gate: {
        decideFor: () =>
          Promise.reject(new Error('JURISDICTION_NOT_CLEARED for scope QA under qa/v1')),
      },
    },
    {
      name: 'the pack is with legal review',
      gate: { decideFor: () => Promise.reject(new Error('PENDING_LEGAL_REVIEW')) },
    },
    {
      name: 'the availability store could not be read',
      gate: {
        decideFor: () =>
          Promise.reject(
            new Error('relation "public.capability_availability" does not exist (SQLSTATE 42P01)'),
          ),
      },
    },
  ];

  it('answers every condition with the same bytes', async () => {
    const answers: string[] = [];
    for (const condition of CONDITIONS) {
      const app = await boot({ gate: condition.gate });
      try {
        const response = await call(app, { method: 'GET', url: '/financial/accounts' });
        expect(response.statusCode, condition.name).toBe(403);
        expect(response.headers['content-type'], condition.name).toBe(PROBLEM_JSON_CONTENT_TYPE);
        answers.push(response.body);
      } finally {
        await app.close();
      }
    }
    expect(new Set(answers).size, 'the refusals must be indistinguishable').toBe(1);
  });

  it('never echoes the internal cause, the store text, or a legal term', async () => {
    for (const condition of CONDITIONS) {
      const app = await boot({ gate: condition.gate });
      try {
        const response = await call(app, { method: 'GET', url: '/financial/accounts' });
        const body = response.body.toUpperCase();
        for (const leak of [
          'NOT_IMPLEMENTED',
          'NOT_DEPLOYED',
          'JURISDICTION',
          'POLICY_PACK',
          'PENDING_LEGAL_REVIEW',
          'PENDING_REGULATORY_REVIEW',
          'ENTITLEMENT',
          'CONSENT',
          'LICENCE',
          'PROVIDER',
          'QA/V1',
          'SQLSTATE',
          'CAPABILITY_AVAILABILITY',
        ]) {
          expect(body, `${condition.name} leaked '${leak}'`).not.toContain(leak);
        }
        // Not even the shape of a hint: no reason, no retryable, no stack.
        expect(Object.keys(response.json() as object).sort()).toEqual([
          'code',
          'detail',
          'status',
          'title',
          'type',
        ]);
      } finally {
        await app.close();
      }
    }
  });
});

describe('no client input reaches the decision', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await boot({ gate: gateAnswering('UNAVAILABLE') });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Everything a caller could try, in every place a caller could put it. */
  const OVERRIDES: ReadonlyArray<{
    readonly name: string;
    readonly headers?: Record<string, string>;
    readonly query?: string;
    readonly payload?: unknown;
  }> = [
    { name: 'a query parameter', query: '?capability=TRANSACTIONS&capabilityAvailable=true' },
    { name: 'a header', headers: { 'x-karar-capability': 'TRANSACTIONS' } },
    { name: 'an availability header', headers: { 'x-capability-available': 'AVAILABLE' } },
    { name: 'a cookie', headers: { cookie: 'capability=TRANSACTIONS; available=true' } },
    { name: 'an environment header', headers: { 'x-karar-env': 'local' } },
    { name: 'a jurisdiction header', headers: { 'x-jurisdiction': 'QA' } },
  ];

  for (const override of OVERRIDES) {
    it(`${override.name} changes nothing on a read`, async () => {
      const response = await call(app, { method: 'GET', url: '/financial/accounts' }, override);
      expect(response.statusCode).toBe(403);
      expect((response.json() as { code: string }).code).toBe('CAPABILITY_UNAVAILABLE');
    });
  }

  it('a body claiming the capability is available changes nothing on a write', async () => {
    const response = await call(
      app,
      { method: 'POST', url: '/financial/accounts' },
      {
        payload: {
          capability: 'TRANSACTIONS',
          capabilityAvailable: true,
          available: true,
          jurisdiction: 'QA',
        },
        headers: { 'x-karar-capability': 'TRANSACTIONS' },
      },
    );
    expect(response.statusCode).toBe(403);
    expect((response.json() as { code: string }).code).toBe('CAPABILITY_UNAVAILABLE');
  });
});

describe('the gate does not replace the principal checks, and does not outrank them', () => {
  it('an unauthenticated caller still gets 401, not a capability refusal', async () => {
    const app = await boot({
      gate: gateAnswering('AVAILABLE'),
      principalSource: { fromRequest: () => 'AUTHENTICATION_REQUIRED' },
    });
    try {
      const response = await call(app, { method: 'GET', url: '/financial/accounts' });
      expect(response.statusCode).toBe(401);
      expect((response.json() as { code: string }).code).toBe('AUTHENTICATION_REQUIRED');
    } finally {
      await app.close();
    }
  });

  it('a session with no tenant binding still gets 403 TENANT_BINDING_REQUIRED', async () => {
    const app = await boot({
      gate: gateAnswering('AVAILABLE'),
      principalSource: { fromRequest: () => 'TENANT_BINDING_REQUIRED' },
    });
    try {
      const response = await call(app, { method: 'GET', url: '/financial/accounts' });
      expect(response.statusCode).toBe(403);
      expect((response.json() as { code: string }).code).toBe('TENANT_BINDING_REQUIRED');
    } finally {
      await app.close();
    }
  });

  it('an unauthenticated caller is refused before the gate is even asked', async () => {
    let asked = false;
    const app = await boot({
      gate: {
        decideFor: () => {
          asked = true;
          return Promise.resolve('AVAILABLE');
        },
      },
      principalSource: { fromRequest: () => 'AUTHENTICATION_REQUIRED' },
    });
    try {
      await call(app, { method: 'GET', url: '/financial/accounts' });
      expect(asked, 'a capability decision needs a subject; there was none').toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe('the gate is asked about the session principal and nothing else', () => {
  it('receives exactly the principal the surface acts for', async () => {
    const seen: unknown[] = [];
    const app = await boot({
      gate: {
        decideFor: (principal) => {
          seen.push(principal);
          return Promise.resolve('UNAVAILABLE');
        },
      },
    });
    try {
      await call(
        app,
        { method: 'GET', url: '/financial/accounts' },
        {
          query: '?userId=99999999-9999-4999-8999-999999999999',
          headers: { 'x-tenant-id': '88888888-8888-4888-8888-888888888888' },
        },
      );
      expect(seen).toEqual([PRINCIPAL]);
    } finally {
      await app.close();
    }
  });
});

describe('an available capability lets the request through', () => {
  it('reaches the handler, which is the trap bundle', async () => {
    // Without this, every assertion above would also pass for a guard that
    // refuses unconditionally — which would be a broken surface, not a gate.
    const app = await boot({ gate: gateAnswering('AVAILABLE') });
    try {
      const response = await call(app, { method: 'GET', url: '/financial/accounts' });
      expect(response.statusCode).toBe(500);
      expect((response.json() as { code: string }).code).toBe('INTERNAL_ERROR');
    } finally {
      await app.close();
    }
  });
});
