# Security Findings Carried Forward from Qarar

**Deliverable:** Phase 0.2
**Source:** `docs/qcb/evidence/SECURITY_AUDIT_FINDINGS_STATUS_2026-08-12.json` (audit dated 11 August 2026), `docs/qcb/QARAR_QCB_SECURITY_GAP_REGISTER.md`, and re-derivation against HEAD (13 August 2026).

**This document does not assert that Qarar is or is not secure, and asserts nothing about Karar V2.** It records what a self-audit of the legacy found, so that Karar V2's design answers it deliberately rather than by accident.

---

## 1. The honest totals

```
critical: 0 · high: 7 · medium: 74 · low: 37 · info: 10 · total: 128
arithmetic: 0 + 7 + 74 + 37 + 10 = 128
```

Three qualifications the legacy states about its own audit, repeated here rather than smoothed over:

1. **Only 8 of 128 findings carry any reviewed status.** No re-audit has run.
2. **104 of the 128 carry matters the audit could not verify from the repository alone.**
3. **The auditor and the remediator are the same party.** The legacy's own position: *"I cannot also be the independent assessor of my own work, and nothing I produce should reach QCB as an independent assessment."*

A fourth, from this audit: the legacy's feature matrix reports 72 MEDIUM / 47 LOW, while the findings JSON reports 74 MEDIUM / 37 LOW / 10 INFO. **The JSON is authoritative** — it states its arithmetic and is dated. The discrepancy is an aggregation artefact of the kind the legacy documents elsewhere, and it is recorded rather than silently reconciled.

**No independent penetration test exists.** A scope document was written; no test has been run.

---

## 2. The seven HIGH findings

| ID | Finding | Status at HEAD | Karar V2 answer |
|---|---|---|---|
| **P1** | AI consent notice stated merchant names and free-text notes were redacted before leaving Qatar. **They were not.** The code preserved merchant names deliberately and passed notes through — and that notice was **the legal basis for a cross-border transfer of customer financial data** | **REMEDIATED** by `V43` (11 Aug). *Partially* — holders of a v1 acceptance are not re-prompted while `enforce-reacceptance` is `false` | §4.1 below |
| **INFRA-02** | Nothing scraped the metrics; no alert reached a human | **PARTIAL.** 12 of 25 rules live; one fired and was received. **No dashboard. No on-call — one email address, no rotation, no escalation, so a SEV-1 and a SEV-3 arrive identically** | Phase 17+; on-call is a Phase 20 gate |
| **AUTHN-04** | Auth rate limiter keys on client-supplied `X-Forwarded-For` with no trusted-proxy allow-list. Assessed practical effect: **total bypass**, with a request claiming to be localhost exempt from every rule **including the AI spend cap**. Second half: **no attempt counter or lock on admin recovery-code verification** | **OPEN** | §4.2 below |
| **FILES-1** | The complete uploaded statement — the single most sensitive artefact the product holds — stored **unencrypted** for the whole retention window, while data derived from it was encrypted, and while the privacy policy told customers sensitive fields are encrypted | **REMEDIATED** by `V45` (derived text) + `V46` (the file itself) | Encrypted from the start, Phase 5 |
| **FILES-2** | **No cap on parsed statement rows.** A 10 MB CSV can carry ~1M rows into a single transaction, on a one-instance deployment with a connection pool of 10 | **OPEN** (legacy worklist C6) | §4.3 below |
| **API-01** | Rate-limit policy selected from the **raw undecoded URI**, so `/api/v1/ai/%63hat` reaches the AI handler on the loose catch-all limit. Also in-process and per-instance | **OPEN** | §4.2 below |
| **P9** | **No customer financial data is processed in Qatar**, and the processor agreement for the largest cross-border disclosure is not executed | **OPEN.** DPAs with OpenAI, Resend and Supabase: **none signed** (legacy E5) | §4.4 below |

Two of the seven are closed at HEAD. Any document quoting "seven open HIGH findings" is stale.

---

## 3. The finding that should reshape Karar V2 — ENC-2

Not a HIGH in the legacy's own grading. It should be treated as the most important finding in the pack for Karar V2's purposes.

> **Key rotation, escrow or a second copy: NOT BUILT.** The key is a one-way door and **has already been lost once in production, on 11 August 2026.**

The legacy survived this because production held 3 users, 45 transactions, and 2 accounts, and because encrypted columns sit beside unencrypted metadata that makes loss *visible*.

**Karar V2's `SEALED` classification removes both of those cushions.** By design, sealed data is never projected, never in events, never in logs, never in analytics, never readable by support or admin, and never consumed by AI. It follows that:

- **Key loss on sealed data is unrecoverable.** There is no second copy of the plaintext anywhere by construction.
- **Key loss on sealed data is undetectable.** No projection, dashboard, or support path can notice the discrepancy, because none of them may read the payload.
- **Discovery happens at the worst possible moment** — a verified, authorised disclosure to a bereaved family, after death verification, recipient verification, a waiting period, and human approval have all completed.

Plan v2 §4.2 specifies per-record DEK wrapped by a jurisdiction-scoped KEK via `EncryptionProvider`, and says nothing about escrow, rotation, or recovery.

**Required amendment — raised in [`../architecture/plan-v2-deltas.md`](../architecture/plan-v2-deltas.md) as D2:**

1. KEK escrow with a documented, rehearsed recovery procedure, before any production `SEALED` data exists — alongside the existing Phase 20 gate that the vault be extracted to its own boundary.
2. A **sealed-integrity canary**: a synthetic sealed record per jurisdiction-KEK, decrypted on a schedule, alerting on failure. This is the only mechanism that can detect key loss without violating the seal, because the canary's plaintext is known and contains no customer data.
3. Key rotation designed in from Phase 2, not retrofitted — the legacy's rotation is additionally entangled with statement fingerprinting (legacy M9), which is what retrofitting costs.

---

## 4. Findings that translate into Karar V2 design rules

### 4.1 Published legal text is part of the system (P1, P12, AI-3, AI-5)

The most instructive failure in the pack. **The code was defensible; the document was wrong.**

Related findings compound it: **P12** — publishing a new version of the terms asks nobody to accept it, contradicting the terms themselves. **AI-5** — the consent gate on AI processing **fails open when no disclosure document is published**. **P4** — the privacy policy tells customers they can export their data in the app, and **no mobile screen calls the export endpoint**. **C4/M7** — a document compulsory at registration promises per-item deletion of accounts, statements and entries, and `AccountController` exposes a single `@GetMapping`.

Four separate instances of the same class: **the published document and the running system disagree, and the document is the one with legal force.**

**Karar V2 rules:**

| Rule | Where enforced |
|---|---|
| Consent gates **fail closed**. No published disclosure ⇒ the capability is unavailable, not permitted | Capability resolver (§2.2), deny-by-default |
| Republishing a legal document version triggers a **re-consent evaluation** | Consent context, Phase 3 |
| A capability whose legal document promises a behaviour must **declare** that behaviour in its `CapabilityDescriptor`; CI asserts the pair | New architecture test — see §6 |
| `MODULE.md` names the legal documents a capability's promises appear in | Phase 0.7 template |

Plan v2's `(operatingEntity, purpose, jurisdiction)` consent triple is a real improvement but does **not** cover version republication within a stable triple — which is the case that actually occurred. Delta **D4**.

### 4.2 Controls must be tested against the shape of the attack (AUTHN-04, API-01, RLS-01, RLS-02, AZ3)

A cluster of findings sharing one root cause: **a control that exists and does not work is worse than a known absence**, because it is counted as protection.

- Rate limiting keyed on a **client-supplied header** → attacker mints a fresh bucket per request.
- Rate-limit policy selected from the **raw undecoded URI** → percent-encoding routes around it.
- RLS guards test *"enabled but no policy"*, not *"no RLS at all"* (RLS-01) or *"FORCEd but not enabled"* (RLS-02) — and the audit log table itself carries the second shape.
- `TenantAccessGuard`: **two of three documented protections have no call site anywhere.**
- Entitlement enforcement defaults **off**, so the paid boundary is not a control (API-13).

**Karar V2 rule — every control ships with a test that fails when the control is removed.** Not a test that the control exists; a test that the *attack* fails. Plan v2 §7.9 layer 4 already requires adversarial cross-tenant tests; this generalises it.

**Specific inherited requirements:**

| Requirement | Phase |
|---|---|
| Trusted-proxy allow-list before any header-derived client identity is trusted | 2 |
| Rate-limit policy selected from the **normalised, decoded** path | 2 |
| RLS guard detects *no RLS*, *enabled-without-policy*, **and** *FORCEd-without-enabled* | 3 |
| Every declared guard has an asserted call site | 1 (architecture test) |
| Entitlement enforcement defaults **on**; disabling is an audited, staged change | 10 |

### 4.3 Resource limits are correctness, not performance (FILES-2, FILES-7, API-05)

No cap on parsed rows; a PDF renderer converting up to 2 MB of caller-supplied HTML with **no time or memory budget**; no PDF page, memory, or timeout ceiling.

**Karar V2 rule:** every ingestion and rendering path declares explicit limits — bytes, rows, pages, wall-clock, memory — and rejects rather than degrades. Applies to statement import (Phase 5), report rendering (Phase 16), and **disclosure package generation** (Phase 13), which is a rendering path handling `SEALED` data and therefore the least acceptable place for an unbounded operation.

### 4.4 Data residency is an unanswered question, and it is the first one a regulator asks (P9)

The legacy states it without hedging:

> **Customer financial data processed in Qatar: None.**

Compute on Render (stated Oregon, **unverified** — `render.yaml` carries no region key). Database on Supabase (stated Frankfurt, **provider dashboard only**). OpenAI and Resend both United States. Five third parties reachable from the running system: Supabase, OpenAI, Resend, Stooq, Render. **No DPA signed with any of them.**

**Karar V2:** `docs/architecture/data-residency.md` inherits this as its central open question. Plan v2's L0–L3 topology ladder (§7.11) is the mechanism that makes a residency answer a Terraform change rather than a rewrite — but **the ladder does not answer the question, and the legal opinion is correctly listed among Plan v2's deferred decisions.** The AI path is the largest cross-border disclosure and the one most likely to need an in-region model or a Qatar-resident provider.

### 4.5 Staff access needs two layers, not one (AZ1, AZ5)

> There is no endpoint that returns one customer's transactions to a staff member. **The database, however, grants a platform administrator session SELECT on every consumer financial table; only the absence of an endpoint prevents the read.** That is one layer, not two.

And **AZ5**: staff reads of customer records leave **no audit row** — only mutations are audited. The legacy's own worklist ranks fixing this as **C1**, *"the only item on the whole list that gets permanently worse every day it stays open,"* because unrecorded events cannot be recovered later.

**Karar V2:**

- RLS + revoked grants make the database the second layer, not a bypass (Phase 3).
- **Every staff read of a customer record is audited**, from Phase 8 — including reads that return nothing.
- For `SEALED` data this is already absolute: Plan v2 §6.3 item 15 requires auditing **every attempted sealed access, successful or not**, and no admin role holds a content-read permission at any level.

### 4.6 Client-side security is not security (MOB-01, MOB-03, MOB-04, MOB-06, MOB-07, AUTHN-07)

Arabic name and phone field-encrypted server-side and **cached in plaintext `AsyncStorage`** on device. Imported statement PDFs left in the app cache on sign-out. Session clear-down by a **hand-maintained registry with a documented blind spot**. No biometric lock, idle timeout, or re-authentication on foreground. Admin sign-out **client-side only** — the highest-privilege session cannot be revoked server-side.

**Karar V2 (Phase 4, Flutter):** secure storage for anything classified `CONFIDENTIAL` or above; sign-out clears by construction rather than by registry; biometric lock, idle timeout, and foreground re-auth built once; server-side session revocation for **all** sessions, admin sessions first.

**Retained from Plan v1 unchanged:** challenge **C11** — no certificate pinning in v1. The legacy has none either (MOB-01, MEDIUM). This is a deliberate, recorded acceptance, not an oversight.

### 4.7 Erasure has to handle data with no owner (P7, P5, P8)

One production table holds statement-derived data belonging to no user and **therefore cannot be erased on request**. The export omits whole categories of the customer's own data *while its coverage block claims to name everything it omits*. Nothing but the raw file has a retention schedule.

**Karar V2:** every table declares an erasure strategy at design time — `CASCADE`, `ANONYMISE`, `RETAIN_WITH_BASIS`, or `ORPHANED_BY_DESIGN` with a stated legal basis. Enforced by the `MODULE.md` template (Phase 0.7) and asserted in Phase 16. **Deriving data into an ownerless shape is a design decision, and it must be made deliberately rather than discovered during a data-subject request.**

---

## 5. Findings that Plan v2 already answers

Recorded so the design gets credit where it is due, and so nobody re-solves them.

| Legacy finding | Plan v2 mechanism |
|---|---|
| AI-7 — numeric guard ignores numbers not marked with a currency or percent token, so bare counts are unchecked | `VerifiedFinancialFacts` (ADR-0019). **The model never writes a number**, so there is nothing to guard |
| AI-4 — a code path calls the provider directly, bypassing usage logging, metrics, provenance and rate limiting | Single AI orchestrator; provider port is the only route (ADR-0010) |
| RLS retrofit across V9/V30/V40, still incomplete | RLS at Phase 3 (ADR-0022) |
| INFRA-13 — staging designed, never provisioned; now blocking the pen test | Staging mandatory before production, hard gate Phase 19 (§7.10) |
| AUTHN-16 — admin sign-in tokens in one JVM's heap; breaks on restart or a second instance | Control plane as a security gateway with its own trust boundary (ADR-0021) |
| API-13 — entitlement enforcement off by default | Deny-by-default capability availability (§2.2). **A capability with no availability row is `DISABLED`** |
| White-label control plane without a data plane | Explicitly costed at Phase 11 following this audit (delta D3) |
| Documentation drifting because it was re-derived from itself | Evidence labels + derive-from-source, adopted as convention |

---

## 6. New architecture tests arising from this audit

Additions to Plan v2 §13, which specifies 21. These take it to **26**.

| # | Test | From |
|---|---|---|
| 22 | **RLS coverage guard** — every table is RLS-enabled and FORCEd, or appears on an explicit allow-list with a stated reason. Detects *no RLS*, *enabled-without-policy*, and *FORCEd-without-enabled* | RLS-01, RLS-02, P14 |
| 23 | **No declared guard without a call site** — a class or decorator documented as a protection must be reachable | AZ3 |
| 24 | **Ingestion and rendering paths declare explicit limits** — bytes, rows, pages, wall-clock, memory | FILES-2, FILES-7, API-05 |
| 25 | **Every table declares an erasure strategy** | P7, P8 |
| 26 | **Capability promises reconcile with legal documents** — a `CapabilityDescriptor` referencing a legal document must declare the behaviours that document promises | P1, P4, P12, C4 |

Test 26 cannot fully verify prose against code and is not claimed to. It asserts the *link* exists and that a declared promise has a named owner — which is what was missing when the AI notice and the redaction code diverged.

---

## 7. What Karar V2 must not inherit

| | Why |
|---|---|
| The retrofit sequence for RLS | Phase 3, or it is never complete |
| Encryption without rotation or escrow | ENC-2. **The key has already been lost once** |
| Controls that default off | API-13. Deny-by-default instead |
| Documentation re-derived from itself | Derive from source, label evidence |
| A single alert recipient with no rotation | *"A SEV-1 and a SEV-3 arrive identically"* |
| Consent text written separately from the code it describes | P1 — the finding that mattered most |
| Surfaces that fabricate state | The connect-a-bank mock. Plan v2 §2.2 requires denials to carry machine-readable reasons and be shown honestly |

---

## 8. Open items owned outside engineering

Carried from the legacy's go-live worklist. These belong on Karar V2's pre-launch list because they are not made obsolete by a rewrite.

| | Item |
|---|---|
| **E2** | Counsel review of the privacy policy |
| **E3** | Arabic legal translation by a legal translator — **no Arabic legal text has ever been independently reviewed** |
| **E4** | Independent security assessment by a party that did not build the system |
| **E5** | DPAs with every processor — **none signed** |
| **M5** | Written regulator conditions, participant-specific, not on the public portal |
| **M6** | Retention decision — do minimums or maximums apply, and do they differ between the original statement file and the derived transactions? **Unanswered.** The legacy's 90 days was chosen because a number was needed |
| **M10** | A written risk-acceptance register. **None exists** |
| **M11** | Name an independent assessor |
| **M12** | Measure RTO. RPO is evidenced at ~24h; **recovery time has never been measured** |

Plus, specific to Karar V2 and with no legacy equivalent: **Sharia review for Zakat** (none exists), and **Amanat legal clearance per jurisdiction** (Plan v2, before Phase 14).
