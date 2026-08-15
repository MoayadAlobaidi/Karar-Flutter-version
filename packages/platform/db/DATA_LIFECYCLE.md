# Platform data lifecycle declarations

Six-field lifecycle declarations (ADR-0026; data-model.md §6) for datasets
created by platform migrations. Module-owned tables are declared in the owning
module's `MODULE.md`; this file covers platform infrastructure tables that no
module owns, and mirrors module-owned rows where a platform migration created
the table. Architecture test 25 parses this file with the same rules as the
module tables: **every named dataset carries all six fields with canonical
values.**

**Placeholders are forbidden.** A row may not hold `TBD`, `TODO`, `?`, or an
empty cell for any of the six fields. A dataset whose lifecycle is genuinely
undecided does not get a migration — the declaration is cheap at design time
and expensive as an audit (ADR-0026). Retention never names a code constant:
it names the PolicyPack clause (or the interim policy-configuration
placeholder) that owns the number.

| Table                              | Subject relationship | Purpose                                                                                                            | Classification | Retention                                                                                                                                                                                                                                                                                   | Export treatment                                                                                                                                   | Erasure strategy    |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `platform.schema_migrations`       | `NON_PERSONAL`       | migration bookkeeping — which schema changes applied, when, by which role, with what checksum                      | `INTERNAL`     | indefinite (local rule: lives and dies with the database; it is the database's verifiable history)                                                                                                                                                                                          | n/a                                                                                                                                                | `RETAIN_WITH_BASIS` |
| `audit.audit_events`               | `SUBJECT_DERIVED`    | accountability — tamper-evident record of who did what, when, to which resource, with what outcome                 | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); local development placeholder 13 months, held in policy configuration, never a code constant                                                                                                                                                  | excluded (integrity record about the account, not subject content; export coverage note names this omission)                                       | `RETAIN_WITH_BASIS` |
| `platform.outbox_events`           | `SUBJECT_DERIVED`    | reliable event delivery — transactional outbox rows carrying envelopes until published or dead-lettered (ADR-0012) | `CONFIDENTIAL` | short operational window: unpublished rows live until delivered or dead-lettered; published and dead-lettered history purged by the later-phase retention job on the interim policy-configuration placeholder of 30 days (PolicyPack owns the number from Phase 3.5; never a code constant) | excluded — delivery plumbing; the owning module's tables are the authoritative exportable record, and the export coverage note names this omission | `RETAIN_WITH_BASIS` |
| `platform.event_consumer_receipts` | `SUBJECT_DERIVED`    | consumer idempotency — (consumer, event id) receipts that make at-least-once delivery safe (ADR-0012)              | `INTERNAL`     | short operational window aligned to the outbox rows the receipts refer to; purged with them by the same later-phase retention job on the same interim 30-day policy-configuration placeholder                                                                                               | excluded — delivery plumbing, uuids and consumer names only                                                                                        | `RETAIN_WITH_BASIS` |
| `platform.jobs`                    | `SUBJECT_DERIVED`    | reliable background work execution — queued/leased/finished jobs with retry and dead-letter semantics (ADR-0013)   | `CONFIDENTIAL` | short operational window: queued/leased rows live until finished; succeeded and dead history purged by the later-phase retention job on the interim 30-day policy-configuration placeholder (PolicyPack owns the number from Phase 3.5)                                                     | excluded — execution plumbing; the use cases a job calls write the authoritative record                                                            | `RETAIN_WITH_BASIS` |

Basis notes:

- `platform.schema_migrations` — `RETAIN_WITH_BASIS`: the basis is schema
  verifiability (drift detection compares files against this history); it
  holds role names and checksums, no personal data. Deleting rows would make
  every future `db:verify` unable to distinguish drift from history.
- `audit.audit_events` — canonical declaration and full basis in
  [`modules/audit/MODULE.md`](../../../modules/audit/MODULE.md); mirrored here
  because migration `0010_audit_events.sql` creates it.

<!-- WORKSTREAM D: append outbox/jobs rows below this marker (tables from
     migrations 0020-0029, e.g. platform.outbox_events, platform.jobs,
     platform.dead_letter_events). Same six columns; placeholders forbidden. -->

Workstream D basis notes:

- Classification for `platform.outbox_events` and `platform.jobs` is the
  Phase 2 CEILING: each row's `classification` column mirrors its envelope or
  payload (at most `CONFIDENTIAL` today; only INTERNAL diagnostics exist).
  SEALED envelopes carry identifiers/status only by ADR-0025, so the table
  never stores sealed content regardless of the column value.

- `platform.outbox_events` — `RETAIN_WITH_BASIS`: the basis is reliable
  delivery (an unpublished row IS the undelivered event) plus a short
  forensic window over published/dead-lettered history for incident
  reconstruction (a silent DLQ is the failure ADR-0012 names). Envelopes may
  carry `tenantId` and identifier payloads, so `NON_PERSONAL_BY_DESIGN` would
  be a false claim, and severing linkage would break redelivery — hence
  retain-short, then purge. `karar_app` deliberately holds no DELETE; the
  purge is the retention job's, in its own phase.
- `platform.event_consumer_receipts` — `RETAIN_WITH_BASIS`: a receipt is what
  makes a duplicate delivery a no-op; deleting receipts before their outbox
  rows would re-execute consumers. `event_id` is a pseudonymous link to an
  envelope that may concern a subject (pseudonymization is not anonymization,
  ADR-0026), so the row is `SUBJECT_DERIVED` despite holding only uuids.
- `platform.jobs` — `RETAIN_WITH_BASIS`: the basis is work-in-flight
  integrity (a queued row IS the pending work; deleting it un-requests the
  work) plus the same short forensic window over finished history
  (`last_error` on dead jobs is the alerting evidence). Payloads may carry
  tenant/subject identifiers when later phases enqueue tenant-scoped work, so
  `NON_PERSONAL_BY_DESIGN` would be a false claim. Same no-DELETE grant
  discipline; the purge belongs to the retention job.
