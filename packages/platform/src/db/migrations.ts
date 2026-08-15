import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PostgresPersistenceAdapter } from './adapter.js';
import { PgError } from './errors.js';

/**
 * Forward-only migration runner.
 *
 * Policy (canonical prose in db/migrations/README.md):
 *
 * - Migrations are plain SQL files named NNNN_description.sql, applied in
 *   strict ascending filename order, each inside its own transaction, and
 *   recorded in platform.schema_migrations with a sha256 checksum.
 * - The runner connects as karar_migrator — never a superuser — so a
 *   migration that silently depends on elevated privilege fails on a laptop
 *   instead of in production (backend.md section 6).
 * - Forward-only: there are no down-migrations. Every file documents its
 *   recovery expectations in a `-- rollback:` comment block (enforced here);
 *   a bad migration is corrected by the next migration forward.
 * - Breaking changes follow expand / migrate / contract: one migration adds
 *   the new shape alongside the old, application code moves over, and a later
 *   migration removes the old shape once nothing reads it. No single
 *   migration both changes a shape and destroys the previous one.
 * - Checksum drift on an already-applied file is a hard failure, in both
 *   `migrate` and `verify`: an applied file is history, not an editable
 *   document.
 */

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly filename: string;
  readonly path: string;
  readonly sql: string;
  /** sha256 hex digest of the raw file bytes. */
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: string;
  readonly appliedBy: string;
}

export type AppliedStatus = 'ok' | 'checksum_drift' | 'missing_file' | 'name_mismatch';

export interface VerifyReport {
  readonly database: string;
  readonly migrationsDir: string;
  /** True once platform.schema_migrations exists. */
  readonly metadataPresent: boolean;
  readonly applied: ReadonlyArray<AppliedMigration & { readonly status: AppliedStatus }>;
  readonly pending: ReadonlyArray<Pick<MigrationFile, 'version' | 'name' | 'checksum'>>;
  readonly status: 'clean' | 'pending' | 'drift';
}

export type MigrationErrorKind = 'format' | 'order' | 'drift' | 'apply' | 'not_bootstrapped';

export class MigrationError extends Error {
  readonly kind: MigrationErrorKind;

  constructor(kind: MigrationErrorKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MigrationError';
    this.kind = kind;
  }
}

export interface MigrationRunnerOptions {
  /** Connection made as karar_migrator. The runner never uses a superuser. */
  readonly adapter: PostgresPersistenceAdapter;
  /** Defaults to packages/platform/db/migrations. */
  readonly migrationsDir?: string;
}

const FILENAME_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const ROLLBACK_BLOCK_PATTERN = /^\s*--\s*rollback:/im;

/**
 * The metadata definition, textually identical to the statements in
 * 0001_platform_and_audit_schemas.sql. The runner ensures this exists before
 * the very first apply; migration 0001 then records itself into it inside its
 * own transaction. Both paths are IF NOT EXISTS and converge on one state.
 */
const METADATA_DDL = `
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION karar_migrator;
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version    integer     PRIMARY KEY,
  name       text        NOT NULL,
  checksum   text        NOT NULL, -- sha256 hex of the migration file bytes
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text        NOT NULL DEFAULT current_user
);
`;

export function defaultMigrationsDir(): string {
  // src/db/ and dist/db/ are both two levels below the package root, so the
  // same relative path serves compiled and test execution.
  return fileURLToPath(new URL('../../db/migrations/', import.meta.url));
}

/**
 * Loads and validates every migration file in a directory. Hard errors:
 * mis-named .sql files, duplicate version numbers, and files without a
 * `-- rollback:` recovery block.
 */
export async function loadMigrationFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files: MigrationFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) {
      continue; // README.md and subdirectories are not migrations
    }
    const match = FILENAME_PATTERN.exec(entry.name);
    if (match === null) {
      throw new MigrationError(
        'format',
        `Migration filename ${JSON.stringify(entry.name)} does not match NNNN_description.sql ` +
          '(four digits, lowercase snake_case description)',
      );
    }
    const path = join(migrationsDir, entry.name);
    const bytes = await readFile(path);
    const sql = bytes.toString('utf8');
    if (!ROLLBACK_BLOCK_PATTERN.test(sql)) {
      throw new MigrationError(
        'format',
        `Migration ${entry.name} is missing its "-- rollback:" recovery block; ` +
          'every migration documents recovery expectations (db/migrations/README.md)',
      );
    }
    files.push({
      version: Number.parseInt(match[1] as string, 10),
      name: match[2] as string,
      filename: entry.name,
      path,
      sql,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  files.sort((a, b) => a.version - b.version);
  for (let i = 1; i < files.length; i += 1) {
    const previous = files[i - 1] as MigrationFile;
    const current = files[i] as MigrationFile;
    if (previous.version === current.version) {
      throw new MigrationError(
        'format',
        `Duplicate migration number ${String(current.version).padStart(4, '0')}: ` +
          `${previous.filename} and ${current.filename}`,
      );
    }
  }
  return files;
}

/** Returns applied rows, or null when platform.schema_migrations does not exist yet. */
export async function readAppliedMigrations(
  adapter: PostgresPersistenceAdapter,
): Promise<AppliedMigration[] | null> {
  try {
    const result = await adapter.query<{
      version: number;
      name: string;
      checksum: string;
      applied_at: Date;
      applied_by: string;
    }>(
      'SELECT version, name, checksum, applied_at, applied_by FROM platform.schema_migrations ORDER BY version',
    );
    return result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      checksum: row.checksum,
      appliedAt: row.applied_at.toISOString(),
      appliedBy: row.applied_by,
    }));
  } catch (error) {
    if (
      error instanceof PgError &&
      (error.sqlState === '42P01' || error.sqlState === '3F000') // undefined_table / invalid_schema_name
    ) {
      return null;
    }
    throw error;
  }
}

function classifyApplied(row: AppliedMigration, file: MigrationFile | undefined): AppliedStatus {
  if (file === undefined) {
    return 'missing_file';
  }
  if (file.name !== row.name) {
    return 'name_mismatch';
  }
  if (file.checksum !== row.checksum) {
    return 'checksum_drift';
  }
  return 'ok';
}

function driftMessage(row: AppliedMigration, status: AppliedStatus, file?: MigrationFile): string {
  const version = String(row.version).padStart(4, '0');
  switch (status) {
    case 'checksum_drift':
      return (
        `Migration ${version}_${row.name} has changed since it was applied ` +
        `(recorded sha256 ${row.checksum}, file sha256 ${file?.checksum ?? 'unknown'}). ` +
        'Applied migrations are immutable history; write a new forward migration instead of ' +
        'editing an applied file. If the database genuinely diverged from the repository, ' +
        'treat it as schema drift and reconcile before migrating.'
      );
    case 'missing_file':
      return (
        `Migration ${version}_${row.name} is recorded as applied but its file is missing from ` +
        'the migrations directory. Restore the file; applied history must remain in version control.'
      );
    case 'name_mismatch':
      return (
        `Migration ${version} was applied as ${JSON.stringify(row.name)} but the file with that ` +
        'number is named differently. Restore the original filename; applied history is immutable.'
      );
    case 'ok':
      return '';
  }
}

/**
 * Compares files against applied rows; throws MigrationError('drift') on any
 * drift shape, and MigrationError('order') if a pending file is numbered
 * below an already-applied migration (out-of-order insertion).
 */
function reconcile(
  files: MigrationFile[],
  applied: AppliedMigration[],
): { pending: MigrationFile[] } {
  const filesByVersion = new Map(files.map((file) => [file.version, file]));
  for (const row of applied) {
    const file = filesByVersion.get(row.version);
    const status = classifyApplied(row, file);
    if (status !== 'ok') {
      throw new MigrationError('drift', driftMessage(row, status, file));
    }
  }
  const appliedVersions = new Set(applied.map((row) => row.version));
  const maxApplied = applied.reduce((max, row) => Math.max(max, row.version), 0);
  const pending = files.filter((file) => !appliedVersions.has(file.version));
  const outOfOrder = pending.find((file) => file.version < maxApplied);
  if (outOfOrder !== undefined) {
    throw new MigrationError(
      'order',
      `Migration ${outOfOrder.filename} is numbered below already-applied version ${maxApplied}. ` +
        'Migrations apply in strict filename order; renumber it after the latest applied migration.',
    );
  }
  return { pending };
}

async function ensureMetadata(adapter: PostgresPersistenceAdapter): Promise<void> {
  try {
    await adapter.withTransaction(async (tx) => {
      await tx.query(METADATA_DDL);
    });
  } catch (error) {
    if (error instanceof PgError && error.code === 'insufficient_privilege') {
      throw new MigrationError(
        'not_bootstrapped',
        `karar_migrator lacks privileges on database ${JSON.stringify(adapter.profile.database)}; ` +
          'run db:create (bootstrap) before db:migrate.',
        error,
      );
    }
    throw error;
  }
}

/** Applies all pending migrations in order. Returns the newly applied files. */
export async function migrateToLatest(
  options: MigrationRunnerOptions,
): Promise<{ applied: MigrationFile[] }> {
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir();
  const files = await loadMigrationFiles(migrationsDir);
  await ensureMetadata(options.adapter);
  const applied = (await readAppliedMigrations(options.adapter)) ?? [];
  const { pending } = reconcile(files, applied);
  const newlyApplied: MigrationFile[] = [];
  for (const file of pending) {
    try {
      await options.adapter.withTransaction(async (tx) => {
        await tx.query(file.sql);
        await tx.query(
          'INSERT INTO platform.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [file.version, file.name, file.checksum],
        );
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new MigrationError(
        'apply',
        `Migration ${file.filename} failed and was rolled back; nothing was recorded. ` +
          `Cause: ${detail}`,
        error,
      );
    }
    newlyApplied.push(file);
  }
  return { applied: newlyApplied };
}

/**
 * Read-only comparison of the database against the migrations directory.
 * Creates nothing; a database without metadata reports every file as pending.
 */
export async function verifyMigrations(options: MigrationRunnerOptions): Promise<VerifyReport> {
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir();
  const files = await loadMigrationFiles(migrationsDir);
  const appliedRows = await readAppliedMigrations(options.adapter);
  const filesByVersion = new Map(files.map((file) => [file.version, file]));
  const applied = (appliedRows ?? []).map((row) => ({
    ...row,
    status: classifyApplied(row, filesByVersion.get(row.version)),
  }));
  const appliedVersions = new Set(applied.map((row) => row.version));
  const pending = files
    .filter((file) => !appliedVersions.has(file.version))
    .map((file) => ({ version: file.version, name: file.name, checksum: file.checksum }));
  const hasDrift = applied.some((row) => row.status !== 'ok');
  return {
    database: options.adapter.profile.database,
    migrationsDir,
    metadataPresent: appliedRows !== null,
    applied,
    pending,
    status: hasDrift ? 'drift' : pending.length > 0 ? 'pending' : 'clean',
  };
}
