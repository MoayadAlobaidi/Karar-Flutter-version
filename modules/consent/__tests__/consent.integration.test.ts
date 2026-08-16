import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PgError,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { RecordAuditEvent } from '@karar/audit';
import { PostgresAuditWriter } from '@karar/audit/dist/infrastructure/persistence/postgres-audit-writer.js';
import { Uuidv7AuditEventIdSource } from '@karar/audit/dist/infrastructure/persistence/uuidv7-audit-event-id-source.js';
import {
  EntityAuditTrail,
  SetTenantDefaultEntity,
  CreateOperatingEntity,
  type OperatingEntityId,
} from '@karar/operating-entity';
import {
  PrismaEntityAssignmentRepository,
  PrismaOperatingEntityRepository,
} from '@karar/operating-entity/dist/infrastructure/persistence/prisma-repositories.js';
import { Uuidv7IdSource as EntityIdSource } from '@karar/operating-entity/dist/infrastructure/persistence/uuidv7-id-source.js';
import { ResolveEffectiveOperatingEntity } from '@karar/operating-entity';
import { TenantId, UserId } from '@karar/shared-kernel';

import { ConsentAuditTrail } from '../application/audit-trail.js';
import type { ConsentPrincipal } from '../application/ports/consent-grant-repository.js';
import {
  ClassifyDocumentVersion,
  CreateLegalDocument,
  DraftDocumentVersion,
  PublishDocumentVersion,
} from '../application/use-cases/legal-documents.js';
import {
  DeclareProcessingBasisReference,
  RecordReconsentEvaluation,
} from '../application/use-cases/reconsent.js';
import {
  AssertConsentFor,
  GetOwnConsentStatus,
  ListApplicableDocuments,
  RecordOwnAcceptance,
  WithdrawOwnConsent,
} from '../application/use-cases/consent.js';
import { PrismaConsentGrantRepository } from '../infrastructure/persistence/prisma-consent-grant-repository.js';
import { PrismaLegalDocumentRepository } from '../infrastructure/persistence/prisma-legal-document-repository.js';
import {
  PrismaProcessingBasisRepository,
  PrismaReconsentEvaluationRepository,
} from '../infrastructure/persistence/prisma-reconsent-repositories.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { OperatingEntityDirectoryAdapter } from '../infrastructure/operating-entity/operating-entity-directory-adapter.js';
import { JurisdictionRef, PurposeRef } from '../domain/refs.js';
import { AllowAllPolicyService } from './fakes/allow-all-policy-service.js';

// Live-PostgreSQL evidence for the consent module (migrations 0064-0065):
// the versioned grant lifecycle, the immutability triggers, the publication
// rule, the classification matrix end-to-end, entity pinning across
// assignment changes, RLS on the subject tables (asserted on NON-EMPTY
// data), and the allow-list documentation for every deliberately global
// table. Same probe-or-skip pattern as modules/audit.

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
      `CONSENT TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for migrations 0064-0065 and the consent',
      'lifecycle; a skipped run proves nothing. Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/consent test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_consent`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const PURPOSE = 'purpose:ai-processing';
const JURISDICTION = 'jurisdiction:qa';
const operator = { principalRef: `staff:${randomUUID()}`, tenantRef: null };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe.skipIf(unreachable !== null)('consent (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let documents: PrismaLegalDocumentRepository;
  let grants: PrismaConsentGrantRepository;
  let evaluations: PrismaReconsentEvaluationRepository;
  let bases: PrismaProcessingBasisRepository;
  let directory: OperatingEntityDirectoryAdapter;
  let consentAudit: ConsentAuditTrail;
  let setTenantDefault: SetTenantDefaultEntity;

  const policy = new AllowAllPolicyService();
  const ids = new Uuidv7IdSource();

  let entityA: OperatingEntityId;
  let entityB: OperatingEntityId;
  const tenant1 = TenantId.of(randomUUID());
  const tenant2 = TenantId.of(randomUUID());
  const tenant3 = TenantId.of(randomUUID());
  const alice: ConsentPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant1 };
  const bob: ConsentPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant2 };
  const carol: ConsentPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant3 };

  /** Raw SQL under the subject's principal context — for adversarial probes. */
  async function rawAsPrincipal<T extends pg.QueryResultRow>(
    principal: ConsentPrincipal,
    sql: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<T>> {
    return appAdapter.withTransaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
        [principal.tenantId, principal.userId],
      );
      return tx.query<T>(sql, params);
    });
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    const { applied } = await migrateToLatest({ adapter: migratorAdapter });
    expect(applied.map((f) => f.filename)).toEqual(
      expect.arrayContaining(['0064_legal_documents.sql', '0065_consent_grants.sql']),
    );
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    documents = new PrismaLegalDocumentRepository(prismaHandle.client);
    grants = new PrismaConsentGrantRepository(prismaHandle);
    evaluations = new PrismaReconsentEvaluationRepository(prismaHandle.client);
    bases = new PrismaProcessingBasisRepository(prismaHandle.client);

    const recordAuditEvent = new RecordAuditEvent(
      new PostgresAuditWriter(appAdapter),
      new Uuidv7AuditEventIdSource(),
    );
    consentAudit = new ConsentAuditTrail(recordAuditEvent, 'local-test');

    // Seed the entity dimension through the operating-entity module itself.
    const entityRepo = new PrismaOperatingEntityRepository(prismaHandle.client);
    const assignmentRepo = new PrismaEntityAssignmentRepository(prismaHandle.client);
    const entityAudit = new EntityAuditTrail(recordAuditEvent, 'local-test');
    const entityIds = new EntityIdSource();
    const createEntity = new CreateOperatingEntity(entityRepo, policy, entityIds, entityAudit);
    setTenantDefault = new SetTenantDefaultEntity(
      assignmentRepo,
      entityRepo,
      policy,
      entityIds,
      entityAudit,
    );
    directory = new OperatingEntityDirectoryAdapter(
      new ResolveEffectiveOperatingEntity(assignmentRepo),
    );

    const a = await createEntity.execute({
      principal: operator,
      legalName: 'Karar Qatar LLC',
      registrationNumber: 'CR-100',
      registeredJurisdictionRef: JURISDICTION,
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    const b = await createEntity.execute({
      principal: operator,
      legalName: 'Karar Gulf Holding',
      registrationNumber: 'CR-200',
      registeredJurisdictionRef: JURISDICTION,
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    if (!a.ok || !b.ok) throw new Error('entity seed failed');
    entityA = a.value.id;
    entityB = b.value.id;
    const bound = await setTenantDefault.execute({
      principal: operator,
      tenantId: tenant1,
      entityId: entityA,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
    });
    if (!bound.ok) throw new Error('tenant binding seed failed');
  }, 60_000);

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

  let documentId: string;
  let v1: string;

  it('creates a document and drafts an UNCLASSIFIED version', async () => {
    const createDocument = new CreateLegalDocument(documents, policy, ids, consentAudit);
    const created = await createDocument.execute({
      principal: operator,
      entityId: entityA,
      jurisdictionRef: JURISDICTION,
      purposeRefs: [PURPOSE],
      kind: 'PRIVACY_NOTICE',
      now: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    documentId = created.value.id;

    const draft = new DraftDocumentVersion(documents, policy, ids, consentAudit);
    const drafted = await draft.execute({
      principal: operator,
      documentId,
      version: '1.0.0',
      contentHash: 'sha256:v1',
      storageRef: 'store://privacy/v1',
      author: 'author:legal',
      now: NOW,
    });
    expect(drafted.ok).toBe(true);
    if (drafted.ok) {
      v1 = drafted.value.id;
      expect(drafted.value.classification).toBeNull(); // no default, ever
    }
  });

  it('BLOCKS unclassified publication — typed error and CHECK constraint', async () => {
    const publish = new PublishDocumentVersion(documents, policy, consentAudit);
    const blocked = await publish.execute({ principal: operator, versionId: v1, now: NOW });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.kind).toBe('UNCLASSIFIED_PUBLICATION_BLOCKED');
    }
    // Bypassing the use case cannot cheat: the schema refuses the shape.
    const direct = await appAdapter
      .query(`UPDATE legal_document_versions SET effective_at = now() WHERE id = $1`, [v1])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(direct).toBeInstanceOf(PgError);
    expect((direct as PgError).sqlState).toBe('23514'); // check_violation
  });

  it('classifies (explicit reviewer + reason) and publishes; published versions are immutable', async () => {
    const classify = new ClassifyDocumentVersion(documents, policy, consentAudit);
    const classified = await classify.execute({
      principal: operator,
      versionId: v1,
      classification: 'NO_USER_ACTION_REQUIRED',
      reviewer: 'reviewer:counsel',
      reason: 'initial publication',
      now: NOW,
    });
    expect(classified.ok).toBe(true);

    const publish = new PublishDocumentVersion(documents, policy, consentAudit);
    const published = await publish.execute({
      principal: operator,
      versionId: v1,
      effectiveAt: new Date('2026-02-01T00:00:00Z'),
      now: NOW,
    });
    expect(published.ok).toBe(true);

    // Immutable after publication: trigger for direct SQL, typed error for the use case.
    const edit = await appAdapter
      .query(`UPDATE legal_document_versions SET reason = 'edited' WHERE id = $1`, [v1])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(edit).toBeInstanceOf(PgError);
    expect((edit as PgError).message).toContain('published and immutable');

    const reclassify = await classify.execute({
      principal: operator,
      versionId: v1,
      classification: 'MATERIAL_REACCEPTANCE_REQUIRED',
      reviewer: 'reviewer:counsel',
      reason: 'attempting to reclassify a published version',
      now: NOW,
    });
    expect(reclassify.ok).toBe(false);
    if (!reclassify.ok) {
      expect(reclassify.error.kind).toBe('VERSION_IMMUTABLE');
    }
  });

  let grantId: string;

  it('records OWN acceptance: a grant pinned to (entity, purpose, jurisdiction) and the exact version', async () => {
    const accept = new RecordOwnAcceptance(grants, documents, directory, ids, consentAudit);
    const accepted = await accept.execute({
      principal: alice,
      legalDocumentVersionId: v1,
      purposeRef: PURPOSE,
      evidenceReference: 'request:test-accept-1',
      policyPin: { policyPackVersion: 'zz-test/v1', subjectPolicySelectionVersion: null },
      now: NOW,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    grantId = accepted.value.id;
    expect(accepted.value.operatingEntityId).toBe(entityA);
    expect(accepted.value.jurisdictionRef).toBe(JURISDICTION);
    expect(accepted.value.consentVersion).toBe('1.0.0');
    expect(accepted.value.status).toBe('ACTIVE');

    const listApplicable = new ListApplicableDocuments(documents, directory);
    const applicable = await listApplicable.execute({ principal: alice, now: NOW });
    expect(applicable.ok).toBe(true);
    if (applicable.ok) {
      expect(applicable.value).toHaveLength(1);
      expect(applicable.value[0]?.effectiveVersion?.id).toBe(v1);
    }
  });

  it('RLS: the owner sees non-empty data; a cross-tenant principal sees and changes nothing', async () => {
    // Own-tenant, own-user: NON-EMPTY — an empty pass proves nothing.
    const own = await grants.listGrants(alice);
    expect(own.length).toBeGreaterThan(0);
    const ownRaw = await rawAsPrincipal(alice, `SELECT id FROM consent_grants`);
    expect(ownRaw.rowCount).toBeGreaterThan(0);

    // Cross-tenant reads: empty, and the specific row invisible.
    const crossList = await grants.listGrants(bob);
    expect(crossList).toHaveLength(0);
    expect(await grants.findById(bob, grantId)).toBeNull();
    const crossRaw = await rawAsPrincipal(bob, `SELECT id FROM consent_grants`);
    expect(crossRaw.rowCount).toBe(0);

    // Cross-tenant UPDATE: matches nothing.
    const crossUpdate = await rawAsPrincipal(
      bob,
      `UPDATE consent_grants SET status = 'WITHDRAWN', withdrawn_at = now() WHERE id = $1`,
      [grantId],
    );
    expect(crossUpdate.rowCount).toBe(0);

    // Cross-tenant withdrawal through the use case: NOT_FOUND, nothing changed.
    const withdraw = new WithdrawOwnConsent(grants, consentAudit);
    const denied = await withdraw.execute({ principal: bob, grantId, now: NOW });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.kind).toBe('NOT_FOUND');
    }
    // No principal context at all: fail closed.
    const noContext = await appAdapter.query(`SELECT id FROM consent_grants`);
    expect(noContext.rowCount).toBe(0);
    // The grant survived every attempt, intact.
    expect((await grants.findById(alice, grantId))?.status).toBe('ACTIVE');
  });

  it('withdrawal preserves the row; re-granting creates a NEW row', async () => {
    const withdraw = new WithdrawOwnConsent(grants, consentAudit);
    const withdrawn = await withdraw.execute({ principal: alice, grantId, now: NOW });
    expect(withdrawn.ok).toBe(true);

    const status = new GetOwnConsentStatus(grants, documents, directory);
    const afterWithdraw = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(afterWithdraw.ok).toBe(true);
    if (afterWithdraw.ok) {
      expect(afterWithdraw.value.state).toBe('WITHDRAWN');
    }
    const assert = new AssertConsentFor(status);
    const deniedProcessing = await assert.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(deniedProcessing.ok).toBe(false);
    if (!deniedProcessing.ok) {
      expect(deniedProcessing.error.kind).toBe('CONSENT_REQUIRED');
    }

    // The withdrawn row is preserved, not erased or reused.
    const rows = await grants.listGrants(alice);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: grantId, status: 'WITHDRAWN' });
    expect(rows[0]?.withdrawnAt).not.toBeNull();

    // Withdrawing again is refused: the transition happened once.
    const again = await withdraw.execute({ principal: alice, grantId, now: NOW });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.kind).toBe('GRANT_NOT_ACTIVE');
    }

    // Re-grant: a NEW row; the withdrawn row stays exactly as it was.
    const accept = new RecordOwnAcceptance(grants, documents, directory, ids, consentAudit);
    const reGranted = await accept.execute({
      principal: alice,
      legalDocumentVersionId: v1,
      purposeRef: PURPOSE,
      evidenceReference: 'request:test-accept-2',
      policyPin: { policyPackVersion: 'zz-test/v1', subjectPolicySelectionVersion: null },
      now: NOW,
    });
    expect(reGranted.ok).toBe(true);
    const after = await grants.listGrants(alice);
    expect(after).toHaveLength(2);
    expect(after.map((g) => g.status).sort()).toEqual(['ACTIVE', 'WITHDRAWN']);
    const reActive = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(reActive.ok && reActive.value.state === 'ACTIVE').toBe(true);
  });

  it('accepting again while ACTIVE supersedes the prior grant atomically', async () => {
    const accept = new RecordOwnAcceptance(grants, documents, directory, ids, consentAudit);
    const again = await accept.execute({
      principal: alice,
      legalDocumentVersionId: v1,
      purposeRef: PURPOSE,
      evidenceReference: 'request:test-accept-3',
      policyPin: { policyPackVersion: 'zz-test/v1', subjectPolicySelectionVersion: null },
      now: NOW,
    });
    expect(again.ok).toBe(true);
    const rows = await grants.listGrants(alice);
    expect(rows.map((g) => g.status).sort()).toEqual(['ACTIVE', 'SUPERSEDED', 'WITHDRAWN']);
  });

  it('grant content is immutable: trigger refuses edits and deletion at every level', async () => {
    const active = (await grants.listGrants(alice)).find((g) => g.status === 'ACTIVE');
    expect(active).toBeDefined();
    // Content edit under the owner's own principal context: trigger raises.
    const edit = await rawAsPrincipal(
      alice,
      `UPDATE consent_grants SET purpose_ref = 'purpose:other' WHERE id = $1`,
      [active?.id],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(edit).toBeInstanceOf(PgError);
    expect((edit as PgError).message).toContain('immutable');
    // WITHDRAWN -> ACTIVE reversal: refused.
    const reverse = await rawAsPrincipal(
      alice,
      `UPDATE consent_grants SET status = 'ACTIVE', withdrawn_at = NULL WHERE id = $1`,
      [grantId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(reverse).toBeInstanceOf(PgError);
    // DELETE: revoked grants for the app role (42501)…
    const appDelete = await appAdapter.query(`DELETE FROM consent_grants`).then(
      () => null,
      (error: unknown) => error,
    );
    expect((appDelete as PgError).sqlState).toBe('42501');
    // …and the trigger even for a superuser, which bypasses RLS.
    const superDelete = await superuserAdapter
      .query(`DELETE FROM consent_grants WHERE id = $1`, [grantId])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superDelete as PgError).sqlState).toBe('P0001');
  });

  it('classification matrix: NO_ACTION leaves status unchanged; NOTICE flags; MATERIAL fails closed', async () => {
    const draft = new DraftDocumentVersion(documents, policy, ids, consentAudit);
    const classify = new ClassifyDocumentVersion(documents, policy, consentAudit);
    const publish = new PublishDocumentVersion(documents, policy, consentAudit);
    const status = new GetOwnConsentStatus(grants, documents, directory);
    const assert = new AssertConsentFor(status);

    async function republish(
      version: string,
      classification:
        | 'MATERIAL_REACCEPTANCE_REQUIRED'
        | 'NOTICE_REQUIRED'
        | 'NO_USER_ACTION_REQUIRED',
      effectiveAt: Date,
    ): Promise<string> {
      const drafted = await draft.execute({
        principal: operator,
        documentId,
        version,
        contentHash: `sha256:${version}`,
        storageRef: `store://privacy/${version}`,
        author: 'author:legal',
        now: NOW,
      });
      if (!drafted.ok) throw new Error('draft failed');
      const classified = await classify.execute({
        principal: operator,
        versionId: drafted.value.id,
        classification,
        reviewer: 'reviewer:counsel',
        reason: `republication ${version}`,
        now: NOW,
      });
      if (!classified.ok) throw new Error('classify failed');
      const published = await publish.execute({
        principal: operator,
        versionId: drafted.value.id,
        effectiveAt,
        now: NOW,
      });
      if (!published.ok) throw new Error('publish failed');
      return drafted.value.id;
    }

    // NO_USER_ACTION_REQUIRED: nothing changes.
    await republish('2.0.0', 'NO_USER_ACTION_REQUIRED', new Date('2026-03-01T00:00:00Z'));
    const afterNoAction = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(afterNoAction.ok).toBe(true);
    if (afterNoAction.ok) {
      expect(afterNoAction.value).toMatchObject({ state: 'ACTIVE', noticeRequired: false });
    }

    // NOTICE_REQUIRED: the acceptance stands, with the notice flag set.
    await republish('3.0.0', 'NOTICE_REQUIRED', new Date('2026-04-01T00:00:00Z'));
    const afterNotice = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(afterNotice.ok).toBe(true);
    if (afterNotice.ok) {
      expect(afterNotice.value).toMatchObject({ state: 'ACTIVE', noticeRequired: true });
    }
    expect((await assert.execute({ principal: alice, purposeRef: PURPOSE, now: NOW })).ok).toBe(
      true,
    );

    // MATERIAL_REACCEPTANCE_REQUIRED: outstanding re-consent fails closed.
    const v4 = await republish(
      '4.0.0',
      'MATERIAL_REACCEPTANCE_REQUIRED',
      new Date('2026-05-01T00:00:00Z'),
    );
    const afterMaterial = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(afterMaterial.ok).toBe(true);
    if (afterMaterial.ok) {
      expect(afterMaterial.value.state).toBe('RECONSENT_REQUIRED');
      expect(afterMaterial.value.effectiveVersionId).toBe(v4);
    }
    const denied = await assert.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toMatchObject({ kind: 'CONSENT_REQUIRED', state: 'RECONSENT_REQUIRED' });
    }

    // Re-accepting the material version restores processing.
    const accept = new RecordOwnAcceptance(grants, documents, directory, ids, consentAudit);
    const reAccepted = await accept.execute({
      principal: alice,
      legalDocumentVersionId: v4,
      purposeRef: PURPOSE,
      evidenceReference: 'request:test-accept-4',
      policyPin: { policyPackVersion: 'zz-test/v1', subjectPolicySelectionVersion: null },
      now: NOW,
    });
    expect(reAccepted.ok).toBe(true);
    const restored = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(restored.ok && restored.value.state === 'ACTIVE').toBe(true);
    expect((await assert.execute({ principal: alice, purposeRef: PURPOSE, now: NOW })).ok).toBe(
      true,
    );
  });

  it('records re-consent evaluations that MATCH the version classification, append-only', async () => {
    const versionRows = await appAdapter.query<{ id: string }>(
      `SELECT id FROM legal_document_versions WHERE version = '4.0.0'`,
    );
    const v4 = versionRows.rows[0]?.id as string;
    const record = new RecordReconsentEvaluation(evaluations, documents, policy, ids, consentAudit);

    const mismatch = await record.execute({
      principal: operator,
      legalDocumentVersionId: v4,
      purposeRef: PURPOSE,
      evaluation: 'NO_USER_ACTION_REQUIRED',
      affectedQueryNotes: 'grants pinned to older versions of this document',
      now: NOW,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.kind).toBe('EVALUATION_MISMATCH');
    }

    const recorded = await record.execute({
      principal: operator,
      legalDocumentVersionId: v4,
      purposeRef: PURPOSE,
      evaluation: 'MATERIAL_REACCEPTANCE_REQUIRED',
      affectedQueryNotes:
        'SELECT user_id FROM consent_grants WHERE legal_document_version_id IN (older versions) AND status = ACTIVE',
      now: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    // Append-only: revoked grants first (42501 for karar_app)…
    const appEdit = await appAdapter
      .query(`UPDATE reconsent_evaluations SET evaluation = 'NOTICE_REQUIRED' WHERE id = $1`, [
        recorded.value.id,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((appEdit as PgError).sqlState).toBe('42501');
    // …trigger second, even for a superuser.
    const superEdit = await superuserAdapter
      .query(`UPDATE reconsent_evaluations SET evaluation = 'NOTICE_REQUIRED' WHERE id = $1`, [
        recorded.value.id,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superEdit as PgError).sqlState).toBe('P0001');
  });

  it('entity pinning survives an assignment change — and resolution honours the new entity', async () => {
    const status = new GetOwnConsentStatus(grants, documents, directory);
    const before = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(before.ok && before.value.state === 'ACTIVE').toBe(true);

    // The tenant's forward binding moves to entity B…
    const rebound = await setTenantDefault.execute({
      principal: operator,
      tenantId: tenant1,
      entityId: entityB,
      effectiveFrom: new Date('2026-06-01T00:00:00Z'),
      now: NOW,
    });
    expect(rebound.ok).toBe(true);

    // …but every existing grant keeps its original pinned entity.
    const pinned = await rawAsPrincipal<{ operating_entity_id: string }>(
      alice,
      `SELECT DISTINCT operating_entity_id FROM consent_grants`,
    );
    expect(pinned.rowCount).toBeGreaterThan(0);
    expect(pinned.rows.every((row) => row.operating_entity_id === entityA)).toBe(true);

    // Resolution against the NEW entity finds no consent: consent given to
    // Entity A is not automatically valid for Entity B (ADR-0024).
    const after = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.operatingEntityId).toBe(entityB);
      expect(after.value.state).toBe('NO_GRANT');
    }
    const assert = new AssertConsentFor(status);
    const denied = await assert.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(denied.ok).toBe(false);

    // Restoring the binding restores resolution — the grants never moved.
    const restored = await setTenantDefault.execute({
      principal: operator,
      tenantId: tenant1,
      entityId: entityA,
      effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      now: NOW,
    });
    expect(restored.ok).toBe(true);
    const back = await status.execute({ principal: alice, purposeRef: PURPOSE, now: NOW });
    expect(back.ok && back.value.state === 'ACTIVE').toBe(true);
  });

  it('fails closed when no operating entity is bound for the principal', async () => {
    const accept = new RecordOwnAcceptance(grants, documents, directory, ids, consentAudit);
    const refused = await accept.execute({
      principal: carol,
      legalDocumentVersionId: v1,
      purposeRef: PURPOSE,
      evidenceReference: 'request:test-carol-1',
      policyPin: { policyPackVersion: 'zz-test/v1', subjectPolicySelectionVersion: null },
      now: NOW,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('NO_EFFECTIVE_ENTITY');
    }
  });

  it('declares processing-basis references as typed references (upsert, no conclusions)', async () => {
    const declare = new DeclareProcessingBasisReference(bases, policy, ids, consentAudit);
    const declared = await declare.execute({
      principal: operator,
      purposeRef: PURPOSE,
      jurisdictionRef: JURISDICTION,
      basisRef: 'basis:consent',
      now: NOW,
    });
    expect(declared.ok).toBe(true);
    const found = await bases.find(PurposeRef.of(PURPOSE), JurisdictionRef.of(JURISDICTION));
    expect(found?.basisRef).toBe('basis:consent');
    const redeclared = await declare.execute({
      principal: operator,
      purposeRef: PURPOSE,
      jurisdictionRef: JURISDICTION,
      basisRef: 'basis:contract-performance',
      now: NOW,
    });
    expect(redeclared.ok).toBe(true);
    const updated = await bases.find(PurposeRef.of(PURPOSE), JurisdictionRef.of(JURISDICTION));
    expect(updated?.basisRef).toBe('basis:contract-performance');
  });

  it('RLS posture: subject tables FORCEd; every deliberately global table is on the allow-list with a reason', async () => {
    const posture = await appAdapter.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname IN (
            'operating_entities', 'entity_jurisdiction_permissions', 'entity_licences',
            'data_protection_role_assignments', 'operating_entity_assignments',
            'entity_migrations', 'legal_documents', 'legal_document_versions',
            'consent_grants', 'reconsent_evaluations', 'processing_basis_references'
          )`,
    );
    const byName = new Map(posture.rows.map((row) => [row.relname, row]));
    expect(byName.size).toBe(11);

    // The subject table: RLS enabled AND forced.
    expect(byName.get('consent_grants')).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    // consent_grants carries a real policy, not enabled-without-policy.
    const policies = await appAdapter.query(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_grants'`,
    );
    expect(policies.rowCount).toBeGreaterThan(0);

    // Every table deliberately NOT under RLS is documented on the allow-list
    // with the fields the review requires.
    const allowList = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'packages/platform/db/rls-allow-list.json'), 'utf8'),
    ) as Array<{
      table: string;
      reason: string;
      owner: string;
      compensatingGrants: string;
      reviewPhase: string;
    }>;
    const allowListed = new Map(allowList.map((entry) => [entry.table, entry]));
    for (const [name, row] of byName) {
      if (row.relrowsecurity) {
        expect(allowListed.has(`public.${name}`)).toBe(false);
        continue;
      }
      const entry = allowListed.get(`public.${name}`);
      expect(entry, `public.${name} must be on the RLS allow-list with a reason`).toBeDefined();
      for (const field of ['reason', 'owner', 'compensatingGrants', 'reviewPhase'] as const) {
        expect((entry?.[field] ?? '').length, `${name}.${field} must be stated`).toBeGreaterThan(0);
      }
    }
  });

  it('every consent state change left an audit record', async () => {
    const audited = await appAdapter.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit.audit_events WHERE action LIKE 'consent.%' ORDER BY action`,
    );
    expect(audited.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'consent.document.created',
        'consent.document_version.drafted',
        'consent.document_version.classified',
        'consent.document_version.published',
        'consent.grant.recorded',
        'consent.grant.withdrawn',
        'consent.reconsent.evaluated',
        'consent.processing_basis.declared',
      ]),
    );
  });
});
