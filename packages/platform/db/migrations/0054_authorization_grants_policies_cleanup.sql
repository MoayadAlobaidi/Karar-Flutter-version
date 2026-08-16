-- 0054_authorization_grants_policies_cleanup
--
-- Closes the authorization / kill-switch range (0050-0053) with the same
-- belt-and-braces hygiene as 0034 and 0044: no table in the range is
-- reachable through PUBLIC, every deliberately-absent DML privilege is
-- pinned by an explicit REVOKE (effective documentation `db:verify` drift
-- checking defends), and the classification comment convention is completed.
--
-- Nothing here changes behaviour on a correctly-applied 0050-0053; each
-- statement makes an implicit guarantee explicit:
--   permissions / roles / role_permissions — migration-seeded catalogues:
--     karar_app reads them and NEVER writes them (a runtime catalogue write
--     would bypass review of the access-control design).
--   role_assignments — no DELETE: revocation is a status; the row is the
--     evidence authority existed (the guard trigger raises independently).
--   kill_switches — no INSERT (closed registry: a new switch is a reviewed
--     migration mirrored in code) and no DELETE (removal is a migration).
--   kill_switch_history — append-only, and the appender is the SECURITY
--     DEFINER trigger alone: karar_app holds no INSERT at all.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — single
-- transaction. Deliberate reversal is meaningless here: these are revokes of
-- privileges nothing should hold and comments on existing objects; there is
-- no state to restore.

-- No authorization or kill-switch table is reachable through PUBLIC.
REVOKE ALL ON public.permissions          FROM PUBLIC;
REVOKE ALL ON public.roles                FROM PUBLIC;
REVOKE ALL ON public.role_permissions     FROM PUBLIC;
REVOKE ALL ON public.role_assignments     FROM PUBLIC;
REVOKE ALL ON public.kill_switches        FROM PUBLIC;
REVOKE ALL ON public.kill_switch_history  FROM PUBLIC;

-- Catalogue tables are read-only for the application; the catalogue changes
-- by reviewed migration, mirrored in modules/authorization/domain/catalogue.ts.
REVOKE INSERT, UPDATE, DELETE ON public.permissions      FROM karar_app;
REVOKE INSERT, UPDATE, DELETE ON public.roles            FROM karar_app;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM karar_app;

-- Assignments are never deleted; revocation is the UPDATE the 0052 guard
-- trigger permits.
REVOKE DELETE ON public.role_assignments FROM karar_app;

-- The switch registry is closed (INSERT is a migration) and permanent
-- (DELETE is a migration); operate is UPDATE.
REVOKE INSERT, DELETE ON public.kill_switches FROM karar_app;

-- History rows come from the SECURITY DEFINER trigger only.
REVOKE INSERT, UPDATE, DELETE ON public.kill_switch_history FROM karar_app;

-- Classification and contract, visible at the object (full lifecycle headers
-- live in 0050-0053 and packages/platform/db/DATA_LIFECYCLE.md). 0050-0053
-- already COMMENT their tables; nothing to restate here.
