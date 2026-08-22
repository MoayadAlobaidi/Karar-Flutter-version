import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dropScratchDatabase,
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
import { isCapabilityId, type CapabilityId } from '@karar/capability-registry';

import { SubjectPolicyAuditTrail } from '../application/audit-trail.js';
import type { SubjectPolicyPrincipal } from '../application/ports/selection-repository.js';
import {
  GetOwnSelection,
  GetSelectionVersionForResolution,
  RecordSubjectPolicySelection,
  WithdrawOwnSelection,
} from '../application/use-cases/selections.js';
import { PrismaSubjectPolicySelectionRepository } from '../infrastructure/persistence/prisma-subject-policy-selection-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { JurisdictionRef, ProfileRef } from '../domain/refs.js';
import type { SubjectOptionSet } from '../domain/option-set.js';
import { FixedOptionSource } from './fakes/fixed-option-source.js';
import { skipUnlessDatabaseRequired } from '@karar/platform/dist/db/index.js';

// Live-PostgreSQL evidence for the subject-policy module (migration 0083):
// restrict-only recording against pack option sets, version pinning with the
// concurrent-pack-change re-check, temporal reads with expiry denial,
// supersession with historical reproducibility, RLS on NON-EMPTY data
// (tenant+user scoped, fail closed without a principal context), the
// immutability/transition triggers held against the table owner, and the
// audit-trail leak regression. Same probe-or-skip pattern as modules/consent.
//
// Capability ids on rows are REAL registry ids ('ZAKAT', 'TRANSACTIONS') —
// synthetic test capabilities never enter database rows (capability-registry
// header); the pack OPTION SETS are fixtures behind the SubjectOptionSource
// port, which is exactly the seam the lead binds to the jurisdiction-policy
// workstream's real resolution at composition.

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
skipUnlessDatabaseRequired('subject-policy subject policy suite', unreachable);
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `SUBJECT-POLICY TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for migration 0083 and the selection',
      'lifecycle; a skipped run proves nothing. Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  POSTGRES_PORT=5433 pnpm --filter @karar/subject-policy test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_subject_policy`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const T1 = new Date('2026-08-01T00:00:00.000Z');
const T2 = new Date('2026-08-10T00:00:00.000Z');
const JURISDICTION = 'jurisdiction:qa';
const RACE_JURISDICTION = 'jurisdiction:ae-difc';
const PACK_V1 = 'qa/v1';
const PACK_V2 = 'qa/v2';
// Option-content canaries: recorded on rows (CONFIDENTIAL, RLS'd — correct),
// but they must NEVER surface in audit entries (leak regression below).
const PROFILE_A = 'profile:zakat/methodology-canary-a7x';
const PROFILE_B = 'profile:zakat/methodology-beta';
const SNAPSHOT_CANARY = 'sha256:snapshot-canary-b3y';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function zakatOptionSet(packVersion: string, scopeRef: string): SubjectOptionSet<CapabilityId> {
  return {
    capabilityId: 'ZAKAT',
    jurisdictionRef: JurisdictionRef.of(scopeRef),
    policyPackVersion: packVersion,
    permittedOptions: [
      { profileRef: ProfileRef.of(PROFILE_A), profileVersions: ['1.0.0', '1.1.0'] },
      { profileRef: ProfileRef.of(PROFILE_B), profileVersions: ['2.0.0'] },
    ],
  };
}

describe.skipIf(unreachable !== null)('subject-policy (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let repository: PrismaSubjectPolicySelectionRepository;
  let optionSource: FixedOptionSource<CapabilityId>;
  let audit: SubjectPolicyAuditTrail;
  let record: RecordSubjectPolicySelection;
  let getOwn: GetOwnSelection;
  let forResolution: GetSelectionVersionForResolution;
  let withdraw: WithdrawOwnSelection;

  const ids = new Uuidv7IdSource();

  const tenant1 = TenantId.of(randomUUID());
  const tenant2 = TenantId.of(randomUUID());
  const alice: SubjectPolicyPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant1 };
  const bob: SubjectPolicyPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant2 };
  // Same tenant as alice, different user: BOTH GUCs must match, not just one.
  const mallory: SubjectPolicyPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant1 };
  const carol: SubjectPolicyPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant1 };
  const dave: SubjectPolicyPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant1 };
  const erin: SubjectPolicyPrincipal = { userId: UserId.of(randomUUID()), tenantId: tenant1 };

  /** Raw SQL under the subject's principal context — for adversarial probes. */
  async function rawAsPrincipal<T extends pg.QueryResultRow>(
    principal: SubjectPolicyPrincipal,
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
      expect.arrayContaining(['0083_subject_policy_selections.sql']),
    );
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    repository = new PrismaSubjectPolicySelectionRepository(prismaHandle);
    optionSource = new FixedOptionSource<CapabilityId>()
      .withOptionSet(zakatOptionSet(PACK_V1, JURISDICTION))
      .withNoSubjectPolicy('TRANSACTIONS', JURISDICTION);

    audit = new SubjectPolicyAuditTrail(
      new RecordAuditEvent(new PostgresAuditWriter(appAdapter), new Uuidv7AuditEventIdSource()),
      'local-test',
    );
    record = new RecordSubjectPolicySelection(repository, optionSource, isCapabilityId, ids, audit);
    getOwn = new GetOwnSelection(repository, optionSource, isCapabilityId);
    forResolution = new GetSelectionVersionForResolution(repository, isCapabilityId);
    withdraw = new WithdrawOwnSelection(repository, audit);
  }, 60_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, database);
    } finally {
      await maintenance.end();
    }
  });

  let firstSelectionId: string;

  it('records a valid selection inside the pack-permitted options, pinning versions and provenance', async () => {
    const recorded = await record.execute({
      principal: alice,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_A,
      profileVersion: '1.0.0',
      profileSnapshotHash: SNAPSHOT_CANARY,
      now: T1,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    firstSelectionId = recorded.value.id;
    expect(recorded.value).toMatchObject({
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      policyPackVersion: PACK_V1,
      profileVersion: '1.0.0',
      status: 'ACTIVE',
      selectionSource: 'subject-election',
      recordedBy: alice.userId,
    });

    const row = await rawAsPrincipal<{ policy_pack_version: string; effective_from: Date }>(
      alice,
      `SELECT policy_pack_version, effective_from FROM subject_policy_selections WHERE id = $1`,
      [firstSelectionId],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0]?.policy_pack_version).toBe(PACK_V1);
    expect(row.rows[0]?.effective_from).toEqual(T1);
  });

  it('denies everything restrict-only forbids, recording nothing', async () => {
    const base = {
      principal: alice,
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_A,
      profileVersion: '1.0.0',
      now: NOW,
    };
    // Option outside the pack set.
    const badOption = await record.execute({
      ...base,
      capabilityId: 'ZAKAT',
      profileVersion: '9.9.9',
    });
    expect(!badOption.ok && badOption.error.kind === 'OPTION_NOT_PERMITTED').toBe(true);
    // Capability id not in the production registry.
    const unknown = await record.execute({ ...base, capabilityId: 'FUNDRAISING' });
    expect(!unknown.ok && unknown.error.kind === 'CAPABILITY_UNKNOWN').toBe(true);
    // A registered capability that declares NO subject policy here.
    const noPolicy = await record.execute({ ...base, capabilityId: 'TRANSACTIONS' });
    expect(!noPolicy.ok && noPolicy.error.kind === 'NO_SUBJECT_POLICY_DECLARED').toBe(true);
    // A capability whose option set cannot be resolved: fail closed.
    const unresolved = await record.execute({
      ...base,
      capabilityId: 'BUDGETS', // no fixture -> UNRESOLVED from the source
    });
    expect(!unresolved.ok && unresolved.error.kind === 'OPTION_SET_UNRESOLVED').toBe(true);
    // A stale pack version: the applicable one is qa/v1.
    const stale = await record.execute({
      ...base,
      capabilityId: 'ZAKAT',
      expectedPolicyPackVersion: 'qa/v0',
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error).toMatchObject({
        kind: 'PACK_VERSION_MISMATCH',
        detected: 'AT_RESOLUTION',
      });
    }

    const rows = await rawAsPrincipal(alice, `SELECT id FROM subject_policy_selections`);
    expect(rows.rowCount).toBe(1); // still only the valid recording
  });

  it('RLS: the owner sees non-empty data; cross-tenant, cross-user, and context-free principals see and change nothing', async () => {
    // Own-tenant, own-user FIRST and NON-EMPTY — an empty pass proves nothing.
    const own = await repository.listSelections(alice, 'ZAKAT');
    expect(own.length).toBeGreaterThan(0);
    const ownRaw = await rawAsPrincipal(alice, `SELECT id FROM subject_policy_selections`);
    expect(ownRaw.rowCount).toBeGreaterThan(0);

    // Cross-tenant: empty, and the specific row invisible.
    expect(await repository.listSelections(bob, 'ZAKAT')).toHaveLength(0);
    expect(await repository.findById(bob, firstSelectionId)).toBeNull();
    expect((await rawAsPrincipal(bob, `SELECT id FROM subject_policy_selections`)).rowCount).toBe(
      0,
    );

    // Same tenant, different user: BOTH GUCs are required, not just one.
    expect(await repository.listSelections(mallory, 'ZAKAT')).toHaveLength(0);
    expect(await repository.findById(mallory, firstSelectionId)).toBeNull();
    expect(
      (await rawAsPrincipal(mallory, `SELECT id FROM subject_policy_selections`)).rowCount,
    ).toBe(0);

    // Cross-principal UPDATE: matches nothing.
    const crossUpdate = await rawAsPrincipal(
      bob,
      `UPDATE subject_policy_selections SET status = 'WITHDRAWN', withdrawn_at = now() WHERE id = $1`,
      [firstSelectionId],
    );
    expect(crossUpdate.rowCount).toBe(0);

    // Cross-principal INSERT claiming alice's identity: WITH CHECK refuses.
    const forged = await rawAsPrincipal(
      bob,
      `INSERT INTO subject_policy_selections
         (id, user_id, tenant_id, capability_id, profile_ref, profile_version,
          jurisdiction_ref, policy_pack_version, effective_from, status,
          selection_source, recorded_by)
       VALUES ($1, $2, $3, 'ZAKAT', 'profile:zakat/forged', '1.0.0',
               $4, $5, now(), 'ACTIVE', 'subject-election', $2)`,
      [randomUUID(), alice.userId, alice.tenantId, JURISDICTION, PACK_V1],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(forged).toBeInstanceOf(PgError);
    expect((forged as PgError).sqlState).toBe('42501');

    // Cross-principal withdrawal through the use case: NOT_FOUND.
    const denied = await withdraw.execute({
      principal: bob,
      selectionId: firstSelectionId,
      now: NOW,
    });
    expect(!denied.ok && denied.error.kind === 'NOT_FOUND').toBe(true);

    // No principal context at all: fail closed.
    const noContext = await appAdapter.query(`SELECT id FROM subject_policy_selections`);
    expect(noContext.rowCount).toBe(0);

    // The selection survived every attempt, intact.
    expect((await repository.findById(alice, firstSelectionId))?.status).toBe('ACTIVE');
  });

  let secondSelectionId: string;

  it('re-election supersedes; the superseded row remains readable with its ORIGINAL pinned versions', async () => {
    // The pack moved to qa/v2; alice re-elects under it.
    optionSource.withOptionSet(zakatOptionSet(PACK_V2, JURISDICTION));
    const reElected = await record.execute({
      principal: alice,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V2,
      profileRef: PROFILE_A,
      profileVersion: '1.1.0',
      now: T2,
    });
    expect(reElected.ok).toBe(true);
    if (!reElected.ok) return;
    secondSelectionId = reElected.value.id;
    expect(reElected.value.policyPackVersion).toBe(PACK_V2);

    // The old row: SUPERSEDED, content untouched, pins preserved.
    const oldRow = await rawAsPrincipal<{
      status: string;
      policy_pack_version: string;
      profile_version: string;
    }>(
      alice,
      `SELECT status, policy_pack_version, profile_version FROM subject_policy_selections WHERE id = $1`,
      [firstSelectionId],
    );
    expect(oldRow.rows[0]).toEqual({
      status: 'SUPERSEDED',
      policy_pack_version: PACK_V1,
      profile_version: '1.0.0',
    });

    // Historical reproducibility: a PAST instant resolves to the OLD pins…
    const past = await forResolution.execute({
      principal: alice,
      capabilityId: 'ZAKAT',
      at: new Date('2026-08-05T00:00:00.000Z'),
    });
    expect(past.ok).toBe(true);
    if (past.ok) {
      expect(past.value).toMatchObject({
        kind: 'PINNED_VERSIONS',
        selectionId: firstSelectionId,
        policyPackVersion: PACK_V1,
        profileVersion: '1.0.0',
      });
    }
    // …and the present instant to the new ones.
    const present = await forResolution.execute({
      principal: alice,
      capabilityId: 'ZAKAT',
      at: NOW,
    });
    expect(present.ok).toBe(true);
    if (present.ok) {
      expect(present.value).toMatchObject({
        kind: 'PINNED_VERSIONS',
        selectionId: secondSelectionId,
        policyPackVersion: PACK_V2,
        profileVersion: '1.1.0',
      });
    }
    const view = await getOwn.execute({
      principal: alice,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      at: NOW,
    });
    expect(view.ok && view.value.kind === 'SELECTION').toBe(true);
  });

  it('detects a concurrent pack-version change during recording: typed refusal, nothing recorded', async () => {
    optionSource
      .withOptionSet(zakatOptionSet(PACK_V1, RACE_JURISDICTION))
      .flipTo('ZAKAT', RACE_JURISDICTION, {
        kind: 'OPTION_SET',
        optionSet: zakatOptionSet(PACK_V2, RACE_JURISDICTION),
      });
    const denied = await record.execute({
      principal: dave,
      capabilityId: 'ZAKAT',
      jurisdictionRef: RACE_JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_A,
      profileVersion: '1.0.0',
      now: NOW,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toMatchObject({
        kind: 'PACK_VERSION_MISMATCH',
        expectedPackVersion: PACK_V1,
        applicablePackVersion: PACK_V2,
        detected: 'AT_PIN',
      });
    }
    expect((await rawAsPrincipal(dave, `SELECT id FROM subject_policy_selections`)).rowCount).toBe(
      0,
    );
  });

  let carolSelectionId: string;

  it('denies an expired selection on read — temporal validation, not the stored marker', async () => {
    const expiry = new Date('2026-08-16T13:00:00.000Z');
    const recorded = await record.execute({
      principal: carol,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V2,
      profileRef: PROFILE_B,
      profileVersion: '2.0.0',
      effectiveTo: expiry,
      now: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    carolSelectionId = recorded.value.id;

    const beforeExpiry = await getOwn.execute({
      principal: carol,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      at: new Date('2026-08-16T12:30:00.000Z'),
    });
    expect(beforeExpiry.ok && beforeExpiry.value.kind === 'SELECTION').toBe(true);

    const afterExpiry = new Date('2026-08-16T14:00:00.000Z');
    const view = await getOwn.execute({
      principal: carol,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      at: afterExpiry,
    });
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value).toMatchObject({
        kind: 'SELECTION_EXPIRED',
        selectionId: carolSelectionId,
        expiredAt: expiry,
      });
    }
    const pinned = await forResolution.execute({
      principal: carol,
      capabilityId: 'ZAKAT',
      at: afterExpiry,
    });
    expect(pinned.ok).toBe(true);
    if (pinned.ok) {
      expect(pinned.value).toEqual({
        kind: 'NO_SELECTION_APPLICABLE',
        cause: 'SELECTION_EXPIRED',
      });
    }
  });

  it('immutability and the transition matrix hold against every level, including the table owner', async () => {
    // Content edit under the owner's own principal context: trigger raises.
    const edit = await rawAsPrincipal(
      alice,
      `UPDATE subject_policy_selections SET profile_version = '3.0.0' WHERE id = $1`,
      [secondSelectionId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(edit).toBeInstanceOf(PgError);
    expect((edit as PgError).message).toContain('immutable');

    // SUPERSEDED -> ACTIVE resurrection: refused (only ACTIVE transitions out).
    const resurrect = await rawAsPrincipal(
      alice,
      `UPDATE subject_policy_selections SET status = 'ACTIVE' WHERE id = $1`,
      [firstSelectionId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(resurrect).toBeInstanceOf(PgError);
    expect((resurrect as PgError).sqlState).toBe('P0001');

    // ACTIVE -> EXPIRED is a lawful arm (a later lifecycle job's transition);
    // the read path derived expiry already, so nothing changes for readers.
    const expire = await rawAsPrincipal(
      carol,
      `UPDATE subject_policy_selections SET status = 'EXPIRED' WHERE id = $1`,
      [carolSelectionId],
    );
    expect(expire.rowCount).toBe(1);

    // Superuser bypasses RLS but not the trigger: content edit raises…
    const superEdit = await superuserAdapter
      .query(`UPDATE subject_policy_selections SET policy_pack_version = 'qa/v9' WHERE id = $1`, [
        firstSelectionId,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(superEdit).toBeInstanceOf(PgError);
    expect((superEdit as PgError).sqlState).toBe('P0001');

    // …DELETE: revoked grants for the app role (42501)…
    const appDelete = await appAdapter.query(`DELETE FROM subject_policy_selections`).then(
      () => null,
      (error: unknown) => error,
    );
    expect((appDelete as PgError).sqlState).toBe('42501');

    // …and the trigger even for a superuser, row-targeted and TRUNCATE alike.
    const superDelete = await superuserAdapter
      .query(`DELETE FROM subject_policy_selections WHERE id = $1`, [firstSelectionId])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superDelete as PgError).sqlState).toBe('P0001');
    const superTruncate = await superuserAdapter
      .query(`TRUNCATE public.subject_policy_selections`)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superTruncate as PgError).sqlState).toBe('P0001');
  });

  it('withdrawal preserves the row; a withdrawn election resolves to nothing from its instant on', async () => {
    const recorded = await record.execute({
      principal: erin,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V2,
      profileRef: PROFILE_A,
      profileVersion: '1.1.0',
      now: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const later = new Date('2026-08-16T15:00:00.000Z');
    const withdrawn = await withdraw.execute({
      principal: erin,
      selectionId: recorded.value.id,
      now: later,
    });
    expect(withdrawn.ok).toBe(true);

    const rows = await repository.listSelections(erin, 'ZAKAT');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: recorded.value.id, status: 'WITHDRAWN' });
    expect(rows[0]?.withdrawnAt).toEqual(later);

    // From the withdrawal instant on: no effective selection…
    const after = await forResolution.execute({
      principal: erin,
      capabilityId: 'ZAKAT',
      at: new Date('2026-08-16T16:00:00.000Z'),
    });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value).toEqual({ kind: 'NO_SELECTION_APPLICABLE', cause: 'NO_SELECTION' });
    }
    // …while instants BEFORE it still replay the election (history intact).
    const before = await forResolution.execute({
      principal: erin,
      capabilityId: 'ZAKAT',
      at: new Date('2026-08-16T13:00:00.000Z'),
    });
    expect(before.ok).toBe(true);
    if (before.ok) {
      expect(before.value).toMatchObject({
        kind: 'PINNED_VERSIONS',
        selectionId: recorded.value.id,
      });
    }

    const again = await withdraw.execute({
      principal: erin,
      selectionId: recorded.value.id,
      now: later,
    });
    expect(!again.ok && again.error.kind === 'SELECTION_NOT_ACTIVE').toBe(true);
  });

  it('RLS posture: ENABLEd AND FORCEd with a real policy, and deliberately NOT on the allow-list', async () => {
    const posture = await appAdapter.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'subject_policy_selections'`,
    );
    expect(posture.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await appAdapter.query(
      `SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'subject_policy_selections'`,
    );
    expect(policies.rowCount).toBeGreaterThan(0);

    // Subject-owned and RLS'd: an allow-list entry would be a contradiction.
    const allowList = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'packages/platform/db/rls-allow-list.json'), 'utf8'),
    ) as Array<{ table: string }>;
    expect(allowList.some((entry) => entry.table === 'public.subject_policy_selections')).toBe(
      false,
    );
  });

  it('audits every state change with REFERENCE-ONLY metadata — the leak regression', async () => {
    const actions = await appAdapter.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit.audit_events WHERE action LIKE 'subjectpolicy.%' ORDER BY action`,
    );
    expect(actions.rows.map((row) => row.action)).toEqual([
      'subjectpolicy.selection.recorded',
      'subjectpolicy.selection.withdrawn',
    ]);

    // Grep the ENTIRE audit rows (metadata and scalar columns serialized) for
    // option content: the profile references, the snapshot hash, and any
    // option-content-shaped key must be absent. The selection TABLE holds the
    // references (CONFIDENTIAL, RLS'd); the audit trail must not.
    const serialized = await appAdapter.query<{ row_text: string }>(
      `SELECT to_jsonb(e)::text AS row_text
         FROM audit.audit_events e
        WHERE action LIKE 'subjectpolicy.%'`,
    );
    expect(serialized.rowCount).toBeGreaterThan(0);
    for (const { row_text } of serialized.rows) {
      expect(row_text).not.toContain(PROFILE_A);
      expect(row_text).not.toContain(PROFILE_B);
      expect(row_text).not.toContain(SNAPSHOT_CANARY);
      expect(row_text).not.toContain('methodology');
      expect(row_text).not.toMatch(/profile_?[rR]ef|snapshot/);
    }

    const metadataKeys = await appAdapter.query<{ key: string }>(
      `SELECT DISTINCT k.key
         FROM audit.audit_events e,
              LATERAL jsonb_object_keys(coalesce(e.before_metadata, '{}'::jsonb) || coalesce(e.after_metadata, '{}'::jsonb)) AS k(key)
        WHERE e.action LIKE 'subjectpolicy.%'`,
    );
    for (const { key } of metadataKeys.rows) {
      expect(key).not.toMatch(/profileRef|profile_ref|snapshot|option/i);
    }
  });
});
