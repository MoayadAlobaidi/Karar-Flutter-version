# Phase Compliance Gate

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.5 · **Date:** 2026-08-16 · **Review:** Phase 4 gate

**v0.5 (2026-08-16):** Phase 3.5 gate checklist appended — **checklist only, outcome PENDING**; the gate record itself is executed and written by the lead at Phase 3.5 closeout. A required-fields rule added, applying to this and every later gate record.

**Two standing sections added at v0.5, and the reason is a finding rather than a refinement.** The Phase 3.5 independent review found that KAR-CTL-014's access review had never been performed at any gate, and that the Clause 10 nonconformity log had stayed empty across three gates that produced review findings. Both controls existed; neither had a place in the closing procedure, so neither happened. **§9 Access review** and **§10 Continual improvement** are that place. The root cause is recorded once, in [continual-improvement](iso27001/continual-improvement.md) CI-001: a check written only in the file that describes it does not get performed by someone reading a different file. A personal name was also removed from the Phase 3 record per [control-owners.md](control-owners.md) rule 1.

**v0.4 (2026-08-16):** Phase 3 gate record written at closeout — outcome PASS_WITH_DOCUMENTED_DEFERRED_ITEMS, six deferred items each with reason/owner/target/residual/closure.

**v0.3 (2026-08-16):** Phase 3 gate checklist appended — checklist only, outcome PENDING; the gate record itself is written by the lead at Phase 3 closeout.

**v0.2 (2026-08-15):** Phase 2 gate checklist appended — checklist only; the gate record itself is written by the lead at phase close.

Every phase ends with a Security/Compliance review whose output is a recorded gate report. This defines what that report must contain. It is the compliance half of the phase-closure template the docs process defines at [`docs/phases/PHASE_TEMPLATE.md`](../phases/PHASE_TEMPLATE.md) — the template carries the overall phase report; the sections below are what its security/compliance section must satisfy. The gate report itself is evidence (EV-008 pattern) and is referenced from the evidence register.

---

## The gate report — required sections

**1. Control status deltas.**
Which KAR-CTL controls changed status this phase (DESIGNED → IMPLEMENTED → OPERATING …), each with the pointer that justifies the move — a CI run, a settings export, a review record. A status change with no pointer does not pass. Statuses only ever move in the [control matrix](control-matrix.md); the report cites, never forks.

**2. Evidence generated and missing.**
EV rows collected or reviewed this phase; expected evidence that did not materialize (e.g. a [C1]-contingent control whose check never ran), each with a reason and a follow-up owner.

**3. Risk register update.**
New risks, re-scored risks, closed risks (EV-008 record). Explicit statement that the register was reviewed even when nothing changed.

**4. Exceptions.**
New exceptions opened, existing ones re-affirmed or closed, and any exception whose exit trigger fired but was not acted on — the last is a gate failure, not a note.

**5. Mapping deltas.**
Changes flowing into the SOC 2 [trust-services mapping](soc2/trust-services-mapping.md) and the ISO [Statement of Applicability](iso27001/statement-of-applicability.md) (e.g. a PLANNED Annex A control becoming real this phase). Nonconformities and corrective actions recorded in [continual-improvement](iso27001/continual-improvement.md).

**6. Claims reconciliation.**
Assurance Claim Registry entries touched by this phase's scope re-reviewed (`docs/security/assurance-claims.md` §3); any published promise the phase's output contradicts is named — this is the anti-P1 check.

**7. Residual risk statement.**
One paragraph, plain language: what the platform is still exposed to entering the next phase, and why that is acceptable (or what was accepted by whom if it is High/Critical).

**8. Next-phase entry criteria.**
The compliance preconditions for the next phase to begin — deferred controls that activate, evidence that must start flowing, legal/external gates that fall due (e.g. Phase 14's Amanat clearance, Phase 20's custody gates). Pulled from the [treatment plan](treatment-plan.md) and the [roadmap](../roadmap.md) gate lists, not invented per gate.

**9. Access review.** *(Added 2026-08-16 at the Phase 3.5 gate — see below for why.)*
Who holds access to what, re-read and recorded: repository and CI accounts and their roles, the registrar and DNS account, any cloud or vendor account that exists, and the application role and permission catalogue once one is seeded. Every role change since the last gate is named. **The set is trivial today — one maintainer, one SCM account, no environments — and it is recorded anyway**, because a review that only starts when it is hard has no baseline. KAR-CTL-014 asserted this happened at every gate from Phase 1; no gate record contained it, and the omission is logged as CI-004 in [continual-improvement](iso27001/continual-improvement.md). Also re-read here: vendor review dates against the [vendor register](vendor-and-subprocessor-register.md), whose lapse across two gates is CI-005.

**10. Continual improvement.**
Every finding from this phase's independent review is either logged in [continual-improvement](iso27001/continual-improvement.md) or explicitly classified as not-a-nonconformity with the reason. Open NCs from earlier gates are checked against their due dates. **An empty log at a gate that produced findings is itself a nonconformity** — that is the log's own rule, and it went unenforced across three gates (CI-001) because no gate section pointed at it. This section is that pointer.

## Rules

- **No gate, no phase close.** A phase without a recorded gate report is not complete, whatever the code says.
- **Honesty over completeness:** "not done, because X, owned by Y" passes review; silence or an unsupported OPERATING claim fails it.
- The reviewer is the Compliance Owner; where a phase's work was authored under EXC-001 (single person), the independent-reviewer-agent findings for the phase are attached to the report.
- Hard roadmap gates (staging before production, custody before sealed data, independent assessment before launch) cannot be waived by a gate report — they are preconditions the report verifies, not items it may accept as risks.

## Phase 1 specifics

The first gate report (closing Phase 1) must additionally record: verification of EV-007 (branch protection, per `docs/operations/repository-security-settings.md`), the workflow-file review against KAR-CTL-009 and KAR-RSK-005, first-run references for EV-001–EV-006, disposition of the `Archive.zip` item (KAR-RSK-012), a decision on the SCA blocking threshold (KAR-CTL-025 — currently report-only), and confirmation that every [C1]-contingent control's check actually exists in the merged CI.

## Phase 1 gate record — PASSED, 2026-08-15

- EV-007 verified row-by-row via the GitHub API; observed values in `docs/operations/repository-security-settings.md`.
- EV-001–EV-006 COLLECTED with first-run URLs (all 12 checks green; one transient Actions-allowlist failure fixed and recorded).
- `Archive.zip` (KAR-RSK-012) disposition: untracked and git-ignored in the Phase 1 PR; history deliberately not rewritten; risk row updated.
- KAR-CTL-025 decision: dependency audit stays report-only for Phase 2; the blocking dependency gate remains `dependency-review` (KAR-CTL-027). Tightening criterion unchanged in the settings doc.
- All [C1]-contingent controls confirmed: every referenced check exists in the merged CI and ran green.
- Independent review: 0 BLOCKING / 2 HIGH / 6 MEDIUM — all HIGH and MEDIUM remediated pre-PR ([phase report](../phases/phase-01.md)).
- No control moved to OPERATING or EVIDENCED at this gate; statuses remain as the matrix records.

## Phase 2 specifics — gate checklist

**Status: PENDING. This is the checklist, not the record.** The gate outcome (PASS or findings) is recorded by the lead at phase close, below this block, following the Phase 1 pattern. Prepared 2026-08-15 alongside the Phase 2 compliance updates (matrix v0.2, registers v0.2).

The Phase 2 gate report must verify, beyond the standard eight sections:

1. **EV-201–EV-219 first instances.** The Phase 2 PR CI run URL(s) recorded against the new evidence rows and their statuses moved PENDING → COLLECTED; the phase report's verification section (`docs/phases/phase-02.md`) referenced as the lead-local-run record of 2026-08-15. Any row that cannot cite a green run stays PENDING, with a reason and owner.
2. **Control deltas with pointers.** KAR-CTL-051–065 added (13 IMPLEMENTED [P2], 2 DESIGNED); KAR-CTL-033 and 040 moved to IMPLEMENTED [P2]; KAR-CTL-007, 008, 015 moved to IMPLEMENTED on the EV-007 verification. Each move must cite its pointer; confirm no control anywhere claims OPERATING or EVIDENCED and nothing is represented as deployed.
3. **Design-only boundaries hold.** KAR-CTL-064/065 remain DESIGNED; no cloud KMS, no production keys, no operating canary is claimed anywhere (SoA 8.24 deliberately not advanced).
4. **Policy approval decision.** The 14 DRAFT policies name this gate as their approval target ([policy-index](policy-index.md)); the gate records approval by the Platform Owner or the slip with a new target. Silence fails the gate.
5. **Evidence-store decision.** The interim-store exit was due "no later than the Phase 2 gate" ([evidence register](evidence-register.md), KAR-RSK-011): record the chosen store or the explicit re-acceptance of the interim.
6. **Risk review record (EV-008 pattern).** Register v0.2 deltas signed: KAR-RSK-014/015 added, 010 re-scored 12 → 9, 003 note revised, no closures; every other row confirmed reviewed.
7. **Exceptions re-affirmed.** EXC-001, 002, 003 re-affirmed (register v0.2); verify no exit trigger fired — the team is still one person.
8. **Mapping deltas match the matrix.** SoA v0.2 (seven rows to IMPLEMENTED, tally 47/28/10/8/0) and trust-services mapping v0.2 quote matrix v0.2 exactly; any disagreement resolves toward the matrix.
9. **Claims reconciliation.** The threat model's "Phase 2 platform threats" evidence refs (EV-201–EV-213) resolve one-for-one against the evidence register; assurance-claim entries touched by Phase 2 re-reviewed; architecture test 26 green on the closing run.
10. **Architecture-test activation.** Tests 5, 6, 23 ACTIVE and 25 deepened; 19 registry-active numbered tests plus the supplementary check passing (20 passing); self-test 22 seeded-violation cases (EV-217).
11. **Fresh-clone verification.** Executed at phase close and recorded (EV-218, KAR-CTL-046).
12. **KAR-CTL-025 threshold decision.** The Phase 1 gate deferred the SCA blocking threshold to this gate: decide, or re-defer with the reason and the tightening criterion re-affirmed.
13. **Database-reality checks.** Spot-verify in the CI logs: from-zero creation ran twice, a 42501 denial and a P0001 trigger denial actually occurred, and the destructive-reset guard refused outside its double condition.

## Phase 2 gate record — PASS_WITH_DOCUMENTED_DEFERRED_ITEMS, 2026-08-16

Evaluated against the checklist above at commit `324fce1` plus the closeout commit.

**Evidence status.** EV-201–EV-219 COLLECTED (CI run 31907338148, Security run 31907338141, both green on the final head; clean-clone record and lead local runs in the phase report). Reviewed: the independent reviewer re-executed every underlying suite and check and reproduced every count. Pending: formal evidence-file review in a protected store — the store itself is a deferred item below. Owner: Security Owner.

**Control status.** KAR-CTL-051–063 confirmed IMPLEMENTED with the [P2] local-only contingency (mechanism plus tests in-repo; deployed nowhere); KAR-CTL-064 and 065 remain DESIGNED — key custody and the integrity canary are design-only, no cloud KMS and no production key exists. Nothing was upgraded to OPERATING or EVIDENCED.

**Policies.** All fourteen remain DRAFT. Policy approval deferred — Platform Owner review required. Deadline: before the first non-local deployment (Phase 18 at the latest; earlier if an external audit engagement begins first).

**Interim evidence storage.** Decision recorded: non-sensitive engineering evidence is referenced through GitHub Actions artifacts and controlled local verification records. Sensitive evidence must never enter the public repository. A protected long-term evidence store remains undecided — owner: Platform Owner; risk retained (KAR-RSK-011 vendor concentration and run-URL retention limits); mandatory reassessment before Phase 4 or before any external audit engagement, whichever occurs first.

**Separation of duties.** EXC-001 stays open. Agent-based independent review is genuine technical review but is not independent human separation of duties; the exception and its two-engineer remediation trigger remain visible in the exceptions register.

**SCA policy.** dependency-review blocks newly introduced high-severity dependencies at the PR boundary (KAR-CTL-027); the package-manager audit job remains report-only under the approved policy (KAR-CTL-025 DESIGNED), with the tightening trigger and owner in `docs/operations/repository-security-settings.md`. Historical transitive findings are not claimed to be blocking. Residual risk carried in the risk register.

**Deferred items (with owners and targets):** policy approval (Platform Owner, before first non-local deployment) · protected evidence store (Platform Owner, before Phase 4 or external audit) · KAR-CTL-025 threshold tightening (Engineering Owner, criterion in the settings doc) · custody/canary implementation (Phase 13/20) · EXC-001 (team growth trigger).

**Outcome: PASS_WITH_DOCUMENTED_DEFERRED_ITEMS.** No hard roadmap gate was waived; every deferred item carries an owner and a target.

## Phase 3 specifics — gate checklist

**Status: PREPARED, outcome PENDING. This is the checklist, not the record.** The gate is executed at Phase 3 closeout; its outcome (PASS or findings) is recorded by the lead below this block, following the Phase 1 and Phase 2 patterns. Prepared 2026-08-16 alongside the Phase 3 compliance updates (matrix v0.3, evidence register v0.4, risk register v0.3, SoA v0.3). Nothing in this checklist asserts or presumes an outcome.

The Phase 3 gate report must verify, beyond the standard eight sections:

1. **EV-301–EV-317 instances.** The Phase 3 PR CI run URL(s) recorded and EV-317 moved PENDING → COLLECTED; EV-301–EV-316's executed-run basis re-confirmed on the closing head; the phase report's verification sections (`docs/phases/phase-03.md`) completed and referenced. Expected counts to reproduce: full workspace suite 797 passed / 5 skipped (802 total) across 80 passed / 1 skipped test files, the skipped file being the KARAR_INTEGRATION-gated readiness suite, which runs in CI. Any row that cannot cite a green run reverts to PENDING with a reason and owner.
2. **Control deltas with pointers.** KAR-CTL-066–078 added (13 IMPLEMENTED [P3]); KAR-CTL-010, 011, 049 moved DEFERRED → IMPLEMENTED [P3]; KAR-CTL-020's Phase 3 activation note. Each move cites its pointer; confirm no control anywhere claims OPERATING or EVIDENCED and nothing is represented as deployed.
3. **Kill-switch guard mounting.** The integration wiring mounts `KillSwitchGuard`/`RequireOperationAllowed` on the registration, login, refresh, and invitation routes; verify on the closing head and close KAR-RSK-019 on that verification — or hold it OPEN with reason and owner. Until verified, kill-switch route enforcement is not claimed anywhere.
4. **Phase 3.5 boundaries hold.** No jurisdiction PolicyPack, capability-availability, or SubjectPolicySelection behaviour smuggled in; architecture test 21's registry activation gate for the Phase 3.5 pinning columns present (the run fails when 3.5 arrives without them); `LocalDevEncryptionProvider`/`LocalMailSink` still refuse outside local; SoA 8.24 deliberately not advanced — no cloud KMS, no production keys, no operating canary claimed anywhere.
5. **Permission-absence honesty.** `identity.account.disable`/`enable` remain documented-but-unseeded (migration 0050 header); `amanat.content.read` absence still test-pinned; no permission returns credential material; DB seed == code catalogue on the closing run (14 permissions, 8 roles).
6. **Policy approval decision.** The 14 policies remain DRAFT under the Phase 2 gate's deadline (before the first non-local deployment); the gate records Platform Owner approval or re-affirms the deadline. Silence fails the gate.
7. **Risk review record (EV-008 pattern).** Register v0.3 deltas signed: KAR-RSK-016–020 added, 009 note dated, no re-scores; the only closure candidate is KAR-RSK-019 under item 3; every other row confirmed reviewed.
8. **Exceptions.** EXC-001, 002, 003 re-affirmed or updated; EXC-002's compensating-control refresh (short-lived tokens with server-side revocation delivered as Phase 3 code) verified; confirm no exit trigger fired — the team is still one person.
9. **Mapping deltas match the matrix.** SoA v0.3 (four rows to IMPLEMENTED, tally 43/28/10/12/0) and trust-services mapping v0.3 quote matrix v0.3 exactly; any disagreement resolves toward the matrix.
10. **Claims reconciliation.** The threat model's "Phase 3 identity, tenancy, and access-control threats" evidence refs (EV-301–EV-313) resolve one-for-one against the evidence register; assurance-claim entries touched by Phase 3 re-reviewed; architecture test 26 green on the closing run.
11. **Architecture-test activation.** Tests 9 (tenant scoping), 21 (pinning), 22 (RLS coverage) ACTIVE and test 4 narrowed; 23 passed / 0 failed / 5 skipped with zero registry activation errors; built-in self-test 35/35 seeded cases (EV-315).
12. **Database-reality checks.** Spot-verify in the CI/local logs: the RLS inventory matches EV-316 (37 tables = 17 ENABLE+FORCE + 27 allow-listed, 7 in both); the adversarial suites' non-empty two-tenant seeding visible before denial assertions; escalation probes (SET ROLE, DDL, trigger disabling, `session_replication_role`) rejected; append-only ledgers hold against the migrator role.
13. **Fresh-clone verification.** Executed at phase close and recorded (per-phase frequency on the EV-218 row; KAR-CTL-046).
14. **KAR-CTL-025 threshold.** Unchanged from the Phase 2 gate decision (package-manager audit report-only; dependency-review blocking at the PR boundary); re-affirm the tightening criterion and owner, or act on it.

---

## Phase 3 gate record — executed 2026-08-16

**Outcome: PASS_WITH_DOCUMENTED_DEFERRED_ITEMS.** Gate executed by the phase lead (Compliance Owner role) at close; the independent-reviewer-agent findings for the phase (0 BLOCKING / 3 HIGH / 2 MEDIUM / 4 LOW, all HIGH and MEDIUM resolved or formally deferred before the PR) are attached per the EXC-001 rule. All review here is maintainer-directed agent review, not organizational separation of duties.

**Standard sections.**

1. *Control deltas:* KAR-CTL-066–078 added IMPLEMENTED [P3]; KAR-CTL-010, 011, 049 DEFERRED → IMPLEMENTED [P3]; KAR-CTL-020 activation note extended — every move carries its pointer in matrix v0.3. No control anywhere claims OPERATING or EVIDENCED; nothing is represented as deployed. Reviewed per the closeout instruction across identity lifecycle, registration/verification, password authentication and recovery, MFA foundation, session lifecycle, refresh rotation and reuse detection, server-side revocation, RBAC, privileged access, tenant isolation, RLS, invitations, consent, legal-document lifecycle, re-consent, kill switches, security events, and audit trails: all IMPLEMENTED [P3] or DESIGNED with honest notes. Local-only encryption/signing/mail providers are recorded as exactly that — they establish no production key-management readiness (KAR-RSK-009 custody gates unchanged).
2. *Evidence:* EV-301–EV-319 COLLECTED (register v0.5) with executed-run references — CI run 31921545097 and Security run 31921545041 green at implementation head `8627f16`, clean-clone verification EV-319, suppression review EV-318. No expected evidence failed to materialize. Nothing is REVIEWED by an independent organization; nothing is EVIDENCED.
3. *Risk register:* v0.3 deltas signed (KAR-RSK-016–021 added across the phase; 009 note dated; no re-scores). KAR-RSK-019 CLOSED at this gate on the mounting verification (item 3 below). Every other row reviewed; KAR-RSK-021 carried into Phase 3.5 (deferred items below).
4. *Exceptions:* EXC-001 re-affirmed OPEN (the team is one person; no exit trigger fired). EXC-002 compensating-control refresh verified (short-lived tokens with per-request server-side revalidation delivered as code). EXC-003 re-affirmed unchanged.
5. *Mapping deltas:* SoA v0.3 (5.16, 5.17, 8.3, 8.5 → IMPLEMENTED; tally 43/28/10/12/0) and trust-services mapping v0.3 quote matrix v0.3 exactly; verified at close, no disagreement. 8.24 deliberately not advanced.
6. *Claims reconciliation:* threat-model EV-301–EV-313 references resolve one-for-one against the register; architecture test 26 green on the closing run; no published promise contradicted. The tenant-binding dormancy is stated wherever the tenant-bound surface is described (phase report, MODULE.md files, OpenAPI description, threat model).
7. *Residual risk:* entering Phase 3.5, the platform's principal exposures are: the dormant tenant-bound surface until session binding lands (KAR-RSK-021 — fail-closed, so exposure is unavailability, not disclosure); single-maintainer concentration (KAR-RSK-001/002, EXC-001); local-only key/mail custody with no production providers (KAR-RSK-009/020 — fail-closed constructors); no production deployment exists, so operational exposure is nil in substance. Acceptable because every gap denies rather than degrades open.
8. *Next-phase entry criteria:* Phase 3.5 begins only after PR #5 merges, the branch is deleted, and the new branch starts from the merge commit; Phase 3.5 owns the tenant-binding/bootstrap mechanism (KAR-RSK-021 closure), the PolicyPack/capability foundation the test-21 activation gate expects, and the Phase 3.5 compliance gate.

**Phase 3 checklist items 1–14:** all verified on the closing head. Notes where the record differs from the prepared expectation:

- Item 1: the prepared expected counts (797/5/802 across 80/1) predate final integration; the closing clean-clone counts are **807 passed / 5 skipped (812) across 83 passed / 1 skipped files** — the delta is the lead-integration tests (kill-switch mounts, composed error boundary, tenancy restriction case) and the close-out suppression-review test, all named in the phase report. EV rows updated to the executed numbers; nothing reverted to PENDING.
- Item 3: kill-switch guard mounting VERIFIED — register/login/refresh and invitation issue/redeem carry the consumer-declared gates, proven by the mount tests and the composed error-boundary test in the clean-clone run; KAR-RSK-019 closed on this verification.
- Item 6: policy approval — Platform Owner approval has NOT occurred; the 14 policies remain DRAFT and the deadline is re-affirmed: **Platform Owner review required before the first non-local deployment.** Nothing was approved on the owner's behalf.
- Item 13: fresh-clone verification executed and recorded (EV-319; phase report Close-out record).
- Item 14: KAR-CTL-025 threshold re-affirmed unchanged (report-only package audit; blocking dependency-review at the PR boundary); tightening criterion and owner unchanged.
- Additional at close: the Phase 3 security suppressions were individually re-reviewed (EV-318) — two exact-fingerprint gitleaks entries and one per-alert CodeQL dismissal, no broad suppressions.

**Deferred items (each with reason / owner / target / residual risk / closure condition):**

1. *Session tenant binding (KAR-RSK-021).* Reason: no safe binding mechanism existed in Phase 3 scope; the fail-closed design keeps the surface dormant rather than guessable. Owner: Engineering Owner. Target: Phase 3.5 (which owns the mechanism). Residual: tenant-bound endpoints unavailable; no disclosure exposure. Closure: binding/bootstrap mechanism implemented with its own adversarial and concurrency tests, and the risk row closed at the Phase 3.5 gate.
2. *Production signing/encryption key custody.* Reason: no non-local environment exists; local providers fail closed by construction. Owner: Platform Owner. Target: provider selection at Phase 17+, custody gates at Phase 20 (roadmap). Residual: identity flows needing mail/KMS cannot run outside local. Closure: real provider selection with custody evidence at those gates (KAR-RSK-009, 020).
3. *Separation of duties (EXC-001).* Reason: single maintainer; agent workstreams are technical, not organizational. Owner: Platform Owner. Target: exit trigger = engineering team ≥ 2 (exception register). Residual: author/approver identity. Closure: exception exit on team growth; until then merge-blocking CI plus reviewer-agent findings attached to every gate.
4. *Policy approval.* Reason: Platform Owner review pending. Owner: Platform Owner. Target: before the first non-local deployment. Residual: policies guide but do not bind formally. Closure: the Platform Owner's own recorded approval; never approved on that role-holder's behalf. *(Personal name removed 2026-08-16 per [control-owners.md](control-owners.md) rule 1 — roles only, in a public repository.)*
5. *Protected long-term evidence storage.* Reason: interim model keeps only safe references/summaries in-repo; no protected store exists. Owner: Compliance Owner. Target: revisit at the Phase 20 operational gates alongside off-host audit shipping. Residual: evidence files live in maintainer-controlled locations without organizational access control. Closure: protected store decision recorded with access design.
6. *Session-touch write amplification.* Reason: sliding-idle semantics chosen deliberately; optimization is a performance concern with no correctness effect. Owner: identity workstream. Target: first performance-sensitive phase. Residual: one UPDATE per bearer-carrying request. Closure: conditional touch (skip far from expiry) or a recorded decision to keep the semantics.

---

## Required fields — applies to this and every later gate record

**No field in a gate record may be left blank, dashed, or filled with a bare "PENDING".** A gate record is read later by people deciding whether to trust the platform, and an empty cell reads as "fine" when it means "unknown". Two rules, both enforced by the Compliance Owner before a record is accepted:

1. **Every field is answered.** If the honest answer is that something did not happen, the field says *what* did not happen and *why*, not nothing. "PENDING" alone fails; "PENDING — the run has not been executed; owner Engineering Owner; executes at PR open" passes.
2. **Every deferred item carries five things: reason · owner · target phase or date · residual risk · closure condition.** An item missing any of the five is not a deferral, it is an omission, and the gate does not pass with it. This is the shape the Phase 2 and Phase 3 records already use; it is written down here so it is a rule rather than a habit.

The same discipline applies to the registers a gate quotes: an evidence row that cannot cite a green run reverts to `PENDING` **with a reason and an owner**, a risk with no owner is not a recorded risk, and an exception with no exit trigger is not an exception.

## Phase 3.5 specifics — gate checklist

**Status: PREPARED, outcome PENDING. This is the checklist, not the record.** The gate is executed at Phase 3.5 closeout; its outcome (PASS, PASS_WITH_DOCUMENTED_DEFERRED_ITEMS, or findings) is recorded by the lead below this block, following the Phase 1, 2, and 3 patterns. Prepared 2026-08-16 alongside the Phase 3.5 compliance updates (matrix v0.4, evidence register v0.6, risk register v0.4, treatment plan v0.4, SoA v0.4, trust-services mapping v0.4, exceptions register v0.4, asset inventory v0.3, vendor register v0.2, and the domain runbook). **Nothing in this checklist asserts or presumes an outcome**, and preparing it is not passing it.

The Phase 3.5 gate report must verify, beyond the standard eight sections:

1. **EV-401–EV-429 instances.** The Phase 3.5 PR CI and Security run URLs recorded and **EV-426 moved PENDING → COLLECTED**; EV-401–EV-425's executed-run basis re-confirmed on the closing head and the implementation head recorded; the phase report's verification sections (`docs/phases/phase-03-5.md`) completed and referenced. Expected counts to reproduce: full workspace suite **1100 passed / 5 skipped (1105 total) across 105 passed / 1 skipped test files** (the skipped file is the `KARAR_INTEGRATION`-gated readiness suite, which runs in CI); architecture runner **24 passed / 0 failed / 4 skipped**, 0 registry activation errors, self-test **56/56**; docs-check 7/7; Prisma mapping 43 mapped tables. **Any row that cannot cite a green run reverts to PENDING with a reason and an owner.** EV-427 (domain hardening), EV-428 (independent review) and EV-429 (clean-clone) are expected to be resolved or explicitly re-stated as PENDING with reason and owner — silence on them fails the gate.
2. **Control deltas with pointers.** KAR-CTL-079–093 added (15, all IMPLEMENTED [P3.5]); **one existing control changed status** — KAR-CTL-004 DESIGNED → IMPLEMENTED on the three existing gate records; KAR-CTL-011, 020, 049, 076 note extensions verified against reality, and KAR-CTL-014 and 047 notes corrected to record what has *not* happened (CI-004, CI-005). Each addition cites its pointer. Confirm no control anywhere claims OPERATING or EVIDENCED, no evidence row anywhere claims EVIDENCED, and nothing is represented as deployed.
3. **Policy approval — records the deadline, never an approval.** The 14 policies remain **DRAFT** under the standing deadline set at the Phase 2 gate and re-affirmed at Phase 3: **Platform Owner review is required before the first non-local deployment.** The gate records either the Platform Owner's own recorded approval or the re-affirmed deadline with its owner. **Nothing is approved on the Platform Owner's behalf, by any workstream, at any gate.** Silence fails the gate.
4. **Separation of duties — EXC-001 stays open.** Verify no exit trigger fired (the team is one person) and that the record describes every review performed this phase — reviewer agent, security workstream, compliance workstream, suppression review — as **maintainer-directed technical review**, not organizational separation of duties or independent human review. A record implying otherwise is a gate failure, not a wording preference.
5. **Evidence completeness.** Every EV id cited by a Phase 3.5 control, risk, or assurance claim exists in the register; every EV-4xx the threat model cites is defined (EV-401–EV-414, one per threat row); every file path cited in a Phase 3.5 evidence row resolves on disk; and no evidence status anywhere is anything but PENDING, COLLECTED, or REVIEWED.
6. **`qa/v1` non-production posture.** Confirm on the closing head: `qa/v1` is `DRAFT` / `PENDING_LEGAL_REVIEW` with `approvalReference: null`, `clearedCapabilities` EMPTY, and **every** decision slot an explicit `PENDING_LEGAL_REVIEW` carrying its stated open question; `canActivate` refuses it outside `local`, and refuses any `APPROVED` claim without an approval reference everywhere. **No jurisdiction is approved and no pack is approved** — record that as a fact of the phase, not as a gap to be closed by anyone in this repository.
7. **Capability non-availability.** Confirm every capability in the registry is `NOT_IMPLEMENTED` and deployed in no environment, that the availability and entitlement tables ship with **no rows**, that Amanat declares no jurisdictions and is `HIDDEN`, that Zakat's Sharia gate is recorded as a non-engineering launch gate (KAR-RSK-007), that `FUNDRAISING` has no id and no descriptor, and that the four declared permissions are unseeded so every mutating use case refuses. **No capability resolves available anywhere** — verify the record says so plainly.
8. **Tenant binding and the closure of KAR-RSK-021.** Verify the binding mechanism on the closing head — server-side membership sourcing, bind-time re-verification, switch-time session **and refresh-family** rotation, verify → act → re-verify → compensate, uniform denial of arbitrary/revoked/expired/disabled targets, first-party tenant from typed configuration with no identifier literal in domain code — with its adversarial and concurrency tests (EV-411, 412, 420). **Close KAR-RSK-021 on that verification, or hold it OPEN with reason and owner.** Confirm the surviving residual is carried as KAR-RSK-030 rather than folded into the closure.
9. **Domain and vendor records.** Verify the `kararfinance.com` asset row records only confirmed facts (registrar and DNS Cloudflare, registration USER_CONFIRMED, hosting/traffic/API/email/proxy/CDN/WAF all NOT_CONFIGURED, **no DNS record configured**), that all seven hardening items remain **TO_VERIFY** unless someone actually checked and recorded an observed value with a date, that Cloudflare is registered as registrar and DNS only and **not** as a financial-data processor or subprocessor with the conditions that would change that stated, and that **no account identifier, credential, billing datum, invoice id, or screenshot** entered the repository. EV-427 stays PENDING until a real verification exists.
10. **Architecture-test activation.** Tests 12, 17 (second tier), 19, 21 (deferral machinery removed, real enforcement), 22 (anti-boilerplate allow-list rules), and 26 (repo paths resolve, EV ids well formed) verified on the closing run: **24 passed / 0 failed / 4 skipped**, 0 registry activation errors, self-test **56/56** (EV-422). Confirm test 21 no longer contains Phase 3.5 deferral machinery of any kind.
11. **Database-reality checks.** Spot-verify: the RLS inventory matches EV-423 (**48 tables = 22 ENABLE+FORCE + 33 allow-listed, 7 in both**); the Phase 3.5 adversarial suite reads its own non-empty data before every denial assertion (16 tests); the three new append-only ledgers hold against the table owner; migration `0086`'s CHECKs behave as written; and a fresh scratch database migrates clean through `0086` with the unused numbers (`0078`, `0079`, `0082`, `0084`, `0085`, `0087`–`0089`) left as gaps.
12. **Mapping deltas match the matrix.** SoA v0.4 (5.15 and 8.32 → IMPLEMENTED; tally **41 / 28 / 10 / 14 / 0** = 93) and trust-services mapping v0.4 quote matrix v0.4 (**93 controls; 17 DESIGNED / 61 IMPLEMENTED / 14 DEFERRED / 1 EXCEPTION / 0 OPERATING / 0 EVIDENCED** — 61 rather than 60 because KAR-CTL-004 moved DESIGNED → IMPLEMENTED on the three existing gate records) exactly; any disagreement resolves toward the matrix. Confirm 8.24 is again **not** advanced.
13. **Claims reconciliation.** The threat model's Phase 3.5 evidence refs (EV-401–EV-414) resolve one-for-one against the evidence register; AC-016 to AC-021 re-read and confirmed still `UNVERIFIED` — **no assurance claim may be marked VERIFIED at this gate**, because no human assurance review has been recorded; architecture test 26 green on the closing run.
14. **Risk review record (EV-008 pattern).** Register v0.4 deltas signed: KAR-RSK-021 closed on item 8, 022–030 added, notes dated on 010, 016, 017, 020, no re-scores; every other row confirmed reviewed. Treatment plan v0.4 rows exist for every open risk.
15. **Exceptions.** EXC-001, 002, 003 re-affirmed per the register's Phase 3.5 entry; confirm no exit trigger fired and **no exception was opened, closed, or re-approved**.
16. **KAR-CTL-025 threshold.** Unchanged from the Phase 2 and Phase 3 decisions (package-manager audit report-only; dependency-review blocking at the PR boundary); re-affirm the tightening criterion and owner, or act on it.
17. **The two new standing sections, performed for the first time.** §9 **Access review**: record who holds repository, CI, and registrar/DNS access, the role each holds, and any change since the Phase 3 gate — trivial today and recorded anyway; note that the application permission catalogue is unchanged and that the four Phase 3.5 permissions remain unseeded. §10 **Continual improvement**: confirm CI-001…CI-006 are logged with owners and due gates, and that this phase's review findings are each logged or explicitly classified as not-a-nonconformity. **An empty or unreferenced log fails this item.**
18. **Register-integrity sweep (CI-006).** Re-run the cross-reference checks and record the result: every EV / KAR-CTL / KAR-RSK id cited anywhere resolves; every quoted evidence status matches the register; every quoted control status matches the matrix; every cited repository path exists; the matrix, SoA, and trust-services tallies agree. **Zero forks is the pass condition**, and the gate records the number checked, not just the outcome. Also record a decision on CI-006's corrective action: whether this sweep graduates into the architecture-test suite as a merge-blocking check, with an owner and a target phase.
19. **Vendor review dates (CI-005).** Confirm every vendor row's next-review date is in the future and that the Phase 3.5 re-read is recorded as a **register re-read, not a vendor security review** — the distinction KAR-CTL-047's status depends on.

**Deferred items must each state reason, owner, target phase or date, residual risk, and closure condition** — the required-fields rule above, restated here because it is where gates most often go quiet. At minimum the following carry into the record unless something closed them: policy approval (Platform Owner, before first non-local deployment) · protected long-term evidence storage (Compliance Owner) · separation of duties, EXC-001 (Platform Owner, team ≥ 2) · production key custody (Platform Owner, Phases 17+/20) · the unseeded Phase 3.5 permissions and their operator surfaces (Phase 8) · the caller-settable pin cutoff, KAR-RSK-029 · legal review of every `PENDING_LEGAL_REVIEW` slot in `qa/v1` (Platform Owner with counsel; not an engineering task) · Sharia review for Zakat and legal clearance for Amanat (KAR-RSK-007, 008; non-engineering gates).

