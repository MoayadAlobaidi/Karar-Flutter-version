# Phase Compliance Gate

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.3 · **Date:** 2026-08-16 · **Review:** Phase 3 gate

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
