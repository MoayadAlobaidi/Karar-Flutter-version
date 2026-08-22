import { copyFile, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { PostgresPersistenceAdapter } from './adapter.js';
import { BootstrapError, bootstrapRolesAndDatabase, resetLocalDatabase } from './bootstrap.js';
import {
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  type DatabaseRole,
} from './connection-profile.js';
import { mapPgError, PgError } from './errors.js';
import {
  defaultMigrationsDir,
  loadMigrationFiles,
  MigrationError,
  migrateToLatest,
  verifyMigrations,
} from './migrations.js';
import { SecretValue } from '../config/secret-value.js';
import { dropScratchDatabase } from './scratch-database.js';
import { skipUnlessDatabaseRequired } from './connection-budget.js';

// Contract tests against a real PostgreSQL (docs/architecture/
// database-portability.md section 7). All database tests live in this one
// file deliberately: vitest runs tests within a file serially, and these
// tests share cluster-global state (the karar_migrator/karar_app roles).
//
// If PostgreSQL is unreachable the suite SKIPS with a loud banner rather
// than passing silently — but a skip is never acceptable evidence for a
// change to this package; start the database and rerun.

const pid = process.pid;
const scratchDbName = (suffix: string): string => `karar_test_${pid}_${suffix}`;
const createdDatabases: string[] = [];
const scratchDirs: string[] = [];

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

// The real migration set, loaded once: assertions below are count-agnostic so
// later workstreams' migrations (audit 0010-0019, eventing 0020-0029) extend
// this suite's coverage instead of breaking it. Test fixtures use 99xx
// numbers, above every assigned range (db/migrations/README.md).
const realMigrations = await loadMigrationFiles(defaultMigrationsDir());
const realFilenames = realMigrations.map((file) => file.filename);
const realVersions = realMigrations.map((file) => file.version);

const unreachable = await probePostgres();
skipUnlessDatabaseRequired('platform contract suite', unreachable);
if (unreachable !== null) {
  const target = `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`;

  // process.stderr directly: vitest's reporter suppresses console output from
  // module scope, and this warning must never be suppressible.
  process.stderr.write(
    [
      '='.repeat(76),
      `DATABASE CONTRACT TESTS SKIPPED — PostgreSQL is not reachable at ${target}`,
      `(${unreachable})`,
      'These tests are the evidence for the database foundation; a skipped run',
      'proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/platform test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

async function withAdapter<T>(
  role: DatabaseRole,
  database: string,
  fn: (adapter: PostgresPersistenceAdapter) => Promise<T>,
): Promise<T> {
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(role, { database }),
  );
  try {
    return await fn(adapter);
  } finally {
    await adapter.end();
  }
}

/** Bootstraps a scratch database and registers it for afterAll teardown. */
async function createScratchDatabase(suffix: string): Promise<string> {
  const database = scratchDbName(suffix);
  createdDatabases.push(database);
  const result = await bootstrapRolesAndDatabase({ database });
  expect(result.database).toBe(database);
  return database;
}

/** Copies the real migrations into a scratch directory tests may then mutate. */
async function createScratchMigrationsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'karar-migrations-'));
  scratchDirs.push(dir);
  const source = defaultMigrationsDir();
  for (const entry of await readdir(source)) {
    if (entry.endsWith('.sql')) {
      await copyFile(join(source, entry), join(dir, entry));
    }
  }
  return dir;
}

const PROBE_MIGRATION = `-- 9998_migration_probe
-- Test-only probe table exercising the grant convention in README.md:
-- karar_app receives the minimal DML this table needs (SELECT, INSERT) and
-- nothing else, so UPDATE/DELETE/DDL denials below prove the convention.
-- rollback: test scratch database; removed by dropping the database.
CREATE TABLE platform.migration_probe (
  id   integer PRIMARY KEY,
  note text    NOT NULL
);
GRANT SELECT, INSERT ON platform.migration_probe TO karar_app;
`;

const BAD_MIGRATION = `-- 9999_broken_on_purpose
-- rollback: never applies; the duplicate insert below aborts the transaction.
CREATE TABLE platform.broken (id integer PRIMARY KEY);
INSERT INTO platform.broken (id) VALUES (1);
INSERT INTO platform.broken (id) VALUES (1);
`;

describe.skipIf(unreachable !== null)('database contract (live PostgreSQL)', () => {
  afterAll(async () => {
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      for (const database of createdDatabases) {
        await dropScratchDatabase(maintenance, database);
      }
    } finally {
      await maintenance.end();
    }
    for (const dir of scratchDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  let dbA: string; // fresh-to-latest
  let dbB: string; // second fresh database
  let dbC: string; // probe table, privilege denial, adapter contract
  let dbD: string; // invalid migration, checksum drift
  let probeDir: string; // real migrations + 0003_migration_probe
  let driftDir: string; // real migrations, mutated for drift scenarios

  // PROVISIONS A DATABASE, so the 5-second default is the wrong bound. Measured
  // alone this test takes ~0.4s; under the full suite the file it lives in
  // takes ~20s, because every integration suite here is contending for one
  // PostgreSQL. It timed out once in ten consecutive canonical runs.
  //
  // This is a TIMEOUT ADJUSTMENT, not a fix: nothing about the test got
  // faster. 30s is two orders of magnitude above the unloaded cost and still
  // well inside "something is genuinely hung", which is what a timeout is for.
  it('brings a fresh database from zero to latest and verifies clean', async () => {
    dbA = scratchDbName('a');
    createdDatabases.push(dbA);
    const bootstrap = await bootstrapRolesAndDatabase({ database: dbA });
    expect(bootstrap.createdDatabase).toBe(true);

    await withAdapter('migrator', dbA, async (adapter) => {
      const { applied } = await migrateToLatest({ adapter });
      expect(applied.map((file) => file.filename)).toEqual(realFilenames);
      expect(realFilenames.slice(0, 2)).toEqual([
        '0001_platform_and_audit_schemas.sql',
        '0002_public_schema_hygiene.sql',
      ]);

      const report = await verifyMigrations({ adapter });
      expect(report.status).toBe('clean');
      expect(report.metadataPresent).toBe(true);
      expect(report.pending).toEqual([]);
      expect(report.applied.map((row) => row.status)).toEqual(realFilenames.map(() => 'ok'));
    });
  }, 30_000);

  // PROVISIONS A DATABASE, so the 5-second default is the wrong bound. Measured
  // alone this test takes ~0.4s; under the full suite the file it lives in
  // takes ~20s, because every integration suite here is contending for one
  // PostgreSQL. It timed out once in ten consecutive canonical runs.
  //
  // This is a TIMEOUT ADJUSTMENT, not a fix: nothing about the test got
  // faster. 30s is two orders of magnitude above the unloaded cost and still
  // well inside "something is genuinely hung", which is what a timeout is for.
  it('creates a second fresh database identically, from zero', async () => {
    dbB = await createScratchDatabase('b');
    await withAdapter('migrator', dbB, async (adapter) => {
      const { applied } = await migrateToLatest({ adapter });
      expect(applied).toHaveLength(realFilenames.length);
      const report = await verifyMigrations({ adapter });
      expect(report.status).toBe('clean');

      // The second database's applied history is byte-identical to the first's.
      const first = await withAdapter('migrator', dbA, (a) => verifyMigrations({ adapter: a }));
      const shape = (r: typeof report) =>
        r.applied.map(({ version, name, checksum }) => ({ version, name, checksum }));
      expect(shape(report)).toEqual(shape(first));
    });
  }, 30_000);

  it('is idempotent: repeated migrate and verify are no-ops with stable reports', async () => {
    await withAdapter('migrator', dbA, async (adapter) => {
      const again = await migrateToLatest({ adapter });
      expect(again.applied).toEqual([]);

      const one = await verifyMigrations({ adapter });
      const two = await verifyMigrations({ adapter });
      expect(two).toEqual(one);
      expect(two.status).toBe('clean');
    });
  });

  it('ran migrations as karar_migrator, which is neither superuser nor RLS-exempt', async () => {
    // The metadata rows themselves record who applied each migration.
    await withAdapter('superuser', dbA, async (adapter) => {
      const rows = await adapter.query<{ applied_by: string; current: string }>(
        'SELECT applied_by, current_user AS current FROM platform.schema_migrations',
      );
      expect(rows.rows.length).toBeGreaterThan(0); // non-empty, not vacuously true
      for (const row of rows.rows) {
        expect(row.applied_by).toBe('karar_migrator');
        expect(row.applied_by).not.toBe(row.current); // and not the superuser running this probe
      }
    });

    // A live probe: connecting with the migrator profile really is that role.
    await withAdapter('migrator', dbA, async (adapter) => {
      const who = await adapter.query<{ user: string }>('SELECT current_user AS user');
      expect(who.rows[0]?.user).toBe('karar_migrator');
    });

    // Role attributes in pg_roles: restricted means restricted.
    await withAdapter('superuser', dbA, async (adapter) => {
      const roles = await adapter.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
      }>(
        `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
           FROM pg_catalog.pg_roles
          WHERE rolname IN ('karar_migrator', 'karar_app')
          ORDER BY rolname`,
      );
      expect(roles.rows.map((r) => r.rolname)).toEqual(['karar_app', 'karar_migrator']);
      for (const role of roles.rows) {
        expect(role, `attributes of ${role.rolname}`).toMatchObject({
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        });
      }
    });
  });

  // PROVISIONS A DATABASE, so the 5-second default is the wrong bound. Measured
  // alone this test takes ~0.4s; under the full suite the file it lives in
  // takes ~20s, because every integration suite here is contending for one
  // PostgreSQL. It timed out once in ten consecutive canonical runs.
  //
  // This is a TIMEOUT ADJUSTMENT, not a fix: nothing about the test got
  // faster. 30s is two orders of magnitude above the unloaded cost and still
  // well inside "something is genuinely hung", which is what a timeout is for.
  it('denies DDL to karar_app and allows exactly the granted DML', async () => {
    probeDir = await createScratchMigrationsDir();
    await writeFile(join(probeDir, '9998_migration_probe.sql'), PROBE_MIGRATION);
    dbC = await createScratchDatabase('c');
    await withAdapter('migrator', dbC, async (adapter) => {
      const { applied } = await migrateToLatest({ adapter, migrationsDir: probeDir });
      expect(applied).toHaveLength(realFilenames.length + 1);
    });

    await withAdapter('app', dbC, async (adapter) => {
      // Granted DML works, and the read asserts on non-empty expected data.
      await adapter.query('INSERT INTO platform.migration_probe (id, note) VALUES ($1, $2)', [
        1,
        'granted insert',
      ]);
      const rows = await adapter.query<{ id: number; note: string }>(
        'SELECT id, note FROM platform.migration_probe ORDER BY id',
      );
      expect(rows.rows).toEqual([{ id: 1, note: 'granted insert' }]);

      // Everything not granted is denied with insufficient_privilege (42501).
      const denied: Array<[string, string]> = [
        ['UPDATE', "UPDATE platform.migration_probe SET note = 'x' WHERE id = 1"],
        ['DELETE', 'DELETE FROM platform.migration_probe WHERE id = 1'],
        ['CREATE TABLE in public', 'CREATE TABLE public.karar_app_escape (id integer)'],
        ['CREATE TABLE in platform', 'CREATE TABLE platform.karar_app_escape (id integer)'],
        ['CREATE SCHEMA', 'CREATE SCHEMA karar_app_escape'],
        ['DROP TABLE', 'DROP TABLE platform.migration_probe'],
      ];
      for (const [label, sql] of denied) {
        const failure = await adapter.query(sql).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure, `${label} must be denied for karar_app`).toBeInstanceOf(PgError);
        expect((failure as PgError).code, `${label} error code`).toBe('insufficient_privilege');
        expect((failure as PgError).sqlState, `${label} sqlstate`).toBe('42501');
      }
    });

    // The denials had no effect: the probe table and its row survived.
    await withAdapter('migrator', dbC, async (adapter) => {
      const rows = await adapter.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM platform.migration_probe',
      );
      expect(rows.rows[0]?.count).toBe('1');
    });
  }, 30_000);

  it('adapter contract: session timeouts, transactions, error mapping, shutdown', async () => {
    const adapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database: dbC }),
    );
    try {
      // Profile timeouts arrive as per-session settings via connection startup.
      const timeouts = await adapter.query<{ statement: string; lock: string }>(
        "SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock",
      );
      expect(timeouts.rows[0]).toEqual({ statement: '30s', lock: '5s' });

      // Commit path: the write is visible after the transaction resolves.
      await adapter.withTransaction(async (tx) => {
        await tx.query('INSERT INTO platform.migration_probe (id, note) VALUES ($1, $2)', [
          2,
          'committed',
        ]);
      });
      const committed = await adapter.query('SELECT id FROM platform.migration_probe WHERE id = 2');
      expect(committed.rowCount).toBe(1);

      // Rollback path: the caller's own error type survives, the write does not.
      class DomainFailure extends Error {}
      await expect(
        adapter.withTransaction(async (tx) => {
          await tx.query('INSERT INTO platform.migration_probe (id, note) VALUES ($1, $2)', [
            3,
            'rolled back',
          ]);
          throw new DomainFailure('abort');
        }),
      ).rejects.toBeInstanceOf(DomainFailure);
      const rolledBack = await adapter.query(
        'SELECT id FROM platform.migration_probe WHERE id = 3',
      );
      expect(rolledBack.rowCount).toBe(0);

      // Driver errors map to the small typed surface.
      const duplicate = await adapter
        .query('INSERT INTO platform.migration_probe (id, note) VALUES ($1, $2)', [2, 'again'])
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(duplicate).toBeInstanceOf(PgError);
      expect((duplicate as PgError).code).toBe('unique_violation');
      expect((duplicate as PgError).sqlState).toBe('23505');

      // Shutdown is safe and terminal: later queries fail typed, end() is idempotent.
      await adapter.end();
      await expect(adapter.query('SELECT 1')).rejects.toMatchObject({
        name: 'PgError',
        code: 'connection_failure',
      });
      await expect(adapter.end()).resolves.toBeUndefined();
    } finally {
      await adapter.end();
    }
  });

  it('rolls back an invalid migration entirely and records nothing', async () => {
    driftDir = await createScratchMigrationsDir();
    await writeFile(join(driftDir, '9999_broken_on_purpose.sql'), BAD_MIGRATION);
    dbD = await createScratchDatabase('d');

    await withAdapter('migrator', dbD, async (adapter) => {
      const failure = await migrateToLatest({ adapter, migrationsDir: driftDir }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(MigrationError);
      expect((failure as MigrationError).kind).toBe('apply');
      expect((failure as MigrationError).message).toContain('9999_broken_on_purpose.sql');

      // Every good migration applied; the bad one left no metadata row...
      const applied = await adapter.query<{ version: number }>(
        'SELECT version FROM platform.schema_migrations ORDER BY version',
      );
      expect(applied.rows.map((row) => row.version)).toEqual(realVersions);

      // ...and no half-created objects: its CREATE TABLE was rolled back.
      const broken = await adapter.query<{ exists: string | null }>(
        "SELECT to_regclass('platform.broken')::text AS exists",
      );
      expect(broken.rows[0]?.exists).toBeNull();
    });
  });

  it('fails loudly on checksum drift of an applied migration', async () => {
    // Remove the failing file; dbD now matches the applied history exactly.
    await rm(join(driftDir, '9999_broken_on_purpose.sql'));

    const mutatedFile = join(driftDir, '0002_public_schema_hygiene.sql');
    const original = await readFile(mutatedFile, 'utf8');
    await writeFile(mutatedFile, `${original}\n-- drift: edited after apply\n`);

    await withAdapter('migrator', dbD, async (adapter) => {
      const report = await verifyMigrations({ adapter, migrationsDir: driftDir });
      expect(report.status).toBe('drift');
      expect(report.applied.find((row) => row.version === 2)?.status).toBe('checksum_drift');

      await expect(migrateToLatest({ adapter, migrationsDir: driftDir })).rejects.toMatchObject({
        name: 'MigrationError',
        kind: 'drift',
        message: expect.stringContaining('changed since it was applied'),
      });

      // Restoring the exact bytes clears the drift: detection is content-based.
      await writeFile(mutatedFile, original);
      const restored = await verifyMigrations({ adapter, migrationsDir: driftDir });
      expect(restored.status).toBe('clean');

      // A missing applied file is drift too, not a silent skip.
      const movedAside = join(driftDir, 'hidden_0001.not_sql');
      await rename(join(driftDir, '0001_platform_and_audit_schemas.sql'), movedAside);
      const missing = await verifyMigrations({ adapter, migrationsDir: driftDir });
      expect(missing.status).toBe('drift');
      expect(missing.applied.find((row) => row.version === 1)?.status).toBe('missing_file');
      await rename(movedAside, join(driftDir, '0001_platform_and_audit_schemas.sql'));
    });
  });

  // PROVISIONS A DATABASE, so the 5-second default is the wrong bound. Measured
  // alone this test takes ~0.4s; under the full suite the file it lives in
  // takes ~20s, because every integration suite here is contending for one
  // PostgreSQL. It timed out once in ten consecutive canonical runs.
  //
  // This is a TIMEOUT ADJUSTMENT, not a fix: nothing about the test got
  // faster. 30s is two orders of magnitude above the unloaded cost and still
  // well inside "something is genuinely hung", which is what a timeout is for.
  it('reset-local is double-guarded and rebuilds the database from zero', async () => {
    const guardEnv = { ...process.env };
    delete guardEnv.KARAR_ENV;

    // Guard 1: refuses without KARAR_ENV=local, before touching the database.
    await expect(resetLocalDatabase({ database: dbC, env: guardEnv })).rejects.toMatchObject({
      name: 'BootstrapError',
      kind: 'guard',
    });

    // Guard 2: refuses a non-loopback host even with KARAR_ENV=local.
    const remoteFailure = await resetLocalDatabase({
      database: dbC,
      env: { ...process.env, KARAR_ENV: 'local', KARAR_DB_HOST: '10.20.30.40' },
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(remoteFailure).toBeInstanceOf(BootstrapError);
    expect((remoteFailure as BootstrapError).kind).toBe('guard');
    expect((remoteFailure as BootstrapError).message).toContain('loopback');

    // With both guards satisfied it drops and recreates, and migrating the
    // fresh database no longer contains the probe table from the old one.
    const result = await resetLocalDatabase({
      database: dbC,
      env: { ...process.env, KARAR_ENV: 'local' },
    });
    expect(result).toEqual({ database: dbC, createdDatabase: true });

    await withAdapter('migrator', dbC, async (adapter) => {
      const { applied } = await migrateToLatest({ adapter });
      expect(applied).toHaveLength(realFilenames.length);
      const probe = await adapter.query<{ exists: string | null }>(
        "SELECT to_regclass('platform.migration_probe')::text AS exists",
      );
      expect(probe.rows[0]?.exists).toBeNull();
    });
  }, 30_000);
});

describe('migration file validation (no database required)', () => {
  async function scratchDirWith(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'karar-migrations-unit-'));
    scratchDirs.push(dir);
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(dir, name), content);
    }
    return dir;
  }

  afterAll(async () => {
    for (const dir of scratchDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const wellFormed = '-- rollback: nothing to recover.\nSELECT 1;\n';

  it('hard-errors on duplicate migration numbers', async () => {
    const dir = await scratchDirWith({
      '0004_first.sql': wellFormed,
      '0004_second.sql': wellFormed,
    });
    await expect(loadMigrationFiles(dir)).rejects.toMatchObject({
      name: 'MigrationError',
      kind: 'format',
      message: expect.stringContaining('Duplicate migration number 0004'),
    });
  });

  it('hard-errors on a mis-named .sql file instead of skipping it', async () => {
    const dir = await scratchDirWith({ '01_short.sql': wellFormed });
    await expect(loadMigrationFiles(dir)).rejects.toMatchObject({
      kind: 'format',
      message: expect.stringContaining('NNNN_description.sql'),
    });
  });

  it('hard-errors on a migration without a rollback block', async () => {
    const dir = await scratchDirWith({ '0005_no_rollback.sql': 'SELECT 1;\n' });
    await expect(loadMigrationFiles(dir)).rejects.toMatchObject({
      kind: 'format',
      message: expect.stringContaining('-- rollback:'),
    });
  });

  it('ignores non-SQL files such as README.md', async () => {
    const dir = await scratchDirWith({ 'README.md': '# notes\n', '0006_ok.sql': wellFormed });
    const files = await loadMigrationFiles(dir);
    expect(files.map((file) => file.filename)).toEqual(['0006_ok.sql']);
  });
});

describe('error mapping (no database required)', () => {
  const withCode = (code: string): Error => Object.assign(new Error(`code ${code}`), { code });

  it('maps the named SQLSTATEs and passes raw codes through', () => {
    expect(mapPgError(withCode('23505')).code).toBe('unique_violation');
    expect(mapPgError(withCode('40001')).code).toBe('serialization_failure');
    expect(mapPgError(withCode('42501')).code).toBe('insufficient_privilege');
    expect(mapPgError(withCode('08006')).code).toBe('connection_failure');
    expect(mapPgError(withCode('57P03')).code).toBe('connection_failure');

    const passthrough = mapPgError(withCode('23503')); // foreign_key_violation, unnamed by design
    expect(passthrough.code).toBe('unknown');
    expect(passthrough.sqlState).toBe('23503');
  });

  it('maps node network errors and terminated connections', () => {
    expect(mapPgError(withCode('ECONNREFUSED')).code).toBe('connection_failure');
    expect(mapPgError(new Error('Connection terminated unexpectedly')).code).toBe(
      'connection_failure',
    );
  });

  it('is idempotent for already-mapped errors', () => {
    const mapped = mapPgError(withCode('23505'));
    expect(mapPgError(mapped)).toBe(mapped);
  });
});

describe('connection profile secrecy (no database required)', () => {
  // SecretValue's own redaction contract is covered by the config workstream's
  // tests; here we pin that profiles built from env actually use it.
  it('wraps passwords so the value is reachable only via unwrap()', () => {
    const secret = new SecretValue('super-sensitive');
    expect(String(secret)).toBe('[redacted]');
    expect(inspect({ nested: secret }, { depth: 5 })).not.toContain('super-sensitive');
    expect(secret.unwrap()).toBe('super-sensitive');
  });

  it('keeps profiles safe to log', () => {
    const profile = LocalPostgresConnectionProfile.fromEnv('app', {
      env: { KARAR_DB_APP_PASSWORD: 'do-not-print' },
    });
    expect(inspect(profile)).not.toContain('do-not-print');
    expect(JSON.stringify(profile)).not.toContain('do-not-print');
  });
});
