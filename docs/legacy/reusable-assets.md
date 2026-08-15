# Reusable Assets from Qarar

**Deliverable:** Phase 0.2
**Provenance:** SOURCE-VERIFIED against `MoayadAlobaidi/Qarar` at HEAD (13 August 2026).

---

## The reuse rule

Karar V2's backend is **TypeScript / NestJS**; Qarar's is **Java / Spring Boot**. Karar V2's client is **Flutter**; Qarar's is **React Native**.

**No source file is portable.** Anything that claims to be "reusable code" here would be a rewrite wearing a borrowed name, and Plan v2's Part I is explicit that there is to be **no mechanical migration**.

What *is* reusable is more valuable and more portable than code:

| Tier | What | Why it transfers |
|---|---|---|
| **A — Specifications** | Written domain rules that took real work to derive | Language-independent. Re-implementing from a spec is cheap; re-deriving the spec is not |
| **B — Algorithms and thresholds** | Rules with tuned constants and stated rationale | Transfers as pseudocode plus test cases |
| **C — Schema and migration design** | Table shapes, constraints, trigger patterns, RLS policy shapes | Postgres is Postgres. Both systems target it |
| **D — Operational procedures** | Verification scripts, drills, runbooks | Mostly shell and Python against Postgres — several run essentially unmodified |
| **E — Regulatory and legal artefacts** | The QCB submission pack, threat model, privacy draft | Reusable as documents, subject to counsel review |
| **F — Decisions and their rationale** | Why a thing was done a particular way, including the mistakes | The highest-value tier and the easiest to lose |

Each asset below is graded, and carries an honest note on what must change.

---

## Tier A — Specifications

### A1. Zakat specification set — **the single most valuable asset in the legacy**

| File | Lines |
|---|---|
| `docs/zakat/ZAKAT_SPECIFICATION.md` | 1,056 |
| `docs/zakat/ZAKAT_CALCULATION_METHODOLOGY.md` | 832 |
| `docs/zakat/METHODOLOGY_DECISIONS.md` | 140 |
| **Total** | **2,028** |

Two thousand lines of derived domain rules covering nisab bases, the purity ladder, hawl through the Umm al-Qura calendar, valuation by weight rather than retail price, the twelve-month liability portion, doubtful portions, company look-through, and — critically — **a register of the points where scholars disagree, each exposed as a named, validated, audit-logged setting rather than hard-coded**.

**Why it matters beyond Zakat:** this is the pattern Plan v2's `PolicyPack` design wants everywhere, arrived at independently. It also exposes the gap recorded in [`qarar-audit.md` §6.1](qarar-audit.md) — these settings vary **per subject**, not per jurisdiction, which is a dimension Plan v2 does not model.

**Reuse:** carry the specification across essentially intact. Re-implement the engine in TypeScript against it.

**Must change:** `BigDecimal` arithmetic becomes BIGINT minor units (ADR-0006). Weight and purity stay decimal — they are measurements, not money. Multi-currency holdings must actually convert via `ExchangeRate` rather than being summed with a warning.

**Hard gate, unchanged:** no Sharia review, board, scholar, or certificate exists. The specification is engineering against written sources and **nothing more should be inferred from it**.

### A2. QCB regulatory submission pack — 24 documents

`docs/qcb/` — access-control matrix, data flow, data inventory, data security classification, encryption register, evidence matrix, RLS matrix, threat model, security gap register, regulatory questions, bank-integration readiness, incident and resilience readiness.

**Reuse:** as the skeleton for Karar V2's regulatory pack, and directly as input to Phase 0.6 security docs and Phase 20 regulatory review. The *structure* is proven against a real regulator's expectations.

**Must change:** every figure. The pack describes a Java system on Render and Supabase with 69 tables. It also predates V43–V47, so it hands a reader closed findings — the legacy's own worklist item **C2** flags exactly this hazard for the pen-test scope document.

### A3. Privacy policy draft — `docs/legal/DRAFT_privacy_policy_v2.md`

Deliberately **not** a migration, i.e. never published. **Reuse** as a starting point only. **External gate E2:** counsel review, and **E3:** Arabic legal translation by a legal translator, not a developer. No Arabic legal text in the legacy has ever been independently reviewed.

---

## Tier B — Algorithms and thresholds

### B1. Statement number normalisation — **port the rules exactly**

Handles: Arabic-Indic digits, U+066B (Arabic decimal separator), U+066C (Arabic thousands separator), accounting negatives `(1,234.56)`, trailing minus `1234.56-`, and non-breaking spaces.

**Why it is worth more than it looks:** every one of these represents a real Qatari bank statement that broke a naive parser. Re-deriving this list costs weeks of user-reported bugs. **Port the rule list and its test cases verbatim; re-implement the code.**

### B2. Unreadable-row quarantine

A row that cannot be parsed returns **null, never a substituted zero**. The legacy's stated reason: *"A zero would silently understate spending."*

**This is a financial-correctness rule, not a parser convenience.** Carry it forward as a rule in `financial-engine`, and assert it in a test.

### B3. Ambiguous-date flagging

Day-first assumed; a date where **both** components are ≤12 is flagged rather than silently assumed. Carry forward.

### B4. Balance-chain reconciliation

Exact arithmetic, **no tolerance**; verdicts `BALANCED` / `UNBALANCED` / `NOT_CHECKED`; the first line reported as unverifiable because no prior balance exists.

**Must change:** exact `BigDecimal` becomes exact BIGINT minor units. The *no-tolerance* decision carries forward unchanged — a tolerance is how reconciliation silently stops working.

### B5. Recurring-charge detection

≥3 occurrences within monthly or yearly day-count bands, median amount tolerance, utilities waive the amount check and are marked variable. **Never proposes transfer, income, cash, or housing** — the legacy's reason: *"salary is not a subscription."*

**Port the bands and the exclusion list.** They are tuned against real data.

### B6. Detection as proposal, not fact — **a product pattern worth institutionalising**

Detected subscriptions are proposals until confirmed. Only confirmed rows appear in lists or totals. The customer is shown **the evidence** — *"seen four times, about every 30 days"* — rather than a bare assertion.

This is the same instinct as Plan v2's requirement that every capability denial carry a machine-readable reason (§2.2). **Make it a platform-wide rule: derived claims show their basis.**

### B7. Metal price provenance model — **the provenance shape V2 wants everywhere**

Every recorded price carries: source name, exact URL, quote as published, FX rate applied, trading day, fetch time, automatic-or-manual, and the administrator responsible for a manual entry. Plus **staleness refusal** — past a configured age the engine returns 409 and asks for today's price rather than computing from a stale one.

**Refusing to compute is the correct default**, and it generalises directly to Plan v2's per-recommendation provenance (ruleset version + jurisdiction + operating entity).

**Must change:** the source. stooq.com is *a free public quote service — not a benchmark, not LBMA, not a QCB rate*, and USD/oz is converted at a **pegged**, not live, rate. Karar V2 should treat the feed as a port with a documented, replaceable implementation and say plainly in-product what the source is.

### B8. Shared definitions of income and spend

One shared definition, so no two screens can disagree. Refunds netted so category shares cannot exceed the whole; transfers excluded. **This is ADR-0007 in miniature and the legacy proves it works.**

### B9. Local calendar days on the wire

Qatar is UTC+3, and a UTC serialisation once ran every custom report a day early. **Carry the rule and the bug story** — the story is what stops it recurring.

---

## Tier C — Schema and migration design

### C1. Append-only audit via trigger — **carry forward**

A trigger that raises on UPDATE and DELETE **even for the table owner**. Plan v2 Part I already specifies append-only audit enforced by revoked grants; the legacy's trigger is the complementary half.

**Known defect to avoid:** the audit table itself carries the schema's one flagged anomaly — **RLS FORCEd but not enabled**, a shape no existing guard detects (RLS-02). Karar V2's Phase 3 RLS guard must test for it.

### C2. RLS policy shapes and the `SET LOCAL` GUC pattern

The legacy binds `app.tenant_id` **from the caller's own record inside the transaction, never from client input**. That is exactly right and matches Plan v2 §7.9.

**Carry forward.** **Do not carry forward** the retrofit sequence: RLS arrived across V9 → V30 → V40 and still leaves 24 tables uncovered, 6 unexplained, `users` among them. This is the direct evidence for ADR-0022 moving RLS to Phase 3.

### C3. Migration-as-app-role verification — `scripts/verify-migrations-as-app-role.sh`

Runs migrations as the restricted application role rather than an owner, catching migrations that only work with elevated privilege. The legacy records it as **proven to fail on a genuinely defective migration** — i.e. the control has actually caught something.

**Reuse nearly as-is.** Highest-value operational script in the repository.

### C4. Immutable assessment records

Zakat assessments carry a full breakdown, a snapshot of the jurisprudential settings in force, and a SHA-256; an UPDATE trigger permits only the payment-confirmed timestamp to move from null.

The legacy labels this precisely: **"tamper-evident, not tamper-proof."** Keep both the pattern and the honest label.

### C5. Price versioning

A price change creates a new version; existing subscribers keep the price they agreed. Carry forward to Phase 10.

### C6. Encryption envelope conventions

Versioned prefix `enc:v1:`, fresh 12-byte SecureRandom IV per encryption, 128-bit tag, 32-byte key enforced, and a **startup check that refuses to boot when encrypted data cannot be decrypted**.

**Carry all of it**, and add what the legacy lacks: rotation, escrow, and a second copy. See [`security-findings.md`](security-findings.md) ENC-2 — this is the highest-priority lesson in the entire audit.

**Also carry the known limit:** `merchant_rules.pattern` **cannot** use this converter, because the repository sorts on `LENGTH(pattern)` and matches it exactly, which random-IV GCM breaks. That is a genuine design constraint discovered the hard way (legacy C12).

---

## Tier D — Operational procedures

| Asset | Path | Reuse |
|---|---|---|
| Migration-as-app-role verification | `scripts/verify-migrations-as-app-role.sh` | **Near-verbatim.** See C3 |
| Runtime RLS verification | `scripts/verify-rls-runtime.sh`, `scripts/rls_runtime_checks.py` | **Near-verbatim.** Extend to catch "no RLS at all" (RLS-01) and "FORCEd but not enabled" (RLS-02) |
| RLS cutover rehearsal | `scripts/rehearse-rls-cutover.sh` | Adapt. Karar V2 has no cutover — RLS is there from Phase 3 — but the rehearsal shape suits staging drills |
| DR restore drill | `scripts/dr/` | **Reuse.** Verified 13/13 tables and 45/45 encrypted values on 12 Aug. **Note what it does not cover:** application recovery, and any *provider* backup |
| App-role setup | `scripts/setup-local-app-role.sh` | Adapt for Phase 1 Compose |
| Observability config | `docs/operations/alert-rules.yml`, `grafana-dashboard.json` | Reuse as a starting rule set. **25 rules defined, 12 live** — the other 13 are a written to-do list |
| Load test harness | `scripts/load-test/` | Structure only. Results are not usable: run on a developer laptop, artefacts uncommitted, *"a projection is not a measurement"* |
| Count derivation | `scripts/qcb/derive-counts.py` | **Reuse the idea.** Deriving documentation figures from source rather than from the previous version of the document is why the legacy caught its own drift |

### D1. Architecture tests already exist

`backend/src/test/java/com/qarar/architecture` — 9 tests by file count. Plan v2 §13 specifies 21. The legacy's existence proof matters more than its coverage: **architecture tests in CI are achievable on this team.**

---

## Tier E — Regulatory and legal

Covered in A2 and A3. One structural asset deserves separate mention.

### E1. The evidence-label discipline

The legacy's feature matrix labels every claim **CODE / RUNTIME / INFRASTRUCTURE / ABSENT**, and states plainly: *"An INFRASTRUCTURE claim must never be read as a verified one."*

**Adopt this convention across all Karar V2 documentation.** It is the mechanism that let the legacy catch and correct its own errors — including reporting the development database's row counts as production's.

---

## Tier F — Decisions and rationale

The assets most easily lost and hardest to re-derive.

| Decision | Keep | Why |
|---|---|---|
| Roles re-derived from the database per request, not carried in the token | **Yes** | Revocation is immediate. Costs a lookup; worth it |
| Security escalations routed away from the support queue, enforced server-side | **Yes** | The split is *not cosmetic*. Carry the enforcement, not just the routing |
| Subscription lifecycle transitions go through the state machine | **Yes** | *"The job cannot make a move a human could not."* Excellent invariant |
| Only a masked account number is stored; no full-number column exists | **Yes** | Cannot leak what was never stored |
| Empty state rather than placeholder money on a failed fetch | **Yes** | *"The product does not display invented figures."* Platform rule |
| Person names redacted only where surrounding text marks a transfer rail | **Yes, with the reasoning** | Deliberate: a naive detector would fill a Qatari spending breakdown with placeholders. A subtle, correct call |
| PDF rejected for non-QNB layouts with a message naming the bank | **Yes** | Honest refusal beats a wrong parse |
| No payment mechanism, and a guard class asserting it | **Yes** | Plan v2 C10. Deferring cost nothing |
| Trial length as a per-plan value, not a constant | **Yes** | |
| `BillerConnector` as an interface with no implementations, by explicit design | **Yes** | A named seam with nothing behind it is honest; a fake implementation is not |

### F1. The mistakes worth inheriting

Recorded because inheriting a mistake's *lesson* is cheaper than repeating it.

1. **The database-identity confusion.** `qarar-dev` and `qarar-prod` carry **byte-identical `DATABASE_URL` values** — the pooler host is regional and only the project-reference suffix on `DATABASE_USERNAME` selects a project. Render was pointed at development for four days, and an audit read development's rows and reported them as production's. **Karar V2 environments must be distinguishable at a glance and asserted at boot.**

2. **Documentation re-derived from itself drifts.** An earlier feature matrix *"was re-derived from itself rather than from the code, and had drifted"* — it listed endpoints that do not exist and marked built capabilities absent. **Derive from source; label evidence; re-derive on a schedule.**

3. **A guard that is decorative is worse than no guard.** `TenantAccessGuard` has two documented protections with **no call site anywhere**; the AI kill switch was *"decorative until 12 August"*; `enforce-entitlements` defaults false so the paid boundary is not a control. **Karar V2: every control gets a test that fails when the control is removed.**

4. **An empty result is indistinguishable from correct isolation.** `tenant_users` has no bank-admin policy, so the roster returns empty for everyone — and the isolation claim on that endpoint has therefore never actually been tested. **Adversarial cross-tenant tests must assert on non-empty expected data** (Plan v2 §7.9 layer 4).

5. **The consent text is part of the system.** The one HIGH finding that mattered most, P1, was not a code defect — the code was defensible. **The published document described behaviour the code did not implement, and that document was the legal basis for a cross-border transfer of customer financial data.** Legal text must be reviewed against code, and CI should assert the pairs it can.

---

## What is deliberately **not** carried forward

| | Why |
|---|---|
| Any Java source | Different language and framework. Rewrite from specs |
| Any React Native source | Flutter client; Plan v2 forbids mechanical migration |
| The `admin-web` static console | Plan v2 §10 specifies a full Super Admin IA. A 4-file static page is not a starting point for it |
| The fabricated "connect your bank" flow | *"The single most misleading surface in the product."* **Delete the pattern, keep the lesson** |
| The family-budget screen | A design mock shipped in the app, backed by a device-local sample file and a no-op invite button |
| The 90-day retention window | Chosen *"because a number was needed."* Karar V2 sets it from a policy decision (legacy M6) or not at all |
| Render + Supabase topology | Plan v2 targets GCP with no GCP in the domain. The *portability lesson* carries; the topology does not |
| Test-result counts | Disk artefacts inflated by stale reports, as the legacy's own script warns |
