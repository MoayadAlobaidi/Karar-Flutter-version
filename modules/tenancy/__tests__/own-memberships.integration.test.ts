/**
 * GET /tenancy/memberships against live PostgreSQL — the adversarial evidence
 * for the SELF-scoped read the Phase 4 client contract needs.
 *
 * THE AZ2 LESSON, applied in order: the caller's OWN list must come back
 * NON-EMPTY first, because a scoping bug that returns nothing passes every
 * "cannot see the other user" assertion while breaking the feature. Only then
 * is the denial asserted — and it is asserted as INVISIBILITY, not as an
 * error: another user's memberships are simply not in the answer.
 *
 * Everything below the controller is real: the real ListOwnMemberships over
 * the real PrismaMembershipRepository against a migrated scratch database, so
 * what is proven is the 0080 self-arm, not a fake.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  withAdapter,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_B2,
  USER_NEW,
} from './fixtures.js';
import { PrismaMembershipRepository } from '../infrastructure/persistence/prisma-membership-repository.js';
import { ListOwnMemberships } from '../application/use-cases/list-own-memberships.js';
import { TenancySelfApiModule } from '../presentation/tenancy-self-api.module.js';
import type { AuthenticatedSelf } from '../presentation/http/principal-source.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'OWN-MEMBERSHIP SURFACE TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_own_memberships`;

// Fixed AFTER seeding: provisionDatabase stamps effective_from with the
// database's now(), so the evaluation instant must sit past it.
const clock = new Clock.Fixed(new Date('2026-12-01T00:00:00.000Z'));
let handle: PrismaHandle;

interface MembershipRow {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly roleHint: string;
  readonly state: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

async function appFor(principal: AuthenticatedSelf | null): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TenancySelfApiModule.register({
        useCases: {
          listOwnMemberships: new ListOwnMemberships(new PrismaMembershipRepository(handle), clock),
        },
        principalSource: { fromRequest: () => principal },
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function listAs(
  principal: AuthenticatedSelf | null,
  url = '/tenancy/memberships',
): Promise<{ statusCode: number; body: { memberships?: MembershipRow[] } & Record<string, unknown> }> {
  const app = await appFor(principal);
  try {
    const response = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url });
    return { statusCode: response.statusCode, body: response.json() };
  } finally {
    await app.close();
  }
}

describe.skipIf(unreachable !== null)('own-membership listing (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    await withAdapter(database, 'superuser', async (adapter) => {
      // A1 belongs to BOTH seeded tenants — the switch-target case the
      // bootstrap surface cannot express from a bound session.
      await adapter.query(
        `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
         VALUES ($1, $2, $3, 'MEMBER', 'ACTIVE', '2026-01-01T00:00:00.000Z')`,
        [
          '2a2a2a2a-0000-4000-8000-000000000001',
          TenantId.toString(TENANT_B),
          UserId.toString(USER_A1),
        ],
      );
      // USER_NEW: a REMOVED row and a window-EXPIRED row — present in the
      // table, absent from the answer.
      await adapter.query(
        `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from, effective_to)
         VALUES ($1, $2, $3, 'MEMBER', 'REMOVED', '2026-01-01T00:00:00.000Z', NULL),
                ($4, $5, $3, 'MEMBER', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
        [
          '2a2a2a2a-0000-4000-8000-000000000002',
          TenantId.toString(TENANT_A),
          UserId.toString(USER_NEW),
          '2a2a2a2a-0000-4000-8000-000000000003',
          TenantId.toString(TENANT_B),
        ],
      );
    });
    handle = buildHandle(database);
  }, 60_000);

  afterAll(async () => {
    await handle?.end();
    await dropDatabase(database);
  });

  it('returns the caller their OWN memberships across tenants — NON-EMPTY first (AZ2)', async () => {
    const { statusCode, body } = await listAs({ userId: USER_A1, sessionId: 'session-a1' });

    expect(statusCode).toBe(200);
    const memberships = body.memberships ?? [];
    // The whole point of the surface: a caller bound to one tenant can still
    // see the other as a switch target.
    expect(memberships).toHaveLength(2);
    expect(memberships.map((row) => row.tenantId).sort()).toEqual(
      [TenantId.toString(TENANT_A), TenantId.toString(TENANT_B)].sort(),
    );
    for (const row of memberships) {
      expect(row.userId).toBe(UserId.toString(USER_A1));
      expect(row.state).toBe('ACTIVE');
    }
  });

  it('serializes EXACTLY the seven declared fields — the response set is closed', async () => {
    const { statusCode, body } = await listAs({ userId: USER_A1, sessionId: 'session-a1' });

    expect(statusCode).toBe(200);
    const memberships = body.memberships ?? [];
    // Non-empty first, as always: an empty list would satisfy a `for` loop of
    // key assertions without ever inspecting a serialized membership.
    expect(memberships).toHaveLength(2);

    // WHY THIS IS ASSERTED AT ALL. `toMembershipResponse` is a hand-written
    // mapper, which is exactly why it is safe today and unguarded tomorrow:
    // one `...membership` spread — the shortest edit a future contributor
    // could make — would widen every membership answer to the whole domain
    // row, and no existing test would notice. Pinning the key set makes that
    // edit a failing test rather than a silent change to what the client
    // contract (packages/api-contracts/openapi/paths/tenancy.yaml) promises.
    for (const row of memberships) {
      expect(Object.keys(row).sort()).toEqual([
        'effectiveFrom',
        'effectiveTo',
        'id',
        'roleHint',
        'state',
        'tenantId',
        'userId',
      ]);
    }

    // And the mapper genuinely DROPS things — the domain membership the
    // repository returns carries more than the response does, so the closed
    // set above is a real narrowing rather than a restatement of the row.
    const domainRows = await new ListOwnMemberships(
      new PrismaMembershipRepository(handle),
      clock,
    ).execute({ userId: USER_A1 });
    expect(domainRows.ok).toBe(true);
    if (!domainRows.ok) return;
    const domainKeys = Object.keys(domainRows.value[0] ?? {});
    expect(domainKeys).toEqual(expect.arrayContaining(['createdAt', 'updatedAt']));
    expect(domainKeys.length).toBeGreaterThan(7);
  });

  it('never carries another user’s memberships — invisibility, not an error', async () => {
    const own = await listAs({ userId: USER_B2, sessionId: 'session-b2' });

    expect(own.statusCode).toBe(200);
    const memberships = own.body.memberships ?? [];
    // Non-empty for B2 as well, so the denial below is about scoping.
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.tenantId).toBe(TenantId.toString(TENANT_B));
    expect(memberships.every((row) => row.userId === UserId.toString(USER_B2))).toBe(true);
    // A1's rows exist and are readable BY A1 (asserted above); they are simply
    // not in B2's answer.
    expect(memberships.some((row) => row.userId === UserId.toString(USER_A1))).toBe(false);
  });

  it('drops non-ACTIVE and window-closed rows: an empty list is a real answer', async () => {
    const { statusCode, body } = await listAs({ userId: USER_NEW, sessionId: 'session-new' });

    expect(statusCode).toBe(200);
    expect(body.memberships).toEqual([]);
  });

  it('ignores identity-shaped request values entirely', async () => {
    // A query string naming another user changes nothing: the controller reads
    // the principal from the injected source and consults no request value.
    const { statusCode, body } = await listAs(
      { userId: USER_B2, sessionId: 'session-b2' },
      `/tenancy/memberships?userId=${UserId.toString(USER_A1)}&tenantId=${TenantId.toString(TENANT_A)}`,
    );

    expect(statusCode).toBe(200);
    const memberships = body.memberships ?? [];
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.userId).toBe(UserId.toString(USER_B2));
  });

  it('answers 401 without an authenticated principal — no anonymous listing', async () => {
    const { statusCode, body } = await listAs(null);

    expect(statusCode).toBe(401);
    expect(body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
