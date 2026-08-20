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
import { QA_V1, jurisdictionId, resolveEffectivePolicy } from '@karar/jurisdiction-policy';

import { JurisdictionAuditTrail } from '../application/audit-trail.js';
import {
  AssignUserJurisdiction,
  EndUserJurisdictionAssignment,
  GetEffectiveUserJurisdiction,
} from '../application/use-cases/user-assignments.js';
import {
  AssignTenantJurisdiction,
  GetEffectiveTenantJurisdiction,
} from '../application/use-cases/tenant-assignments.js';
import {
  ActivatePackVersion,
  GetActivePackVersion,
  RetirePackVersion,
} from '../application/use-cases/pack-activation.js';
import {
  PrismaTenantJurisdictionAssignmentRepository,
  PrismaUserJurisdictionAssignmentRepository,
} from '../infrastructure/persistence/prisma-assignment-repositories.js';
import {
  PrismaJurisdictionDirectory,
  PrismaJurisdictionSettingsReader,
  PrismaPackActivationLedger,
} from '../infrastructure/persistence/prisma-configuration-repositories.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { PermissiveForTestsPolicyService } from './fakes/policy-services.js';
import { syntheticApprovedPack } from './fixtures/synthetic-approved-pack.js';

// Live-PostgreSQL evidence for the jurisdiction module (migrations
// 0070-0075): the seeded reference registers (no fabricated approvals), RLS
// on BOTH assignment tables asserted on NON-EMPTY data first, the end-only
// assignment guards, the verification/source CHECKs, the append-only
// activation ledger (owner included), the lifecycle predicate at the
// activation use case (DRAFT denied outside local), and the allow-list
// documentation for every deliberately global table. Same probe-or-skip
// pattern as modules/consent.

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
      `JURISDICTION TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for migrations 0070-0075 and the pack',
      'activation gates; a skipped run proves nothing. Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  POSTGRES_PORT=5433 pnpm --filter @karar/jurisdiction test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_jurisdiction`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const operator = { principalRef: `staff:${randomUUID()}`, tenantRef: null };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe.skipIf(unreachable !== null)('jurisdiction (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let userAssignments: PrismaUserJurisdictionAssignmentRepository;
  let tenantAssignments: PrismaTenantJurisdictionAssignmentRepository;
  let directory: PrismaJurisdictionDirectory;
  let settingsReader: PrismaJurisdictionSettingsReader;
  let ledger: PrismaPackActivationLedger;
  let audit: JurisdictionAuditTrail;

  const policy = new PermissiveForTestsPolicyService();
  const ids = new Uuidv7IdSource();

  const tenant1 = TenantId.of(randomUUID());
  const tenant2 = TenantId.of(randomUUID());
  const alice = { userId: UserId.of(randomUUID()), tenantId: tenant1 };
  const bob = { userId: UserId.of(randomUUID()), tenantId: tenant2 };

  /** Raw SQL under a principal context — for adversarial probes. */
  async function rawAsPrincipal<T extends pg.QueryResultRow>(
    principal: { readonly tenantId: string; readonly userId: string },
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
      expect.arrayContaining([
        '0070_countries.sql',
        '0071_jurisdictions.sql',
        '0072_user_jurisdiction_assignments.sql',
        '0073_tenant_jurisdiction_assignments.sql',
        '0074_jurisdiction_settings.sql',
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

    userAssignments = new PrismaUserJurisdictionAssignmentRepository(prismaHandle);
    tenantAssignments = new PrismaTenantJurisdictionAssignmentRepository(prismaHandle);
    directory = new PrismaJurisdictionDirectory(prismaHandle.client);
    settingsReader = new PrismaJurisdictionSettingsReader(prismaHandle.client);
    ledger = new PrismaPackActivationLedger(prismaHandle.client);

    const recordAuditEvent = new RecordAuditEvent(
      new PostgresAuditWriter(appAdapter),
      new Uuidv7AuditEventIdSource(),
    );
    audit = new JurisdictionAuditTrail(recordAuditEvent, 'local-test');

    // The synthetic pack's jurisdiction must exist in the register for the
    // activation FK; insert it as the migrator (the register is SELECT-only
    // for karar_app — reviewed migrations own it in production).
    await migratorAdapter.query(
      `INSERT INTO public.jurisdictions
         (code, country_code, type, status, review_status, provenance, updated_at)
       VALUES ('ZZ-TEST', 'QA', 'SPECIAL_REGIME', 'DRAFT', 'NOT_SUBMITTED',
               'synthetic test regime — test databases only', now())`,
    );
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

  it('seeds the reference registers honestly: countries carry no rules, no jurisdiction is APPROVED', async () => {
    const countries = await directory.listCountries();
    expect(countries.map((c) => c.code)).toEqual(
      expect.arrayContaining(['QA', 'SA', 'AE', 'OM', 'KW', 'BH']),
    );
    const jurisdictions = await directory.listJurisdictions();
    expect(jurisdictions.length).toBeGreaterThanOrEqual(3);
    for (const record of jurisdictions) {
      expect(['DRAFT', 'PENDING_LEGAL_REVIEW']).toContain(record.status);
      expect(record.provenance.length).toBeGreaterThan(0);
    }
    // One country, two regimes: the model never assumes 1:1.
    const ae = jurisdictions.filter((record) => record.countryCode === 'AE');
    expect(ae.length).toBe(2);

    // The registers are SELECT-only for the app role: runtime writes refuse.
    const write = await appAdapter
      .query(`UPDATE public.jurisdictions SET status = 'APPROVED' WHERE code = 'QA'`)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((write as PgError).sqlState).toBe('42501');
  });

  let aliceAssignmentId = '';

  it('assigns a user jurisdiction (operator-side): supersede-on-assign, audited', async () => {
    const assign = new AssignUserJurisdiction(userAssignments, directory, policy, ids, audit);
    const first = await assign.execute({
      principal: operator,
      userId: alice.userId,
      tenantId: alice.tenantId,
      jurisdictionCode: 'QA',
      source: 'OPERATOR_ASSIGNED',
      verificationStatus: 'UNVERIFIED',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      reason: 'operator assignment during onboarding review',
      now: NOW,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    aliceAssignmentId = first.value.id;

    // A later provider verification supersedes: the first row is ended, not edited.
    const verified = await assign.execute({
      principal: operator,
      userId: alice.userId,
      tenantId: alice.tenantId,
      jurisdictionCode: 'QA',
      source: 'PROVIDER_VERIFIED',
      verificationStatus: 'VERIFIED',
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
      reason: 'identity provider verified residency',
      now: NOW,
    });
    expect(verified.ok).toBe(true);

    const rows = await userAssignments.listForPrincipal(alice);
    expect(rows).toHaveLength(2);
    const ended = rows.find((row) => row.id === aliceAssignmentId);
    expect(ended?.effectiveTo).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('rejects an unknown jurisdiction and an illegal (source, verification) pair as typed outcomes', async () => {
    const assign = new AssignUserJurisdiction(userAssignments, directory, policy, ids, audit);
    const unknown = await assign.execute({
      principal: operator,
      userId: alice.userId,
      tenantId: alice.tenantId,
      jurisdictionCode: 'XX-NOWHERE',
      source: 'OPERATOR_ASSIGNED',
      verificationStatus: 'UNVERIFIED',
      effectiveFrom: NOW,
      reason: 'test',
      now: NOW,
    });
    expect(!unknown.ok && unknown.error.kind).toBe('UNKNOWN_JURISDICTION');

    const mismatched = await assign.execute({
      principal: operator,
      userId: alice.userId,
      tenantId: alice.tenantId,
      jurisdictionCode: 'QA',
      source: 'USER_DECLARED',
      verificationStatus: 'VERIFIED',
      effectiveFrom: NOW,
      reason: 'test',
      now: NOW,
    });
    expect(!mismatched.ok && mismatched.error.kind).toBe('VERIFICATION_SOURCE_MISMATCH');

    // The schema enforces the same rule below the use case: a direct insert
    // of USER_DECLARED+VERIFIED violates the CHECK.
    const direct = await rawAsPrincipal(
      alice,
      `INSERT INTO user_jurisdiction_assignments
         (id, user_id, tenant_id, jurisdiction_code, source, verification_status,
          effective_from, reason, assigned_by)
       VALUES ($1, $2, $3, 'QA', 'USER_DECLARED', 'VERIFIED', now(), 'cheat', 'test')`,
      [randomUUID(), alice.userId, alice.tenantId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(direct).toBeInstanceOf(PgError);
    expect((direct as PgError).sqlState).toBe('23514'); // check_violation
  });

  it('RLS (user assignments): own reads NON-EMPTY FIRST, then cross-principal and no-context denial', async () => {
    // Own-principal: non-empty — an empty pass proves nothing.
    const own = await userAssignments.listForPrincipal(alice);
    expect(own.length).toBeGreaterThan(0);
    const ownRaw = await rawAsPrincipal(alice, `SELECT id FROM user_jurisdiction_assignments`);
    expect(ownRaw.rowCount).toBeGreaterThan(0);

    // Cross-tenant principal: sees nothing, changes nothing.
    const crossRead = await rawAsPrincipal(bob, `SELECT id FROM user_jurisdiction_assignments`);
    expect(crossRead.rowCount).toBe(0);
    const crossUpdate = await rawAsPrincipal(
      bob,
      `UPDATE user_jurisdiction_assignments SET effective_to = now() WHERE id = $1`,
      [aliceAssignmentId],
    );
    expect(crossUpdate.rowCount).toBe(0);

    // Same tenant, different user: both GUCs must match, not just tenant.
    const sameTenantOtherUser = await rawAsPrincipal(
      { tenantId: alice.tenantId, userId: UserId.of(randomUUID()) },
      `SELECT id FROM user_jurisdiction_assignments`,
    );
    expect(sameTenantOtherUser.rowCount).toBe(0);

    // Missing GUCs entirely: fail closed.
    const noContext = await appAdapter.query(`SELECT id FROM user_jurisdiction_assignments`);
    expect(noContext.rowCount).toBe(0);

    // Tenant GUC alone (user GUC unset): still nothing — both are required.
    const tenantOnly = await appAdapter.withTransaction(async (tx) => {
      await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [alice.tenantId]);
      return tx.query(`SELECT id FROM user_jurisdiction_assignments`);
    });
    expect(tenantOnly.rowCount).toBe(0);
  });

  it('assignment rows are end-only history: edits, deletes, and re-ending refuse at every level', async () => {
    // The ended row cannot be re-ended or edited, even by its own subject.
    const reEnd = await rawAsPrincipal(
      alice,
      `UPDATE user_jurisdiction_assignments SET effective_to = now() WHERE id = $1`,
      [aliceAssignmentId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(reEnd).toBeInstanceOf(PgError);
    expect((reEnd as PgError).message).toContain('ended and immutable');

    const edit = await rawAsPrincipal(
      alice,
      `UPDATE user_jurisdiction_assignments SET reason = 'rewritten' WHERE effective_to IS NULL`,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(edit).toBeInstanceOf(PgError);
    expect((edit as PgError).message).toContain('never edited');

    // DELETE: no grant for the app role (42501)…
    const appDelete = await appAdapter.query(`DELETE FROM user_jurisdiction_assignments`).then(
      () => null,
      (error: unknown) => error,
    );
    expect((appDelete as PgError).sqlState).toBe('42501');
    // …and the trigger raises even for a superuser, which bypasses RLS.
    const superDelete = await superuserAdapter
      .query(`DELETE FROM user_jurisdiction_assignments WHERE id = $1`, [aliceAssignmentId])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superDelete as PgError).sqlState).toBe('P0001');
  });

  it('reads the effective user jurisdiction temporally and exposes verification for fail-closed gating', async () => {
    const read = new GetEffectiveUserJurisdiction(userAssignments);

    const early = await read.execute({
      principal: alice,
      at: new Date('2026-01-15T00:00:00.000Z'),
    });
    expect(early.ok && early.value.kind).toBe('UNVERIFIED');

    const late = await read.execute({ principal: alice, at: new Date('2026-03-01T00:00:00.000Z') });
    expect(late.ok && late.value.kind).toBe('VERIFIED');
    if (late.ok && late.value.kind === 'VERIFIED') {
      expect(String(late.value.assignment.jurisdictionCode)).toBe('QA');
    }

    const before = await read.execute({
      principal: alice,
      at: new Date('2025-06-01T00:00:00.000Z'),
    });
    expect(before.ok && before.value.kind).toBe('NONE');

    // A principal with no rows resolves NONE — the deny arm, not an error.
    const none = await read.execute({ principal: bob, at: NOW });
    expect(none.ok && none.value.kind).toBe('NONE');
  });

  it('ending a user assignment leaves history intact and audited; ending nothing is NOT_FOUND', async () => {
    const end = new EndUserJurisdictionAssignment(userAssignments, policy, audit);
    const ended = await end.execute({
      principal: operator,
      userId: alice.userId,
      tenantId: alice.tenantId,
      endsAt: new Date('2026-06-01T00:00:00.000Z'),
      reason: 'subject relocated; new assignment pending review',
      now: NOW,
    });
    expect(ended.ok).toBe(true);

    const after = await new GetEffectiveUserJurisdiction(userAssignments).execute({
      principal: alice,
      at: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(after.ok && after.value.kind).toBe('NONE');
    // Nothing vanished: both historical rows remain.
    expect(await userAssignments.listForPrincipal(alice)).toHaveLength(2);

    const nothingOpen = await end.execute({
      principal: operator,
      userId: alice.userId,
      tenantId: alice.tenantId,
      endsAt: NOW,
      reason: 'no-op',
      now: NOW,
    });
    expect(!nothingOpen.ok && nothingOpen.error.kind).toBe('NOT_FOUND');
  });

  it('RLS (tenant assignments): own tenant NON-EMPTY FIRST, cross-tenant and no-context denied', async () => {
    const assign = new AssignTenantJurisdiction(tenantAssignments, directory, policy, ids, audit);
    const assigned = await assign.execute({
      principal: operator,
      tenantId: tenant1,
      actingUserId: alice.userId,
      jurisdictionCode: 'QA',
      source: 'CONTRACT_DERIVED',
      verificationStatus: 'VERIFIED',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      reason: 'operating jurisdiction per service contract',
      now: NOW,
    });
    expect(assigned.ok).toBe(true);

    // Own tenant: non-empty at repository and raw-SQL layers.
    const own = await tenantAssignments.listForTenant({
      tenantId: tenant1,
      userId: alice.userId,
    });
    expect(own.length).toBeGreaterThan(0);
    const ownRaw = await rawAsPrincipal(alice, `SELECT id FROM tenant_jurisdiction_assignments`);
    expect(ownRaw.rowCount).toBeGreaterThan(0);

    // Cross-tenant: nothing visible, nothing changeable.
    const crossRaw = await rawAsPrincipal(bob, `SELECT id FROM tenant_jurisdiction_assignments`);
    expect(crossRaw.rowCount).toBe(0);
    const crossUpdate = await rawAsPrincipal(
      bob,
      `UPDATE tenant_jurisdiction_assignments SET effective_to = now()`,
    );
    expect(crossUpdate.rowCount).toBe(0);

    // No context: fail closed.
    const noContext = await appAdapter.query(`SELECT id FROM tenant_jurisdiction_assignments`);
    expect(noContext.rowCount).toBe(0);

    const state = await new GetEffectiveTenantJurisdiction(tenantAssignments).execute({
      principal: { tenantId: tenant1, userId: alice.userId },
      at: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(state.ok && state.value.kind).toBe('VERIFIED');
  });

  it('pack activation: qa/v1 (DRAFT) activates in local, is DENIED for production, and unapproved packs never activate outside local (§46)', async () => {
    const activate = new ActivatePackVersion(ledger, directory, policy, ids, audit);

    // DRAFT in production: denied by the pure predicate, nothing written.
    const draftProduction = await activate.execute({
      principal: operator,
      pack: QA_V1,
      environment: 'production',
      reason: 'attempting to launch the draft',
      now: NOW,
    });
    expect(!draftProduction.ok && draftProduction.error.kind).toBe('ACTIVATION_DENIED');

    // Unapproved, shape 1 — an APPROVED claim without evidence: structural
    // validation refuses it before the predicate is even consulted.
    const unevidenced = await activate.execute({
      principal: operator,
      pack: syntheticApprovedPack({ approvalReference: null }),
      environment: 'staging',
      reason: 'attempting to activate without approval evidence',
      now: NOW,
    });
    expect(unevidenced.ok).toBe(false);
    if (!unevidenced.ok && unevidenced.error.kind === 'PACK_INVALID') {
      expect(unevidenced.error.findings.map((f) => f.kind)).toContain('APPROVAL_EVIDENCE_MISSING');
    } else {
      expect.fail(`expected PACK_INVALID, got ${JSON.stringify(unevidenced)}`);
    }

    // Unapproved, shape 2 — a valid pack that simply is not approved yet:
    // the lifecycle predicate denies outside local.
    const pendingPack = {
      ...syntheticApprovedPack({}),
      lifecycle: 'PENDING_LEGAL_REVIEW' as const,
      reviewStatus: 'PENDING_LEGAL_REVIEW' as const,
      approvalReference: null,
    };
    const pendingDenied = await activate.execute({
      principal: operator,
      pack: pendingPack,
      environment: 'staging',
      reason: 'attempting to activate an unapproved pack',
      now: NOW,
    });
    expect(!pendingDenied.ok && pendingDenied.error.kind).toBe('ACTIVATION_DENIED');

    // The ledger is untouched by denials.
    const ledgerRows = await appAdapter.query(`SELECT id FROM policy_pack_activations`);
    expect(ledgerRows.rowCount).toBe(0);

    // qa/v1 in LOCAL: permitted — local development may load drafts.
    const local = await activate.execute({
      principal: operator,
      pack: QA_V1,
      environment: 'local',
      reason: 'local development draft activation',
      now: new Date('2026-08-16T12:00:00.000Z'),
    });
    expect(local.ok).toBe(true);
    if (local.ok) {
      expect(local.value.packLifecycleAtActivation).toBe('DRAFT');
    }

    const active = await new GetActivePackVersion(ledger, directory).execute({
      jurisdictionCode: 'QA',
      environment: 'local',
    });
    expect(active.ok && active.value).toMatchObject({ active: true, packVersion: 'qa/v1' });

    // Re-activating the same version is refused — the ledger stays meaningful.
    const again = await activate.execute({
      principal: operator,
      pack: QA_V1,
      environment: 'local',
      reason: 'duplicate',
      now: new Date('2026-08-16T13:00:00.000Z'),
    });
    expect(!again.ok && again.error.kind).toBe('ALREADY_ACTIVE');
  });

  it('activates a synthetic APPROVED pack for production and retires it; the ledger keeps full history', async () => {
    const activate = new ActivatePackVersion(ledger, directory, policy, ids, audit);
    const retire = new RetirePackVersion(ledger, directory, policy, ids, audit);
    const pack = syntheticApprovedPack({});

    const activated = await activate.execute({
      principal: operator,
      pack,
      environment: 'production',
      reason: 'synthetic approved pack for ledger evidence',
      now: new Date('2026-08-16T12:00:00.000Z'),
    });
    expect(activated.ok).toBe(true);

    // Retiring a version that is not the active one is a typed refusal.
    const wrongVersion = await retire.execute({
      principal: operator,
      pack: { ...pack, version: 'zz-test/v9' },
      environment: 'production',
      reason: 'wrong version',
      now: new Date('2026-08-16T13:00:00.000Z'),
    });
    expect(!wrongVersion.ok && wrongVersion.error.kind).toBe('NOT_ACTIVE');

    const retired = await retire.execute({
      principal: operator,
      pack,
      environment: 'production',
      reason: 'retiring the synthetic pack',
      now: new Date('2026-08-16T14:00:00.000Z'),
    });
    expect(retired.ok).toBe(true);

    const afterRetire = await new GetActivePackVersion(ledger, directory).execute({
      jurisdictionCode: 'ZZ-TEST',
      environment: 'production',
    });
    expect(afterRetire.ok && afterRetire.value.active).toBe(false);

    // History: both events remain, ordered.
    const events = await ledger.listFor(jurisdictionId('ZZ-TEST'), 'production');
    expect(events.map((event) => event.action)).toEqual(['ACTIVATED', 'RETIRED']);
  });

  it('the ledger pins provenance: a retired version still resolves historically, unchanged by a successor', async () => {
    const pack = syntheticApprovedPack({});
    const successor = { ...syntheticApprovedPack({ version: 'zz-test/v2' }) };

    // The ledger recorded zz-test/v1 ACTIVATED then RETIRED in the previous
    // test; that recorded VERSION is what a historical record would pin.
    const events = await ledger.listFor(jurisdictionId('ZZ-TEST'), 'production');
    const pinnedVersion = events[0]?.packVersion as string;
    expect(pinnedVersion).toBe('zz-test/v1');

    // Resolving that exact version still works after retirement — history is
    // never rewritten — and the result carries jurisdiction + version +
    // per-capability strategy in its provenance.
    const historical = resolveEffectivePolicy({
      jurisdiction: jurisdictionId('ZZ-TEST'),
      requestedAt: new Date('2026-08-16T15:00:00.000Z'),
      packs: [{ ...pack, lifecycle: 'RETIRED' }],
      selection: { kind: 'EXPLICIT_VERSION', version: pinnedVersion },
      environment: 'production',
    });
    expect(historical.ok).toBe(true);
    if (!historical.ok) return;
    expect(historical.value.provenance).toMatchObject({
      packVersion: 'zz-test/v1',
      packLifecycle: 'RETIRED',
      selection: 'EXPLICIT_VERSION',
      environment: 'production',
    });
    expect(String(historical.value.provenance.jurisdiction)).toBe('ZZ-TEST');
    expect(historical.value.provenance.strategyByCapability).toMatchObject({
      SYNTH_LEDGER: 'AT_CREATION',
    });

    // A successor version appearing changes nothing about the pinned one.
    const afterSuccessor = resolveEffectivePolicy({
      jurisdiction: jurisdictionId('ZZ-TEST'),
      requestedAt: new Date('2026-08-16T15:00:00.000Z'),
      packs: [{ ...pack, lifecycle: 'RETIRED' }, successor],
      selection: { kind: 'EXPLICIT_VERSION', version: pinnedVersion },
      environment: 'production',
    });
    expect(afterSuccessor.ok).toBe(true);
    if (afterSuccessor.ok) {
      expect(afterSuccessor.value).toEqual(historical.value);
    }
  });

  it('the activation ledger is append-only for EVERYONE, owner included', async () => {
    const anyRow = await superuserAdapter.query<{ id: string }>(
      `SELECT id FROM policy_pack_activations LIMIT 1`,
    );
    expect(anyRow.rowCount).toBe(1);
    const id = anyRow.rows[0]?.id;

    // karar_app: UPDATE/DELETE are not even granted (42501).
    const appUpdate = await appAdapter
      .query(`UPDATE policy_pack_activations SET reason = 'rewritten' WHERE id = $1`, [id])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((appUpdate as PgError).sqlState).toBe('42501');
    const appDelete = await appAdapter
      .query(`DELETE FROM policy_pack_activations WHERE id = $1`, [id])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((appDelete as PgError).sqlState).toBe('42501');

    // The table owner (superuser bypasses RLS and grants): trigger raises.
    const superUpdate = await superuserAdapter
      .query(`UPDATE policy_pack_activations SET reason = 'rewritten' WHERE id = $1`, [id])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superUpdate as PgError).sqlState).toBe('P0001');
    const superDelete = await superuserAdapter
      .query(`DELETE FROM policy_pack_activations WHERE id = $1`, [id])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((superDelete as PgError).sqlState).toBe('P0001');
    const superTruncate = await superuserAdapter.query(`TRUNCATE policy_pack_activations`).then(
      () => null,
      (error: unknown) => error,
    );
    expect((superTruncate as PgError).sqlState).toBe('P0001');
  });

  it('jurisdiction settings are restrict-only rows, SELECT-only for the app role; absent row = no restriction', async () => {
    expect(await settingsReader.findSettings(jurisdictionId('QA'))).toBeNull();

    // The app role cannot write settings this phase (no grant).
    const appInsert = await appAdapter
      .query(
        `INSERT INTO jurisdiction_settings
           (jurisdiction_code, disabled_capability_ids, ai_processing_suspended, version, reason, updated_by, updated_at)
         VALUES ('QA', '{}', false, 1, 'test', 'test', now())`,
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((appInsert as PgError).sqlState).toBe('42501');

    // Seeded via the migrator (migration-or-operator-use-case-only writes),
    // the reader surfaces the restrict-only shape.
    await migratorAdapter.query(
      `INSERT INTO public.jurisdiction_settings
         (jurisdiction_code, disabled_capability_ids, ai_processing_suspended, version, reason, updated_by, updated_at)
       VALUES ('QA', ARRAY['SYNTH_LEDGER'], true, 1,
               'test restriction row', 'migration:test', now())`,
    );
    const settings = await settingsReader.findSettings(jurisdictionId('QA'));
    expect(settings).toMatchObject({
      disabledCapabilityIds: ['SYNTH_LEDGER'],
      aiProcessingSuspended: true,
      version: 1,
    });
  });

  it('RLS posture: assignment tables FORCEd with policies; every global table is allow-listed with reasons', async () => {
    const posture = await appAdapter.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname IN (
            'countries', 'jurisdictions', 'user_jurisdiction_assignments',
            'tenant_jurisdiction_assignments', 'jurisdiction_settings',
            'policy_pack_activations'
          )`,
    );
    const byName = new Map(posture.rows.map((row) => [row.relname, row]));
    expect(byName.size).toBe(6);

    for (const subjectTable of ['user_jurisdiction_assignments', 'tenant_jurisdiction_assignments']) {
      expect(byName.get(subjectTable)).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      const policies = await appAdapter.query(
        `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
        [subjectTable],
      );
      expect(policies.rowCount).toBeGreaterThan(0);
    }

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

  it('every jurisdiction state change left an audit record', async () => {
    const audited = await appAdapter.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit.audit_events WHERE action LIKE 'jurisdiction.%' ORDER BY action`,
    );
    expect(audited.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'jurisdiction.user_assignment.recorded',
        'jurisdiction.user_assignment.ended',
        'jurisdiction.tenant_assignment.recorded',
        'jurisdiction.pack.activated',
        'jurisdiction.pack.retired',
      ]),
    );
  });
});
