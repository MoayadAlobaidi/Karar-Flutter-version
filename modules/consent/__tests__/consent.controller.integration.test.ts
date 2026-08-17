/**
 * The §49 subject-facing endpoints as a CLIENT would receive them —
 * ConsentController over live PostgreSQL, reached through the very module the
 * composition root mounts (ConsentApiModule).
 *
 * WHY THIS SUITE EXISTS. Three of the controller's safety properties were
 * stated in prose and guarded by nothing executable:
 *
 *   1. the listing must not carry `storageRef`. The use case genuinely HOLDS
 *      that value (asserted below, so this is not a test of an absent field);
 *      the controller simply declines to copy it. One added spread would ship
 *      the platform's internal storage locator to every subject.
 *   2. acceptance must REFUSE when policy provenance is unresolved. A stored
 *      grant cannot be unpinned — the schema sees to that — but "the schema
 *      would have rejected it" is not the same guarantee as "the endpoint
 *      never tried". This suite drives the refusal and then proves the only
 *      thing standing between refusal and success was the pin.
 *   3. `evidenceReference` is derived from the REQUEST IDENTITY, never from
 *      client input. Evidence a subject can dictate is not evidence.
 *
 * Everything below the controller is real: real use cases over the real
 * Prisma repositories against a migrated scratch database, with the document
 * catalogue built through the module's own publication lifecycle. Only the
 * two seams the composition root owns are doubles — the PolicyService (the
 * RBAC workstream's) and the policy-pin resolver (the jurisdiction
 * workstream's) — and the pin resolver is a double precisely so its answer,
 * including its refusal, can be chosen by the test.
 *
 * The consent module depends on @nestjs/common alone, so the controller is
 * constructed directly rather than through a NestJS runtime. The module's
 * wiring contract is asserted on the DynamicModule descriptor it returns, and
 * the controller under test is then built FROM that descriptor's provider —
 * so what answers the requests is what the composition root would receive.
 *
 * Fixture text and identifiers are synthetic; nothing here drafts, approves,
 * or implies legal wording.
 */

import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
import {
  GetOwnConsentStatus,
  ListApplicableDocuments,
  RecordOwnAcceptance,
  WithdrawOwnConsent,
} from '../application/use-cases/consent.js';
import type { ConsentPolicyPin } from '../domain/consent-grant.js';
import type {
  ConsentPolicyPinRequest,
  ConsentPolicyPinSource,
} from '../application/ports/policy-pin-source.js';
import { PrismaConsentGrantRepository } from '../infrastructure/persistence/prisma-consent-grant-repository.js';
import { PrismaLegalDocumentRepository } from '../infrastructure/persistence/prisma-legal-document-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { OperatingEntityDirectoryAdapter } from '../infrastructure/operating-entity/operating-entity-directory-adapter.js';
import { ConsentApiModule } from '../presentation/consent-api.module.js';
import {
  CONSENT_ENDPOINT_USE_CASES,
  ConsentController,
  type ConsentEndpointUseCases,
  type RecordAcceptanceBody,
  type WithdrawConsentBody,
} from '../presentation/consent.controller.js';
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
      `CONSENT ENDPOINT TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence that the consent listing leaks no storage',
      'locator and that acceptance refuses an unresolved pin; a skipped run',
      'proves neither. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  POSTGRES_PORT=5433 pnpm --filter @karar/consent test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_consent_endpoints`;
const SEED_NOW = new Date('2026-08-16T12:00:00.000Z');
const EFFECTIVE_FROM = new Date('2026-01-01T00:00:00.000Z');
const PURPOSE = 'purpose:ai-processing';
const OTHER_PURPOSE = 'purpose:marketing-messages';
const JURISDICTION = 'jurisdiction:qa';
const operator = { principalRef: `staff:${randomUUID()}`, tenantRef: null };

/**
 * The internal locator, chosen to be unmistakable in a serialized body: if any
 * fragment of it ever appears on the wire the assertions name exactly what
 * escaped. Non-empty and distinct from every other fixture value on purpose —
 * a blank or duplicated locator would make the leak assertions unfalsifiable.
 */
const STORAGE_REF = 'store://karar-internal-bucket/consent-listing-canary/v1';
const CONTENT_HASH = createHash('sha256').update('synthetic notice v1', 'utf8').digest('hex');

/** The provenance a resolver would hand the edge for the happy path. */
const RESOLVED_PIN: ConsentPolicyPin = {
  policyPackVersion: 'zz-endpoint-test/v1',
  subjectPolicySelectionVersion: null,
};

/**
 * The pin resolver as a controllable double. It is the seam the composition
 * root owns (the jurisdiction resolver lives outside this module by design),
 * and a double is the only way to drive its REFUSAL — the branch under test.
 * Every request it receives is captured, so the suite can prove the resolver
 * was consulted with the SERVER-resolved principal and nothing client-shaped.
 */
class RecordingPinSource implements ConsentPolicyPinSource {
  readonly requests: ConsentPolicyPinRequest[] = [];
  constructor(private readonly answer: ConsentPolicyPin | null) {}
  resolvePin(request: ConsentPolicyPinRequest): Promise<ConsentPolicyPin | null> {
    this.requests.push(request);
    return Promise.resolve(this.answer);
  }
}

/** A request as the authentication guard leaves it, plus whatever a hostile
 * client managed to attach. Nothing outside `principal` and `id` is read. */
interface RequestUnderTest {
  principal?: { userId: string; tenantId: string } | undefined;
  id?: string | undefined;
  [attackerControlled: string]: unknown;
}

describe.skipIf(unreachable !== null)('consent endpoints (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let documents: PrismaLegalDocumentRepository;
  let grants: PrismaConsentGrantRepository;
  let directory: OperatingEntityDirectoryAdapter;
  let consentAudit: ConsentAuditTrail;

  const policy = new AllowAllPolicyService();
  const ids = new Uuidv7IdSource();

  const tenant = TenantId.of(randomUUID());
  const subject = { userId: UserId.of(randomUUID()), tenantId: tenant };
  const attachedPrincipal = {
    userId: String(subject.userId),
    tenantId: String(subject.tenantId),
  };

  let entityA: OperatingEntityId;
  /** Entity A, published, storage_ref = STORAGE_REF. */
  let publishedDocumentId = '';
  let publishedVersionId = '';
  /** Entity A, drafted only — accepting it must be refused as unpublished. */
  let unpublishedVersionId = '';

  /**
   * The four use cases the composition root wires, over the real repositories.
   * `pin` is the only thing a caller varies: `undefined` reproduces a
   * composition root that has not bound the resolver at all.
   */
  function endpointUseCases(pin?: ConsentPolicyPinSource): ConsentEndpointUseCases {
    const wired = {
      listApplicableDocuments: new ListApplicableDocuments(documents, directory),
      recordOwnAcceptance: new RecordOwnAcceptance(
        grants,
        documents,
        directory,
        ids,
        consentAudit,
      ),
      withdrawOwnConsent: new WithdrawOwnConsent(grants, consentAudit),
      getOwnConsentStatus: new GetOwnConsentStatus(grants, documents, directory),
    };
    return pin === undefined ? wired : { ...wired, policyPinSource: pin };
  }

  /**
   * The controller AS THE COMPOSITION ROOT WOULD GET IT: registered through
   * ConsentApiModule, then built from the provider the module declares. A
   * module that stopped binding the use cases, or stopped declaring the
   * controller, fails here rather than in production.
   */
  function mountedController(useCases: ConsentEndpointUseCases): ConsentController {
    const registered = ConsentApiModule.register(useCases);
    expect(registered.module).toBe(ConsentApiModule);
    expect(registered.controllers).toEqual([ConsentController]);
    const providers = (registered.providers ?? []) as ReadonlyArray<{
      provide?: unknown;
      useValue?: unknown;
    }>;
    const bound = providers.find((provider) => provider.provide === CONSENT_ENDPOINT_USE_CASES);
    expect(bound, 'ConsentApiModule must bind CONSENT_ENDPOINT_USE_CASES').toBeDefined();
    // Identity, not equality: the module hands the controller the very object
    // the composition root wired, so nothing is copied or re-shaped in between.
    expect(bound?.useValue).toBe(useCases);
    return new ConsentController(bound?.useValue as ConsentEndpointUseCases);
  }

  /** What a caller sees: the status, the SERIALIZED body, and the parsed body. */
  interface Answer {
    statusCode: number;
    raw: string;
    body: Record<string, unknown>;
  }

  async function call(
    invoke: (controller: ConsentController) => Promise<unknown>,
    useCases: ConsentEndpointUseCases,
    okStatus: number,
  ): Promise<Answer> {
    try {
      const sent = await invoke(mountedController(useCases));
      return {
        statusCode: okStatus,
        raw: JSON.stringify(sent),
        body: (sent ?? {}) as Record<string, unknown>,
      };
    } catch (error) {
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
  }

  function listDocuments(
    useCases: ConsentEndpointUseCases,
    request: RequestUnderTest = { principal: attachedPrincipal },
    scopeRef?: string,
  ): Promise<Answer> {
    return call(
      (controller) =>
        scopeRef === undefined
          ? controller.listDocuments(request)
          : controller.listDocuments(request, scopeRef),
      useCases,
      200,
    );
  }

  function recordAcceptance(
    useCases: ConsentEndpointUseCases,
    body: RecordAcceptanceBody,
    request: RequestUnderTest = { principal: attachedPrincipal, id: 'req-accept' },
  ): Promise<Answer> {
    return call((controller) => controller.recordAcceptance(request, body), useCases, 201);
  }

  function withdrawConsent(
    useCases: ConsentEndpointUseCases,
    body: WithdrawConsentBody,
    request: RequestUnderTest = { principal: attachedPrincipal, id: 'req-withdraw' },
  ): Promise<Answer> {
    return call((controller) => controller.withdrawConsent(request, body), useCases, 200);
  }

  function readStatus(
    useCases: ConsentEndpointUseCases,
    purposeRef?: string,
    request: RequestUnderTest = { principal: attachedPrincipal },
  ): Promise<Answer> {
    return call((controller) => controller.readStatus(request, purposeRef), useCases, 200);
  }

  /** Grants belonging to the subject, read past RLS so the count is the truth. */
  async function grantCount(): Promise<number> {
    const rows = await superuserAdapter.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.consent_grants WHERE user_id = $1`,
      [String(subject.userId)],
    );
    return rows.rows[0]?.n ?? -1;
  }

  async function grantRow(grantId: string): Promise<Record<string, unknown> | undefined> {
    const rows = await superuserAdapter.query<Record<string, unknown>>(
      `SELECT evidence_reference, policy_pack_version, policy_pack_pin_state,
              subject_policy_selection_version, subject_policy_selection_pin_state, status
         FROM public.consent_grants WHERE id = $1`,
      [grantId],
    );
    return rows.rows[0];
  }

  async function publishVersion(
    documentId: string,
    version: string,
    options: { publish: boolean },
  ): Promise<string> {
    const drafted = await new DraftDocumentVersion(documents, policy, ids, consentAudit).execute({
      principal: operator,
      documentId,
      version,
      contentHash: CONTENT_HASH,
      storageRef: STORAGE_REF,
      author: 'author:test',
      now: SEED_NOW,
    });
    if (!drafted.ok) throw new Error('version seed failed');
    if (options.publish) {
      const classified = await new ClassifyDocumentVersion(documents, policy, consentAudit).execute(
        {
          principal: operator,
          versionId: drafted.value.id,
          classification: 'NO_USER_ACTION_REQUIRED',
          reviewer: 'reviewer:test',
          reason: 'synthetic fixture; no legal review has taken place',
          now: SEED_NOW,
        },
      );
      if (!classified.ok) throw new Error('classification seed failed');
      const published = await new PublishDocumentVersion(documents, policy, consentAudit).execute({
        principal: operator,
        versionId: drafted.value.id,
        effectiveAt: EFFECTIVE_FROM,
        now: SEED_NOW,
      });
      if (!published.ok) throw new Error('publication seed failed');
    }
    return drafted.value.id;
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

    documents = new PrismaLegalDocumentRepository(prismaHandle.client);
    grants = new PrismaConsentGrantRepository(prismaHandle);
    const recordAuditEvent = new RecordAuditEvent(
      new PostgresAuditWriter(appAdapter),
      new Uuidv7AuditEventIdSource(),
    );
    consentAudit = new ConsentAuditTrail(recordAuditEvent, 'local-test');

    const entityRepo = new PrismaOperatingEntityRepository(prismaHandle.client);
    const assignmentRepo = new PrismaEntityAssignmentRepository(prismaHandle.client);
    const entityAudit = new EntityAuditTrail(recordAuditEvent, 'local-test');
    directory = new OperatingEntityDirectoryAdapter(
      new ResolveEffectiveOperatingEntity(assignmentRepo),
    );

    const created = await new CreateOperatingEntity(entityRepo, policy, ids, entityAudit).execute({
      principal: operator,
      legalName: 'Karar Qatar LLC (synthetic)',
      registrationNumber: 'CR-950',
      registeredJurisdictionRef: JURISDICTION,
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: SEED_NOW,
    });
    if (!created.ok) throw new Error('entity seed failed');
    entityA = created.value.id;
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
      effectiveFrom: EFFECTIVE_FROM,
      now: SEED_NOW,
    });
    if (!bound.ok) throw new Error('tenant binding seed failed');

    const document = await new CreateLegalDocument(documents, policy, ids, consentAudit).execute({
      principal: operator,
      entityId: entityA,
      jurisdictionRef: JURISDICTION,
      purposeRefs: [PURPOSE],
      kind: 'PRIVACY_NOTICE',
      now: SEED_NOW,
    });
    if (!document.ok) throw new Error('document seed failed');
    publishedDocumentId = document.value.id;
    publishedVersionId = await publishVersion(publishedDocumentId, '1.0.0', { publish: true });
    unpublishedVersionId = await publishVersion(publishedDocumentId, '2.0.0', { publish: false });
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

  describe('GET /consent/documents — metadata only, never the storage locator', () => {
    it('the row and the use case both CARRY storageRef — the omission is a choice, not an absence', async () => {
      // Stated first so the leak assertions below cannot pass vacuously: the
      // locator exists, is non-empty, and reaches the application layer. What
      // the next test proves is that the controller declines to copy it.
      const stored = await superuserAdapter.query<{ storage_ref: string }>(
        `SELECT storage_ref FROM public.legal_document_versions WHERE id = $1`,
        [publishedVersionId],
      );
      expect(stored.rows[0]?.storage_ref).toBe(STORAGE_REF);

      const carried = await new ListApplicableDocuments(documents, directory).execute({
        principal: subject,
        now: new Date(),
      });
      expect(carried.ok).toBe(true);
      if (!carried.ok) return;
      expect(carried.value).toHaveLength(1);
      expect(carried.value[0]?.effectiveVersion?.storageRef).toBe(STORAGE_REF);
    });

    it('serializes the effective version WITHOUT storageRef, and with a closed field set', async () => {
      const { statusCode, raw, body } = await listDocuments(endpointUseCases());

      expect(statusCode).toBe(200);
      // NON-EMPTY first: a listing that returned nothing would satisfy every
      // "does not contain" assertion below while breaking the feature.
      const documentsListed = body.documents as ReadonlyArray<Record<string, unknown>>;
      expect(documentsListed).toHaveLength(1);
      const listed = documentsListed[0] as Record<string, unknown>;
      expect(listed.documentId).toBe(publishedDocumentId);
      const effective = listed.effectiveVersion as Record<string, unknown> | null;
      expect(effective, 'a published version must be in force for this assertion to mean anything')
        .not.toBeNull();
      expect(effective?.versionId).toBe(publishedVersionId);
      expect(effective?.contentHash).toBe(CONTENT_HASH);

      // THE PROPERTY. Asserted on the SERIALIZED body, because that is what
      // crosses the wire — an object the serializer might still change is not
      // evidence. Three independent ways of catching the same leak: the key,
      // the exact value, and the scheme any storage locator would carry.
      expect(Object.keys(effective ?? {})).not.toContain('storageRef');
      expect(raw).not.toContain('storageRef');
      expect(raw).not.toContain(STORAGE_REF);
      expect(raw).not.toContain('store://');

      // The field set is CLOSED, so a future spread is a failing test rather
      // than a silent widening of what every subject receives.
      expect(Object.keys(listed).sort()).toEqual([
        'documentId',
        'effectiveVersion',
        'entityId',
        'jurisdictionRef',
        'kind',
        'purposeRefs',
      ]);
      expect(Object.keys(effective ?? {}).sort()).toEqual([
        'classification',
        'contentHash',
        'effectiveAt',
        'version',
        'versionId',
      ]);
    });

    it('keeps the locator out of the answer when the scope filter is used too', async () => {
      // The filtered read is a different call into the same mapper; a leak
      // introduced on either branch is caught.
      const matching = await listDocuments(endpointUseCases(), undefined, JURISDICTION);
      expect((matching.body.documents as unknown[]).length).toBe(1);
      expect(matching.raw).not.toContain('store://');

      const other = await listDocuments(endpointUseCases(), undefined, 'jurisdiction:zz');
      expect(other.body.documents).toEqual([]);
    });

    it('answers 401 without an authenticated principal', async () => {
      const { statusCode } = await listDocuments(endpointUseCases(), {});

      expect(statusCode).toBe(new UnauthorizedException().getStatus());
      expect(statusCode).toBe(401);
    });
  });

  describe('POST /consent/acceptances — provenance or nothing', () => {
    it('records a fully pinned grant when the resolver answers (the positive control)', async () => {
      const pin = new RecordingPinSource(RESOLVED_PIN);
      const before = await grantCount();

      const { statusCode, body } = await recordAcceptance(endpointUseCases(pin), {
        legalDocumentVersionId: publishedVersionId,
        purposeRef: PURPOSE,
      });

      expect(statusCode).toBe(201);
      // The acceptance answer names the grant it created and its resolved
      // pinning triple — nothing here is echoed back from the request.
      expect(Object.keys(body).sort()).toEqual([
        'consentVersion',
        'grantId',
        'grantedAt',
        'jurisdictionRef',
        'legalDocumentVersionId',
        'operatingEntityId',
        'purposeRef',
        'status',
      ]);
      expect(await grantCount()).toBe(before + 1);
      expect(await grantRow(String(body.grantId))).toMatchObject({
        policy_pack_version: RESOLVED_PIN.policyPackVersion,
        policy_pack_pin_state: 'PINNED',
        subject_policy_selection_pin_state: 'NOT_APPLICABLE',
        status: 'ACTIVE',
      });

      // The resolver was consulted with the SERVER-resolved principal and the
      // purpose under acceptance — the pin is fetched, never accepted from the
      // caller.
      expect(pin.requests).toHaveLength(1);
      expect(String(pin.requests[0]?.principal.userId)).toBe(String(subject.userId));
      expect(String(pin.requests[0]?.principal.tenantId)).toBe(String(subject.tenantId));
      expect(pin.requests[0]?.purposeRef).toBe(PURPOSE);
    });

    it('REFUSES with 503 when the resolver has no pin — and records nothing', async () => {
      const before = await grantCount();
      // Non-vacuous by construction: the same subject, version, and purpose
      // succeeded a moment ago. The ONLY difference is the resolver's answer.
      expect(before).toBeGreaterThan(0);
      const refusing = new RecordingPinSource(null);

      const failure = await mountedController(endpointUseCases(refusing))
        .recordAcceptance(
          { principal: attachedPrincipal, id: 'req-unpinned' },
          { legalDocumentVersionId: publishedVersionId, purposeRef: PURPOSE },
        )
        .then(
          () => null,
          (error: unknown) => error,
        );

      // The TYPED failure, not merely "something threw": the transport meaning
      // is 503 (the provenance dependency is unavailable), never a 4xx that
      // would invite the client to retry with its own pin.
      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      const problem = failure as ServiceUnavailableException;
      expect(problem.getStatus()).toBe(503);
      expect(problem.message).toBe('policy provenance is unresolved; not recorded unpinned');

      // THE PROPERTY: refused rather than recorded. The schema would also
      // reject an unpinned row, but "the database caught it" is a different
      // guarantee from "the endpoint never attempted it" — a would-be grant
      // that reached the store would already have burned an id and an audit
      // record. Nothing was written.
      expect(await grantCount()).toBe(before);
      expect(refusing.requests).toHaveLength(1);

      // And the refusal was about the pin alone: restoring the resolver
      // records the very acceptance that was just refused.
      const retried = await recordAcceptance(endpointUseCases(new RecordingPinSource(RESOLVED_PIN)), {
        legalDocumentVersionId: publishedVersionId,
        purposeRef: PURPOSE,
      });
      expect(retried.statusCode).toBe(201);
      expect(await grantCount()).toBe(before + 1);
    });

    it('REFUSES with 503 when the composition root bound no resolver at all', async () => {
      const before = await grantCount();
      expect(before).toBeGreaterThan(0);

      // `policyPinSource` is optional on the wiring interface only so a
      // composition can be assembled before the resolver exists. While it is
      // absent the route must refuse — not fall back to an invented pin.
      const failure = await mountedController(endpointUseCases())
        .recordAcceptance(
          { principal: attachedPrincipal, id: 'req-unwired' },
          { legalDocumentVersionId: publishedVersionId, purposeRef: PURPOSE },
        )
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
      expect(await grantCount()).toBe(before);
    });

    it('derives evidenceReference from the REQUEST IDENTITY, never from client input', async () => {
      const forged = 'evidence:forged-by-the-client';
      // Every client-controlled surface the route touches, loaded at once: the
      // body it parses, and identity-shaped keys smuggled onto the request
      // object beside the ones the guard attaches.
      const hostileBody: Record<string, unknown> = {
        legalDocumentVersionId: publishedVersionId,
        purposeRef: PURPOSE,
        evidenceReference: forged,
        evidence_reference: forged,
        policyPin: { policyPackVersion: 'attacker/v9', subjectPolicySelectionVersion: 'sel/v9' },
        policyPackVersion: 'attacker/v9',
        id: 'req-chosen-by-the-client',
      };
      const hostileRequest: RequestUnderTest = {
        principal: attachedPrincipal,
        id: 'req-server-assigned-42',
        evidenceReference: forged,
      };

      const { statusCode, body } = await recordAcceptance(
        endpointUseCases(new RecordingPinSource(RESOLVED_PIN)),
        hostileBody as RecordAcceptanceBody,
        hostileRequest,
      );
      expect(statusCode).toBe(201);

      const row = await grantRow(String(body.grantId));
      // Evidence of the acceptance act is the SERVER's record of the request.
      // Evidence a subject can dictate is not evidence — a repudiation defence
      // built on a client-supplied string defends nothing.
      expect(row?.evidence_reference).toBe('request:req-server-assigned-42');
      expect(String(row?.evidence_reference)).not.toContain('forged');
      expect(String(row?.evidence_reference)).not.toContain('chosen-by-the-client');
      // The pin is the resolver's too: a client-supplied pack version would be
      // a forged provenance pin on a legally consequential row.
      expect(row?.policy_pack_version).toBe(RESOLVED_PIN.policyPackVersion);
      expect(row?.subject_policy_selection_version).toBeNull();
      expect(row?.subject_policy_selection_pin_state).toBe('NOT_APPLICABLE');
    });

    it('records an UNIDENTIFIED request as such rather than substituting client input', async () => {
      const { statusCode, body } = await recordAcceptance(
        endpointUseCases(new RecordingPinSource(RESOLVED_PIN)),
        { legalDocumentVersionId: publishedVersionId, purposeRef: PURPOSE },
        // No `id`: the edge did not stamp one. The honest record is that the
        // request was unidentified — not the caller's own idea of an id.
        { principal: attachedPrincipal, id: undefined },
      );

      expect(statusCode).toBe(201);
      expect((await grantRow(String(body.grantId)))?.evidence_reference).toBe(
        'request:unidentified',
      );
    });

    it('validates required fields and maps use-case refusals to their transport meaning', async () => {
      const pinned = () => endpointUseCases(new RecordingPinSource(RESOLVED_PIN));

      // `purposeRef` is required BEFORE the resolver is consulted.
      const noPurpose = await recordAcceptance(pinned(), {
        legalDocumentVersionId: publishedVersionId,
      });
      expect(noPurpose.statusCode).toBe(new BadRequestException().getStatus());
      expect(noPurpose.statusCode).toBe(400);

      const noVersion = await recordAcceptance(pinned(), { purposeRef: PURPOSE });
      expect(noVersion.statusCode).toBe(400);

      // VERSION_NOT_PUBLISHED -> 400: a draft is not something to accept.
      const draft = await recordAcceptance(pinned(), {
        legalDocumentVersionId: unpublishedVersionId,
        purposeRef: PURPOSE,
      });
      expect(draft.statusCode).toBe(400);

      // PURPOSE_NOT_COVERED -> 400: the document says nothing about it.
      const uncovered = await recordAcceptance(pinned(), {
        legalDocumentVersionId: publishedVersionId,
        purposeRef: OTHER_PURPOSE,
      });
      expect(uncovered.statusCode).toBe(400);

      // NOT_FOUND -> 404, and the answer names no other subject's document.
      const unknown = await recordAcceptance(pinned(), {
        legalDocumentVersionId: randomUUID(),
        purposeRef: PURPOSE,
      });
      expect(unknown.statusCode).toBe(new NotFoundException().getStatus());
      expect(unknown.statusCode).toBe(404);
    });

    it('answers 401 without an authenticated principal, and consults no resolver', async () => {
      const pin = new RecordingPinSource(RESOLVED_PIN);
      const before = await grantCount();

      const { statusCode } = await recordAcceptance(
        endpointUseCases(pin),
        { legalDocumentVersionId: publishedVersionId, purposeRef: PURPOSE },
        {},
      );

      expect(statusCode).toBe(401);
      // Unauthenticated means nothing downstream ran — not even the lookup
      // that would tell a caller whether a version id exists.
      expect(pin.requests).toEqual([]);
      // And the caller's existing grants are untouched — an unauthenticated
      // request is not a way to supersede somebody's standing acceptance.
      expect(await grantCount()).toBe(before);
      expect(before).toBeGreaterThan(0);
    });
  });

  describe('GET /consent/status and POST /consent/withdrawals', () => {
    it('reads OWN status for a purpose and refuses an unnamed purpose', async () => {
      const { statusCode, body } = await readStatus(endpointUseCases(), PURPOSE);

      expect(statusCode).toBe(200);
      expect(body).toMatchObject({
        state: 'ACTIVE',
        purposeRef: PURPOSE,
        jurisdictionRef: JURISDICTION,
        operatingEntityId: entityA,
        documentId: publishedDocumentId,
      });
      // Closed field set: the status answer is a resolution summary, and
      // nothing about where documents are kept belongs in it.
      expect(Object.keys(body).sort()).toEqual([
        'documentId',
        'effectiveVersion',
        'effectiveVersionId',
        'grantId',
        'grantedVersion',
        'jurisdictionRef',
        'noticeRequired',
        'operatingEntityId',
        'purposeRef',
        'state',
      ]);

      const unnamed = await readStatus(endpointUseCases());
      expect(unnamed.statusCode).toBe(400);
    });

    it('withdraws the caller’s own ACTIVE grant, then refuses the second attempt as 409', async () => {
      const active = await readStatus(endpointUseCases(), PURPOSE);
      // There really is an ACTIVE grant to withdraw; without this the 200
      // below could be a withdrawal of nothing.
      expect(active.body.state).toBe('ACTIVE');
      expect(active.body.grantId).not.toBeNull();
      const grantId = String(active.body.grantId);

      const withdrawn = await withdrawConsent(endpointUseCases(), { grantId });
      expect(withdrawn.statusCode).toBe(200);
      expect(withdrawn.body).toMatchObject({ grantId, status: 'WITHDRAWN' });
      expect(withdrawn.body.withdrawnAt).not.toBeNull();

      // GRANT_NOT_ACTIVE -> 409: the transition happened once; re-granting is
      // a new row, never a reversal of this one.
      const again = await withdrawConsent(endpointUseCases(), { grantId });
      expect(again.statusCode).toBe(new ConflictException().getStatus());
      expect(again.statusCode).toBe(409);

      // An id that is not the caller's own is NOT_FOUND — indistinguishable
      // from absence, so the route is no oracle for other subjects' grants.
      const foreign = await withdrawConsent(endpointUseCases(), { grantId: randomUUID() });
      expect(foreign.statusCode).toBe(404);

      const missing = await withdrawConsent(endpointUseCases(), {});
      expect(missing.statusCode).toBe(400);
    });

    it('answers 401 on both routes without an authenticated principal', async () => {
      expect((await readStatus(endpointUseCases(), PURPOSE, {})).statusCode).toBe(401);
      expect((await withdrawConsent(endpointUseCases(), { grantId: randomUUID() }, {})).statusCode)
        .toBe(401);
    });
  });
});
