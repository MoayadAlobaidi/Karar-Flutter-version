/**
 * NEGATIVE evidence for the failure/absence distinction.
 *
 * The defect this suite exists to keep closed: a capability or policy
 * resolution that FAILED used to be reported as an empty list, so a broken
 * store and a legitimately empty entitlement set produced byte-identical
 * 200 responses. The denial was correct and the explanation was false — the
 * client stops asking, retries nothing, and operations sees a healthy 200.
 *
 * Every case below drives a port that fails and asserts the request does NOT
 * succeed: no 200, no empty list, no null section standing in for an outage.
 * The 503 document is checked for what it must carry (a stable code, a
 * retryable indication, the correlation id) and for what it must NOT — no
 * capability identifiers, no policy detail, no store or driver text, no
 * stack, no licence or provider internals.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';

import { GetBootstrap } from '../application/use-cases/get-bootstrap.js';
import { BootstrapApiModule } from '../presentation/bootstrap-api.module.js';
import { problemForBootstrapError } from '../presentation/http/problems.js';
import type { BootstrapUseCases } from '../presentation/http/bootstrap.controller.js';
import type { BootstrapPrincipalSource } from '../presentation/http/principal-source.js';
import type { SetTenantBinding } from '../application/use-cases/set-tenant-binding.js';
import {
  CLIENT,
  FakeResolve,
  RecordingAudit,
  SESSION,
  USER,
  UnreachableBind,
  UnreachableRevoke,
  enrichment,
  fixedClock,
  principal,
  unavailableEnrichment,
} from './helpers/fakes.js';

const REQUEST_ID = 'req-7f3c1b';

function bootstrapWith(overrides: Parameters<typeof enrichment>[0]) {
  return new GetBootstrap({
    resolveTenantContext: new FakeResolve([{ kind: 'UNBOUND' }]),
    bindSession: new UnreachableBind(),
    revokeSession: new UnreachableRevoke(),
    ...enrichment(overrides),
    auditTrail: new RecordingAudit(),
    clock: fixedClock,
  });
}

describe('a failing enrichment port fails the request — it never becomes an empty 200', () => {
  it('capability resolution failure: the call fails instead of returning an empty list', async () => {
    const result = await bootstrapWith({
      capabilities: unavailableEnrichment.capabilities,
    }).execute(principal(), CLIENT);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('a failed capability resolution must not produce a bootstrap view');
    }
    expect(result.error.kind).toBe('resolution_unavailable');
  });

  it('policy-pack ledger failure: the call fails instead of reporting "no pack"', async () => {
    const result = await bootstrapWith({ policyPack: unavailableEnrichment.policyPack }).execute(
      principal(),
      CLIENT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('a failed policy-pack read must not produce a bootstrap view');
    expect(result.error.kind).toBe('resolution_unavailable');
  });

  it('jurisdiction read failure: the call fails instead of reporting state NONE', async () => {
    const result = await bootstrapWith({
      jurisdiction: unavailableEnrichment.jurisdiction,
    }).execute(principal(), CLIENT);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('a failed jurisdiction read must not produce a bootstrap view');
    expect(result.error.kind).toBe('resolution_unavailable');
  });

  it('a jurisdiction failure short-circuits: the downstream resolvers are never consulted', async () => {
    let downstreamCalls = 0;
    const counting = {
      statusFor: () => {
        downstreamCalls += 1;
        return Promise.resolve({ kind: 'NONE' as const });
      },
    };
    const result = await bootstrapWith({
      jurisdiction: unavailableEnrichment.jurisdiction,
      policyPack: counting,
    }).execute(principal(), CLIENT);

    expect(result.ok).toBe(false);
    // Resolving a pack against a jurisdiction nobody could read would be a
    // guess; the request fails before anything downstream is asked.
    expect(downstreamCalls).toBe(0);
  });

  it('a RESOLVED-but-empty capability list still succeeds — absence is not failure', async () => {
    const result = await bootstrapWith({
      capabilities: {
        resolveFor: () => Promise.resolve({ kind: 'RESOLVED' as const, capabilities: [] }),
      },
    }).execute(principal(), CLIENT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('an empty resolution is a success, not a failure');
    expect(result.value.capabilities).toEqual({ state: 'RESOLVED', items: [] });
  });
});

describe('the 503 problem document', () => {
  it('carries the stable code, the retryable indication, and the correlation id', () => {
    const problem = problemForBootstrapError(
      { kind: 'resolution_unavailable', message: 'capability resolution did not complete', retryable: true },
      REQUEST_ID,
    );

    expect(problem.status).toBe(503);
    expect(problem.body.code).toBe('BOOTSTRAP_UNAVAILABLE');
    expect(problem.body.retryable).toBe(true);
    expect(problem.body.requestId).toBe(REQUEST_ID);
    expect(problem.body.status).toBe(503);
  });

  it('reports a non-retryable failure as such rather than inviting a pointless retry', () => {
    const problem = problemForBootstrapError({
      kind: 'resolution_unavailable',
      message: 'the assignment names a jurisdiction the register does not hold',
      retryable: false,
    });

    expect(problem.status).toBe(503);
    expect(problem.body.retryable).toBe(false);
    expect(problem.body.requestId).toBeUndefined();
  });

  it('uses the SAME code for a tenant-context failure — one remedy, one code', () => {
    const problem = problemForBootstrapError({
      kind: 'context_unavailable',
      message: 'tenant-context resolution is unavailable',
    });

    expect(problem.status).toBe(503);
    expect(problem.body.code).toBe('BOOTSTRAP_UNAVAILABLE');
    expect(problem.body.retryable).toBe(true);
  });

  it('leaks nothing: no capability ids, no policy detail, no store text, no stack', () => {
    const problem = problemForBootstrapError(
      {
        kind: 'resolution_unavailable',
        // A message deliberately stuffed with everything that must not escape.
        message:
          'AMANAT ceiling read failed: relation "capability_availability" does not exist at ' +
          'karar_app@localhost:5433 — pack qa/v1 rule 7.3; licence CBI-2026-001; ' +
          'at PrismaClient._request (/app/node_modules/.prisma/client/index.js:1:1)',
        retryable: true,
      },
      REQUEST_ID,
    );

    const serialized = JSON.stringify(problem.body);
    for (const forbidden of [
      'AMANAT', // hidden capability identifier
      'capability_availability', // internal table
      'karar_app', // database role
      'localhost:5433', // connection detail
      'qa/v1', // policy pack version
      'rule 7.3', // internal policy reasoning
      'CBI-2026-001', // licence internals
      'PrismaClient', // driver internals
      'node_modules', // stack frame
      'does not exist', // raw store text
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Only the declared, reviewed fields cross the edge.
    expect(Object.keys(problem.body).sort()).toEqual([
      'code',
      'requestId',
      'retryable',
      'status',
      'title',
      'type',
    ]);
  });
});

/**
 * The same guarantee through the real HTTP surface: the module's controller
 * over the real use case, with only the failing dependency faked. If a
 * regression reinstates the swallow, this is the test that answers 200.
 */
describe('GET /platform/bootstrap over the real controller', () => {
  async function appWithFailingCapabilities() {
    const useCases: BootstrapUseCases = {
      getBootstrap: bootstrapWith({ capabilities: unavailableEnrichment.capabilities }),
      setTenantBinding: {
        execute: () => {
          throw new Error('the binding surface must not be reached here');
        },
      } as unknown as SetTenantBinding,
    };
    const principalSource: BootstrapPrincipalSource = {
      fromRequest: () => ({
        userId: USER,
        sessionId: SESSION,
        tenantId: null,
        emailVerified: true,
        requestId: REQUEST_ID,
      }),
      clientContextOf: () => CLIENT,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [BootstrapApiModule.register({ useCases, principalSource })],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it('answers 503 with the coded problem — NOT 200 with an empty capability list', async () => {
    const app = await appWithFailingCapabilities();
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url: '/platform/bootstrap' });

      expect(response.statusCode).toBe(503);
      const body = response.json<Record<string, unknown>>();
      expect(body.code).toBe('BOOTSTRAP_UNAVAILABLE');
      expect(body.retryable).toBe(false);
      expect(body.requestId).toBe(REQUEST_ID);
      // The shapes a 200 would have carried must be absent entirely.
      expect(body).not.toHaveProperty('capabilities');
      expect(body).not.toHaveProperty('binding');
      expect(response.payload).not.toContain('"items"');
    } finally {
      await app.close();
    }
  });
});
