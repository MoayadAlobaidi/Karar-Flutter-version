/**
 * GET /consent/documents/{documentId}/content against live PostgreSQL — the
 * evidence that a subject can READ what they are being asked to accept, that
 * what they read is what was published, and that the platform's internal
 * storage locator never reaches them.
 *
 * The catalogue is real: documents and versions are created, classified, and
 * published through the module's own use cases against a migrated scratch
 * database, and the effective version is chosen by the same repository read
 * the acceptance path uses. Only the CONTENT SOURCE is a double, because this
 * phase ships none that holds anything — which is itself asserted, in the
 * "nothing retrievable" case below.
 *
 * The fixture text is a synthetic string that says on its face that it is not
 * a legal document. Nothing here drafts, approves, or implies legal wording.
 */

import { createHash, randomUUID } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dropScratchDatabase,
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
import {
  CreateOperatingEntity,
  EntityAuditTrail,
  ResolveEffectiveOperatingEntity,
  SetTenantDefaultEntity,
  type OperatingEntityId,
} from '@karar/operating-entity';
import {
  PrismaEntityAssignmentRepository,
  PrismaOperatingEntityRepository,
} from '@karar/operating-entity/dist/infrastructure/persistence/prisma-repositories.js';
import { TenantId, UserId } from '@karar/shared-kernel';

import { ConsentAuditTrail } from '../application/audit-trail.js';
import {
  ClassifyDocumentVersion,
  CreateLegalDocument,
  DraftDocumentVersion,
  PublishDocumentVersion,
} from '../application/use-cases/legal-documents.js';
import { GetLegalDocumentContent } from '../application/use-cases/legal-document-content.js';
import type {
  LegalDocumentContent,
  LegalDocumentContentSource,
} from '../application/ports/legal-document-content-source.js';
import type { LegalDocumentVersion } from '../domain/legal-document.js';
import { PrismaLegalDocumentRepository } from '../infrastructure/persistence/prisma-legal-document-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { OperatingEntityDirectoryAdapter } from '../infrastructure/operating-entity/operating-entity-directory-adapter.js';
import { NoContentSourceConfigured } from '../infrastructure/content/no-content-source-configured.js';
import { Sha256ContentDigest } from '../infrastructure/providers/sha256-content-digest.js';
import { ConsentDocumentContentController } from '../presentation/document-content.controller.js';
import { AllowAllPolicyService } from './fakes/allow-all-policy-service.js';
import { skipUnlessDatabaseRequired } from '@karar/platform/dist/db/index.js';

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
skipUnlessDatabaseRequired('consent legal document content suite', unreachable);
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `DOCUMENT-CONTENT TESTS SKIPPED — PostgreSQL is not reachable at ${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_doc_content`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const PURPOSE = 'purpose:ai-processing';
const JURISDICTION = 'jurisdiction:qa';
const STORAGE_REF = 'store://synthetic/notice/v1';
const operator = { principalRef: `staff:${randomUUID()}`, tenantRef: null };

const FIXTURE_TEXT =
  'SYNTHETIC TEST FIXTURE. This is not a legal document, has not been reviewed by counsel or ' +
  'any regulator, and has no legal effect. It exists so the document-content path can be ' +
  'exercised against a local database.';
const FIXTURE_HASH = createHash('sha256').update(FIXTURE_TEXT, 'utf8').digest('hex');

/** A source that holds exactly one version's bytes. */
class FixtureContentSource implements LegalDocumentContentSource {
  constructor(private readonly content: LegalDocumentContent | null) {}
  fetch(version: LegalDocumentVersion): Promise<LegalDocumentContent | null> {
    void version;
    return Promise.resolve(this.content);
  }
}

describe.skipIf(unreachable !== null)('legal-document content (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;

  let documents: PrismaLegalDocumentRepository;
  let directory: OperatingEntityDirectoryAdapter;
  let consentAudit: ConsentAuditTrail;

  const policy = new AllowAllPolicyService();
  const ids = new Uuidv7IdSource();

  const tenant = TenantId.of(randomUUID());
  const subject = { userId: UserId.of(randomUUID()), tenantId: tenant };

  let entityA: OperatingEntityId;
  let entityB: OperatingEntityId;
  /** Entity A, published version whose bytes hash to FIXTURE_HASH. */
  let publishedDocumentId = '';
  /** Entity A, drafted but never published — nothing is in force. */
  let unpublishedDocumentId = '';
  /** Entity B — applicable to nobody in this tenant. */
  let foreignDocumentId = '';

  /**
   * The real controller over the real use case, repository, and database. The
   * reply double captures exactly what would go on the wire, so the leak
   * assertions inspect the SERIALIZED body rather than an object the
   * serializer might still change.
   */
  async function readContent(
    documentId: string,
    source: LegalDocumentContentSource,
    principal: { userId: string; tenantId: string } | null = {
      userId: String(subject.userId),
      tenantId: String(subject.tenantId),
    },
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
    // The composition root's enrichment guard attaches `principal` from the
    // SESSION row; the test attaches the same key, so the controller reads a
    // principal it never took from the request payload.
    const request = principal === null ? {} : { principal };
    try {
      await controller.readContent(request, documentId, reply);
    } catch (error) {
      // NestJS HTTP exceptions are the controller's other answer channel.
      const status = (error as { getStatus?: () => number }).getStatus?.();
      if (status === undefined) throw error;
      const response = (error as { getResponse: () => unknown }).getResponse();
      return {
        statusCode: status,
        raw: JSON.stringify(response),
        body: (typeof response === 'object' && response !== null
          ? (response as Record<string, unknown>)
          : { message: response }) as Record<string, unknown>,
      };
    }
    return {
      statusCode,
      raw: JSON.stringify(sent),
      body: (sent ?? {}) as Record<string, unknown>,
    };
  }

  async function publishDocument(
    entityId: OperatingEntityId,
    kind: string,
    options: { publish: boolean },
  ): Promise<string> {
    const created = await new CreateLegalDocument(documents, policy, ids, consentAudit).execute({
      principal: operator,
      entityId,
      jurisdictionRef: JURISDICTION,
      purposeRefs: [PURPOSE],
      kind,
      now: NOW,
    });
    if (!created.ok) throw new Error('document seed failed');
    const drafted = await new DraftDocumentVersion(documents, policy, ids, consentAudit).execute({
      principal: operator,
      documentId: created.value.id,
      version: '1.0.0',
      contentHash: FIXTURE_HASH,
      storageRef: STORAGE_REF,
      author: 'author:test',
      now: NOW,
    });
    if (!drafted.ok) throw new Error('version seed failed');
    if (options.publish) {
      const classified = await new ClassifyDocumentVersion(documents, policy, consentAudit).execute(
        {
          principal: operator,
          versionId: drafted.value.id,
          classification: 'MATERIAL_REACCEPTANCE_REQUIRED',
          reviewer: 'reviewer:test',
          reason: 'synthetic fixture; no legal review has taken place',
          now: NOW,
        },
      );
      if (!classified.ok) throw new Error('classification seed failed');
      const published = await new PublishDocumentVersion(documents, policy, consentAudit).execute({
        principal: operator,
        versionId: drafted.value.id,
        effectiveAt: new Date('2026-01-01T00:00:00Z'),
        now: NOW,
      });
      if (!published.ok) throw new Error('publication seed failed');
    }
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
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    documents = new PrismaLegalDocumentRepository(prismaHandle.client);
    const recordAuditEvent = new RecordAuditEvent(
      new PostgresAuditWriter(appAdapter),
      new Uuidv7AuditEventIdSource(),
    );
    consentAudit = new ConsentAuditTrail(recordAuditEvent, 'local-test');

    const entityRepo = new PrismaOperatingEntityRepository(prismaHandle.client);
    const assignmentRepo = new PrismaEntityAssignmentRepository(prismaHandle.client);
    const entityAudit = new EntityAuditTrail(recordAuditEvent, 'local-test');
    const createEntity = new CreateOperatingEntity(entityRepo, policy, ids, entityAudit);
    directory = new OperatingEntityDirectoryAdapter(
      new ResolveEffectiveOperatingEntity(assignmentRepo),
    );

    const a = await createEntity.execute({
      principal: operator,
      legalName: 'Karar Qatar LLC (synthetic)',
      registrationNumber: 'CR-900',
      registeredJurisdictionRef: JURISDICTION,
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    const b = await createEntity.execute({
      principal: operator,
      legalName: 'Karar Gulf Holding (synthetic)',
      registrationNumber: 'CR-901',
      registeredJurisdictionRef: JURISDICTION,
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    if (!a.ok || !b.ok) throw new Error('entity seed failed');
    entityA = a.value.id;
    entityB = b.value.id;
    const bound = await new SetTenantDefaultEntity(
      assignmentRepo,
      entityRepo,
      policy,
      ids,
      entityAudit,
    ).execute({
      principal: operator,
      tenantId: tenant,
      entityId: entityA,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
    });
    if (!bound.ok) throw new Error('tenant binding seed failed');

    publishedDocumentId = await publishDocument(entityA, 'PRIVACY_NOTICE', { publish: true });
    unpublishedDocumentId = await publishDocument(entityA, 'TERMS_OF_SERVICE', { publish: false });
    foreignDocumentId = await publishDocument(entityB, 'PRIVACY_NOTICE', { publish: true });
  }, 60_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, database);
    } finally {
      await maintenance.end();
    }
  });

  it('serves server-supplied content with its language, and no internal locator', async () => {
    const { statusCode, raw, body } = await readContent(
      publishedDocumentId,
      new FixtureContentSource({ language: 'en', format: 'text/plain', content: FIXTURE_TEXT }),
    );

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({
      documentId: publishedDocumentId,
      version: '1.0.0',
      contentHash: FIXTURE_HASH,
      language: 'en',
      format: 'text/plain',
      content: FIXTURE_TEXT,
    });
    // The content is the platform's, byte for byte — the client composes none
    // of it and receives no instruction to.
    expect(body.content).toBe(FIXTURE_TEXT);
    // The locator that names where the platform keeps its bytes stays inside.
    expect(Object.keys(body as Record<string, unknown>)).not.toContain('storageRef');
    expect(raw).not.toContain('storageRef');
    expect(raw).not.toContain(STORAGE_REF);
    expect(raw).not.toContain('store://');
  });

  it('refuses content that is not what the published version pinned', async () => {
    const { statusCode, raw, body } = await readContent(
      publishedDocumentId,
      new FixtureContentSource({
        language: 'en',
        format: 'text/plain',
        content: `${FIXTURE_TEXT} (tampered)`,
      }),
    );

    expect(statusCode).toBe(503);
    expect(body).toMatchObject({ code: 'DOCUMENT_CONTENT_UNVERIFIABLE' });
    // Nothing of the unverified text is served, not even as a sample.
    expect(raw).not.toContain('tampered');
  });

  it('refuses content whose language the source will not state', async () => {
    const { statusCode, body } = await readContent(
      publishedDocumentId,
      new FixtureContentSource({ language: '  ', format: 'text/plain', content: FIXTURE_TEXT }),
    );

    expect(statusCode).toBe(409);
    expect(body).toMatchObject({
      code: 'DOCUMENT_CONTENT_UNAVAILABLE',
      reason: 'LANGUAGE_NOT_STATED',
    });
  });

  it('reports an honest absence when nothing is retrievable — the shipped source', async () => {
    // NoContentSourceConfigured is what the composition root binds this phase:
    // no document store exists, so the endpoint says so and substitutes
    // nothing. A client showing its own unavailable state is the correct
    // outcome; inventing wording would not be.
    const { statusCode, raw, body } = await readContent(
      publishedDocumentId,
      new NoContentSourceConfigured(),
    );

    expect(statusCode).toBe(409);
    expect(body).toMatchObject({
      code: 'DOCUMENT_CONTENT_UNAVAILABLE',
      reason: 'NOT_RETRIEVABLE',
    });
    expect(raw).not.toContain('store://');
  });

  it('reports NO_EFFECTIVE_VERSION when nothing is published to display', async () => {
    const { statusCode, body } = await readContent(
      unpublishedDocumentId,
      new FixtureContentSource({ language: 'en', format: 'text/plain', content: FIXTURE_TEXT }),
    );

    expect(statusCode).toBe(409);
    expect(body).toMatchObject({
      code: 'DOCUMENT_CONTENT_UNAVAILABLE',
      reason: 'NO_EFFECTIVE_VERSION',
    });
  });

  it('answers another entity’s document exactly as it answers an unknown one', async () => {
    const source = new FixtureContentSource({
      language: 'en',
      format: 'text/plain',
      content: FIXTURE_TEXT,
    });
    const foreign = await readContent(foreignDocumentId, source);
    const unknown = await readContent(randomUUID(), source);

    expect(foreign.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    // Indistinguishable on purpose: the route is not an oracle for which
    // documents exist outside the caller's own entity scope.
    expect(foreign.body).toEqual(unknown.body);
    expect(String(entityB).length).toBeGreaterThan(0);
    expect(foreign.raw).not.toContain(String(entityB));
  });

  it('answers 401 without an authenticated principal', async () => {
    const { statusCode } = await readContent(
      publishedDocumentId,
      new FixtureContentSource({ language: 'en', format: 'text/plain', content: FIXTURE_TEXT }),
      null,
    );

    expect(statusCode).toBe(new UnauthorizedException().getStatus());
    expect(statusCode).toBe(401);
  });
});
