# Security Policy

---

## Status

**Karar is at Phase 1.** Foundation code exists (workspace tooling, minimal entrypoints, CI, architecture tests) — no product capabilities are implemented, no system is deployed, and **no customer data is held**.

**No security claim is made.** No penetration test, independent assessment, certification, or regulatory approval exists for this system, and none is implied by any document in this repository.

## Reporting a vulnerability

**Do not open a public issue.**

Report privately to the repository owner. Include what you found, how to reproduce it, and what you assess the impact to be. You will get an acknowledgement; there is no SLA at this stage because there is no on-call rotation yet — that is itself a Phase 20 gate.

## Handling classified data

Six classifications; see [`docs/security/data-classification.md`](docs/security/data-classification.md).

**`SEALED` is categorically different from the rest.** It is data intentionally inaccessible **to Karar itself** until specific conditions and authorizations are met. Reading it requires a `SealAccessGrant` — a compiler-required, non-nullable argument. There is no `SUPPORT`, `ADMIN`, `ANALYTICS`, or `AI` grant type; they do not exist.

**A sealed value appearing in a log, event, projection, or analytic is a SEV-1 regardless of how few records are involved.** The classification is a promise, and the promise is breached at n=1.

## Never commit

| | |
|---|---|
| Secrets, keys, tokens, credentials | `.env` is git-ignored; `.env.example` holds placeholders only |
| Real customer data, in any form | Including in tests and fixtures |
| Production connection strings | |
| A key shared across environments | **Never reuse production's encryption key anywhere** — a staging leak would otherwise decrypt production data |

CI runs secret scanning, and branch protection on `main` makes the required checks merge-blocking (verified 2026-08-15; see `docs/operations/repository-security-settings.md`).

## Inherited security requirements

These come from the audit of the legacy system and are binding on Karar's implementation. Full detail in [`docs/legacy/security-findings.md`](docs/legacy/security-findings.md).

| Requirement | Origin |
|---|---|
| Client IP derived from a **configured trusted-proxy allow-list** — never a bare client-supplied header | AUTHN-04, HIGH |
| Rate-limit policy selected from the **normalised, decoded** path — never the raw URI | API-01, HIGH |
| Every ingestion and rendering path declares explicit limits and **rejects rather than degrades** | FILES-2, HIGH |
| **Approved key-custody strategy, rotation, and an integrity canary** before any production sealed data (ADR-0017) | **ENC-2 — the legacy's production key has already been lost once** |
| RLS guard detects *no RLS*, *enabled-without-policy*, **and** *FORCEd-without-enabled* | RLS-01, RLS-02 |
| Consent gates **fail closed** | AI-5 — the legacy's fails open |
| **Every staff read of a customer record is audited**, including reads returning nothing | AZ5 |
| Published legal text is reconciled with the behaviour it describes | **P1 — the finding that mattered most, and not a code defect** |
| `verify-full` database transport, not `require` | ENC-1 |
| Encryption coverage is **measured**, not assumed | ENC-3, ENC-13 |

## Accepted risks

Recorded with owners rather than left implicit.

| Risk | Rationale |
|---|---|
| No certificate pinning in v1 | Challenge C11, retained from Plan v1 |
| Single AI provider at Phase 7 | The port exists; a second provider is configuration |
| In-process control plane before Phase 20 | Gateway contract in place; separate deployment is a hard production gate |

## Production gates

Production launch requires, among others: a separate staging environment; a separately deployed control plane; the **sealed vault extracted to its own security boundary**; **an approved key-custody strategy with tested recovery/continuity (drill rehearsed where applicable)**; the **sealed-integrity canary running**; an **independent** security assessment by a party that did not build the system; an executed penetration test; a measured RTO; and a written risk-acceptance register.

See [`docs/architecture/environments.md`](docs/architecture/environments.md).
