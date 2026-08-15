// SecretValue is the config workstream's opaque secret holder; reused here so
// the package has exactly one way a password can travel (and one redaction).
import { SecretValue } from '../config/secret-value.js';

/**
 * Connection profiles for the single PostgresPersistenceAdapter.
 *
 * Provider portability lives here, not in adapter code: local Docker, Cloud
 * SQL, RDS, and any approved managed PostgreSQL all use the same adapter and
 * differ only in the profile that produced the connection settings (see
 * docs/architecture/database-portability.md, section 2). A future
 * CloudSqlConnectionProfile or RdsConnectionProfile differs from the local one
 * in TLS material, IAM/database authentication, and connection discovery only
 * — never in query or repository behaviour — and belongs in its own module
 * when a deployment phase needs it. No cloud-provider code is permitted in
 * this file.
 */

/**
 * The three database roles a local deployment connects as.
 *
 * - `superuser`: the compose-managed bootstrap superuser. Used only by
 *   `db:create` / `db:reset-local` to create roles, databases, and grants.
 * - `migrator`: `karar_migrator`, the restricted role that owns the schemas
 *   and applies migrations. Not a superuser, cannot bypass RLS.
 * - `app`: `karar_app`, the runtime role. DML on granted tables only; no DDL.
 */
export type DatabaseRole = 'superuser' | 'migrator' | 'app';

/**
 * TLS placeholder. Local Docker runs without TLS; cloud profiles will carry
 * `require` or `verify-full` plus certificate material. The shape is kept
 * minimal until the first cloud deployment phase makes the requirements
 * concrete (database-portability.md, section 2).
 */
export interface SslConfig {
  readonly mode: 'disable' | 'require' | 'verify-full';
}

export interface ConnectionProfile {
  /** Human-readable profile name; also becomes the pg application_name. */
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  /** Never logged; see SecretValue. */
  readonly password: SecretValue;
  readonly ssl: SslConfig;
  readonly poolMax: number;
  /** Applied per session by the driver at connection startup. */
  readonly statementTimeoutMs: number;
  /** Applied per session by the driver at connection startup. */
  readonly lockTimeoutMs: number;
}

export interface FromEnvOptions {
  /** Target database override (scratch and test databases). */
  readonly database?: string;
  /** Environment source; defaults to process.env. Injected by tests. */
  readonly env?: Record<string, string | undefined>;
}

// Local-development fallbacks only, mirroring docker-compose.yml and
// .env.example. They exist so a fresh clone works without a .env file; any
// non-local environment must set the corresponding variables, and cloud
// profiles replace password authentication entirely per
// database-portability.md section 2.
const LOCAL_ONLY_SUPERUSER = 'karar';
const LOCAL_ONLY_SUPERUSER_PASSWORD = 'karar_dev_password';
const LOCAL_ONLY_DATABASE = 'karar';
const LOCAL_ONLY_MIGRATOR_PASSWORD = 'karar_migrator_dev_password';
const LOCAL_ONLY_APP_PASSWORD = 'karar_app_dev_password';

export const MIGRATOR_ROLE_NAME = 'karar_migrator';
export const APP_ROLE_NAME = 'karar_app';

/**
 * The `postgres` maintenance database exists in every PostgreSQL cluster
 * regardless of POSTGRES_DB; bootstrap connects there to create roles and
 * databases before the target database exists.
 */
export function maintenanceDatabase(env: Record<string, string | undefined> = process.env): string {
  return env.KARAR_DB_MAINTENANCE_DB ?? 'postgres';
}

function parsePort(env: Record<string, string | undefined>): number {
  const raw = env.POSTGRES_PORT ?? env.PGPORT ?? '5432';
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PostgreSQL port ${JSON.stringify(raw)} (POSTGRES_PORT / PGPORT)`);
  }
  return port;
}

/**
 * Builds ConnectionProfiles for the local Docker PostgreSQL from environment
 * variables, with development defaults matching docker-compose.yml. This is
 * the only place connection settings are read from the environment.
 */
export class LocalPostgresConnectionProfile {
  static fromEnv(role: DatabaseRole, options: FromEnvOptions = {}): ConnectionProfile {
    const env = options.env ?? process.env;
    // Development password fallbacks are LOCAL-ONLY: outside an explicit
    // KARAR_ENV=local, every role password must be provided explicitly, and
    // reaching a fallback is a configuration error (fail fast; never connect
    // with a known default). An UNSET KARAR_ENV counts as non-local — a
    // mis-targeted CLI run with a forgotten variable must not downgrade role
    // passwords on a reachable cluster.
    const isLocal = env.KARAR_ENV === 'local';
    const requireOutsideLocal = (
      value: string | undefined,
      fallback: string,
      name: string,
    ): string => {
      if (value !== undefined) return value;
      if (isLocal) return fallback;
      throw new Error(
        `Missing required database credential ${name} (development fallbacks are local-only; KARAR_ENV=${env.KARAR_ENV ?? ''})`,
      );
    };
    const host = env.KARAR_DB_HOST ?? env.PGHOST ?? '127.0.0.1';
    const port = parsePort(env);
    const database =
      options.database ?? env.KARAR_DB_NAME ?? env.POSTGRES_DB ?? LOCAL_ONLY_DATABASE;
    const ssl: SslConfig = { mode: 'disable' };

    switch (role) {
      case 'superuser':
        return Object.freeze({
          name: 'local-superuser',
          host,
          port,
          database,
          user: env.POSTGRES_USER ?? LOCAL_ONLY_SUPERUSER,
          password: new SecretValue(
            requireOutsideLocal(
              env.POSTGRES_PASSWORD,
              LOCAL_ONLY_SUPERUSER_PASSWORD,
              'POSTGRES_PASSWORD',
            ),
          ),
          ssl,
          poolMax: 2,
          statementTimeoutMs: 60_000,
          lockTimeoutMs: 15_000,
        });
      case 'migrator':
        return Object.freeze({
          name: 'local-migrator',
          host,
          port,
          database,
          user: MIGRATOR_ROLE_NAME,
          password: new SecretValue(
            requireOutsideLocal(
              env.KARAR_DB_MIGRATOR_PASSWORD,
              LOCAL_ONLY_MIGRATOR_PASSWORD,
              'KARAR_DB_MIGRATOR_PASSWORD',
            ),
          ),
          ssl,
          poolMax: 2,
          // Migrations may legitimately hold a statement for a while (index
          // builds); the lock timeout stays short so a blocked migration
          // fails fast instead of queueing behind application traffic.
          statementTimeoutMs: 300_000,
          lockTimeoutMs: 15_000,
        });
      case 'app':
        return Object.freeze({
          name: 'local-app',
          host,
          port,
          database,
          user: APP_ROLE_NAME,
          password: new SecretValue(
            requireOutsideLocal(
              env.KARAR_DB_APP_PASSWORD,
              LOCAL_ONLY_APP_PASSWORD,
              'KARAR_DB_APP_PASSWORD',
            ),
          ),
          ssl,
          poolMax: 10,
          statementTimeoutMs: 30_000,
          lockTimeoutMs: 5_000,
        });
    }
  }
}
