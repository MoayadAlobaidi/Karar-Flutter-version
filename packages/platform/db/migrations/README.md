# Migrations

Forward-only SQL, applied in strict filename order by the runner in
`src/db/migrations.ts`, always as `karar_migrator` — never a superuser. Each
migration runs in its own transaction and is recorded in
`platform.schema_migrations` with a sha256 checksum.

## Adding a migration

1. Create `NNNN_description.sql`: four digits, then lowercase snake_case.
   Take the next free number **in your range** (below). Duplicate numbers and
   mis-named files are hard errors.
2. Write plain, provider-neutral PostgreSQL (database-portability.md section
   3). The whole file executes inside one transaction; do not include
   BEGIN/COMMIT or statements that cannot run in a transaction.
3. Grant `karar_app` its DML per the convention below, in the same file that
   creates the table.
4. End with a `-- rollback:` comment block (see stance below). The runner
   rejects files without one.
5. `pnpm --filter @karar/platform db:migrate`, then `db:verify`.

## Number-range ownership

| Range | Owner |
|---|---|
| 0001-0009 | platform core (schemas, hygiene) — workstream B |
| 0010-0019 | audit — workstream F |
| 0020-0029 | eventing and jobs — workstream D |

Later ranges are assigned by the phase lead. Never take a number outside your
range; renumbering after apply is impossible.

## Grant convention

`karar_app` has USAGE on the schemas and nothing else by default. Each table
migration grants it the **minimal DML that table needs**, table by table:

- ordinary tables: `GRANT SELECT, INSERT, UPDATE ON <table> TO karar_app` —
  and omit whatever the table does not need (most tables do not need DELETE);
- audit tables: `GRANT SELECT, INSERT` **only** — append-only is enforced by
  revoked grants first, triggers second (data-model.md section 10);
- sequences backing owned tables: `GRANT USAGE` where the app inserts.

Never `GRANT ALL`, never grant to `PUBLIC`, never grant CREATE. DDL stays
with `karar_migrator`, which owns the schemas and every object in them.

## Forward-only and recovery

There are no down-migrations; a wrong migration is corrected by the next one
forward. Every file still documents recovery in its `-- rollback:` block:
what a failed apply leaves behind (nothing — single transaction), and what
the deliberate reversal would be if the change had to be unwound. Honest
notes, not executable scripts.

Breaking changes follow **expand / migrate / contract**: add the new shape,
move readers and writers, remove the old shape in a later migration once
nothing depends on it. Take a backup before any destructive contract step.

## Drift policy

An applied file is immutable history. If `verify` or `migrate` reports a
checksum mismatch, a missing file, or a renamed file, the run fails hard.
Fix the repository (restore the file), or if the database itself diverged,
reconcile it deliberately — never by editing applied files until checksums
happen to match.

## A second database, from zero

Every database is created the same way; nothing is copied from an existing
one (database-portability.md section 6):

```
KARAR_DB_NAME=<name> pnpm --filter @karar/platform db:create    # roles, database, grants
KARAR_DB_NAME=<name> pnpm --filter @karar/platform db:migrate   # full history as karar_migrator
KARAR_DB_NAME=<name> pnpm --filter @karar/platform db:verify    # expect: status clean
```

`db:reset-local` drops and recreates the local database the same way; it
refuses to run unless `KARAR_ENV=local` and the host is loopback.
