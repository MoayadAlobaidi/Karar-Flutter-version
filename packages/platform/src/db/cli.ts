import { PostgresPersistenceAdapter } from './adapter.js';
import { bootstrapRolesAndDatabase, BootstrapError, resetLocalDatabase } from './bootstrap.js';
import { LocalPostgresConnectionProfile } from './connection-profile.js';
import {
  MigrationError,
  migrateToLatest,
  verifyMigrations,
  type VerifyReport,
} from './migrations.js';

/**
 * Database CLI behind the four package scripts:
 *
 *   db:create       bootstrap roles, database, and grants (superuser)
 *   db:migrate      apply pending migrations (karar_migrator)
 *   db:verify       report applied/pending/drift; --strict, --json
 *   db:reset-local  drop and recreate the local database, then migrate
 *                   (guarded: KARAR_ENV=local and loopback host only)
 *
 * Connection settings come from the environment (connection-profile.ts);
 * KARAR_DB_NAME overrides the target database for scratch runs.
 *
 * Exit codes: 0 success; 1 failure. verify exits 1 on drift always, and on
 * pending migrations only under --strict.
 */

const USAGE = `Usage: cli.js <command> [flags]

Commands:
  create        Create roles, the database (if missing), and grants. Superuser.
  migrate       Apply pending migrations as karar_migrator.
  verify        Compare the database against db/migrations. Read-only.
                  --strict   also fail (exit 1) when migrations are pending
                  --json     print the report as JSON instead of text
  reset-local   Drop and recreate the LOCAL database, then migrate.
                  Refuses unless KARAR_ENV=local and the host is loopback.
`;

function formatReport(report: VerifyReport): string {
  const lines: string[] = [];
  lines.push(`database:   ${report.database}`);
  lines.push(`migrations: ${report.migrationsDir}`);
  lines.push(`status:     ${report.status}`);
  lines.push('');
  lines.push('version  state    name');
  for (const row of report.applied) {
    const state = row.status === 'ok' ? 'applied' : row.status;
    lines.push(
      `${String(row.version).padStart(4, '0')}     ${state.padEnd(8)} ${row.name} (by ${row.appliedBy} at ${row.appliedAt})`,
    );
  }
  for (const row of report.pending) {
    lines.push(`${String(row.version).padStart(4, '0')}     pending  ${row.name}`);
  }
  if (report.applied.length === 0 && report.pending.length === 0) {
    lines.push('(no migrations)');
  }
  return lines.join('\n');
}

async function withMigratorAdapter<T>(
  fn: (adapter: PostgresPersistenceAdapter) => Promise<T>,
): Promise<T> {
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('migrator'),
  );
  try {
    return await fn(adapter);
  } finally {
    await adapter.end();
  }
}

async function runVerify(flags: ReadonlySet<string>): Promise<void> {
  const report = await withMigratorAdapter((adapter) => verifyMigrations({ adapter }));
  if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(report)}\n`);
  }
  if (report.status === 'drift') {
    process.exitCode = 1;
    process.stderr.write('verify: schema drift detected (see report above)\n');
  } else if (report.status === 'pending' && flags.has('--strict')) {
    process.exitCode = 1;
    process.stderr.write(`verify --strict: ${report.pending.length} migration(s) pending\n`);
  }
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  const flags = new Set(rest);

  switch (command) {
    case 'create': {
      const result = await bootstrapRolesAndDatabase();
      process.stdout.write(
        `create: roles ensured; database ${result.database} ` +
          `${result.createdDatabase ? 'created' : 'already existed'}; grants applied\n`,
      );
      return;
    }
    case 'migrate': {
      const { applied } = await withMigratorAdapter((adapter) => migrateToLatest({ adapter }));
      if (applied.length === 0) {
        process.stdout.write('migrate: nothing pending\n');
      } else {
        for (const file of applied) {
          process.stdout.write(`migrate: applied ${file.filename}\n`);
        }
      }
      return;
    }
    case 'verify': {
      await runVerify(flags);
      return;
    }
    case 'reset-local': {
      const result = await resetLocalDatabase();
      process.stdout.write(`reset-local: database ${result.database} dropped and recreated\n`);
      const { applied } = await withMigratorAdapter((adapter) => migrateToLatest({ adapter }));
      process.stdout.write(`reset-local: ${applied.length} migration(s) applied\n`);
      return;
    }
    case undefined:
    case '--help':
    case '-h': {
      process.stdout.write(USAGE);
      if (command === undefined) {
        process.exitCode = 1;
      }
      return;
    }
    default: {
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof MigrationError || error instanceof BootstrapError) {
    process.stderr.write(`${error.name}: ${error.message}\n`);
  } else {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exitCode = 1;
});
