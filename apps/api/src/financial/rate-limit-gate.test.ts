/**
 * The rate limiter refuses at the BOUNDARY, and a refusal is not an oracle.
 *
 * Three properties, all asserted through the real router rather than argued:
 *
 *  1. A REFUSED REQUEST DOES NO WORK. The use-case bundle is a Proxy that
 *     throws if the handler touches it, exactly as the capability-gate suite
 *     does. A 429 whose body does not carry that throw is proof the handler
 *     body never ran — so no account was queried, no import draft created, no
 *     source byte written, no CSV parsed, no commit transaction opened and no
 *     transfer state mutated.
 *  2. THE CAPABILITY GATE STILL WINS. With the capability unavailable AND the
 *     budget spent, the answer is 403, not 429. Otherwise a 429 would leak
 *     that the capability was available, and the budget would become an
 *     availability oracle.
 *  3. A 429 SAYS NOTHING ABOUT WHAT EXISTS. A refused request naming a
 *     resource that does not exist and one naming a resource that does produce
 *     byte-identical responses — because at that point nothing has looked.
 */

import 'reflect-metadata';

import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { TenantId, UserId } from '@karar/shared-kernel';
import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';
import type { RateLimitPolicy } from '@karar/platform/dist/ratelimit/index.js';
import { afterEach, describe, expect, it } from 'vitest';

import { APP_LOGGER } from '../di-tokens.js';
import { GlobalExceptionFilter } from '../errors/global-exception.filter.js';
import { PROBLEM_JSON_CONTENT_TYPE } from '../errors/problem-response.js';
import type { FinancialCapabilityDecision, FinancialCapabilityGate } from './capability-gate.js';
import { FinancialApiModule } from './financial.module.js';
import type { FinancialPrincipal, FinancialPrincipalSource } from './principal.js';
import type { FinancialRateLimitPort } from './rate-limit-port.js';
import type { FinancialUseCases } from './use-cases.js';

const PRINCIPAL: FinancialPrincipal = {
  tenantId: TenantId.of('11111111-1111-4111-8111-111111111111'),
  userId: UserId.of('22222222-2222-4222-8222-222222222222'),
};

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

/**
 * Throws if the handler body reaches a use case.
 *
 * Named keys rather than "any property": the DI layer probes for `then` and
 * other framework names during instantiation, and throwing on those would make
 * the module fail to build instead of proving anything. Allow-listing the
 * real use cases keeps the trap armed for exactly what matters.
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

const boundPrincipal: FinancialPrincipalSource = { fromRequest: () => PRINCIPAL };

function gateAnswering(decision: FinancialCapabilityDecision): FinancialCapabilityGate {
  return { decideFor: () => Promise.resolve(decision) };
}

/** A limiter that always refuses, as a spent budget does. */
function refusingLimits(): FinancialRateLimitPort {
  return {
    subjectKeyFor: () => 'a-digest-not-an-identifier',
    assertWithinLimit: (policy: RateLimitPolicy) =>
      Promise.reject(
        new PlatformError({
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Try again later.',
          origin: 'infrastructure',
          retryable: true,
          details: { policy: policy.name, retryAfterSeconds: 60 },
        }),
      ),
  };
}

/** A limiter whose store is down and whose policy fails closed. */
function unavailableLimits(): FinancialRateLimitPort {
  return {
    subjectKeyFor: () => 'a-digest-not-an-identifier',
    assertWithinLimit: (policy: RateLimitPolicy) =>
      Promise.reject(
        new PlatformError({
          code: ErrorCode.DEPENDENCY_UNAVAILABLE,
          message: 'Rate limiting is unavailable; the request was not processed.',
          origin: 'infrastructure',
          retryable: true,
          details: { policy: policy.name },
        }),
      ),
  };
}

let app: NestFastifyApplication | null = null;

async function boot(options: {
  readonly gate: FinancialCapabilityGate;
  readonly rateLimits: FinancialRateLimitPort;
}): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      FinancialApiModule.register({
        useCases: trapUseCases(),
        clock: { now: () => new Date('2026-08-19T09:00:00.000Z') },
        rateLimits: options.rateLimits,
        capabilityGate: options.gate,
        principalSource: boundPrincipal,
      }),
    ],
    providers: [
      { provide: APP_LOGGER, useValue: silentLogger },
      { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    ],
  }).compile();
  const created = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await created.init();
  await created.getHttpAdapter().getInstance().ready();
  app = created;
  return created;
}

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('a rate-limited request is refused before it does anything', () => {
  it('answers 429 on an upload, and writes no source byte', async () => {
    const server = await boot({ gate: gateAnswering('AVAILABLE'), rateLimits: refusingLimits() });
    const response = await server
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/financial/statement-imports/01J0000000000000000000000A/source',
        headers: { 'content-type': 'text/csv' },
        payload: 'date,amount,merchant\n2026-01-01,100,Shop\n',
      });
    expect(response.statusCode).toBe(429);
    // The handler never ran: had it, the Proxy would have thrown and the body
    // would carry that message.
    expect(response.body).not.toContain('use-case bundle');
    expect(response.headers['content-type']).toBe(PROBLEM_JSON_CONTENT_TYPE);
    expect(JSON.parse(response.body).code).toBe('RATE_LIMITED');
  });

  it('answers 429 on a transaction write without reaching the use case', async () => {
    const server = await boot({ gate: gateAnswering('AVAILABLE'), rateLimits: refusingLimits() });
    const response = await server
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/financial/transactions',
        payload: { anything: 'at all' },
      });
    expect(response.statusCode).toBe(429);
    expect(response.body).not.toContain('use-case bundle');
  });

  it('answers 429 on a transfer decision without mutating transfer state', async () => {
    const server = await boot({ gate: gateAnswering('AVAILABLE'), rateLimits: refusingLimits() });
    const response = await server.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/financial/transfer-matches/01J0000000000000000000000B/confirmation',
      payload: {},
    });
    expect(response.statusCode).toBe(429);
    expect(response.body).not.toContain('use-case bundle');
  });
});

describe('the budget is not an oracle', () => {
  it('an unavailable capability answers 403, not 429, even with the budget spent', async () => {
    const server = await boot({ gate: gateAnswering('UNAVAILABLE'), rateLimits: refusingLimits() });
    const response = await server
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/financial/accounts' });
    // The capability gate runs FIRST. A 429 here would say the capability was
    // available, which is exactly the leak the ordering prevents.
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('a 429 is byte-identical whether the named resource exists or not', async () => {
    const server = await boot({ gate: gateAnswering('AVAILABLE'), rateLimits: refusingLimits() });
    const bodies = new Set<string>();
    const statuses = new Set<number>();
    for (const accountId of [
      '01J0000000000000000000000C',
      '01J0000000000000000000000D',
      '01J000000000000000000000ZZ',
    ]) {
      const response = await server
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url: `/financial/accounts/${accountId}` });
      statuses.add(response.statusCode);
      // The instance member names the path, which differs by construction;
      // everything else must be identical.
      const body = JSON.parse(response.body) as Record<string, unknown>;
      delete body['instance'];
      delete body['traceId'];
      bodies.add(JSON.stringify(body));
    }
    expect([...statuses]).toEqual([429]);
    expect(bodies.size).toBe(1);
  });
});

describe('a fail-closed policy with the store down answers 503', () => {
  it('refuses with DEPENDENCY_UNAVAILABLE under problem+json', async () => {
    const server = await boot({
      gate: gateAnswering('AVAILABLE'),
      rateLimits: unavailableLimits(),
    });
    const response = await server.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/financial/transactions',
      payload: {},
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toBe(PROBLEM_JSON_CONTENT_TYPE);
    expect(JSON.parse(response.body).code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(response.body).not.toContain('use-case bundle');
  });

  it('leaks no store detail: no Redis host, no key, no subject digest', async () => {
    const server = await boot({
      gate: gateAnswering('AVAILABLE'),
      rateLimits: unavailableLimits(),
    });
    const response = await server.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/financial/transactions',
      payload: {},
    });
    const body = response.body.toLowerCase();
    for (const forbidden of [
      'redis',
      'karar:rl:',
      '127.0.0.1',
      '6379',
      'a-digest-not-an-identifier',
    ]) {
      expect({ forbidden, present: body.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
    // Nor the principal it was charged to.
    expect(body).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(body).not.toContain('22222222-2222-4222-8222-222222222222');
  });
});
