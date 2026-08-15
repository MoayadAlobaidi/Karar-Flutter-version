# Evidence Handling

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** Phase 2 gate

---

## Purpose

Evidence proves controls operate. Collected carelessly, it becomes a second copy of exactly the data the controls protect. This document sets the rules so the evidence trail can be handed to an auditor without itself being a finding.

## What may enter git

| May be committed | Must never be committed |
|---|---|
| Evidence **references**: run URLs, artifact IDs, file names, hashes | Raw logs of any kind |
| Register rows (ID, description, owner, method, location ref, status, dates) | Credentials, tokens, keys — including expired ones |
| Signed review records containing roles, dates, and conclusions | Vulnerability reports or scanner output (committed); they live in the evidence store and are referenced |
| Redacted configuration exports (see redaction rule) | Access exports naming real accounts/emails beyond the repository's own public metadata |
| Counts and summaries ("0 findings", "26 checks passed") | Personal data of any person, customer or staff |
| | Real customer data in any form — also banned repo-wide by `SECURITY.md` |

The [evidence register](evidence-register.md) stores identifiers, descriptions, owners, methods, location references, retention, review status, and timestamps — **only**.

## Redaction rule

Before any artefact (screenshot, settings export, report excerpt) enters the evidence store or is referenced from git:

1. Remove or mask secrets, tokens, internal hostnames, and personal email addresses.
2. Remove any customer-derived value, even one that looks harmless — classification is decided by `docs/security/data-classification.md`, not by how a value looks.
3. If redaction would remove what makes the evidence probative, keep the artefact **only in the evidence store** with access restricted to the owning role, and reference it here by ID.

A screenshot for EV-007 (branch protection) should show the protection rules and repository name — not the account list of an unrelated settings page.

## Naming

```
EV-###__YYYY-MM-DD__short-slug.ext        e.g. EV-005__2026-09-01__secret-scan-pr-42.txt
```

One evidence instance per file; the `EV-###` prefix makes the register row discoverable from the artefact and vice versa.

## Retention

| Class | Default | Why |
|---|---|---|
| Control-operation evidence (EV-001…) | **13 months** | Covers a 12-month SOC 2 Type II observation window plus collection buffer |
| Phase-gate records | Life of the project | They are the readiness narrative |
| Incident evidence | 13 months minimum; longer if legal hold applies | Per incident-response policy |

Retention for anything containing personal data will be governed by ADR-0026 lifecycle declarations — at present nothing in the evidence trail may contain personal data at all, which is the simpler rule.

## Review cadence

- Every register row is re-reviewed at each **phase gate**; rows older than their stated frequency are marked `STALE`.
- `STALE` evidence supports no status above `IMPLEMENTED` in the control matrix.
- The reviewer records date and role in the register row; the review record itself is evidence (EV-008 pattern).

## Store

To be approved (decision owner: Platform Owner, revisit at Phase 2 gate). **Interim:** CI run URLs and workflow artifacts. Note: the source repository is **public** — nothing sensitive may be stored repository-adjacent, which this policy already requires; the interim store therefore holds only the non-sensitive identifiers and summaries this document permits. Two known weaknesses of the interim store, carried openly: run URLs expire with vendor retention policies, and everything sits with one vendor (KAR-RSK-011). Mitigation until then: per-phase export of evidence artefacts into the repository-adjacent private store, per the naming rule above.

## Related

Controls: KAR-CTL-003, 004, 016, 020, 023, 025, 026, 027 · Registers: [evidence-register.md](evidence-register.md) · Plan: [soc2/type-ii-evidence-plan.md](soc2/type-ii-evidence-plan.md)
