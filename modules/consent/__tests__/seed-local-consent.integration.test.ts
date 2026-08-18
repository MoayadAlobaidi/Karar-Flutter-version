/**
 * Evidence for `scripts/db/seed-local-consent.mjs`: the seed makes consent
 * acceptance REACHABLE on a fresh local database, and refuses to run anywhere
 * else.
 *
 * The gap this closes is a DATA gap, not a code gap. `POST /consent/acceptances`
 * answers 503 for every caller on a fresh database because the acceptance pins
 * its provenance from (a) the subject's effective jurisdiction assignment and
 * (b) the PolicyPack activation for that jurisdiction in this environment, and
 * neither has a runtime write path — both permissions are deliberately
 * unseeded. This suite runs the real script against a scratch database and then
 * records a real acceptance through the real use case, with the pin derived
 * exactly as the composition root's pin source derives it.
 *
 * What it also proves the seed does NOT do: no consent grant is written by the
 * seed, qa/v1 is not marked approved, the QA register entry keeps its
 * unapproved status, the activation is scoped to `local`, and the synthetic
 * account has no password credential.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
import { ResolveEffectiveOperatingEntity } from '@karar/operating-entity';
import { PrismaEntityAssignmentRepository } from '@karar/operating-entity/dist/infrastructure/persistence/prisma-repositories.js';
import { TenantId, UserId } from '@karar/shared-kernel';

import { LOCAL_SEED_VERSION, LOCAL_SEED_VERSION_ID } from '@karar/consent-local-fixtures';

import { ConsentAuditTrail } from '../application/audit-trail.js';
import type { ConsentPrincipal } from '../application/ports/consent-grant-repository.js';
import { RecordOwnAcceptance } from '../application/use-cases/consent.js';
import { PrismaConsentGrantRepository } from '../infrastructure/persistence/prisma-consent-grant-repository.js';
import { PrismaLegalDocumentRepository } from '../infrastructure/persistence/prisma-legal-document-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { OperatingEntityDirectoryAdapter } from '../infrastructure/operating-entity/operating-entity-directory-adapter.js';

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
      `SEED TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence that consent acceptance is reachable locally',
      'and that the seed refuses non-local environments. Start the database:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  POSTGRES_PORT=5433 pnpm --filter @karar/consent test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_seed`;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts', 'db', 'seed-local-consent.mjs');
const NOW = new Date('2026-08-16T12:00:00.000Z');
const PURPOSE = 'purpose:ai-processing';

/**
 * The ids the seed pins. The subject and entity are restated here so a silent
 * rename fails the suite; the VERSION comes from the fixture package the seed
 * itself reads, because a copy of it typed out here would be compiled into
 * this module's `dist/` and would break the absence `production-closure.test.ts`
 * proves. What the restatement used to catch is caught below anyway — the row
 * this suite reads back is the one the REAL seed wrote.
 */
const SYNTHETIC_USER = '00000000-0000-4000-8000-534545445531';
const SYNTHETIC_ENTITY = '00000000-0000-4000-8000-534545444531';
const SYNTHETIC_VERSION = LOCAL_SEED_VERSION_ID;

interface SeedRun {
  readonly ok: boolean;
  readonly output: string;
}

/** Runs the real script as a child process — no in-test re-implementation. */
function runSeed(env: Record<string, string | undefined>): SeedRun {
  try {
    const output = execFileSync(process.execPath, [SEED_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, KARAR_DB_NAME: database, ...env },
    });
    return { ok: true, output };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`,
    };
  }
}

describe.skipIf(unreachable !== null)('seed-local-consent (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    const { applied } = await migrateToLatest({ adapter: migratorAdapter });
    expect(applied.map((f) => f.filename)).toEqual(
      expect.arrayContaining([
        '0064_legal_documents.sql',
        '0065_consent_grants.sql',
        '0071_jurisdictions.sql',
        '0072_user_jurisdiction_assignments.sql',
        '0075_policy_pack_activations.sql',
      ]),
    );
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));
  }, 120_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  describe('the environment gate', () => {
    it('refuses a non-local environment and writes nothing', async () => {
      const run = runSeed({ KARAR_ENV: 'staging' });

      expect(run.ok).toBe(false);
      expect(run.output).toContain('refusing to run with KARAR_ENV=staging');
      const written = await superuserAdapter.query(
        `SELECT count(*)::int AS n FROM public.policy_pack_activations`,
      );
      expect(written.rows[0]?.n).toBe(0);
    }, 60_000);

    it('refuses an UNSET environment rather than defaulting to local', async () => {
      const run = runSeed({ KARAR_ENV: undefined });

      expect(run.ok).toBe(false);
      expect(run.output).toContain('refusing to run with KARAR_ENV=(unset)');
      const written = await superuserAdapter.query(
        `SELECT count(*)::int AS n FROM public.user_jurisdiction_assignments`,
      );
      expect(written.rows[0]?.n).toBe(0);
    }, 60_000);
  });

  describe('running the seed', () => {
    it('creates the full fixture, and a second run changes nothing (idempotent)', async () => {
      const first = runSeed({ KARAR_ENV: 'local' });
      expect(first.ok, first.output).toBe(true);

      const snapshot = async () =>
        (
          await superuserAdapter.query(
            `SELECT
               (SELECT count(*) FROM public.tenants)                            AS tenants,
               (SELECT count(*) FROM public.identity_accounts)                  AS accounts,
               (SELECT count(*) FROM public.tenant_members)                     AS members,
               (SELECT count(*) FROM public.operating_entities)                 AS entities,
               (SELECT count(*) FROM public.operating_entity_assignments)       AS bindings,
               (SELECT count(*) FROM public.user_jurisdiction_assignments)      AS user_jur,
               (SELECT count(*) FROM public.tenant_jurisdiction_assignments)    AS tenant_jur,
               (SELECT count(*) FROM public.policy_pack_activations)            AS activations,
               (SELECT count(*) FROM public.legal_documents)                    AS documents,
               (SELECT count(*) FROM public.legal_document_versions)            AS versions,
               (SELECT count(*) FROM public.consent_grants)                     AS grants`,
          )
        ).rows[0];

      const afterFirst = await snapshot();
      // Every row the acceptance path needs, and no grant.
      expect(afterFirst).toMatchObject({
        tenants: '1',
        accounts: '1',
        members: '1',
        entities: '1',
        bindings: '1',
        user_jur: '1',
        tenant_jur: '1',
        activations: '1',
        documents: '1',
        versions: '1',
        grants: '0',
      });

      const second = runSeed({ KARAR_ENV: 'local' });
      expect(second.ok, second.output).toBe(true);
      expect(second.output).toContain('already present');
      expect(await snapshot()).toEqual(afterFirst);
    }, 120_000);

    it('approves nothing: qa/v1 stays DRAFT, the register stays unapproved, the activation is LOCAL', async () => {
      const activation = await superuserAdapter.query(
        `SELECT pack_version, pack_lifecycle_at_activation, environment, action
           FROM public.policy_pack_activations`,
      );
      expect(activation.rows[0]).toMatchObject({
        pack_version: 'qa/v1',
        pack_lifecycle_at_activation: 'DRAFT',
        environment: 'local',
        action: 'ACTIVATED',
      });

      const register = await superuserAdapter.query(
        `SELECT status, review_status FROM public.jurisdictions WHERE code = 'QA'`,
      );
      // Untouched by the seed: engineering approves no legal regime.
      expect(register.rows[0]).toMatchObject({
        status: 'DRAFT',
        review_status: 'PENDING_LEGAL_REVIEW',
      });

      // No licence evidence and no credential were manufactured.
      const licences = await superuserAdapter.query(
        `SELECT count(*)::int AS n FROM public.entity_licences`,
      );
      expect(licences.rows[0]?.n).toBe(0);
      const credentials = await superuserAdapter.query(
        `SELECT count(*)::int AS n FROM public.password_credentials`,
      );
      expect(credentials.rows[0]?.n).toBe(0);
    });

    it('leaves the subject UNVERIFIED — no capability is widened by a seeded assignment', async () => {
      const assignment = await superuserAdapter.query(
        `SELECT jurisdiction_code, source, verification_status
           FROM public.user_jurisdiction_assignments WHERE user_id = $1`,
        [SYNTHETIC_USER],
      );
      expect(assignment.rows[0]).toMatchObject({
        jurisdiction_code: 'QA',
        source: 'OPERATOR_ASSIGNED',
        verification_status: 'UNVERIFIED',
      });
    });
  });

  describe('consent acceptance against the seeded fixture', () => {
    it('records a FULLY PINNED grant through the real use case', async () => {
      const principal: ConsentPrincipal = {
        tenantId: TenantId.of(
          String(
            (
              await superuserAdapter.query(
                `SELECT tenant_id FROM public.tenant_members WHERE user_id = $1`,
                [SYNTHETIC_USER],
              )
            ).rows[0]?.tenant_id,
          ),
        ),
        userId: UserId.of(SYNTHETIC_USER),
      };

      // The pin, derived exactly as JurisdictionConsentPinSource derives it:
      // the subject's effective (open) assignment, then the pack version whose
      // latest ledger event for that jurisdiction + environment is ACTIVATED.
      const pinRow = (
        await superuserAdapter.query(
          `SELECT a.jurisdiction_code,
                  (SELECT p.pack_version
                     FROM public.policy_pack_activations p
                    WHERE p.jurisdiction_code = a.jurisdiction_code
                      AND p.environment = 'local'
                      AND p.action = 'ACTIVATED'
                    ORDER BY p.occurred_at DESC
                    LIMIT 1) AS pack_version
             FROM public.user_jurisdiction_assignments a
            WHERE a.user_id = $1 AND a.effective_to IS NULL`,
          [principal.userId],
        )
      ).rows[0];
      // Before the seed there was no assignment and no activation, so this
      // resolution produced null and the acceptance refused. It resolves now.
      expect(pinRow?.jurisdiction_code).toBe('QA');
      expect(pinRow?.pack_version).toBe('qa/v1');

      const recordAuditEvent = new RecordAuditEvent(
        new PostgresAuditWriter(appAdapter),
        new Uuidv7AuditEventIdSource(),
      );
      const recordAcceptance = new RecordOwnAcceptance(
        new PrismaConsentGrantRepository(prismaHandle),
        new PrismaLegalDocumentRepository(prismaHandle.client),
        new OperatingEntityDirectoryAdapter(
          new ResolveEffectiveOperatingEntity(
            new PrismaEntityAssignmentRepository(prismaHandle.client),
          ),
        ),
        new Uuidv7IdSource(),
        new ConsentAuditTrail(recordAuditEvent, 'local-test'),
      );

      const accepted = await recordAcceptance.execute({
        principal,
        legalDocumentVersionId: SYNTHETIC_VERSION,
        purposeRef: PURPOSE,
        evidenceReference: 'test:seed-local-consent',
        policyPin: {
          policyPackVersion: String(pinRow?.pack_version),
          subjectPolicySelectionVersion: null,
        },
        now: NOW,
      });

      expect(accepted.ok, JSON.stringify(accepted.ok ? {} : accepted.error)).toBe(true);
      if (!accepted.ok) throw new Error('expected the acceptance to be recorded');

      // Every pin the design requires, present on the persisted row — the seed
      // made the act possible without removing or weakening a single one.
      const row = (
        await superuserAdapter.query(
          `SELECT user_id, tenant_id, operating_entity_id, jurisdiction_ref, purpose_ref,
                  consent_version, legal_document_version_id, status, evidence_reference,
                  policy_pack_version, policy_pack_pin_state,
                  subject_policy_selection_version, subject_policy_selection_pin_state
             FROM public.consent_grants WHERE id = $1`,
          [accepted.value.id],
        )
      ).rows[0];

      expect(row).toMatchObject({
        user_id: SYNTHETIC_USER,
        tenant_id: String(principal.tenantId),
        operating_entity_id: SYNTHETIC_ENTITY,
        jurisdiction_ref: 'QA',
        purpose_ref: PURPOSE,
        legal_document_version_id: SYNTHETIC_VERSION,
        status: 'ACTIVE',
        policy_pack_version: 'qa/v1',
        policy_pack_pin_state: 'PINNED',
        // No capability declares elective options, so there is no selection to
        // pin — recorded as the declared case, never as an unexplained NULL.
        subject_policy_selection_version: null,
        subject_policy_selection_pin_state: 'NOT_APPLICABLE',
      });
      expect(row?.evidence_reference).not.toBe('');
      expect(row?.consent_version).toBe(LOCAL_SEED_VERSION);
    }, 60_000);
  });
});
