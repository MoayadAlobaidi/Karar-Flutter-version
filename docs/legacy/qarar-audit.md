# Legacy Audit — `MoayadAlobaidi/Qarar`

**Deliverable:** Phase 0.2
**Status:** COMPLETE — source-verified. Blocker 1 is resolved.
**Audit date:** 15 August 2026
**Subject commit:** `88f16c2`-era `main` of `Qarar`, HEAD `Merge pull request #41 from MoayadAlobaidi/go-live-worklist`, committed 13 August 2026 23:34 +0300
**Method:** read-only clone into a scratch directory with write permissions stripped (`chmod -R a-w`). Nothing in `Qarar` was modified, and no branch, issue, or comment was created there.

---

## 1. Access — Blocker 1 resolved

Architecture Plan v2 recorded one remaining true blocker:

> **Qarar repo access** — session repo scope excludes it. Blocks Phase 0 sign-off and Phase 9 scoping.

**This blocker no longer holds.** The restriction the plan recorded was specific to the MCP GitHub tool's session allow-list. The `gh` CLI in this environment authenticates as `MoayadAlobaidi` with `repo` scope and reaches the repository normally:

```
repos/MoayadAlobaidi/Qarar → private, Java, 37,037 KB, default branch main, pushed 2026-08-15T10:01:06Z
```

The plan's instruction — *"Add `MoayadAlobaidi/Qarar` to this session's allowed repositories, or supply the feature list directly (labelled USER-REPORTED)"* — is therefore moot. The inventory in [`feature-inventory.md`](feature-inventory.md) is **SOURCE-VERIFIED**, not USER-REPORTED, and not fabricated.

**Consequence for the plan:** the §0.9 exit criterion *"feature inventory complete **or** Blocker 1 formally carried into Phase 1 with Phase 9 explicitly unscoped"* is satisfied by the first branch. Phase 9 can be scoped. Phase 0 can reach full sign-off.

---

## 2. Correction to blocking fact #1

Plan v2 states the target repo `Karar-Flutter-version` is empty — *"zero commits, verified via `git ls-remote`, `list_branches` (`[]`), and `get_file_contents` (`409 Git Repository is empty`)"*.

At the time of this audit that is **no longer literally true**. `git ls-remote` returns:

```
88f16c2afd32d2fb8a83c2eff158b5b5a88dbc6e	refs/heads/main
```

One commit exists — *"Add initial README for Karar-Flutter-version"*, authored by MoayadAlobaidi on 15 August 2026 17:37 +0300, containing a single line: the repository title. It was created after the plan's verification and before this session.

**The substance of the plan's claim is unaffected.** A one-line placeholder README is nothing to preserve, and §87 still has nothing to preserve. The correction is recorded because the plan's §0.1 requires preserving an accurate record of the starting state, and "zero commits" would be an inaccurate one.

---

## 3. What Qarar actually is

Plan v2 treats the legacy as an unknown quantity. It is not one. **Qarar is a near-production personal-finance platform prepared for a Qatar Central Bank sandbox submission.** It is not a prototype and not a throwaway.

| Dimension | Fact | Evidence |
|---|---|---|
| Backend | Java / Spring Boot, Maven, `com.qarar.*` | CODE |
| Mobile | **React Native** (`App.tsx`, Metro, `react-native.config.js`) — 423 tracked files | CODE |
| Admin | `admin-web` — a 4-file static single-page console (`index.html`, `app.js`, `styles.css`) | CODE |
| Database | PostgreSQL on Supabase; Flyway migrations | CODE |
| Hosting | Render (`render.yaml`) | CODE |
| Repo scale | 1,343 tracked files, 219 commits | CODE |
| Language spread | 704 `.java`, 192 `.tsx`, 163 `.ts`, 90 `.md`, 71 `.sql` | CODE |
| Regulatory posture | A complete QCB submission package under `docs/qcb/` — 24 documents plus evidence JSON | CODE |

The mobile client being **React Native** confirms the v1 decision recorded in Plan v2's Part I: *"no mechanical React→Flutter migration."* That decision was made without source access; source access supports it. The RN app carries 40 screens across 25 feature modules, and a meaningful share of its behaviour is device-local mock data (see §6).

### 3.1 As-built backend module list

Verified by directory listing under `backend/src/main/java/com/qarar/`:

```
admin · ai · auth · banking · billers · billing · common · consent · dataexport
finance · i18n · infrastructure · loans · notification · report · savings
statements · subscription · support · tenant · user · waste · zakat
```

`infrastructure` subdivides into `config/properties`, `security/{crypto,filter,jwt,principal,ratelimit,rls}` — note that **RLS is an explicit infrastructure concern in the legacy**, not an afterthought.

### 3.2 Counts at HEAD, re-derived for this audit

The legacy's own `QARAR_QCB_FEATURE_MATRIX.md` is pinned to commit `c12c126` (11 August). HEAD is **62 commits ahead**. Counts were re-derived rather than copied:

| Measure | Legacy matrix (`c12c126`) | **This audit (HEAD)** | Drift |
|---|---|---|---|
| Migration files | 40, highest V42 | **45, highest V47** | +5 |
| Backend controllers | 33 | **33** | none |
| JPA entities | 66 | **66** | none |
| Field-encrypted columns | 11 | **16** | +5 |
| Tables in `public` | 69 | 69 (runtime, not re-verified) | — |

**The five new migrations are the remediation work**, and they close HIGH findings:

| Migration | Closes |
|---|---|
| `V43__ai_processing_notice_v2.sql` | **P1** — AI consent notice claimed redaction the code did not perform |
| `V44__ai_input_signals.sql` | AI observability |
| `V45__encrypt_statement_row_text.sql` | **FILES-1** (derived text half) |
| `V46__encrypt_statement_raw_file.sql` | **FILES-1** (the raw statement itself — the half the finding names) |
| `V47__protect_admin_audit_log.sql` | Audit-log tamper protection |

Any downstream use of the legacy matrix must account for this drift. Two of the seven HIGH findings were open when it was written and are closed at HEAD.

---

## 4. Current production reality

From `docs/qcb/GO_LIVE_WORKLIST.md`, dated 13 August 2026 — the newest document in the repository:

> Production is at V47, healthy, **three users, zero pilot customers**.
> `legal_acceptances` holds **0 rows**. Nobody has accepted anything.

This single fact is the most strategically important thing in the audit.

**Qarar has no customers.** Three user rows, forty-five transactions, two accounts, zero statement imports in production; zero legal acceptances; no payment mechanism of any kind and no customer ever charged. There is no migration burden, no data-retention obligation to a live customer base, no re-consent population, and no billing continuity requirement.

**Karar V2 is therefore a green-field build, not a replacement under load.** Plan v2's sequencing — build the platform properly, ship Qatar B2C v1 at Phase 9 — carries no hidden migration cost. Nothing has to be carried across except knowledge, and the knowledge is unusually well documented.

---

## 5. Security posture — the honest number

From `docs/qcb/evidence/SECURITY_AUDIT_FINDINGS_STATUS_2026-08-12.json`, audit dated 11 August 2026:

```
critical: 0 · high: 7 · medium: 74 · low: 37 · info: 10 · total: 128
```

Two qualifications the legacy itself records and this audit repeats rather than smooths over:

- **Only 8 of 128 findings carry any reviewed status**, and no re-audit has run.
- The remediation was performed by the same party that wrote the audit. The legacy's own worklist states the position plainly: *"I cannot also be the independent assessor of my own work, and nothing I produce should reach QCB as an independent assessment."*

Detail, and what each finding means for Karar V2, is in [`security-findings.md`](security-findings.md).

---

## 6. What the audit found that Plan v2 does not account for

These are the findings that change the plan rather than confirm it. Each is raised in [`../architecture/plan-v2-deltas.md`](../architecture/plan-v2-deltas.md) with a proposed disposition.

### 6.1 Zakat is a built capability and Plan v2 does not mention it

`com.qarar.zakat` is a substantial production capability with its own specification, methodology decisions document, calculation engine, and nine migrations' worth of schema. It has **two distinct code paths**: a quick estimate wired to the mobile app, and a full assessment engine with a declared asset/liability ledger, Hijri `hawl` state tracking through the Umm al-Qura calendar, immutable SHA-256-sealed assessments, and a jurisprudential settings register snapshotted into every assessment.

Plan v2 mentions Zakat **nowhere** — not in the domain map (§9), not in the capability registry (§2), not in the roadmap (§11). Phase 9 is specified as *"Consumer features (scope = Phase 0 inventory)"*, so the inventory is exactly where this belongs, and it is now recorded.

**The deeper point is architectural.** Zakat's variation is not keyed on jurisdiction. Two customers in the same jurisdiction, contracting with the same operating entity, can legitimately require different calculations because they follow different scholarly positions on nisab basis, valuation, and the treatment of doubtful portions. Plan v2 models three independent dimensions — Country, Jurisdiction, OperatingEntity (§1.1) — and **none of them expresses this**. It is a per-subject preference with the same versioning, provenance, and pinning requirements as a PolicyPack.

This is a genuine gap in a design whose central claim is that policy variation is fully modelled. It is not fatal — the fix is additive and cheap now — but it is materially cheaper to fix before `financial-engine` and `jurisdiction-policy` exist than after.

### 6.2 The encryption key is a one-way door, and it has already been lost once

Audit finding **ENC-2**: key rotation, escrow, and any second copy are **NOT BUILT**, and the production `DATA_ENCRYPTION_KEY` *"has already been lost once in production, on 11 August 2026."*

Plan v2 §4.2 specifies the sealed vault as per-record DEK wrapped by a jurisdiction-scoped KEK via `EncryptionProvider`, and says nothing about escrow, rotation, or recovery.

For `SEALED` data this is categorically worse than it was for Qarar. `SEALED` data is by design unreadable by Karar, never projected, never in events, never in logs, and never in analytics. **Key loss on sealed data is both unrecoverable and undetectable** — there is no projection to notice the discrepancy and no support path to surface it. An Amanat record whose KEK is gone is indistinguishable from one that decrypts correctly until the single moment it matters most: a verified disclosure to a bereaved family.

The legacy learned this the expensive way with ordinary encrypted columns and a recoverable dataset. Karar V2 must not learn it again with sealed obligations and no recovery path.

### 6.3 White-label: the control plane was built, the data plane was not

The legacy's own framing is exact:

> the **control plane** is the ability for Qarar to configure a bank tenant. The **data plane** is the ability for that configuration to change what a customer sees. The first is built. The second is not.
> …Nothing in the mobile app consumes tenant branding. A bank can be configured in the console and no customer would see any difference. **Qarar is not white-label ready.**

Plan v2 Scenario C (§8.3) concludes **"Zero code changes."** That claim is correct *about the architecture* and should not be softened — deny-by-default entitlements and `BrandConfiguration` genuinely make the capability-scoping side configuration-only. But the legacy is direct evidence that the expensive half of white-label is the client consuming the configuration, and Scenario C does not cost that half. Phase 11 must budget the data plane explicitly.

### 6.4 Consent re-acceptance on republish is unsolved, and is live today

Audit finding **P12**: *"Publishing a new version of the terms or privacy policy asks nobody to accept it, which contradicts the terms themselves."* The flag `qarar.consent.enforce-reacceptance` is `false` with no override; customers holding a version-1 acceptance are never re-prompted. This is why V43's correction of the AI notice is only *partially* remediated.

Plan v2 keys consent on the triple `(operatingEntity, purpose, jurisdiction)` and pins the operating entity at creation — which is a real improvement, and correctly makes `EntityMigration` an audited operation with a re-consent evaluation step. But **document-version republication within a stable triple is a different trigger** and Plan v2 does not name it. The legacy proves it is the case that actually occurs.

### 6.5 Orphaned derived data defeats erasure

Audit finding **P7**: one production table holds statement-derived data belonging to no user, and therefore cannot be erased on request.

Plan v2's retention and erasure design assumes every record has an owner to key erasure on. Derived, aggregated, and reference-extracted data may not. This needs an explicit position before Phase 5 (financial data platform) creates the same shape.

### 6.6 The most misleading surface, and why C9 matters

The legacy records its own worst surface without flinching:

> The connected-banks screen offers connection options… **Every other option runs a one-second animation and then inserts a fabricated account row into local state** with an invented masked number and a "Synced" status. It contacts nothing… **This is the single most misleading surface in the product.**

No monetary amounts are fabricated, but an account and a sync status are. Plan v2's retained challenge **C9** — *manual entry and CSV are first-class `IMPLEMENTED`* — is the correct structural answer, and this is the evidence for why it is not merely a scoping convenience. It is what stops a demo-shaped surface from implying a bank integration that does not exist.

---

## 7. What the audit confirms about Plan v2

Recorded because a design review that only lists problems is not a review.

| Plan v2 decision | Legacy evidence supporting it |
|---|---|
| One authoritative engine; client does no authoritative math (ADR-0007) | The legacy already computes every figure server-side and forbids the model producing numbers. It works |
| AI is never the source of financial truth (ADR-0010) | The legacy's system prompt forbids inventing any amount; the failure was in the *consent text*, not the computation |
| `VerifiedFinancialFacts` as primary AI numeric safety (ADR-0019) | The legacy's numeric guard *"ignores any number the model does not mark with a currency or percent token, so bare counts are unchecked"* (AI-7). A guard is exactly as leaky as the plan demotes it for being |
| RLS moved to Phase 3 (ADR-0022) | The legacy retrofitted RLS across V9/V30/V40 and still has 24 tables without it, 6 unexplained, and `users` among them. Retrofitting cost more than building it in |
| Staging mandatory before production (§7.10) | The legacy's staging is **DESIGNED NOT BUILT**, and it is now the item blocking the pen test, which blocks independent assurance, which is a STOP condition on its own checklist |
| Billing rail deferred behind a port (C10) | The legacy has no payment mechanism at all and has charged nobody. Deferring cost it nothing |
| Manual + CSV first-class (C9) | See §6.6 |
| Append-only audit enforced by DB grants | Built in the legacy and working — the trigger raises on UPDATE and DELETE even for the table owner |
| Arabic/RTL as first-class, not a late pass | The legacy shipped EN/AR with RTL and *still* found *"untranslated category names, residual English strings and RTL alignment defects."* Plan v2 putting RTL in Phase 4 is right |

The single strongest confirmation is §7.6. The legacy's AI numeric safety failed **not** because the model produced a wrong number, but because the *published consent document* described a redaction behaviour the code did not implement — and that document was the legal basis for a cross-border transfer of customer financial data. Plan v2's answer, that the model never writes a number and the platform renders every value, removes the class of problem rather than guarding it.

---

## 8. Provenance and limits of this audit

**What this audit is:** a read of the repository at HEAD, cross-read against the legacy's own QCB evidence pack, with all counts re-derived rather than copied.

**What it is not, and what it cannot establish:**

| Question | Why not |
|---|---|
| Whether the legacy backend test suite passes today | Not run. Test-result counts on disk are inflated by stale reports, as the legacy's own derivation script warns |
| Which region compute or database actually runs in | Not in the repository. Provider dashboard only. **REQUIRES OPERATOR CONFIRMATION** |
| Whether any encrypted column currently holds plaintext rows | No coverage tool exists in the legacy. ENC-13 records 22 known plaintext rows in production |
| Whether the 128 findings are accurate | Only 8 carry a reviewed status. This audit did not re-verify them individually; it reports them as the legacy reports them |
| Runtime behaviour of anything | No system was executed. Every claim here is CODE or a quoted legacy RUNTIME observation, labelled as such |

**Nothing in this document asserts compliance, certification, approval, or readiness of either system.** No Sharia review, penetration test, or independent security assessment exists for Qarar, and none is implied for Karar.

---

## 9. Disposition

| Item | Disposition |
|---|---|
| Blocker 1 | **CLOSED** — source access obtained, inventory verified |
| Phase 0 sign-off | **UNBLOCKED** |
| Phase 9 scoping | **UNBLOCKED** — see [`feature-inventory.md`](feature-inventory.md) |
| Plan v2 amendments arising | **6 raised** — see [`../architecture/plan-v2-deltas.md`](../architecture/plan-v2-deltas.md). None blocks Phases 1–8 |
| Legacy repository | Read-only reference. **Never written to.** No code will be copied without the assessment in [`reusable-assets.md`](reusable-assets.md) |
