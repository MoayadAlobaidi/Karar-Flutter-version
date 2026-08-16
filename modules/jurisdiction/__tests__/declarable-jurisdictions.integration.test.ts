/**
 * GET /jurisdiction/declarable-references against live PostgreSQL — the
 * evidence that the chooser a client renders agrees with what the declaration
 * accepts, and that the register's governance record stays inside the
 * platform.
 *
 * Asserted in this order, deliberately: the real seeded register comes back
 * NON-EMPTY first (a listing that returns nothing satisfies every exclusion
 * assertion while leaving the screen exactly as unusable as before), then the
 * exclusions, then the field set, then the agreement with the write path.
 *
 * The scratch database carries synthetic entries a reviewed migration would
 * never seed — a retired regime, two outside their effective window, one on a
 * retired country — because the seeded register contains no such case and an
 * exclusion nothing exercises is an exclusion nobody has tested.
 */

import { randomUUID } from 'node:crypto';

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { RecordAuditEvent } from '@karar/audit';
import { PostgresAuditWriter } from '@karar/audit/dist/infrastructure/persistence/postgres-audit-writer.js';
import { Uuidv7AuditEventIdSource } from '@karar/audit/dist/infrastructure/persistence/uuidv7-audit-event-id-source.js';
import { TenantId, UserId } from '@karar/shared-kernel';

import { JurisdictionAuditTrail } from '../application/audit-trail.js';
import { DeclareOwnJurisdiction } from '../application/use-cases/self-declaration.js';
import { ListDeclarableJurisdictions } from '../application/use-cases/declarable-jurisdictions.js';
import { PrismaUserJurisdictionAssignmentRepository } from '../infrastructure/persistence/prisma-assignment-repositories.js';
import { PrismaJurisdictionDirectory } from '../infrastructure/persistence/prisma-configuration-repositories.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { JurisdictionApiModule } from '../presentation/jurisdiction-api.module.js';
import type { JurisdictionPrincipal } from '../presentation/http/principal-source.js';

const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<string | null> {
  const client = new pg.Client({
    host: superuserMaintenanceProfile.host,
    port: superuserMaintenanceProfile.port,
    database: superuserMaintenanceProfile.database,
    user: superuserMaintenanceProfile.user,
    password: superuserMaintenanceProfile.password.unwrap(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    return error instanceof Error ? error.message : String(error);
  }
}

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `DECLARABLE-REFERENCE TESTS SKIPPED — PostgreSQL is not reachable at ${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_declarable`;
const NOW = new Date('2026-08-16T12:00:00.000Z');

/** The safe field set, exactly. Anything else in a row is a leak. */
const SAFE_KEYS = [
  'approvalRecorded',
  'code',
  'countryCode',
  'countryDisplayNameKey',
  'jurisdictionId',
  'type',
];

interface ReferenceRow {
  readonly jurisdictionId: string;
  readonly code: string;
  readonly countryCode: string;
  readonly countryDisplayNameKey: string;
  readonly type: string;
  readonly approvalRecorded: boolean;
}

describe.skipIf(unreachable !== null)('declarable jurisdiction references (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;

  const tenant = TenantId.of(randomUUID());
  const subject = { userId: UserId.of(randomUUID()), tenantId: tenant };
  const principal: JurisdictionPrincipal = { userId: subject.userId, tenantId: tenant };

  async function get(url: string, as: JurisdictionPrincipal | null = principal) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JurisdictionApiModule.register({
          useCases: {
            declareOwnJurisdiction: new DeclareOwnJurisdiction(
              new PrismaUserJurisdictionAssignmentRepository(prismaHandle),
              new PrismaJurisdictionDirectory(prismaHandle.client),
              new Uuidv7IdSource(),
              new JurisdictionAuditTrail(
                new RecordAuditEvent(
                  new PostgresAuditWriter(appAdapter),
                  new Uuidv7AuditEventIdSource(),
                ),
                'local-test',
              ),
            ),
            listDeclarableJurisdictions: new ListDeclarableJurisdictions(
              new PrismaJurisdictionDirectory(prismaHandle.client),
            ),
          },
          principalSource: { fromRequest: () => as },
          clock: { now: () => NOW },
        }),
      ],
    }).compile();
    const instance = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    try {
      return await instance.getHttpAdapter().getInstance().inject({ method: 'GET', url });
    } finally {
      await instance.close();
    }
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    await migrateToLatest({ adapter: migratorAdapter });
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    // Synthetic register rows, inserted as the MIGRATOR because the registers
    // are SELECT-only for karar_app — the application cannot write them, here
    // or in production.
    await migratorAdapter.query(
      `INSERT INTO public.countries (code, display_name_key, default_currency, status, updated_at)
       VALUES ('ZQ', 'country.zq', 'QAR', 'RETIRED', now())`,
    );
    await migratorAdapter.query(
      `INSERT INTO public.jurisdictions
         (code, country_code, type, status, review_status, effective_from, effective_to, provenance, updated_at)
       VALUES
         ('ZZ-RETIRED', 'QA', 'SPECIAL_REGIME', 'RETIRED', 'REVIEW_COMPLETE', NULL, NULL,
          'synthetic retired regime — test databases only', now()),
         ('ZZ-FUTURE', 'QA', 'SPECIAL_REGIME', 'DRAFT', 'NOT_SUBMITTED', '2027-01-01T00:00:00Z', NULL,
          'synthetic not-yet-effective regime — test databases only', now()),
         ('ZZ-CLOSED', 'QA', 'SPECIAL_REGIME', 'DRAFT', 'NOT_SUBMITTED',
          '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z',
          'synthetic window-closed regime — test databases only', now()),
         ('ZQ-NAT', 'ZQ', 'NATIONAL', 'DRAFT', 'NOT_SUBMITTED', NULL, NULL,
          'synthetic regime on a retired country — test databases only', now())`,
    );
  }, 60_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  it('lists the seeded register entries — NON-EMPTY first', async () => {
    const response = await get('/jurisdiction/declarable-references');

    expect(response.statusCode).toBe(200);
    const references = (response.json() as { references: ReferenceRow[] }).references;
    expect(references.length).toBeGreaterThanOrEqual(3);
    // The seeded set: QA and the AE pair that keeps country != jurisdiction honest.
    expect(references.map((row) => row.jurisdictionId)).toEqual(
      expect.arrayContaining(['QA', 'AE', 'AE-DIFC']),
    );
    const difc = references.find((row) => row.jurisdictionId === 'AE-DIFC');
    expect(difc).toMatchObject({
      code: 'AE-DIFC',
      countryCode: 'AE',
      countryDisplayNameKey: 'country.ae',
      type: 'FINANCIAL_FREE_ZONE',
    });
  });

  it('offers no retired, not-yet-effective, window-closed, or retired-country entry', async () => {
    const response = await get('/jurisdiction/declarable-references');
    const offered = (response.json() as { references: ReferenceRow[] }).references.map(
      (row) => row.jurisdictionId,
    );

    expect(offered).not.toContain('ZZ-RETIRED');
    expect(offered).not.toContain('ZZ-FUTURE');
    expect(offered).not.toContain('ZZ-CLOSED');
    expect(offered).not.toContain('ZQ-NAT');
  });

  it('claims no approval, and never has one to claim', async () => {
    const response = await get('/jurisdiction/declarable-references');
    const references = (response.json() as { references: ReferenceRow[] }).references;

    // No seeded entry is APPROVED — approval is a legal decision no migration
    // takes — and the response says so on every row rather than staying silent.
    expect(references.every((row) => row.approvalRecorded === false)).toBe(true);
  });

  it('exposes the safe field set only — no provenance, review state, or window', async () => {
    const response = await get('/jurisdiction/declarable-references');
    const references = (response.json() as { references: Record<string, unknown>[] }).references;

    for (const row of references) {
      expect(Object.keys(row).sort()).toEqual(SAFE_KEYS);
    }
    // Belt and braces on the raw bytes: the register's governance record —
    // provenance prose, lifecycle stage, review status, reviewed window —
    // never crosses the edge, however the shape is later refactored.
    const raw = response.body;
    for (const leaked of [
      'provenance',
      'reviewStatus',
      'review_status',
      'PENDING_LEGAL_REVIEW',
      'NOT_SUBMITTED',
      'DRAFT',
      'effectiveFrom',
      'effectiveTo',
    ]) {
      expect(raw).not.toContain(leaked);
    }
  });

  it('agrees with the write path: a listed entry is declarable, a retired one is refused', async () => {
    const listed = await get('/jurisdiction/declarable-references');
    const references = (listed.json() as { references: ReferenceRow[] }).references;
    const first = references[0];
    if (first === undefined) throw new Error('expected at least one declarable reference');

    const declare = new DeclareOwnJurisdiction(
      new PrismaUserJurisdictionAssignmentRepository(prismaHandle),
      new PrismaJurisdictionDirectory(prismaHandle.client),
      new Uuidv7IdSource(),
      new JurisdictionAuditTrail(
        new RecordAuditEvent(new PostgresAuditWriter(appAdapter), new Uuidv7AuditEventIdSource()),
        'local-test',
      ),
    );

    const accepted = await declare.execute({
      principal: subject,
      jurisdictionCode: first.jurisdictionId,
      now: NOW,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('a listed reference must be declarable');
    // Declarable is not approved: what it records stays UNVERIFIED.
    expect(String(accepted.value.assignment.verificationStatus)).toBe('UNVERIFIED');

    const refused = await declare.execute({
      principal: subject,
      jurisdictionCode: 'ZZ-RETIRED',
      now: NOW,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('a retired entry must never be declarable');
    expect(refused.error.kind).toBe('DECLARATION_NOT_PERMITTED');
  });

  it('answers 401 without an authenticated principal', async () => {
    const response = await get('/jurisdiction/declarable-references', null);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });
});
