/**
 * Evidence that a developer can walk the WHOLE consent sequence on a local
 * stack — read the document, then accept the version they read — and that
 * nothing about making that possible reaches a deployed environment.
 *
 * The gap this closes: the catalogue stores a `storage_ref` and no bytes, and
 * the only shipped content source retrieves nothing, so
 * `GET /consent/documents/{id}/content` answered 409 NOT_RETRIEVABLE for every
 * document and the read-then-accept path could not be exercised at all.
 * `LocalSeedContentSource` supplies the bytes for the ONE version
 * `scripts/db/seed-local-consent.mjs` publishes, and refuses to exist anywhere
 * but local/test.
 *
 * Everything here is real: the real seed script runs against a migrated scratch
 * database, the real repository reads it, the real use case chooses the version
 * in force and hashes what the source returned, and the real controller maps
 * the result. Nothing is doubled — including the content source, which is the
 * point of the suite.
 *
 * The four properties that must hold together, or the fixture is a hole:
 *   1. the seeded text is served, and it hash-verifies against the published
 *      version rather than being trusted;
 *   2. content that is not what the version pinned is refused, with none of it
 *      served;
 *   3. the local source cannot be constructed outside local/test, and a
 *      deployed selection still gets the honest absence for the SAME document;
 *   4. an acceptance recorded against the served version is pinned to exactly
 *      that version — reading and accepting name one thing.
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

import { ConsentAuditTrail } from '../application/audit-trail.js';
import type { ConsentPrincipal } from '../application/ports/consent-grant-repository.js';
import type { LegalDocumentContentSource } from '../application/ports/legal-document-content-source.js';
import { RecordOwnAcceptance } from '../application/use-cases/consent.js';
import { GetLegalDocumentContent } from '../application/use-cases/legal-document-content.js';
import {
  ClassifyDocumentVersion,
  CreateLegalDocument,
  DraftDocumentVersion,
  PublishDocumentVersion,
} from '../application/use-cases/legal-documents.js';
import {
  LOCAL_SEED_CONTENT,
  LOCAL_SEED_STORAGE_REF,
  LocalSeedContentSource,
  legalDocumentContentSourceFor,
} from '../infrastructure/content/local-seed-content-source.js';
import { NoContentSourceConfigured } from '../infrastructure/content/no-content-source-configured.js';
import { OperatingEntityDirectoryAdapter } from '../infrastructure/operating-entity/operating-entity-directory-adapter.js';
import { PrismaConsentGrantRepository } from '../infrastructure/persistence/prisma-consent-grant-repository.js';
import { PrismaLegalDocumentRepository } from '../infrastructure/persistence/prisma-legal-document-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { Sha256ContentDigest } from '../infrastructure/providers/sha256-content-digest.js';
import { ConsentDocumentContentController } from '../presentation/document-content.controller.js';
import { AllowAllPolicyService } from './fakes/allow-all-policy-service.js';

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
      'LOCAL-CONTENT TESTS SKIPPED — PostgreSQL is not reachable at ' +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence that the local document text is served, that it is',
      'hash-verified rather than trusted, and that no deployed environment can serve it.',
      'Start the database:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  POSTGRES_PORT=5433 KARAR_ENV=local pnpm --filter @karar/consent test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_local_content`;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts', 'db', 'seed-local-consent.mjs');
const NOW = new Date('2026-08-16T12:00:00.000Z');
const PURPOSE = 'purpose:ai-processing';

/** The ids the seed pins, restated so a silent rename fails the suite. */
const SYNTHETIC_USER = '00000000-0000-4000-8000-534545445531';
const SYNTHETIC_ENTITY = '00000000-0000-4000-8000-534545444531';
const SYNTHETIC_DOCUMENT = '00000000-0000-4000-8000-534545444431';
const SYNTHETIC_VERSION = '00000000-0000-4000-8000-534545445631';

/**
 * The hash the seed pins, computed here from the served constant by the same
 * rule the use case applies. Written out rather than imported from the seed so
 * a change to either side has to survive this comparison.
 */
const EXPECTED_HASH = createHash('sha256').update(LOCAL_SEED_CONTENT.content, 'utf8').digest('hex');

/** Deployed environments, named so the refusal cases are not one lucky string. */
const DEPLOYED_ENVIRONMENTS = ['dev', 'staging', 'production'];

describe.skipIf(unreachable !== null)('local seed document content (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let documents: PrismaLegalDocumentRepository;
  let directory: OperatingEntityDirectoryAdapter;
  let consentAudit: ConsentAuditTrail;
  let principal: ConsentPrincipal;

  const policy = new AllowAllPolicyService();
  const ids = new Uuidv7IdSource();
  const operator = { principalRef: `staff:${randomUUID()}`, tenantRef: null };

  /** Same entity as the seeded document, so both are applicable to the caller. */
  let tamperedDocumentId = '';
  let elsewhereDocumentId = '';

  /**
   * The real controller over the real use case, repository, and database. The
   * reply double captures what would go on the wire, so leak assertions inspect
   * the SERIALIZED body rather than an object the serializer might still change.
   */
  async function readContent(
    documentId: string,
    source: LegalDocumentContentSource,
  ): Promise<{ statusCode: number; raw: string; body: Record<string, unknown> }> {
    const controller = new ConsentDocumentContentController({
      getLegalDocumentContent: new GetLegalDocumentContent(
        documents,
        directory,
        source,
        new Sha256ContentDigest(),
      ),
    });
    let statusCode = 0;
    let sent: unknown = null;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(payload: unknown) {
        sent = payload;
        return payload;
      },
    };
    // The composition root's guard attaches `principal` from the SESSION row;
    // the test attaches the same key, so the controller reads a principal it
    // never took from the request payload.
    const request = {
      principal: { userId: String(principal.userId), tenantId: String(principal.tenantId) },
    };
    await controller.readContent(request, documentId, reply);
    return { statusCode, raw: JSON.stringify(sent), body: (sent ?? {}) as Record<string, unknown> };
  }

  /** Publishes one probe version through the module's own lifecycle use cases. */
  async function publishProbe(
    kind: string,
    contentHash: string,
    storageRef: string,
  ): Promise<string> {
    const created = await new CreateLegalDocument(documents, policy, ids, consentAudit).execute({
      principal: operator,
      entityId: SYNTHETIC_ENTITY,
      jurisdictionRef: 'QA',
      purposeRefs: [PURPOSE],
      kind,
      now: NOW,
    });
    if (!created.ok) throw new Error(`probe document ${kind} failed`);
    const drafted = await new DraftDocumentVersion(documents, policy, ids, consentAudit).execute({
      principal: operator,
      documentId: created.value.id,
      version: 'probe/v1',
      contentHash,
      storageRef,
      author: 'author:test',
      now: NOW,
    });
    if (!drafted.ok) throw new Error(`probe version ${kind} failed`);
    const classified = await new ClassifyDocumentVersion(documents, policy, consentAudit).execute({
      principal: operator,
      versionId: drafted.value.id,
      classification: 'MATERIAL_REACCEPTANCE_REQUIRED',
      reviewer: 'reviewer:test',
      reason: 'synthetic probe; no legal review has taken place',
      now: NOW,
    });
    if (!classified.ok) throw new Error(`probe classification ${kind} failed`);
    const published = await new PublishDocumentVersion(documents, policy, consentAudit).execute({
      principal: operator,
      versionId: drafted.value.id,
      effectiveAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
    });
    if (!published.ok) throw new Error(`probe publication ${kind} failed`);
    return created.value.id;
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
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    // The REAL seed, as a child process — no in-test re-implementation of the
    // rows whose hash this suite is about to verify.
    execFileSync(process.execPath, [SEED_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, KARAR_DB_NAME: database, KARAR_ENV: 'local' },
    });

    documents = new PrismaLegalDocumentRepository(prismaHandle.client);
    const recordAuditEvent = new RecordAuditEvent(
      new PostgresAuditWriter(appAdapter),
      new Uuidv7AuditEventIdSource(),
    );
    consentAudit = new ConsentAuditTrail(recordAuditEvent, 'local-test');
    directory = new OperatingEntityDirectoryAdapter(
      new ResolveEffectiveOperatingEntity(
        new PrismaEntityAssignmentRepository(prismaHandle.client),
      ),
    );
    principal = {
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

    // A version that names the fixture's locator but pins a DIFFERENT text. The
    // source will hand over the fixture bytes; the use case must notice they
    // are not what this version published. Constructed this way because a
    // published row's content_hash is immutable by trigger (0064) — the
    // mismatch has to be created honestly, not edited in afterwards.
    tamperedDocumentId = await publishProbe(
      'LOCAL_SEED_TAMPER_PROBE',
      createHash('sha256').update(`${LOCAL_SEED_CONTENT.content} (tampered)`, 'utf8').digest('hex'),
      LOCAL_SEED_STORAGE_REF,
    );
    // A version whose bytes live somewhere this source does not reach, pinning
    // the fixture's own hash. If the source answered by hash, or answered for
    // everything, this would wrongly serve.
    elsewhereDocumentId = await publishProbe(
      'LOCAL_SEED_ELSEWHERE_PROBE',
      EXPECTED_HASH,
      'store://elsewhere/notice/v1',
    );
  }, 180_000);

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
    it('refuses to construct in any deployed environment', () => {
      for (const environment of DEPLOYED_ENVIRONMENTS) {
        expect(() => new LocalSeedContentSource(environment)).toThrow(
          /refusing to construct in environment/,
        );
      }
      expect(() => new LocalSeedContentSource('local')).not.toThrow();
      expect(() => new LocalSeedContentSource('test')).not.toThrow();
    });

    it('refuses an UNSTATED environment rather than defaulting to local', () => {
      // The seed refuses an unset KARAR_ENV for the same reason: a missing
      // value must never widen what may be written, or served.
      expect(() => new LocalSeedContentSource(undefined)).toThrow(/\(unstated\)/);
      expect(() => new LocalSeedContentSource('')).toThrow(/refusing to construct/);
    });

    it('hands every deployed environment the source that honestly has nothing', () => {
      for (const environment of DEPLOYED_ENVIRONMENTS) {
        expect(legalDocumentContentSourceFor(environment)).toBeInstanceOf(
          NoContentSourceConfigured,
        );
      }
      expect(legalDocumentContentSourceFor(undefined)).toBeInstanceOf(NoContentSourceConfigured);
      expect(legalDocumentContentSourceFor('local')).toBeInstanceOf(LocalSeedContentSource);
      expect(legalDocumentContentSourceFor('test')).toBeInstanceOf(LocalSeedContentSource);
    });

    it('answers the SEEDED document with an honest absence when deployed', async () => {
      // The same document, the same database, the same route — only the
      // environment differs. This is the property a deployed environment
      // depends on: making local work changed nothing for it.
      for (const environment of DEPLOYED_ENVIRONMENTS) {
        const { statusCode, raw, body } = await readContent(
          SYNTHETIC_DOCUMENT,
          legalDocumentContentSourceFor(environment),
        );

        expect(statusCode).toBe(409);
        expect(body).toMatchObject({
          code: 'DOCUMENT_CONTENT_UNAVAILABLE',
          reason: 'NOT_RETRIEVABLE',
        });
        // Not one byte of the synthetic notice, and no locator either.
        expect(raw).not.toContain('SYNTHETIC LOCAL FIXTURE');
        expect(raw).not.toContain(LOCAL_SEED_STORAGE_REF);
      }
    });
  });

  describe('serving the seeded document', () => {
    it('serves the seeded text with its language, hash-verified, and no locator', async () => {
      const { statusCode, raw, body } = await readContent(
        SYNTHETIC_DOCUMENT,
        legalDocumentContentSourceFor('local'),
      );

      expect(statusCode).toBe(200);
      expect(body).toMatchObject({
        documentId: SYNTHETIC_DOCUMENT,
        versionId: SYNTHETIC_VERSION,
        version: 'local-seed/v1',
        contentHash: EXPECTED_HASH,
        language: 'en',
        format: 'text/plain',
        content: LOCAL_SEED_CONTENT.content,
      });
      // The text says what it is. A reader — or a screenshot of one — cannot be
      // mistaken for a reviewed disclosure.
      expect(String(body.content)).toContain('SYNTHETIC LOCAL FIXTURE');
      expect(String(body.content)).toContain('has not been reviewed by counsel');
      // The internal locator stays inside, exactly as it does for every source.
      expect(Object.keys(body)).not.toContain('storageRef');
      expect(raw).not.toContain(LOCAL_SEED_STORAGE_REF);
      expect(raw).not.toContain('local-seed://');
    });

    it('served the hash the DATABASE pinned, not one the source asserted', async () => {
      // The check is real only if the two were computed independently: the seed
      // hashed the constant into an immutable column, and the use case hashed
      // what the source returned. This asserts they meet.
      const pinned = await superuserAdapter.query(
        `SELECT content_hash, storage_ref FROM public.legal_document_versions WHERE id = $1`,
        [SYNTHETIC_VERSION],
      );
      expect(pinned.rows[0]?.content_hash).toBe(EXPECTED_HASH);
      expect(pinned.rows[0]?.storage_ref).toBe(LOCAL_SEED_STORAGE_REF);

      const { body } = await readContent(
        SYNTHETIC_DOCUMENT,
        legalDocumentContentSourceFor('local'),
      );
      expect(body.contentHash).toBe(pinned.rows[0]?.content_hash);
      expect(createHash('sha256').update(String(body.content), 'utf8').digest('hex')).toBe(
        pinned.rows[0]?.content_hash,
      );
    });

    it('refuses content that is not what the published version pinned', async () => {
      const { statusCode, raw, body } = await readContent(
        tamperedDocumentId,
        legalDocumentContentSourceFor('local'),
      );

      // 503, not 409: retrievable content that is not the published content is
      // a platform fault. Nothing of the unverified text is served.
      expect(statusCode).toBe(503);
      expect(body).toMatchObject({ code: 'DOCUMENT_CONTENT_UNVERIFIABLE' });
      expect(raw).not.toContain('SYNTHETIC LOCAL FIXTURE');
    });

    it('holds ONE version’s bytes and answers nothing for any other', async () => {
      // Keyed on the storage reference, not on the hash and not on "always".
      // A source that answered for every version would show one document's text
      // under another document's identity.
      const { statusCode, raw, body } = await readContent(
        elsewhereDocumentId,
        legalDocumentContentSourceFor('local'),
      );

      expect(statusCode).toBe(409);
      expect(body).toMatchObject({
        code: 'DOCUMENT_CONTENT_UNAVAILABLE',
        reason: 'NOT_RETRIEVABLE',
      });
      expect(raw).not.toContain('SYNTHETIC LOCAL FIXTURE');
    });
  });

  describe('accepting the version that was read', () => {
    it('records a fully pinned grant for exactly the version whose text was served', async () => {
      // Step 1 — read, as a subject would.
      const read = await readContent(SYNTHETIC_DOCUMENT, legalDocumentContentSourceFor('local'));
      expect(read.statusCode).toBe(200);
      const versionId = String(read.body.versionId);

      // Step 2 — the provenance pin, derived exactly as the composition root's
      // JurisdictionConsentPinSource derives it. Supplied, never bypassed: the
      // acceptance path still refuses when this cannot be resolved.
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
          [SYNTHETIC_USER],
        )
      ).rows[0];
      expect(pinRow?.pack_version).toBe('qa/v1');

      // Step 3 — accept the version just read, through the real use case.
      const recordAcceptance = new RecordOwnAcceptance(
        new PrismaConsentGrantRepository(prismaHandle),
        documents,
        directory,
        ids,
        consentAudit,
      );
      const accepted = await recordAcceptance.execute({
        principal,
        legalDocumentVersionId: versionId,
        purposeRef: PURPOSE,
        evidenceReference: 'test:local-seed-content',
        policyPin: {
          policyPackVersion: String(pinRow?.pack_version),
          subjectPolicySelectionVersion: null,
        },
        now: NOW,
      });
      expect(accepted.ok, JSON.stringify(accepted.ok ? {} : accepted.error)).toBe(true);
      if (!accepted.ok) throw new Error('expected the acceptance to be recorded');

      // Read and accept named ONE thing: the grant pins the version whose text
      // the subject was shown, and the version string travels with it.
      const row = (
        await superuserAdapter.query(
          `SELECT g.user_id, g.operating_entity_id, g.jurisdiction_ref, g.purpose_ref,
                  g.consent_version, g.legal_document_version_id, g.status,
                  g.policy_pack_version, g.policy_pack_pin_state,
                  g.subject_policy_selection_pin_state, v.content_hash
             FROM public.consent_grants g
             JOIN public.legal_document_versions v ON v.id = g.legal_document_version_id
            WHERE g.id = $1`,
          [accepted.value.id],
        )
      ).rows[0];

      expect(row).toMatchObject({
        user_id: SYNTHETIC_USER,
        operating_entity_id: SYNTHETIC_ENTITY,
        jurisdiction_ref: 'QA',
        purpose_ref: PURPOSE,
        legal_document_version_id: versionId,
        consent_version: 'local-seed/v1',
        status: 'ACTIVE',
        policy_pack_version: 'qa/v1',
        policy_pack_pin_state: 'PINNED',
        subject_policy_selection_pin_state: 'NOT_APPLICABLE',
      });
      expect(row?.content_hash).toBe(read.body.contentHash);
      expect(versionId).toBe(SYNTHETIC_VERSION);
    }, 60_000);
  });
});
