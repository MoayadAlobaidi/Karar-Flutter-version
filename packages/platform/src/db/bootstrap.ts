import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgresPersistenceAdapter } from './adapter.js';
import {
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  type FromEnvOptions,
} from './connection-profile.js';

/**
 * Database bootstrap: the only code path that connects as the compose
 * superuser, and the whole of what it does — create the two restricted roles,
 * create the target database if missing, apply the database-level grants in
 * db/bootstrap/*.sql. Migrations, tables, and everything after belong to
 * karar_migrator via the migration runner.
 *
 * The same flow creates the primary local database, a second database, and
 * every scratch database, which is what keeps the from-zero promise of
 * database-portability.md section 6 honest: nothing is ever copied from an
 * existing environment.
 */

export type BootstrapErrorKind = 'guard' | 'config';

export class BootstrapError extends Error {
  readonly kind: BootstrapErrorKind;

  constructor(kind: BootstrapErrorKind, message: string) {
    super(message);
    this.name = 'BootstrapError';
    this.kind = kind;
  }
}

export interface BootstrapOptions {
  /** Target database override (scratch and test databases). */
  readonly database?: string;
  /** Environment source; defaults to process.env. Injected by tests. */
  readonly env?: Record<string, string | undefined>;
}

export interface BootstrapResult {
  readonly database: string;
  readonly createdDatabase: boolean;
}

export function defaultBootstrapDir(): string {
  // src/db/ and dist/db/ are both two levels below the package root, so the
  // same relative path serves compiled and test execution.
  return fileURLToPath(new URL('../../db/bootstrap/', import.meta.url));
}

// Database names reach CREATE/DROP DATABASE as identifiers, which cannot be
// bind parameters; a strict allow-list plus quoting removes any injection
// surface without a full identifier-quoting implementation.
function validateDatabaseName(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    throw new BootstrapError(
      'config',
      `Refusing database name ${JSON.stringify(name)}: must match [a-z_][a-z0-9_]{0,62}`,
    );
  }
  return `"${name}"`;
}

function profileOptions(options: BootstrapOptions, database?: string): FromEnvOptions {
  return {
    ...(database === undefined
      ? options.database === undefined
        ? {}
        : { database: options.database }
      : { database }),
    ...(options.env === undefined ? {} : { env: options.env }),
  };
}

/**
 * Creates roles and grants, and the target database when missing. Idempotent:
 * re-running converges role attributes, passwords, and grants.
 */
export async function bootstrapRolesAndDatabase(
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const env = options.env ?? process.env;
  const bootstrapDir = defaultBootstrapDir();
  const rolesSql = await readFile(join(bootstrapDir, '001_roles.sql'), 'utf8');
  const grantsSql = await readFile(join(bootstrapDir, '002_database_grants.sql'), 'utf8');

  const targetProfile = LocalPostgresConnectionProfile.fromEnv(
    'superuser',
    profileOptions(options),
  );
  const target = targetProfile.database;
  validateDatabaseName(target);

  // Passwords for the roles being created; revealed only as bind parameters
  // to set_config, never interpolated into SQL text (001_roles.sql).
  const migratorPassword = LocalPostgresConnectionProfile.fromEnv(
    'migrator',
    profileOptions(options),
  ).password;
  const appPassword = LocalPostgresConnectionProfile.fromEnv(
    'app',
    profileOptions(options),
  ).password;

  const maintenance = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(
      'superuser',
      profileOptions(options, maintenanceDatabase(env)),
    ),
  );
  let createdDatabase = false;
  try {
    // Roles are cluster-global; created once from the maintenance session.
    // The advisory lock serializes concurrent bootstrappers (parallel test
    // suites all ensuring the same two roles): without it, simultaneous
    // ALTER ROLE statements race inside PostgreSQL and fail with XX000
    // "tuple concurrently updated". Transaction-scoped, so it releases on
    // COMMIT/ROLLBACK and cannot leak.
    await maintenance.withTransaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('karar.bootstrap_roles'))");
      await tx.query(
        "SELECT set_config('karar.bootstrap_migrator_password', $1, false), " +
          "set_config('karar.bootstrap_app_password', $2, false)",
        [migratorPassword.unwrap(), appPassword.unwrap()],
      );
      await tx.query(rolesSql);
    });

    // CREATE DATABASE cannot run inside a transaction; the existence check
    // makes the flow idempotent for an already-created database.
    const exists = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      target,
    ]);
    if (exists.rowCount === 0) {
      await maintenance.query(`CREATE DATABASE ${validateDatabaseName(target)}`);
      createdDatabase = true;
    }
  } finally {
    await maintenance.end();
  }

  // Database-level grants run connected to the target database, so the same
  // static SQL file (keyed on current_database()) serves every database.
  const targetAdmin = new PostgresPersistenceAdapter(targetProfile);
  try {
    await targetAdmin.withTransaction(async (tx) => {
      await tx.query(grantsSql);
    });
  } finally {
    await targetAdmin.end();
  }

  return { database: target, createdDatabase };
}

/**
 * Drops and recreates the local database. Destructive by design, so it is
 * double-guarded and refuses to run at all unless both hold:
 *
 * 1. KARAR_ENV=local — the caller states explicitly that this is a local
 *    development environment; no deployed environment sets this value.
 * 2. The database host is loopback — a misconfigured .env pointing at a
 *    remote host fails the guard even with KARAR_ENV=local.
 *
 * There is intentionally no --force flag. A guard that can be flagged away
 * in the same command that destroys the data is not a guard.
 */
export async function resetLocalDatabase(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const env = options.env ?? process.env;
  if (env.KARAR_ENV !== 'local') {
    throw new BootstrapError(
      'guard',
      'reset-local refuses to run: KARAR_ENV is not "local". This command drops the database; ' +
        'it exists for local development only.',
    );
  }
  const targetProfile = LocalPostgresConnectionProfile.fromEnv(
    'superuser',
    profileOptions(options),
  );
  if (!['127.0.0.1', 'localhost', '::1'].includes(targetProfile.host)) {
    throw new BootstrapError(
      'guard',
      `reset-local refuses to run: database host ${JSON.stringify(targetProfile.host)} is not ` +
        "loopback. Dropping a non-local database is never this command's job.",
    );
  }
  const target = targetProfile.database;
  const quoted = validateDatabaseName(target);

  const maintenance = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(
      'superuser',
      profileOptions(options, maintenanceDatabase(env)),
    ),
  );
  try {
    // FORCE terminates lingering local sessions (an app left running, an
    // editor's open console) instead of failing the reset on them.
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
  } finally {
    await maintenance.end();
  }

  return bootstrapRolesAndDatabase(options);
}
