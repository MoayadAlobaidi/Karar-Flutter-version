// Database foundation surface: connection profiles, the single persistence
// adapter, typed errors, bootstrap, and the migration runner.
// See docs/architecture/database-portability.md for the design this implements.

export {
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  APP_ROLE_NAME,
  MIGRATOR_ROLE_NAME,
  type ConnectionProfile,
  type DatabaseRole,
  type FromEnvOptions,
  type SslConfig,
} from './connection-profile.js';
export { PgError, mapPgError, type PgErrorCode } from './errors.js';
export {
  CONNECTIONS_PER_WORKER,
  CONNECTION_HEADROOM,
  DatabaseUnavailableError,
  connectionBudget,
  databaseIsRequired,
  skipUnlessDatabaseRequired,
  type ConnectionBudget,
} from './connection-budget.js';
export {
  REQUIRED_SESSION_TIME_ZONE,
  SESSION_STARTUP_OPTIONS,
  SessionTimeZoneError,
  assertSessionTimeZoneIsUtc,
  poolConfigFor,
} from './session-config.js';
export { PostgresPersistenceAdapter, type TransactionClient } from './adapter.js';
export {
  BootstrapError,
  bootstrapRolesAndDatabase,
  defaultBootstrapDir,
  resetLocalDatabase,
  type BootstrapErrorKind,
  type BootstrapOptions,
  type BootstrapResult,
} from './bootstrap.js';
export {
  MigrationError,
  defaultMigrationsDir,
  loadMigrationFiles,
  migrateToLatest,
  readAppliedMigrations,
  verifyMigrations,
  type AppliedMigration,
  type AppliedStatus,
  type MigrationErrorKind,
  type MigrationFile,
  type MigrationRunnerOptions,
  type VerifyReport,
} from './migrations.js';
export { dropScratchDatabase } from './scratch-database.js';
