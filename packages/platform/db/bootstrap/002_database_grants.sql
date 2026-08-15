-- Per-database access bootstrap. Executed by `db:create` (src/db/bootstrap.ts)
-- as the local compose superuser, connected to the target database (which
-- bootstrap.ts created first if it was missing). Uses current_database() so
-- the same file serves the primary database, a second database, and every
-- scratch database identically — the from-zero flow of
-- database-portability.md section 6.
--
-- Idempotent: GRANT/REVOKE/ALTER converge to the same end state on re-runs.

DO $$
DECLARE
  db text := current_database();
BEGIN
  -- PUBLIC can connect to any database by default; access must be an explicit
  -- per-role decision, so the historical open door is closed first.
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', db);

  -- karar_migrator: CONNECT to run migrations against this database; CREATE
  -- so it can create and own the platform and audit schemas (migration 0001).
  -- These are the only two privileges the migrator holds at database level.
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO karar_migrator', db);

  -- karar_app: CONNECT only. The runtime never creates schemas or objects;
  -- its DML arrives per table from migrations (db/migrations/README.md).
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO karar_app', db);
END
$$;

-- Schema public will hold the domain tables (data-model.md section 3), all
-- created by migrations running as karar_migrator, so the migrator needs
-- CREATE on the schema. Ownership grants that and, with it, the authority to
-- manage the schema's privileges — without ownership, the hygiene REVOKE in
-- migration 0002 would be a silent no-op on providers whose template database
-- still grants PUBLIC create on schema public.
ALTER SCHEMA public OWNER TO karar_migrator;
