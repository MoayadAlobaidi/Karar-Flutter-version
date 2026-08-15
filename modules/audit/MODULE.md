# Module: audit

## Purpose

Append-only audit records for every mutation, every staff read, and every attempted sealed access.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 2
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `audit_records` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | append-only: revoked grants AND a trigger |
| `security_events` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` |  |
| `sealed_access_events` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | every attempt, successful or refused |

## Events published

_None. This module consumes events and publishes none._

## Permissions

| Permission | Role(s) |
|---|---|
| `audit.record.read` | `SECURITY` |
| `audit.security_event.read` | `SECURITY` |

**Permissions deliberately absent:** No role may update or delete an audit record. Enforced by revoked grants and by trigger.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

Two mechanisms rather than one: the legacy's audit table carries the schema's single flagged anomaly — **RLS FORCEd but not enabled**, a shape no existing guard detects (RLS-02).

**Staff reads are audited, including reads that return nothing.** The legacy audits only mutations (AZ5), and its own worklist ranks this as *the only item that gets permanently worse every day it stays open* — unrecorded events cannot be recovered later.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
