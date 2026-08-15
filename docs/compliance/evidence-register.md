# Evidence Register

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

---

## What this register is

An index of evidence **about** controls — identifiers, descriptions, owners, collection method, a location reference, retention, and review status. It never contains the evidence itself: no logs, no scan output, no credentials, no access exports pasted inline, no personal data. Handling rules are in [`evidence-handling.md`](evidence-handling.md).

**Evidence store:** to be approved. **Interim:** GitHub Actions run URLs and workflow artifacts. The repository itself is **public**, so evidence summaries recorded here must already satisfy the no-sensitive-content rule in evidence-handling; anything sensitive goes only to the future protected store. The store decision is revisited no later than the Phase 2 gate; whatever is chosen must survive the loss of any single vendor account (KAR-RSK-011).

## Entry schema

| Field | Meaning |
|---|---|
| `id` | `EV-###`, stable, never reused |
| `description` | What the evidence demonstrates, in one sentence |
| `control(s)` | KAR-CTL IDs from the [control matrix](control-matrix.md) |
| `owner` | Role accountable for the evidence existing and staying current |
| `method` | How it is collected (CI artifact, run URL, settings export, signed review record) |
| `location ref` | Pointer to where it lives — a URL or path reference, never the content |
| `frequency` | per-PR · per-phase · on-change · continuous |
| `retention` | Default 13 months (see evidence-handling) unless stated |
| `status` | `PENDING` (mechanism named, no instance yet) · `COLLECTED` (at least one instance referenced) · `REVIEWED` (a human checked it against the control) · `STALE` (older than its frequency implies) |
| `reviewed` | Date of last human review, or `—` |

## Entries

EV-001–EV-006 were COLLECTED from the first CI runs on the Phase 1 PR (2026-08-15; one transient failure — a missing `aquasecurity/setup-trivy` allowlist pattern — was fixed and the rerun passed, recorded in `docs/operations/repository-security-settings.md`). EV-007 was verified during Phase 1 (see its row).

| id | description | control(s) | owner | method | location ref | frequency | retention | status | reviewed |
|---|---|---|---|---|---|---|---|---|---|
| EV-001 | A CI pipeline run showing the required PR checks executing and gating the merge | KAR-CTL-015, 016, 028 | Engineering Owner | GitHub Actions run URL | first runs on PR #2: https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571460 and https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571474 — all 12 checks pass | per-PR (sampled per-phase) | 13 months | COLLECTED | 2026-08-15 |
| EV-002 | Architecture-test job output showing structural checks executed and passing/failing as designed | KAR-CTL-020 | Engineering Owner | CI job log reference + artifact | `architecture` job + `architecture-report` artifact, https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571460 (17 pass / 0 fail / 11 deferred; self-test 16/16) | per-PR (sampled per-phase) | 13 months | COLLECTED | 2026-08-15 |
| EV-003 | SBOM artifact produced by a CI build | KAR-CTL-027 | Engineering Owner | CI build artifact reference | `sbom` artifact (SPDX JSON), https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571474 | per-build (retained per-phase) | 13 months | COLLECTED | 2026-08-15 |
| EV-004 | Dependency-scan (SCA) report from CI showing the scan executed (currently report-only; threshold enforcement tracked in `docs/operations/repository-security-settings.md`) | KAR-CTL-025 | Security Owner | CI job artifact/summary reference | `dependency-audit` artifact + blocking `dependency-review` job, https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571474 | per-PR (sampled per-phase) | 13 months | COLLECTED | 2026-08-15 |
| EV-005 | Secret-scan report from CI showing scan executed with zero (or triaged) findings | KAR-CTL-026 | Security Owner | CI job artifact/summary reference | `secrets` job (gitleaks, full history, zero findings), https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571474 | per-PR (sampled per-phase) | 13 months | COLLECTED | 2026-08-15 |
| EV-006 | Docs link-check / docs-convention job output | KAR-CTL-023 | Engineering Owner | CI job log reference | docs-check within the `architecture` job (7/7), https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31900571460 | per-PR (sampled per-phase) | 13 months | COLLECTED | 2026-08-15 |
| EV-007 | Branch-protection and repository-security configuration for the default branch — API export (required states, actual states, and per-row `gh api` verification commands: `docs/operations/repository-security-settings.md`) | KAR-CTL-007, 008, 015, 016 | Security Owner | `gh api` verification, row-by-row | settings doc rows, each stamped VERIFIED 2026-08-15 with the observed value | on-change + per-phase | 13 months | **VERIFIED 2026-08-15** | branch protection (8 required checks, strict, admins bound, PR-only), secret scanning + push protection, Dependabot alerts + security updates, read-only workflow token, Actions allowlist (GitHub-owned + 5 pinned patterns), fork-PR approval for all external contributors |
| EV-008 | Risk-register review record for a phase gate (attendee role, date, deltas, sign-off) | KAR-CTL-003, 004 | Security Owner | Signed review note in the evidence store | none yet — first record at Phase 1 gate | per-phase | 13 months | PENDING | — |

## Adding entries

New evidence types enter through a PR that adds a row here **and** cites the KAR-CTL ID it supports; evidence with no control is a smell, a control moving past IMPLEMENTED with no evidence row is a gate failure. The per-family expectations that will drive future entries are in [`soc2/type-ii-evidence-plan.md`](soc2/type-ii-evidence-plan.md).
