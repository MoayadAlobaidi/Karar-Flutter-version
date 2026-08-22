# Module: audit

## Purpose

Append-only audit records for every mutation, every staff read, and every attempted sealed access.

## Ownership

- **Business owner:** _unassigned — solo team_
- **Technical owner:** _unassigned — solo team_
- **Status:** ACTIVE — Phase 2 implemented the append-only foundation: `audit.audit_events`
  (migration `0010_audit_events.sql`), the `AuditWriter` port, the `RecordAuditEvent` use case
  with its metadata guard, and the Postgres writer on the platform persistence adapter.
- **Phase:** 2
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `audit.audit_events` | `SUBJECT_DERIVED` | accountability — tamper-evident record of who did what, when, to which resource, with what outcome | `CONFIDENTIAL` | from PolicyPack per jurisdiction (packs land Phase 3.5); local development placeholder 13 months, held in policy configuration, never a code constant | excluded (integrity record about the account, not subject content; export coverage note names this omission) | `RETAIN_WITH_BASIS` |
| `audit.security_events` (planned, Phase 3) | `SUBJECT_DERIVED` | security investigation — authentication and authorization anomalies | `CONFIDENTIAL` | from PolicyPack per jurisdiction; same placeholder discipline as audit_events | excluded (integrity record; named in export coverage note) | `RETAIN_WITH_BASIS` |
| `audit.sealed_access_events` (planned, Phase 13) | `SUBJECT_DERIVED` | accountability for every attempted sealed access, successful or refused — refs and outcomes only, never content | `CONFIDENTIAL` | from PolicyPack per jurisdiction; same placeholder discipline as audit_events | excluded (integrity record; named in export coverage note) | `RETAIN_WITH_BASIS` |

Legal basis for `RETAIN_WITH_BASIS`: accountability and security obligations survive account
closure for the retention period; actor/tenant references are opaque and resolve to nothing
once the referenced subject is erased.

The platform-owned `platform.schema_migrations` table is declared in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md),
which carries the same six-field table for datasets owned by no module.

## Events published

_None. This module consumes events and publishes none._

## Permissions

| Permission | Role(s) |
|---|---|
| `audit.record.read` | _none — declared, deliberately unseeded_ |
| `audit.security_event.read` | _none — declared, deliberately unseeded_ |

Neither is seeded, and `SECURITY` holds nothing in the catalogue. That is deliberate rather than
pending: no surface reads an audit record yet, and a right that exists before the surface that
invokes it is a right nobody reviewed against a real call site. `SECURITY` is where they would
land when a reader exists.

**Permissions deliberately absent:** No role may update or delete an audit record. Enforced by revoked grants and by trigger.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

This module consumes `@karar/platform` (persistence adapter, classification module) and
`@karar/shared-kernel` (`Result`). It depends on no other module.

## Notes and known limitations

Two mechanisms rather than one: the legacy's audit table carries the schema's single flagged anomaly — **RLS FORCEd but not enabled**, a shape no existing guard detects (RLS-02). Phase 2 enforces both: `karar_app` holds INSERT+SELECT only (42501 on anything else), and the `audit_events_immutable` trigger raises on UPDATE/DELETE/TRUNCATE **even for the table owner** — proven live by `__tests__/audit-append-only.integration.test.ts`.

**Staff reads are audited, including reads that return nothing.** The legacy audits only mutations (AZ5), and its own worklist ranks this as *the only item that gets permanently worse every day it stays open* — unrecorded events cannot be recovered later.

**Metadata is guarded, not trusted.** `AuditMetadataGuard` (application layer) rejects secret-pattern keys, SEALED- and SECRET-marked values, unclassified financial-shaped keys, nested payloads, and oversized blobs; HIGHLY_SENSITIVE_FINANCIAL values are stored as `[redacted:hsf]` unless the key is identifier-shaped. Audit rows answer who/what/when/outcome; payload-level state belongs to the owning module.

**Phase 2 wiring limitation:** the writer appends outside the caller's transaction (a denied or rolled-back attempt still leaves its record). Commit-coupled audit rows and the RLS posture for the `audit` schema arrive with tenancy (Phase 3).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
