import { randomUUID } from 'node:crypto';

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
import { TenantId, UserId } from '@karar/shared-kernel';

import type { OperatingEntityId } from '../domain/operating-entity.js';
import { JurisdictionRef, PurposeRef } from '../domain/refs.js';
import { EntityAuditTrail } from '../application/audit-trail.js';
import {
  CreateOperatingEntity,
  UpdateOperatingEntityStatus,
} from '../application/use-cases/entity-admin.js';
import {
  EndJurisdictionPermission,
  GrantJurisdictionPermission,
} from '../application/use-cases/jurisdiction-permissions.js';
import {
  RecordEntityLicence,
  UpdateEntityLicenceStatus,
} from '../application/use-cases/licence-records.js';
import {
  CreateRoleAssignment,
  EndRoleAssignment,
  QueryRoleAssignments,
} from '../application/use-cases/role-assignments.js';
import {
  ResolveEffectiveOperatingEntity,
  SetTenantDefaultEntity,
  SetUserContractingEntity,
} from '../application/use-cases/entity-assignments.js';
import {
  AdvanceEntityMigration,
  ProposeEntityMigration,
  RecordMigrationReconsentEvaluation,
} from '../application/use-cases/entity-migration.js';
import {
  PrismaEntityAssignmentRepository,
  PrismaEntityLicenceRepository,
  PrismaEntityMigrationRepository,
  PrismaOperatingEntityRepository,
  PrismaRoleAssignmentRepository,
} from '../infrastructure/persistence/prisma-repositories.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { AllowAllPolicyService, DenyAllPolicyService } from './fakes/allow-all-policy-service.js';

// Live-PostgreSQL evidence for the operating-entity module: the register,
// licences with an honest vocabulary, relationship-scoped role assignments
// with temporal resolution, forward-only bindings, and the EntityMigration
// state machine with immutable terminal history (migrations 0060-0063).
// Same probe-or-skip pattern as modules/audit — a skipped run is never
// acceptable evidence.

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
      `OPERATING-ENTITY TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for migrations 0060-0063 and the entity',
      'workflows; a skipped run proves nothing. Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/operating-entity test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_entity`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const principal = { principalRef: `staff:${randomUUID()}`, tenantRef: null };

describe.skipIf(unreachable !== null)('operating-entity (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;

  let entities: PrismaOperatingEntityRepository;
  let licences: PrismaEntityLicenceRepository;
  let roleAssignments: PrismaRoleAssignmentRepository;
  let assignments: PrismaEntityAssignmentRepository;
  let migrations: PrismaEntityMigrationRepository;
  let audit: EntityAuditTrail;
  const policy = new AllowAllPolicyService();
  const ids = new Uuidv7IdSource();

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    const { applied } = await migrateToLatest({ adapter: migratorAdapter });
    expect(applied.map((f) => f.filename)).toEqual(
      expect.arrayContaining([
        '0060_operating_entities.sql',
        '0061_entity_licences.sql',
        '0062_data_protection_role_assignments.sql',
        '0063_operating_entity_assignments.sql',
      ]),
    );
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));
    entities = new PrismaOperatingEntityRepository(prismaHandle.client);
    licences = new PrismaEntityLicenceRepository(prismaHandle.client);
    roleAssignments = new PrismaRoleAssignmentRepository(prismaHandle.client);
    assignments = new PrismaEntityAssignmentRepository(prismaHandle.client);
    migrations = new PrismaEntityMigrationRepository(prismaHandle.client);
    audit = new EntityAuditTrail(
      new RecordAuditEvent(new PostgresAuditWriter(appAdapter), new Uuidv7AuditEventIdSource()),
      'local-test',
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

  let entityA: OperatingEntityId;
  let entityB: OperatingEntityId;

  it('creates entities through the authorized use case, audited', async () => {
    const create = new CreateOperatingEntity(entities, policy, ids, audit);
    const a = await create.execute({
      principal,
      legalName: 'Karar Qatar LLC',
      registrationNumber: 'CR-100',
      registeredJurisdictionRef: 'jurisdiction:qa',
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    const b = await create.execute({
      principal,
      legalName: 'Karar Gulf Holding',
      registrationNumber: 'CR-200',
      registeredJurisdictionRef: 'jurisdiction:qa',
      contractingCapacity: true,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      entityA = a.value.id;
      entityB = b.value.id;
    }
    const audited = await appAdapter.query(
      `SELECT 1 FROM audit.audit_events WHERE action = 'entity.entity.created'`,
    );
    expect(audited.rowCount).toBe(2);
  });

  it('refuses everything when the PolicyService denies — and writes nothing', async () => {
    const create = new CreateOperatingEntity(entities, new DenyAllPolicyService(), ids, audit);
    const refused = await create.execute({
      principal,
      legalName: 'Unauthorized Entity',
      registrationNumber: 'CR-999',
      registeredJurisdictionRef: 'jurisdiction:qa',
      contractingCapacity: false,
      dataProtectionContact: 'dpo@karar.example',
      now: NOW,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('AUTHORIZATION_DENIED');
    }
    const rows = await appAdapter.query(
      `SELECT 1 FROM operating_entities WHERE legal_name = 'Unauthorized Entity'`,
    );
    expect(rows.rowCount).toBe(0);
  });

  it('changes entity status with a before/after audit record', async () => {
    const update = new UpdateOperatingEntityStatus(entities, policy, audit);
    const result = await update.execute({
      principal,
      entityId: entityB,
      status: 'SUSPENDED',
      reason: 'holding entity not yet contracting',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    const audited = await appAdapter.query<{ before_metadata: { status: string } }>(
      `SELECT before_metadata FROM audit.audit_events WHERE action = 'entity.entity.status_changed'`,
    );
    expect(audited.rowCount).toBe(1);
    expect(audited.rows[0]?.before_metadata).toEqual({ status: 'ACTIVE' });
  });

  it('grants and ends jurisdiction permission windows', async () => {
    const grant = new GrantJurisdictionPermission(entities, policy, ids, audit);
    const granted = await grant.execute({
      principal,
      entityId: entityA,
      jurisdictionRef: 'jurisdiction:qa',
      permittedFrom: new Date('2026-01-01T00:00:00Z'),
      basisReference: 'legal-opinion:qa-2026-01',
      now: NOW,
    });
    expect(granted.ok).toBe(true);
    const end = new EndJurisdictionPermission(entities, policy, audit);
    if (granted.ok) {
      const ended = await end.execute({
        principal,
        permissionId: granted.value.id,
        permittedTo: new Date('2027-01-01T00:00:00Z'),
        reason: 'basis under renewal',
        now: NOW,
      });
      expect(ended.ok).toBe(true);
    }
    const windows = await entities.listJurisdictionPermissions(entityA);
    expect(windows).toHaveLength(1);
    expect(windows[0]?.permittedTo).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it('licence honesty: EVIDENCED without evidence refused by use case AND by CHECK', async () => {
    const record = new RecordEntityLicence(licences, entities, policy, ids, audit);
    const refused = await record.execute({
      principal,
      entityId: entityA,
      licenceTypeRef: 'licence:payment-services',
      status: 'EVIDENCED',
      sourceProvenance: 'operator:claim',
      reviewOwner: 'owner:compliance',
      now: NOW,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('EVIDENCE_REQUIRED');
    }
    // Bypassing the use case cannot cheat either: the database refuses the shape.
    const direct = await appAdapter
      .query(
        `INSERT INTO entity_licences (id, entity_id, licence_type_ref, status, source_provenance, review_owner, updated_at)
         VALUES ($1, $2, 'licence:payment-services', 'EVIDENCED', 'operator:claim', 'owner:compliance', now())`,
        [randomUUID(), entityA],
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(direct).toBeInstanceOf(PgError);
    expect((direct as PgError).sqlState).toBe('23514'); // check_violation
  });

  it('records an honest claim and upgrades it only with evidence on file', async () => {
    const record = new RecordEntityLicence(licences, entities, policy, ids, audit);
    const claimed = await record.execute({
      principal,
      entityId: entityA,
      licenceTypeRef: 'licence:payment-services',
      status: 'CLAIMED_UNVERIFIED',
      sourceProvenance: 'partner-document:bank-x-2026-07',
      reviewOwner: 'owner:compliance',
      now: NOW,
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const update = new UpdateEntityLicenceStatus(licences, policy, audit);
    const upgradeWithoutEvidence = await update.execute({
      principal,
      licenceId: claimed.value.id,
      status: 'EVIDENCED',
      reason: 'attempting upgrade without evidence',
      now: NOW,
    });
    expect(upgradeWithoutEvidence.ok).toBe(false);
    const upgraded = await update.execute({
      principal,
      licenceId: claimed.value.id,
      status: 'EVIDENCED',
      evidenceReference: 'evidence:regulator-letter-2026-08',
      reason: 'evidence received and filed',
      now: NOW,
    });
    expect(upgraded.ok).toBe(true);
    const stored = await licences.findById(claimed.value.id);
    expect(stored?.status).toBe('EVIDENCED');
    expect(stored?.evidenceReference).toBe('evidence:regulator-letter-2026-08');
  });

  it('answers role-assignment temporal queries by (entity, tenant, purpose, jurisdiction, at-time)', async () => {
    const tenant = TenantId.of(randomUUID());
    const create = new CreateRoleAssignment(roleAssignments, entities, policy, ids, audit);
    const end = new EndRoleAssignment(roleAssignments, policy, audit);
    const first = await create.execute({
      principal,
      operatingEntityId: entityA,
      tenantId: tenant,
      purposeRef: 'purpose:service-delivery',
      jurisdictionRef: 'jurisdiction:qa',
      role: 'PROCESSOR',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      contractReference: 'dpa:bank-x-2026',
      policyPackVersion: 'zz-test/v1',
      now: NOW,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const endedAt = new Date('2026-06-01T00:00:00Z');
    expect(
      (
        await end.execute({
          principal,
          assignmentId: first.value.id,
          effectiveTo: endedAt,
          reason: 'contract renegotiated: entity becomes controller',
          now: NOW,
        })
      ).ok,
    ).toBe(true);
    const second = await create.execute({
      principal,
      operatingEntityId: entityA,
      tenantId: tenant,
      purposeRef: 'purpose:service-delivery',
      jurisdictionRef: 'jurisdiction:qa',
      role: 'CONTROLLER',
      effectiveFrom: endedAt,
      contractReference: 'dpa:bank-x-2026-amended',
      policyPackVersion: 'zz-test/v1',
      now: NOW,
    });
    expect(second.ok).toBe(true);

    const query = new QueryRoleAssignments(roleAssignments, policy);
    const during = await query.execute({
      principal,
      query: {
        operatingEntityId: entityA,
        tenantId: tenant,
        purposeRef: PurposeRef.of('purpose:service-delivery'),
        jurisdictionRef: JurisdictionRef.of('jurisdiction:qa'),
        activeAt: new Date('2026-03-01T00:00:00Z'),
      },
    });
    expect(during.ok).toBe(true);
    if (during.ok) {
      expect(during.value.map((a) => a.role)).toEqual(['PROCESSOR']);
    }
    const after = await query.execute({
      principal,
      query: {
        operatingEntityId: entityA,
        tenantId: tenant,
        activeAt: new Date('2026-07-01T00:00:00Z'),
      },
    });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.map((a) => a.role)).toEqual(['CONTROLLER']);
    }
  });

  it('the guard trigger permits ending an assignment and refuses editing the decision', async () => {
    const rows = await appAdapter.query<{ id: string }>(
      `SELECT id FROM data_protection_role_assignments WHERE effective_to IS NOT NULL LIMIT 1`,
    );
    const endedId = rows.rows[0]?.id;
    expect(endedId).toBeDefined();
    const edit = await appAdapter
      .query(`UPDATE data_protection_role_assignments SET role = 'PROCESSOR' WHERE id = $1`, [
        endedId,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(edit).toBeInstanceOf(PgError);
    expect((edit as PgError).message).toContain('ended and immutable');
  });

  let tenantId: TenantId;
  let userId: UserId;

  it('binds tenant default and user contracting entities; resolution prefers the contracting binding', async () => {
    tenantId = TenantId.of(randomUUID());
    userId = UserId.of(randomUUID());
    const setTenant = new SetTenantDefaultEntity(assignments, entities, policy, ids, audit);
    const setUser = new SetUserContractingEntity(assignments, entities, policy, ids, audit);
    const resolve = new ResolveEffectiveOperatingEntity(assignments);

    const tenantBound = await setTenant.execute({
      principal,
      tenantId,
      entityId: entityA,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
    });
    expect(tenantBound.ok).toBe(true);

    const byTenant = await resolve.execute({ tenantId, userId: null, at: NOW });
    expect(byTenant.ok).toBe(true);
    if (byTenant.ok) {
      expect(byTenant.value).toMatchObject({ entityId: entityA, scope: 'TENANT_DEFAULT' });
    }

    const userBound = await setUser.execute({
      principal,
      userId,
      tenantId,
      entityId: entityB,
      effectiveFrom: new Date('2026-02-01T00:00:00Z'),
      now: NOW,
    });
    expect(userBound.ok).toBe(true);

    const byUser = await resolve.execute({ tenantId, userId, at: NOW });
    expect(byUser.ok).toBe(true);
    if (byUser.ok) {
      expect(byUser.value).toMatchObject({ entityId: entityB, scope: 'USER_CONTRACTING' });
    }
  });

  it('re-binding ends the open assignment and inserts a successor — nothing vanishes', async () => {
    const setTenant = new SetTenantDefaultEntity(assignments, entities, policy, ids, audit);
    const rebound = await setTenant.execute({
      principal,
      tenantId,
      entityId: entityB,
      effectiveFrom: new Date('2026-03-01T00:00:00Z'),
      now: NOW,
    });
    expect(rebound.ok).toBe(true);
    const history = await appAdapter.query<{ entity_id: string; effective_to: Date | null }>(
      `SELECT entity_id, effective_to FROM operating_entity_assignments
        WHERE tenant_id = $1 AND scope = 'TENANT_DEFAULT' ORDER BY effective_from`,
      [tenantId],
    );
    expect(history.rowCount).toBe(2);
    expect(history.rows[0]?.entity_id).toBe(entityA);
    expect(history.rows[0]?.effective_to).not.toBeNull();
    expect(history.rows[1]?.entity_id).toBe(entityB);
    expect(history.rows[1]?.effective_to).toBeNull();
  });

  it('walks the EntityMigration state machine and refuses shortcuts', async () => {
    const propose = new ProposeEntityMigration(migrations, entities, policy, ids, audit);
    const recordEvaluation = new RecordMigrationReconsentEvaluation(migrations, policy, audit);
    const advance = new AdvanceEntityMigration(migrations, policy, audit);

    const proposed = await propose.execute({
      principal,
      scope: 'TENANT_DEFAULT',
      subjectRef: `tenant:${tenantId}`,
      fromEntity: entityA,
      toEntity: entityB,
      reason: 'local incorporation of the Qatar business',
      now: NOW,
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const migrationId = proposed.value.id;

    // Never silent: PROPOSED cannot jump to MIGRATED without an evaluation.
    const shortcut = await advance.execute({
      principal,
      migrationId,
      to: 'MIGRATED',
      reason: 'shortcut attempt',
      now: NOW,
    });
    expect(shortcut.ok).toBe(false);
    if (!shortcut.ok) {
      expect(shortcut.error.kind).toBe('INVALID_TRANSITION');
    }

    const evaluationRef = randomUUID(); // cross-module reference, recorded by the consent module
    expect(
      (
        await recordEvaluation.execute({
          principal,
          migrationId,
          reconsentEvaluationId: evaluationRef,
          now: NOW,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await advance.execute({
          principal,
          migrationId,
          to: 'AWAITING_ACCEPTANCE',
          reason: 'material for consent-based purposes',
          now: NOW,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await advance.execute({
          principal,
          migrationId,
          to: 'MIGRATED',
          reason: 'subject accepted',
          now: NOW,
        })
      ).ok,
    ).toBe(true);

    const completed = await migrations.findById(migrationId);
    expect(completed?.status).toBe('MIGRATED');
    expect(completed?.completedAt).not.toBeNull();
    expect(completed?.reconsentEvaluationId).toBe(evaluationRef);

    // Terminal is terminal — the use case refuses…
    const reopen = await advance.execute({
      principal,
      migrationId,
      to: 'BLOCKED',
      reason: 'attempting to reopen',
      now: NOW,
    });
    expect(reopen.ok).toBe(false);
    // …and so does the trigger, even for the table owner.
    const ownerEdit = await migratorAdapter
      .query(`UPDATE entity_migrations SET status = 'PROPOSED', completed_at = NULL WHERE id = $1`, [
        migrationId,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(ownerEdit).toBeInstanceOf(PgError);
    expect((ownerEdit as PgError).message).toContain('immutable');
    // DELETE is refused by revoked grants for the app role…
    const appDelete = await appAdapter.query(`DELETE FROM entity_migrations`).then(
      () => null,
      (error: unknown) => error,
    );
    expect((appDelete as PgError).sqlState).toBe('42501');
    // …and by the trigger for the owner.
    const ownerDelete = await migratorAdapter
      .query(`DELETE FROM entity_migrations WHERE id = $1`, [migrationId])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((ownerDelete as PgError).sqlState).toBe('P0001');
  });

  it('every state change above left an audit record', async () => {
    const audited = await appAdapter.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit.audit_events ORDER BY action`,
    );
    const actions = audited.rows.map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'entity.entity.created',
        'entity.entity.status_changed',
        'entity.jurisdiction_permission.granted',
        'entity.jurisdiction_permission.ended',
        'entity.licence.recorded',
        'entity.licence.status_changed',
        'entity.role_assignment.created',
        'entity.role_assignment.ended',
        'entity.assignment.set',
        'entity.migration.proposed',
        'entity.migration.reconsent_evaluated',
        'entity.migration.awaiting_acceptance',
        'entity.migration.completed',
      ]),
    );
  });
});
