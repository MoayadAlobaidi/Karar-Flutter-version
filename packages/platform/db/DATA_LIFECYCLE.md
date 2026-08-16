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

| Table                                     | Subject relationship | Purpose                                                                                                                                    | Classification | Retention                                                                                                                                                                                                                                                                                   | Export treatment                                                                                                                                   | Erasure strategy         |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `platform.schema_migrations`              | `NON_PERSONAL`       | migration bookkeeping — which schema changes applied, when, by which role, with what checksum                                              | `INTERNAL`     | indefinite (local rule: lives and dies with the database; it is the database's verifiable history)                                                                                                                                                                                          | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `audit.audit_events`                      | `SUBJECT_DERIVED`    | accountability — tamper-evident record of who did what, when, to which resource, with what outcome                                         | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); local development placeholder 13 months, held in policy configuration, never a code constant                                                                                                                                                  | excluded (integrity record about the account, not subject content; export coverage note names this omission)                                       | `RETAIN_WITH_BASIS`      |
| `platform.outbox_events`                  | `SUBJECT_DERIVED`    | reliable event delivery — transactional outbox rows carrying envelopes until published or dead-lettered (ADR-0012)                         | `CONFIDENTIAL` | short operational window: unpublished rows live until delivered or dead-lettered; published and dead-lettered history purged by the later-phase retention job on the interim policy-configuration placeholder of 30 days (PolicyPack owns the number from Phase 3.5; never a code constant) | excluded — delivery plumbing; the owning module's tables are the authoritative exportable record, and the export coverage note names this omission | `RETAIN_WITH_BASIS`      |
| `platform.event_consumer_receipts`        | `SUBJECT_DERIVED`    | consumer idempotency — (consumer, event id) receipts that make at-least-once delivery safe (ADR-0012)                                      | `INTERNAL`     | short operational window aligned to the outbox rows the receipts refer to; purged with them by the same later-phase retention job on the same interim 30-day policy-configuration placeholder                                                                                               | excluded — delivery plumbing, uuids and consumer names only                                                                                        | `RETAIN_WITH_BASIS`      |
| `platform.jobs`                           | `SUBJECT_DERIVED`    | reliable background work execution — queued/leased/finished jobs with retry and dead-letter semantics (ADR-0013)                           | `CONFIDENTIAL` | short operational window: queued/leased rows live until finished; succeeded and dead history purged by the later-phase retention job on the interim 30-day policy-configuration placeholder (PolicyPack owns the number from Phase 3.5)                                                     | excluded — execution plumbing; the use cases a job calls write the authoritative record                                                            | `RETAIN_WITH_BASIS`      |
| `public.user_profiles`                    | `SUBJECT_OWNED`      | profile presentation and locale — display name, locale, account-status intent, typed residency/entity references (migration 0040)          | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder: life of the account, never a code constant                                                                                                                                                          | included                                                                                                                                           | `CASCADE_DELETE`         |
| `public.user_status_history`              | `SUBJECT_DERIVED`    | account-state accountability — append-only evidence of every status transition (migration 0040)                                            | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder 13 months after account closure                                                                                                                                                                      | excluded (integrity record about the account, not subject content; the export coverage note names this omission)                                   | `RETAIN_WITH_BASIS`      |
| `public.tenants`                          | `NON_PERSONAL`       | tenant registry and contractual record — kind, status, entity binding (migration 0041)                                                     | `INTERNAL`     | life of the contract plus the PolicyPack's post-termination period (Phase 3.5); interim policy-configuration placeholder 6 years                                                                                                                                                            | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.tenant_members`                   | `SUBJECT_OWNED`      | tenant membership and seat state — who belongs to which tenant, from when, in what state (migration 0042)                                  | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder: life of membership plus 13 months                                                                                                                                                                   | included                                                                                                                                           | `CASCADE_DELETE`         |
| `public.tenant_invitations`               | `SUBJECT_DERIVED`    | secure membership invitation and redemption evidence — normalized invitee email, sha256 token hash, lifecycle state (migrations 0043/0044) | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder 13 months from terminal state                                                                                                                                                                        | excluded (operational security record holding a third party's email; the export coverage note names this omission)                                 | `CASCADE_DELETE`         |
| `public.identity_accounts`                | `SUBJECT_OWNED`      | authentication identity — who a principal is: e-mail, verification state, account status, MFA requirement                                  | `CONFIDENTIAL` | life of the account; post-closure grace from the PolicyPack per jurisdiction when packs arrive (Phase 3.5)                                                                                                                                                                                  | included — the subject's own account record                                                                                                        | `CASCADE_DELETE`         |
| `public.password_credentials`             | `SUBJECT_OWNED`      | password authentication — argon2id hash with the parameter version that produced it (upgrade-on-login)                                     | `SECRET`       | life of the credential; replaced in place on change/reset                                                                                                                                                                                                                                   | excluded — credential material, not subject content; export coverage note names this omission                                                      | `CASCADE_DELETE`         |
| `public.email_verifications`              | `SUBJECT_DERIVED`    | e-mail ownership proof — HMAC-hashed one-time codes, attempt-capped, 30-minute expiry                                                      | `CONFIDENTIAL` | short operational window: rows are dead once consumed or expired; purged by the later-phase retention job on the interim 30-day policy-configuration placeholder (PolicyPack owns the number from Phase 3.5)                                                                                | excluded — verification plumbing; export coverage note names this omission                                                                         | `CASCADE_DELETE`         |
| `public.password_reset_requests`          | `SUBJECT_DERIVED`    | password recovery — HMAC-hashed one-time reset tokens, attempt-capped, requester IP digest for abuse investigation                         | `CONFIDENTIAL` | same short operational window and 30-day interim placeholder discipline as email_verifications (PolicyPack owns the number from Phase 3.5)                                                                                                                                                  | excluded — recovery plumbing; export coverage note names this omission                                                                             | `CASCADE_DELETE`         |
| `public.sessions`                         | `SUBJECT_OWNED`      | server-side session state — creation, last-seen, expiry, revocation, minimized client metadata (digests only)                              | `CONFIDENTIAL` | absolute session lifetime plus a short forensic window over revoked/expired rows; purged by the later-phase retention job on the interim policy-configuration placeholder of 90 days after expiry (PolicyPack owns the number from Phase 3.5)                                               | excluded — security-operational metadata; digests are intentionally meaningless outside the platform; export coverage note names this omission     | `CASCADE_DELETE`         |
| `public.refresh_token_families`           | `SUBJECT_OWNED`      | refresh rotation lineage — one family per session grant; the unit revoked on reuse detection                                               | `CONFIDENTIAL` | with the owning session; same purge discipline as sessions                                                                                                                                                                                                                                  | excluded — token plumbing; export coverage note names this omission                                                                                | `CASCADE_DELETE`         |
| `public.refresh_tokens`                   | `SUBJECT_OWNED`      | refresh credential at rest — SHA-256 hash of a 32-byte one-time token, expiry, successor linkage                                           | `SECRET`       | with the owning family; same purge discipline as sessions                                                                                                                                                                                                                                   | excluded — credential material; export coverage note names this omission                                                                           | `CASCADE_DELETE`         |
| `public.mfa_enrolments`                   | `SUBJECT_OWNED`      | second-factor enrolment — TOTP secret ciphertext with key-version provenance (ADR-0017), confirmation state                                | `SECRET`       | life of the enrolment; replaced in place on re-enrolment                                                                                                                                                                                                                                    | excluded — credential material; export coverage note names this omission                                                                           | `CASCADE_DELETE`         |
| `public.mfa_recovery_codes`               | `SUBJECT_OWNED`      | one-time recovery — SHA-256 hashes of ten 128-bit codes, individually consumable, attempt-limited                                          | `SECRET`       | life of the code set; replaced wholesale on regeneration or MFA disable                                                                                                                                                                                                                     | excluded — credential material; export coverage note names this omission                                                                           | `CASCADE_DELETE`         |
| `public.authentication_security_events`   | `SUBJECT_DERIVED`    | security investigation and lockout derivation — append-only authentication occurrences with digested metadata                              | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); local development placeholder 13 months, held in policy configuration, never a code constant                                                                                                                                                  | excluded — integrity record about the account, not subject content; export coverage note names this omission                                       | `RETAIN_WITH_BASIS`      |
| `public.permissions`                      | `NON_PERSONAL`       | permission catalogue — the closed universe of `<capability>.<resource>.<action>` names deny-by-default resolves against (migration 0050)   | `INTERNAL`     | life of the platform — the catalogue is part of the access-control design record; PolicyPack owns any bound (Phase 3.5), never a code constant                                                                                                                                              | n/a — no subject owns a catalogue row                                                                                                              | `NON_PERSONAL_BY_DESIGN` |
| `public.roles`                            | `NON_PERSONAL`       | role catalogue — the eight grantable authority bundles with their binding scope (PLATFORM/TENANT/BOTH) (migration 0051)                    | `INTERNAL`     | life of the platform (access-control design record); PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                                  | n/a — no subject owns a catalogue row                                                                                                              | `NON_PERSONAL_BY_DESIGN` |
| `public.role_permissions`                 | `NON_PERSONAL`       | the reviewed role→permission mapping; the FK to permissions makes an absent permission structurally ungrantable (migration 0051)           | `INTERNAL`     | life of the platform (access-control design record); PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                                  | n/a — no subject owns a catalogue row                                                                                                              | `NON_PERSONAL_BY_DESIGN` |
| `public.role_assignments`                 | `SUBJECT_DERIVED`    | authorization accountability and resolution — who held which role, in which scope, from when to when, granted/revoked by whom (0052)       | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder 13 months after revocation, never a code constant                                                                                                                                                    | included — a subject's export lists the roles they held and hold; grantor/revoker references are opaque UUIDs                                      | `RETAIN_WITH_BASIS`      |
| `public.kill_switches`                    | `NON_PERSONAL`       | restrict-only operational kill switches — deny specific operations during incidents, with reason and accountability (migration 0053)       | `INTERNAL`     | current operational state lives with the platform; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                                    | n/a — no subject owns an operational switch                                                                                                        | `NON_PERSONAL_BY_DESIGN` |
| `public.kill_switch_history`              | `NON_PERSONAL`       | append-only kill-switch state ledger — every state that ever held, in order, with actor, reason, and version (migration 0053)              | `INTERNAL`     | operational history explains every past denial; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                                       | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.operating_entities`               | `NON_PERSONAL`       | legal accountability — which legal person contracts, is liable, and releases disclosed data (ADR-0024)                                     | `INTERNAL`     | corporate/legal record retained for the life of the platform; any bounded period comes from the PolicyPack per jurisdiction (Phase 3.5), never a code constant                                                                                                                              | n/a — no subject owns a legal-person row                                                                                                           | `RETAIN_WITH_BASIS`      |
| `public.entity_jurisdiction_permissions`  | `NON_PERSONAL`       | record where an entity may lawfully contract/operate, with the basis reference carrying the actual claim                                   | `INTERNAL`     | with the entity register; PolicyPack owns any bound (Phase 3.5), never a code constant                                                                                                                                                                                                      | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.entity_licences`                  | `NON_PERSONAL`       | honest licence bookkeeping (typed references with provenance-carrying statuses; a row never implies a legal fact)                          | `INTERNAL`     | licence history explains why a capability was ever enabled; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                           | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.data_protection_role_assignments` | `NON_PERSONAL`       | stored legal decisions: controller/joint-controller/processor per (entity, tenant, purpose, jurisdiction) window                           | `INTERNAL`     | controllership history makes past disclosures explainable; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                            | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.operating_entity_assignments`     | `SUBJECT_DERIVED`    | resolve which legal person serves a tenant / contracted with a user, now and at any past instant                                           | `INTERNAL`     | binding history explains which entity stood behind which period of service; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                           | included — a subject's export names the entity they contracted with and since when                                                                 | `RETAIN_WITH_BASIS`      |
| `public.entity_migrations`                | `SUBJECT_DERIVED`    | audited record that an entity binding moved, under which re-consent evaluation, with which outcome (never silent)                          | `INTERNAL`     | migration history with re-consent outcomes is the Operating Entities Center's record; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                 | included — a subject's export shows migrations of their own binding                                                                                | `RETAIN_WITH_BASIS`      |
| `public.legal_documents`                  | `NON_PERSONAL`       | public catalogue: which document kinds exist per (entity, jurisdiction) pair, covering which purposes (ADR-0024)                           | `PUBLIC`       | the catalogue must outlive any single version; PolicyPack owns any bound (Phase 3.5), never a code constant                                                                                                                                                                                 | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.legal_document_versions`          | `NON_PERSONAL`       | the exact text a consent was given to, verifiable by content hash, with its reviewed re-consent classification                             | `PUBLIC`       | grants pin version ids — deleting a version orphans consent evidence; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                 | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.consent_grants`                   | `SUBJECT_OWNED`      | evidentiary record of the subject's own acceptance/withdrawal acts; resolution source for (entity, purpose, jurisdiction)                  | `CONFIDENTIAL` | consent evidence must outlive the consent itself; period from the PolicyPack per jurisdiction (Phase 3.5), never a code constant                                                                                                                                                            | included — the subject's export contains their own grant and withdrawal history                                                                    | `RETAIN_WITH_BASIS`      |
| `public.reconsent_evaluations`            | `NON_PERSONAL`       | reviewed material/notice/no-action decision per republished version and purpose, with the recorded affected-subject query                  | `INTERNAL`     | the decision explains every RECONSENT_REQUIRED ever returned; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                         | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |
| `public.processing_basis_references`      | `NON_PERSONAL`       | typed reference naming the declared legal basis per (purpose, jurisdiction); resolution is Phase 3.5                                       | `INTERNAL`     | basis history explains past gating; PolicyPack owns any bound (Phase 3.5)                                                                                                                                                                                                                   | n/a                                                                                                                                                | `RETAIN_WITH_BASIS`      |

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

Identity basis notes (migrations 0030-0034; canonical declarations and full
reasoning in [`modules/identity/MODULE.md`](../../../modules/identity/MODULE.md),
mirrored here because platform migrations created the tables):

- The `CASCADE_DELETE` chain is structural: every identity table except
  `authentication_security_events` references `public.identity_accounts` with
  `ON DELETE CASCADE`, so erasing the account row erases every credential,
  code, session, and token with it in one statement.
- `public.authentication_security_events` — `RETAIN_WITH_BASIS`: security
  obligations survive account closure for the retention period (same basis as
  `audit.audit_events`); `account_id` is deliberately an opaque reference with
  no foreign key, so the history survives erasure and then resolves to
  nothing. It is also the lockout ledger — deleting rows would erase the
  failed-attempt history the lockout derivation counts (legacy AUTHN-11).

Users and tenancy basis notes (migrations 0040-0044; canonical declarations in
[`modules/users/MODULE.md`](../../../modules/users/MODULE.md) and
[`modules/tenancy/MODULE.md`](../../../modules/tenancy/MODULE.md), mirrored
here because platform migrations created the tables):

- `public.user_status_history` — `RETAIN_WITH_BASIS`: accountability for
  account-state changes (disable/deletion intent included) survives closure
  for the retention period; rows hold status labels and an opaque actor
  reference that resolves to nothing once the subject is erased. Append-only
  by revoked grants (`karar_app`: SELECT + INSERT).
- `public.tenants` — `RETAIN_WITH_BASIS`: contractual record naming an
  organization, not a subject. RLS ENABLE+FORCE with a self-row policy
  (`id = app.tenant_id`) is the recorded global-table decision — no
  allow-list entry needed; platform-admin cross-tenant reads arrive with the
  control plane (migration 0041 header).
- `public.tenant_invitations` — `CASCADE_DELETE` with two recorded decisions:
  the NORMALIZED invitee email is stored as CONFIDENTIAL text because
  redemption must match it and creators must see whom they invited (a digest
  can do neither; revisited when column-encryption machinery arrives), and
  only sha256(token) is ever at rest — the raw bearer token is returned once
  to the creator and never persisted, logged, or audited.

Authorization and kill-switch basis notes (migrations 0050-0054; canonical
declarations in [`modules/authorization/MODULE.md`](../../../modules/authorization/MODULE.md)
and [`modules/control-plane/MODULE.md`](../../../modules/control-plane/MODULE.md),
mirrored here because platform migrations created the tables):

- `public.permissions`, `public.roles`, `public.role_permissions` —
  `NON_PERSONAL_BY_DESIGN`, with the demonstration ADR-0026 requires: rows
  hold permission/role names, scope labels, and descriptions seeded by
  migration only (`karar_app` is SELECT-only, pinned in 0054). No column
  references a person and no linkage — restorable or otherwise — to any
  subject exists, so re-identification is impossible by construction, not by
  processing.
- `public.role_assignments` — `RETAIN_WITH_BASIS`: the basis is authorization
  accountability (who held privileged authority, when, granted by whom) —
  a security obligation that survives account closure for the retention
  period, same reasoning as `audit.audit_events`. `user_id` / `granted_by` /
  `revoked_by` are opaque identity references with no FK, so the record
  survives erasure and then resolves to nothing. Revoked rows are immutable
  by trigger even for the table owner; `karar_app` holds no DELETE.
- `public.kill_switches` — `NON_PERSONAL_BY_DESIGN`: rows hold switch state,
  an operator reference string, and a reason; `actor` names an operator
  acting in an official capacity, recorded for operational accountability,
  and no subject data exists to re-identify.
- `public.kill_switch_history` — `RETAIN_WITH_BASIS`: the basis is
  operational accountability — every past denial of a guarded operation must
  be explainable (which restriction, whose decision, what reason, when).
  Append-only by both mechanisms (SELECT-only grants and the immutability
  trigger); rows are written solely by the `kill_switches` AFTER UPDATE
  SECURITY DEFINER trigger.
- RLS decisions for the range: `role_assignments` is ENABLEd and FORCEd
  (tenant-roster + self-platform SELECT arms; writes bound to the
  transaction's principal — 0052 header); the two catalogues and the two
  kill-switch tables are deliberately global with compensating controls,
  recorded per table in [`rls-allow-list.json`](rls-allow-list.json).

Operating-entity and consent basis notes (migrations 0060-0065; canonical
declarations in [`modules/operating-entity/MODULE.md`](../../../modules/operating-entity/MODULE.md)
and [`modules/consent/MODULE.md`](../../../modules/consent/MODULE.md), mirrored
here because platform migrations created the tables):

- The operating-entity tables and the consent catalogue/decision tables are
  `RETAIN_WITH_BASIS` as records of legal accountability: who contracted,
  who was responsible, what text was in force, what was decided and when.
  Subject references (`user_id` on assignments, `subject_ref` on migrations,
  `user_id` on grants) are opaque cross-module references that resolve to
  nothing once the referenced subject is erased; the accountability fact
  survives.
- `public.consent_grants` — `RETAIN_WITH_BASIS`: the legal basis is defence
  of processing already performed under the recorded consent. A grant is
  immutable evidence (trigger-enforced); erasure severs the subject linkage
  by erasing the referenced identity, never by deleting the evidence row
  inside the retention period.
- RLS decisions for all eleven tables are recorded per table in
  [`rls-allow-list.json`](rls-allow-list.json) (nine deliberately global with
  compensating controls) and in migration 0065 (`consent_grants` ENABLEd and
  FORCEd on both principal GUCs; `reconsent_evaluations` append-only by
  revoked grants and trigger).
