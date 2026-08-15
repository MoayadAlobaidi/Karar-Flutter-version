# Legacy Feature Inventory — scoping input for Phase 9

**Deliverable:** Phase 0.2
**Provenance:** **SOURCE-VERIFIED.** Derived by reading `MoayadAlobaidi/Qarar` at HEAD (13 August 2026), cross-read against the legacy's own `docs/qcb/QARAR_QCB_FEATURE_MATRIX.md` with drift corrected — see [`qarar-audit.md` §3.2](qarar-audit.md).
**Not** USER-REPORTED. Not fabricated.

---

## How to read this

The legacy's status vocabulary is preserved because it is precise and hard-won:

| Legacy status | Meaning |
|---|---|
| **BUILT AND IN USE** | Exists in code and a shipped surface calls it |
| **BUILT NOT EXERCISED** | Exists and is reachable over the API; no shipped surface calls it |
| **PARTIAL** | Some of it works; the note says which part does not |
| **DESIGNED NOT BUILT** | Schema, interface, or plan exists. Behaviour does not |
| **NOT BUILT** | Nothing exists. Verified by search, not assumed |

The **V2 column** is this document's contribution — the disposition for Karar V2, which is what Phase 9 needs:

| V2 disposition | Meaning |
|---|---|
| **BUILD ‹phase›** | In scope for Karar V2 at the named phase |
| **DEFER → ‹seam›** | Out of v1 scope; the named port or seam keeps it cheap |
| **DROP** | Deliberately not carried forward, with a reason |
| **NEW** | Not in the legacy; introduced by Plan v2 |

**Phase 9 = "Consumer features".** Everything marked BUILD 9 below is the Phase 9 scope. Anything marked BUILD 5/6/7 is platform work Phase 9 depends on.

---

## 1. Identity and account lifecycle

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Registration, email + password | BUILT AND IN USE | **BUILD 3** | Legacy server-side policy is length-only, min 8 (AUTHN-13). V2 sets a real policy |
| Email verification, 6-digit code | BUILT AND IN USE | **BUILD 3** | Legacy hash is unsalted SHA-256 on a table with no RLS (AUTHN-03). V2: salted, RLS from Phase 3 |
| JWT access + rotating refresh | BUILT AND IN USE | **BUILD 3** | Legacy re-derives roles from DB per request so revocation is immediate — **carry this forward**, it is a good decision |
| Account lockout | BUILT AND IN USE | **BUILD 3** | Legacy counter resets when the lock applies, capping brute-force cost per window (AUTHN-11). Fix in V2 |
| Password reset by emailed code | BUILT AND IN USE | **BUILD 3** | Legacy has no per-account cooldown → unbounded email flooding. Fix in V2 |
| Auth rate limiting | **PARTIAL — HIGH** | **BUILD 3** | **AUTHN-04.** Keys on client-supplied `X-Forwarded-For` with no trusted-proxy allow-list; practical effect assessed as total bypass. V2 requires a trusted proxy list from day one |
| Change password | BUILT AND IN USE | **BUILD 3** | Legacy leaves existing tokens alive to expiry (AUTHN-12) |
| Profile incl. Arabic name, phone | BUILT AND IN USE | **BUILD 3** | Field-encrypted in legacy; mobile cached both in plaintext `AsyncStorage` (MOB-04). V2 Flutter: secure storage only |
| Account deletion | PARTIAL | **BUILD 16** | Blocked where admin audit rows exist, because audit is append-only. V2 needs an explicit position — see [`security-findings.md`](security-findings.md) P7 |
| Country selection at first launch | BUILT AND IN USE | **BUILD 4** | Becomes **jurisdiction** resolution in V2, not country — Plan v2 §1.1 |
| Secure token storage (Keychain/Keystore) | BUILT AND IN USE | **BUILD 4** | No cert pinning in legacy (MOB-01); V2 retains challenge **C11** — no pinning in v1 |
| Session clear-down on sign-out | BUILT AND IN USE | **BUILD 4** | Legacy registry is hand-maintained with a documented blind spot (MOB-07). V2: structural, not a registry |
| Biometric lock, idle timeout, re-auth on foreground | **NOT BUILT** | **BUILD 4** | MOB-06. Cheap in Flutter; do it once rather than retrofit |
| Security-notification emails on account events | **NOT BUILT** | **BUILD 3** | AUTHN-09. No email on password change, reset, lockout, admin enrolment, or recovery-code use |

## 2. Getting money in

> Statement import is the **only** route by which financial data enters the legacy. There is no bank connection of any kind.

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| CSV statement upload | BUILT AND IN USE | **BUILD 5** | Plan v2 **C9**: first-class `IMPLEMENTED`, not a stopgap |
| Manual transaction entry | **NOT BUILT** | **BUILD 5** | Plan v2 **C9**. Legacy `TransactionController` exposes two GETs and nothing else |
| PDF statement upload, QNB layout | BUILT AND IN USE | **BUILD 5** | PDFBox text extraction into the CSV pipeline |
| PDF, any other bank | NOT BUILT | **BUILD 5** (extensible) | Legacy rejects with a message naming the bank — deliberate and honest. V2: a `StatementLayout` port, one implementation |
| Upload content validation | **NOT BUILT** | **BUILD 5** | FILES-3. Routing on client-supplied filename/content-type; no magic-byte check |
| Cap on parsed rows | **NOT BUILT — HIGH** | **BUILD 5** | **FILES-2.** A 10 MB CSV can carry ~1M rows into one transaction on a pool of 10 |
| Number normalisation | BUILT AND IN USE | **BUILD 5** | Arabic-Indic digits, U+066B/U+066C separators, accounting negatives, trailing minus, NBSP. **Reusable — see [`reusable-assets.md`](reusable-assets.md)** |
| Ambiguous-date flagging | BUILT AND IN USE | **BUILD 5** | Flags rather than silently assuming. Good decision, carry forward |
| Unreadable-row quarantine | BUILT AND IN USE | **BUILD 5** | Returns null, never a substituted zero. **A zero would silently understate spending** |
| Balance-chain reconciliation | BUILT AND IN USE | **BUILD 5** | Exact `BigDecimal`, no tolerance. In V2 this is BIGINT minor units (ADR-0006) |
| Duplicate file rejection | BUILT AND IN USE | **BUILD 5** | SHA-256 of bytes → 409 |
| Review before commit | BUILT AND IN USE | **BUILD 5** | Nothing enters `transactions` until the customer confirms. Idempotent via unique `external_ref` |
| Delete an import | BUILT AND IN USE | **BUILD 5** | |
| Raw file encryption at rest | **REMEDIATED at HEAD** | **BUILD 5** | Was HIGH FILES-1; closed by `V45`/`V46`. V2 builds it encrypted from the start |
| Raw file retention + purge | BUILT AND IN USE | **BUILD 16** | Nightly job, 90-day default. **The window was chosen because a number was needed** — legacy M6 flags it as an open regulatory question |
| Retention for anything else | **NOT BUILT** | **BUILD 16** | P8. Everything else kept for account life |

## 3. Accounts, transactions, categorisation

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Account list with balances | BUILT AND IN USE | **BUILD 5** | |
| Manual account create/edit/delete | **NOT BUILT** | **BUILD 5** | Accounts are a side effect of statement commit in the legacy. **Legacy doc C4/M7**: the mandatory consent document promises per-item deletion the code does not provide — an unresolved contradiction. V2 must not ship that mismatch |
| Account number masking | BUILT AND IN USE | **BUILD 5** | Only a mask is stored; no full-number column exists. Good design |
| Transaction list + summary | BUILT AND IN USE | **BUILD 5** | RLS-scoped; no `?userId=` accepted anywhere |
| Merchant/note encryption at rest | BUILT AND IN USE | **BUILD 5** | Encryption applied on write only; no tool counts remaining plaintext (ENC-3) |
| Deterministic rule categorisation | BUILT AND IN USE | **BUILD 5** | Curated priority-ordered `merchant_rules` |
| AI fallback categorisation | PARTIAL, off by default | **BUILD 7** | Legacy path bypasses usage logging, metrics, provenance and rate limiting (AI-4) and sends narratives with no consent check (P6). V2: must route through the same orchestrator as everything else |
| Row-level isolation on finance tables | BUILT AND IN USE | **BUILD 3** | RLS moves to Phase 3 (ADR-0022) |

## 4. Insight and analysis

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Dashboard: income / spent / saved | BUILT AND IN USE | **BUILD 6** | One shared definition so no two screens disagree. **Carry the principle** |
| Financial health score | BUILT AND IN USE | **BUILD 6** | Deterministic, clamped |
| Safe-to-spend | BUILT AND IN USE | **BUILD 6** | Deterministic |
| Category breakdown | BUILT AND IN USE | **BUILD 6** | Refunds netted so shares cannot exceed the whole; transfers excluded |
| Period comparison | BUILT AND IN USE | **BUILD 6** | Compared against the equivalent span of the prior month, not raw date subtraction |
| Custom date range | BUILT AND IN USE | **BUILD 6** | **Local calendar days on the wire.** Qatar is UTC+3 and a UTC serialisation once ran every custom report a day early |
| PDF report export | BUILT AND IN USE | **BUILD 16** | Legacy download endpoint is **unauthenticated with a token in the query string, served inline** (FILES-6, AZ8), and the renderer converts 2 MB of caller-supplied HTML with no time or memory budget (FILES-7). V2: authenticated, budgeted, no caller HTML |
| Empty state instead of placeholder money | BUILT AND IN USE | **BUILD 4** | **The product does not display invented figures.** Make this a platform rule |
| Expense forecast | BUILT AND IN USE | **BUILD 7** | This is an **AI narrative, not a deterministic projection** — the legacy corrected its own docs on this. V2 must label it as such |
| Waste finder | BUILT AND IN USE | **BUILD 6** | Deterministic, plus an AI tip card |
| Recurring-charge detection | BUILT AND IN USE | **BUILD 6** | ≥3 occurrences in monthly/yearly day bands with median amount tolerance. Never proposes transfer, income, cash or housing — **salary is not a subscription** |
| Variable-bill handling | BUILT AND IN USE | **BUILD 6** | Utilities waive the amount check and are marked variable |
| Detection as proposal, not fact | BUILT AND IN USE | **BUILD 6** | Customer is shown the evidence ("seen four times, about every 30 days"). **Excellent pattern — carry forward** |
| Monthly-equivalent subscription total | BUILT AND IN USE | **BUILD 6** | |
| Notifications | PARTIAL | **BUILD 9** | Derived on read. **In-app only. No push — no FCM or APNs dependency exists** |
| Push notifications | **NOT BUILT** | **DEFER → `NotificationChannel` port** | |

## 5. Zakat — Islamic financial wellness

> **Plan v2 does not mention this capability anywhere.** It is a production capability with its own specification, engine, and nine migrations. See [`qarar-audit.md` §6.1](qarar-audit.md) for the architectural implication.

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Zakat quick estimate | BUILT AND IN USE | **BUILD 9** | Same calculation core as full assessment, so identical holdings give identical figures |
| Reference values endpoint | BUILT AND IN USE | **BUILD 9** | Publishes gold/silver price per gram, both nisab weights, purity ladder, rounding mode, price age, staleness flag, and **the rate the individual customer's calendar selects** |
| Nisab | BUILT AND IN USE | **BUILD 9** | 85 g pure gold, or 595 g silver where the basis selects it |
| Metal price provenance | BUILT AND IN USE | **BUILD 9** | Source, exact URL, quote as published, FX applied, trading day, fetch time, auto/manual, responsible admin. **Exemplary — the provenance model V2 wants everywhere** |
| Automated metal price feed | BUILT AND IN USE | **BUILD 9** | Nightly against **stooq.com — a free public quote service. Not a benchmark, not LBMA, not a QCB rate.** USD/oz → QAR/g at a *pegged*, not live, FX rate |
| Price staleness refusal | BUILT AND IN USE | **BUILD 9** | Past max age the engine returns 409 rather than computing from a stale price. **Refusing to compute is the right default** |
| Hawl on quick estimate | PARTIAL, declared | **BUILD 9** | Karar cannot observe when a customer came to own money; the estimate says so and reports nothing as due |
| Hawl enforcement in engine | BUILT NOT EXERCISED | **BUILD 9** | Twelve Hijri months via Umm al-Qura (354/355 days, not a fixed count) |
| Declared asset ledger | BUILT NOT EXERCISED | **BUILD 9** | Intention, valuation basis, grams, purity, doubtful portion, company balance-sheet fields |
| Declared liability ledger | BUILT NOT EXERCISED | **BUILD 9** | Total and 12-month portion as separate columns; only the latter deducted. Leases deduct nothing |
| Full assessment + immutable record | BUILT NOT EXERCISED | **BUILD 9** | SHA-256, settings snapshot, UPDATE trigger permitting only payment-confirmation transition. **Tamper-evident, not tamper-proof** |
| Payment confirmation | BUILT NOT EXERCISED | **BUILD 9** | Engine stops at "due". **Karar executes no payment** |
| Customer jurisprudential preferences | BUILT NOT EXERCISED | **BUILD 9** | **This is the fourth policy dimension Plan v2 lacks** — see audit §6.1 |
| Jurisprudential settings register | BUILT AND IN USE | **BUILD 9** | Validated, audit-logged on change, snapshotted into every assessment |
| Metal valuation by weight | BUILT NOT EXERCISED | **BUILD 9** | Grams × purity × spot, not retail. Missing purity refused in **both** Java and a DB CHECK |
| Look-through for held shares | PARTIAL | **BUILD 9** | Customer-supplied figures only; **no fundamentals feed**. Absence walks a documented ladder ending in a stated estimate |
| Multi-currency holdings | PARTIAL | **BUILD 9** | Added as one currency with a warning naming every currency found. **No FX conversion.** V2 has `ExchangeRate` in shared-kernel — fixable |
| Net Invested Funds method | DESIGNED NOT BUILT | **DEFER** | Setting exists; only Net Assets computes, so selecting it **falls back silently**. V2: a declared-but-unimplemented option must fail loudly |
| Agricultural produce, livestock, Rikaz | NOT BUILT | **DROP** | Out of the specification's own scope. Device-only crop/livestock tables are unreviewed |
| Sadaqah tracker | BUILT AND IN USE | **BUILD 9** | Goal tracking. **No payment execution** |
| Sharia review, board, scholar, certificate | **NOT BUILT** | **BLOCKER before launch** | **None exists.** The work is engineering against a written specification and nothing more should be inferred from it |

## 6. Planning, debt, family

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Savings plans and goals | BUILT AND IN USE | **BUILD 9** | Legacy stores the plan as unvalidated JSON bound straight into `jsonb` (API-08). V2: typed |
| Savings planner / affordability | BUILT AND IN USE | **BUILD 9** | Deterministic + AI tip card |
| Loan tracking | BUILT AND IN USE | **BUILD 9** | Debts the customer types in. **No origination, disbursement, credit decision or scoring** |
| Family budget | **NOT BUILT** | **DEFER → own bounded context** | The screen renders a **static device-local file** of sample members and insights; the invite button is bound to a no-op. Group/member tables exist and no surface writes them. **A design mock shipped in the app** |
| Biller linking (Kahramaa, Ooredoo) | PARTIAL | **DEFER → `BillerConnector` port** | Customer can record a field-encrypted account reference. `BillerConnector` has **no implementations, by explicit design** |
| Bill fetch / presentment / payment | NOT BUILT | **DEFER → `BillerConnector`** | |

## 7. AI

> Seven server-side features, each with its own versioned prompt builder: `ai-coach`, `home-dashboard`, `report`, `financial-health`, `waste-finder`, `goal-planner`, `expense-forecast`.

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Conversational coach | BUILT AND IN USE | **BUILD 7** | |
| Feature insight cards | BUILT AND IN USE | **BUILD 7** | Legacy insights endpoint has **no entitlement gate and no meter**, unlike chat (AI-6) |
| Figures computed before the model sees them | BUILT AND IN USE | **BUILD 6→7** | Becomes `VerifiedFinancialFacts` (ADR-0019). **The legacy already does the hard half** |
| Numeric guard on model output | PARTIAL | **BUILD 7, demoted** | **Ignores any number not marked with a currency or percent token, so bare counts are unchecked** (AI-7). Exactly why Plan v2 demotes the guard to tertiary |
| Conversation persistence | BUILT AND IN USE | **BUILD 7** | RLS FORCEd; title and content field-encrypted, because an answer quotes merchant narratives back |
| Arabic replies | BUILT AND IN USE | **BUILD 7** | Locale passed into the prompt |
| Response provenance | BUILT AND IN USE | **BUILD 7** | Prompt version recorded per response. **Carry forward** |
| Context redaction before transmission | PARTIAL | **BUILD 7** | IBAN, card, phone, email, national ID redacted unconditionally. Person names only where surrounding text marks a transfer rail — **deliberate**, because a naive detector would fill a Qatari breakdown with placeholders |
| **Consent notice matches what is sent** | **REMEDIATED at HEAD** | **BUILD 3+7** | Was **HIGH P1/AI-3** — notice claimed merchant names and notes were redacted; they were not, and that text was the legal basis for a cross-border transfer. Closed by `V43`. **Partially** — holders of v1 acceptance are not re-prompted |
| Prompt-injection control | **NOT BUILT** | **BUILD 7** | AI-1. An adversarial suite was written but never executed against production (AI-9) |
| Consent gate on AI processing | PARTIAL | **BUILD 3** | **Fails open when no disclosure document is published** (AI-5). V2: fail closed |
| Provider fallback / second provider | NOT BUILT | **BUILD 7** | Single provider. V2 has the port from Phase 7 |
| AI kill switch | BUILT AND IN USE | **BUILD 8** | Legacy: *"decorative until 12 August"* |

## 8. Consent, privacy rights, legal documents

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Published legal documents, versioned | BUILT AND IN USE | **BUILD 3** | V2 keys these on `(entity, jurisdiction)`, not jurisdiction alone |
| Acceptance capture with evidence | BUILT AND IN USE | **BUILD 3** | Client-supplied IPs stored in clear for account life (P13) |
| Consent status / withdrawal | BUILT AND IN USE | **BUILD 3** | |
| **Re-acceptance on republish** | **NOT BUILT** | **BUILD 3** | **P12.** Publishing a new version asks nobody to accept it, contradicting the terms themselves. See [`qarar-audit.md` §6.4](qarar-audit.md) |
| Data export / portability, server side | BUILT NOT EXERCISED | **BUILD 16** | Real, capped, single-use, ISO-8601 |
| Data export, customer surface | **NOT BUILT** | **BUILD 16** | **P4. No mobile screen calls it, and the privacy policy tells customers they can export in the app** |
| Completeness of export | PARTIAL | **BUILD 16** | Omits categories while claiming to name everything it omits (P5) |
| Erasure | PARTIAL | **BUILD 16** | **P7** — one table holds statement-derived data belonging to no user and cannot be erased |

## 9. Support

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Raise a support case | BUILT AND IN USE | **BUILD 16** | RLS FORCEd, three policies each |
| Raise a security escalation | BUILT AND IN USE | **BUILD 16** | Routed away from the ordinary queue and **not visible to support staff — enforced server-side, not cosmetic.** Good pattern |
| List/read own cases, reply | BUILT AND IN USE | **BUILD 16** | |
| Staff support console | BUILT NOT EXERCISED | **BUILD 16** | Full role-gated routes exist; **the admin console has no support tab**, so no staff UI reaches any of it |

## 10. Staff back office

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Passwordless admin sign-in (emailed link) | BUILT AND IN USE | **BUILD 8** | **Pending tokens live in one JVM's heap** — sign-in does not survive restart and breaks on a second instance (AUTHN-16) |
| TOTP second factor | BUILT AND IN USE | **BUILD 8** | Same-window replay refused |
| Recovery codes | BUILT AND IN USE | **BUILD 8** | Single-use, but **no attempt counter and no lock** — the second half of HIGH AUTHN-04 |
| Admin sign-out | PARTIAL | **BUILD 8** | **Client-side only; the highest-privilege session cannot be revoked server-side** (AUTHN-07) |
| Overview metrics | BUILT AND IN USE | **BUILD 8** | Aggregates only. In V2 these come from **projections** (ADR-0020) |
| User directory, enable/disable | BUILT AND IN USE | **BUILD 8** | Disabling does not revoke refresh tokens, so re-enabling **resurrects every prior session** (AUTHN-08). Staff reads leave no audit row (AZ5) |
| No staff access to individual financial data | BUILT AND IN USE | **BUILD 8** | No endpoint returns one customer's transactions to staff. **But the database grants an admin session SELECT on every consumer financial table — only the absence of an endpoint prevents the read** (AZ1). **That is one layer, not two.** V2 fixes this with RLS + grants |
| Plan/price management | BUILT AND IN USE | **BUILD 10** | A price change creates a new version; existing subscribers keep the price they agreed. **Carry forward** |
| Discounts and promotion codes | BUILT AND IN USE | **BUILD 10** | Created in draft; activation is a separate deliberate act |
| Application settings | PARTIAL | **BUILD 8** | **Not type-validated** — a non-numeric value where a number is expected is accepted and silently falls back to a default |
| Append-only audit log | BUILT AND IN USE | **BUILD 2** | Trigger raises on UPDATE/DELETE even for the owner. **Carry forward.** Note RLS-02: FORCEd but not enabled, and no guard detects that shape |

## 11. Subscription and billing

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Plan catalogue, multi-currency versioned prices | BUILT AND IN USE | **BUILD 10** | |
| Customer's own subscription state | BUILT AND IN USE | **BUILD 10** | |
| Free trial | BUILT AND IN USE | **BUILD 10** | Per-plan value, not a constant |
| Discounts, promo codes, referrals | BUILT AND IN USE | **BUILD 10** | |
| Entitlement engine | BUILT, **enforcement off** | **BUILD 10** | `enforce-entitlements` defaults false, so **the paid boundary is not currently a control** (API-13) |
| Lifecycle transitions | BUILT AND IN USE | **BUILD 10** | Hourly job through the state machine, so **the job cannot make a move a human could not**. Each in its own transaction. **Excellent — carry forward** |
| **Any payment mechanism** | **NOT BUILT** | **DEFER → `SubscriptionBillingProvider`** | No gateway, adapter, webhook, or store receipt validation. **No customer has ever been charged.** Plan v2 **C10** |
| Invoice / payment ledger | DESIGNED NOT BUILT | **DEFER** | Tables and entities exist and are read by the export assembler; nothing writes a payment |
| Refunds, dunning, chargebacks, tax | NOT BUILT | **DEFER** | |

## 12. White label and tenancy

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Tenants, contracts, seat allocations | BUILT AND IN USE | **BUILD 3/11** | RLS FORCEd as of V40 |
| Per-tenant branding, flags, domains, legal docs | BUILT AND IN USE | **BUILD 11** | **Control-plane configuration only** |
| Contract expiry | BUILT AND IN USE | **BUILD 11** | Nightly job |
| Bank-admin role, cross-tenant isolation | PARTIAL | **BUILD 11** | `app.tenant_id` bound from the caller's own record inside the transaction, never client input — **correct**. But `tenant_users` has no bank-admin policy, so **the roster returns empty for everyone** (AZ2), and *an empty roster is indistinguishable from correct isolation*, so the claim has never been tested |
| Tenant access guard | PARTIAL | **BUILD 11** | **Two of its three documented protections have no call site anywhere** (AZ3). They read as live controls and are not |
| Invitation / seat redemption | PARTIAL | **BUILD 11** | `tenant_invitations` holds the bearer code and **has no RLS at all**; redemption elevates the whole transaction to admin authority (RLS-04) |
| RLS on 4 tenant tables | **NOT BUILT** | **BUILD 3** | V40 protected the others and **passed over these without comment** |
| **White-label data plane** | **DESIGNED NOT BUILT** | **BUILD 11** | Nothing in the app consumes tenant branding. **"Qarar is not white-label ready."** See [`qarar-audit.md` §6.3](qarar-audit.md) |

## 13. Bank integration

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| Bank directory | BUILT AND IN USE | **BUILD 5** | Public reference list, correctly no RLS |
| **Any bank API / open-banking client** | **NOT BUILT** | **DEFER → `FinancialDataConnector`** | Verified by search. No dependency, adapter, credential or endpoint exists |
| Payment initiation | NOT BUILT | **DEFER** | |
| "Connect your bank" in-app | **MISLEADING** | **DROP the mock; BUILD 5 honest** | Every option but statement upload **runs a one-second animation and inserts a fabricated account row into local state** with an invented masked number and "Synced" status. **"The single most misleading surface in the product."** V2 shows capability state honestly (Plan v2 §2.2) |

## 14. Localisation

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| English + Arabic, persisted | BUILT AND IN USE | **BUILD 4** | |
| RTL layout | BUILT AND IN USE | **BUILD 4** | |
| Server-side Arabic messages | BUILT AND IN USE | **BUILD 2** | Locale reaches the AI prompt too |
| Arabic numeral formatting | BUILT AND IN USE | **BUILD 4** | In V2 the **platform renders every number** (ADR-0019), which subsumes this |
| Complete Arabic coverage | PARTIAL | **BUILD 4** | Internal testing found untranslated categories, residual English, RTL alignment defects. **Shipping EN/AR is not the same as being done** |

## 15. Platform, security, operations

| Capability | Legacy | V2 | Note |
|---|---|---|---|
| RLS across the schema | PARTIAL | **BUILD 3** | 45/69 tables; of the 24 without, 13 correctly public, 5 documented bootstrap, **6 unexplained — `users` among them** (P14) |
| Production role does not bypass RLS | BUILT AND IN USE | **BUILD 3** | `qarar_app` is not superuser and does not bypass. **Carry forward exactly** |
| **Guard failing when a new table ships with no RLS** | **NOT BUILT** | **BUILD 3** | RLS-01. Existing guards test "enabled but no policy", not "no RLS at all". **V2 architecture test** |
| Field-level AES-256-GCM | BUILT AND IN USE | **BUILD 2** | Fresh random IV, 128-bit tag, 32-byte key enforced, versioned prefix; production refuses to boot without a key or when data cannot be decrypted. **16 columns at HEAD** |
| **Key rotation, escrow, second copy** | **NOT BUILT** | **BUILD 2 — MANDATORY** | **ENC-2. The key is a one-way door and has already been lost once in production.** For `SEALED` data this is unrecoverable *and* undetectable — see [`qarar-audit.md` §6.2](qarar-audit.md) |
| Authenticated DB transport | **NOT BUILT** | **BUILD 2** | `sslmode=require` encrypts without authenticating the server (ENC-1). V2: `verify-full` |
| API rate limiting beyond auth | **PARTIAL — HIGH** | **BUILD 2** | **API-01.** Policy selected from the **raw undecoded URI**, so `/api/v1/ai/%63hat` reaches the AI handler on the loose catch-all limit. Also in-process and per-instance |
| CORS pinned, credentials off | PARTIAL | **BUILD 2** | Code pins origins; **declarative infra config sets allowed origins to `*`** and the code uses the pattern-matching variant (API-03) |
| CI secret + dependency scanning | BUILT AND IN USE | **BUILD 1** | Six jobs. **Gates block a workflow run, not a merge or deploy** (INFRA-07). **Mobile never built, linted, type-checked or tested in CI** (INFRA-10) |
| Migration-as-app-role verification | BUILT AND IN USE | **BUILD 2** | **Proven to fail on a genuinely defective migration.** Excellent — carry forward |
| Runtime RLS verification script | BUILT AND IN USE | **BUILD 3** | |
| Monitoring, alerting, on-call | **PARTIAL — HIGH** | **BUILD 17+** | **INFRA-02.** 12 of 25 rules live. **No dashboard. No on-call: one email address, no rotation, no escalation — a SEV-1 and a SEV-3 arrive identically** |
| Health / readiness probes | PARTIAL | **BUILD 2** | **The health check is a constant and cannot detect a database outage**; no readiness probe (INFRA-04) |
| **Staging environment** | **DESIGNED NOT BUILT** | **BUILD 19 — HARD GATE** | Committed in the blueprint, never provisioned. Now blocks the pen test → independent assurance → a STOP condition on the legacy's own checklist |
| Backup restore | PARTLY EXERCISED | **BUILD 20** | Self-taken dump restored 12 Aug (13/13 tables, 45/45 encrypted values). **Not done:** application recovery, and any restore of a *provider* backup |
| Independent penetration test | **NOT BUILT** | **BUILD 20 — HARD GATE** | Scope document written; no test run |
| Load testing | PARTIAL | **BUILD 20** | Run **on a developer laptop, not production-equivalent hardware**; raw artefacts uncommitted. **"A projection is not a measurement"** |
| Disaster recovery runbook | PARTIAL | **BUILD 20** | Written, never executed; its pool figure exceeds the measured pooler ceiling |

## 16. Deliberately absent in the legacy — and in Karar V2 v1

Stated in one place so nobody infers them from silence. Each was verified by search in the legacy.

| | Legacy | V2 v1 |
|---|---|---|
| Payment processing of any kind | NOT BUILT | **DEFER → `SubscriptionBillingProvider`** |
| Bank API / open-banking connection | NOT BUILT | **DEFER → `FinancialDataConnector`** |
| Payment initiation, funds movement | NOT BUILT | **DEFER** — Karar is not designed to hold funds |
| Zakat / Sadaqah payment execution | NOT BUILT | **DEFER** — both are trackers |
| Credit decisioning, scoring, origination | NOT BUILT | **DROP** |
| Investment advice or execution | NOT BUILT | **DROP** |
| Push notifications | NOT BUILT | **DEFER → `NotificationChannel`** |
| Sharia review, board or certificate | NOT BUILT | **EXTERNAL — required before Zakat launch** |
| Independent penetration test | NOT BUILT | **Phase 20 gate** |
| Staging environment | DESIGNED NOT BUILT | **Phase 19 gate** |
| White-label data plane | DESIGNED NOT BUILT | **BUILD 11** |

---

## 17. Capabilities new in Karar V2 with no legacy precedent

| Capability | Plan v2 ref | Phase |
|---|---|---|
| Jurisdiction + typed versioned PolicyPacks | §1.3 | 3.5 |
| OperatingEntity as a first-class dimension | §1.2 | 3 |
| Capability Registry + availability, deny-by-default | §2 | 3.5 |
| `SEALED` classification + grant-gated vault | §4 | 13 |
| Disclosure ≠ Access workflow | §5 | 13–14 |
| **Amanat** | §6 | 14 (legally gated) |
| Projections / read models | §7.1 | 8 |
| Deployment topology ladder L0–L3 | §7.11 | 17+ |
| Domain event catalogue with governed payloads | §7.3 | 2 |
| Documents / evidence platform capability | §7.4 | 13 |

---

## 18. Phase 9 scope — the answer

**Phase 9 "Consumer features" = every row marked BUILD 9 above**, on the platform delivered by Phases 2–8:

1. Zakat — quick estimate, config/reference values, full assessment engine, asset and liability ledgers, hawl, preferences, settings register, Sadaqah tracker
2. Savings plans, goals, savings planner and affordability
3. Loan tracking
4. Notifications (in-app; push deferred)

Everything else in the consumer product is delivered *by* the platform phases and is not separately scoped at Phase 9: money-in at Phase 5, insight at Phase 6, AI at Phase 7.

**The critical path to a shippable Qatar B2C v1 remains Phases 0–9, unchanged by this inventory.** Zakat is the one addition, and it is a Phase 9 consumer capability rather than platform work — it does not move Phases 1–8.

**Zakat carries one non-engineering gate: no Sharia review, board, scholar, or certificate exists, and none is implied by any of this work.** That gate belongs beside Amanat's legal clearance in the pre-launch list, not in the engineering plan.
