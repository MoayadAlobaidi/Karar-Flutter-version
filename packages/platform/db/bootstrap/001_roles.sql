-- Cluster-global role bootstrap. Executed by `db:create` (src/db/bootstrap.ts)
-- as the local compose superuser, connected to the maintenance database.
--
-- Passwords never appear in this file or in statement text: bootstrap.ts sets
-- the karar.bootstrap_migrator_password / karar.bootstrap_app_password session
-- GUCs through parameterized set_config() calls on the same session before
-- running this file, and the DO blocks read them with current_setting(),
-- which fails loudly if bootstrap forgot to set them.
--
-- Idempotent: CREATE ROLE is guarded (with a duplicate_object handler for
-- concurrent bootstraps); ALTER ROLE then re-applies attributes and password
-- on every run, so attribute drift in a long-lived local cluster is corrected
-- rather than accumulated.

DO $$
BEGIN
  -- karar_migrator: owns and evolves the platform/audit schemas and applies
  -- migrations (database-portability.md section 6). LOGIN because the
  -- migration runner connects as it directly. Everything else is denied:
  -- NOSUPERUSER and NOBYPASSRLS because migrations running with elevated
  -- privilege hide production failures and RLS gaps (ADR-0005, ADR-0022);
  -- NOCREATEDB and NOCREATEROLE because databases and roles are bootstrap's
  -- job, not a migration's; NOREPLICATION because it never streams WAL.
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'karar_migrator') THEN
    BEGIN
      CREATE ROLE karar_migrator;
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- a concurrent bootstrap won the race; ALTER below converges state
    END;
  END IF;
  EXECUTE format(
    'ALTER ROLE karar_migrator WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',
    current_setting('karar.bootstrap_migrator_password')
  );

  -- karar_app: the runtime application role. LOGIN for the application pools;
  -- NOSUPERUSER and NOBYPASSRLS because RLS is the tenant isolation boundary
  -- and the application role must be unable to step around it (ADR-0022);
  -- NOCREATEDB/NOCREATEROLE/NOREPLICATION because the runtime never performs
  -- DDL or cluster administration. Table-level DML is granted per table by
  -- the owning migration (db/migrations/README.md), never here.
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'karar_app') THEN
    BEGIN
      CREATE ROLE karar_app;
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- as above
    END;
  END IF;
  EXECUTE format(
    'ALTER ROLE karar_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',
    current_setting('karar.bootstrap_app_password')
  );
END
$$;
