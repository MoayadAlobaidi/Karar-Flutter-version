-- 0001_platform_and_audit_schemas
--
-- Creates the two platform-owned schemas and the migration metadata table.
-- Runs as karar_migrator, so both schemas are owned by the restricted
-- migrator role, never a superuser (database-portability.md section 6;
-- backend.md section 6). The `readmodel` and `sealed` schemas follow in the
-- phases that introduce projections and sealed storage.
--
-- The IF NOT EXISTS forms are deliberate: the runner ensures the platform
-- schema and metadata table exist with this exact definition before the very
-- first apply (src/db/migrations.ts), and this migration then records itself
-- in that table inside its own transaction. Either path converges on the
-- same state; a fresh database remains fully migration-defined.
--
-- rollback: forward-only (db/migrations/README.md). Nothing to recover on
-- failure: the migration is a single transaction, so a partial apply leaves
-- no trace. To decommission a database intentionally, drop the database
-- itself rather than these schemas; dropping schema platform destroys the
-- migration history that makes the database verifiable.

CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION karar_migrator;
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION karar_migrator;

-- karar_app needs USAGE to reference objects inside these schemas at all;
-- table-level DML stays per-table, granted by each table's own migration
-- under the convention in db/migrations/README.md.
GRANT USAGE ON SCHEMA platform TO karar_app;
GRANT USAGE ON SCHEMA audit TO karar_app;

CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version    integer     PRIMARY KEY,
  name       text        NOT NULL,
  checksum   text        NOT NULL, -- sha256 hex of the migration file bytes
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text        NOT NULL DEFAULT current_user
);

-- karar_app may read migration state (health/readiness surfaces report the
-- schema version); only the migrator writes it.
GRANT SELECT ON platform.schema_migrations TO karar_app;
