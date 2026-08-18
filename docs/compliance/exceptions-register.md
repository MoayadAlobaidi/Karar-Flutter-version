# Exceptions Register

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.5 · **Date:** 2026-08-18 · **Review:** every phase gate

**v0.5 (2026-08-18, Phase 4):** EXC-001, 002, 003 re-affirmed; **no exception opened, closed, or re-approved**, and no exit trigger fired — the team is still one person. **EXC-002's Phase 4 revisit is the substantive item at this version**: Phase 4 is the point EXC-002's own exit clause named ("revisit at Phase 4, Flutter network layer"), the network layer now exists, the revisit was performed, and it produced a **re-score of KAR-RSK-013 from 6 Moderate to 8 Moderate** with the acceptance standing. **EXC-003's compensating-control statement was corrected rather than re-affirmed as written** — it asserted that CI runs the full scan set and blocks merge, and that is now only partly true: three of the lanes carrying this phase's scans are not required checks. **EXC-001 carries the Phase 4 restatement that eleven parallel agent workstreams are not separation of duties.**

**No new exception was opened, and the reasoning is the same one the Phase 3.5 version applied.** Phase 4's residuals — the unverified biometric prompt, the absent signed build, the missing Apple Team ID, the local-only abandonment guarantee, the unenforced goldens, the single-pair artifact comparison, the ungated mobile lanes — are **risks with named owners and treatments** (KAR-RSK-031–041), not bounded deviations from a stated control with compensating controls and an exit. The one that comes closest is the merge-gating gap, and it is deliberately **not** an exception: it is recorded where a status belongs, as **KAR-CTL-113 DESIGNED**, because the control's own statement requires blocking and the honest answer is that the control is not implemented rather than that it is being deviated from. Recording absent controls as exceptions would dilute what an exception means here.

**v0.4 (2026-08-16, Phase 3.5):** EXC-001, 002, 003 re-affirmed; **no exception opened, closed, or re-approved**, and no exit trigger fired — the team is still one person. EXC-001 carries an explicit note that Phase 3.5's multiple agent workstreams are **not** separation of duties. EXC-002's compensating-control facts refreshed again (a tenant switch now rotates the refresh family too). Phase 3.5 produced no new deviation warranting an exception: the residuals it surfaced — the caller-settable pin cutoff, the mislabelled-environment path, the bound-session window — are **risks with named owners** (KAR-RSK-029, 023, 030), not deviations from a stated control, and recording them as exceptions would dilute what an exception means here.

**v0.3 (2026-08-16, Phase 3):** EXC-002's compensating-control facts refreshed — the short-lived-token/server-side-revocation leg moved from Phase 3 design to Phase 3 code (KAR-CTL-067, 068). No exception opened, closed, or re-approved; re-affirmations are Phase 3 gate business.

**v0.2 (2026-08-15, Phase 2 review):** EXC-001, 002, 003 re-affirmed; no exit trigger fired; no exception opened or closed. EXC-003 carries a dated re-affirmation note.

An exception is a recorded, bounded deviation from a stated policy or control — with compensating controls and a defined exit. An unrecorded deviation is not an exception; it is a finding.

---

## Entry schema

| Field | Meaning |
|---|---|
| `id` | `EXC-###`, stable |
| `deviation` | What rule is not being met, referencing the KAR-CTL or policy section |
| `reason` | Why, honestly |
| `compensating controls` | What limits the exposure meanwhile |
| `risk link` | KAR-RSK ID carrying the residual |
| `approved by` | Role (Platform Owner for High/Critical residuals) |
| `opened` | Date |
| `exit` | The trigger or date at which the exception must close or be re-approved |
| `status` | `OPEN` · `CLOSED` (with closing event) |

## Open exceptions

### EXC-001 — Single-person approval of pull requests

| | |
|---|---|
| Deviation | KAR-CTL-017 (independent review of every change) and change-management-policy §R4: author and approver are currently the same person |
| Reason | One maintainer exists; requiring a second human approval would block all work |
| Compensating controls | Merge-blocking CI as the mechanical reviewer (KAR-CTL-016); architecture tests failing on structural violations (020 — **still 24 active checks at Phase 4, self-test 56/56, with none newly activated**); an **independent-reviewer-agent step** in the phase process, whose findings are addressed before phase close; per-gate review of merged changes. **Corrected at Phase 4 rather than repeated: the mechanical half of this compensation did not keep pace with the surface it compensates for.** The architecture runner scans TypeScript and **reaches none of the Dart client**, whose structural rules are a separate scan (KAR-CTL-094); three of the five CI lanes this phase added are **not required checks**, so the artifact assertions cannot block a merge (KAR-CTL-113, KAR-RSK-037); and the register-integrity sweep scheduled into the runner for Phase 4 was not added (KAR-CTL-116). The compensating controls are weaker relative to the risk than this row previously implied, and that is stated here rather than discovered at a later gate |
| Risk link | KAR-RSK-002 |
| Approved by | Platform Owner |
| Opened | 2026-08-15 |
| Exit | Team reaches 2 engineers — human review becomes mandatory and this exception closes at the following gate |
| Status | OPEN |
| Re-affirmed | **2026-08-18 (Phase 4): OPEN, unchanged, no exit trigger fired — the engineering team is still one person.** Restated because Phase 4 was delivered by **eleven** parallel agent workstreams with a reviewer among them, which is more parallelism than any previous phase and **still not separation of duties**: they are technical divisions of labour directed by one maintainer, and every one of them, along with the review of all of them, resolves to the same person. Two Phase 4 facts sharpen the point rather than soften it. First, **the independent review is not final** (EV-461 PENDING), so this phase does not yet have even the maintainer-directed technical review earlier phases recorded. Second, **the phase's own record is the argument for this exception**: three defects passed every static form of review it ran — an invalid hardening resource only the release build path rejects, a navigation dead end whose every unit assertion was individually correct, and a lockfile check that proved a host appeared rather than that it was the only one — and were found by assembling the artifact, pressing the control, and asserting exclusivity. One reviewer, however careful, is what that record describes. The exit trigger remains a second *engineer*, not a second agent. · 2026-08-16 (Phase 3.5): OPEN, unchanged, no exit trigger fired. **Stated explicitly because Phase 3.5 was delivered by several parallel agent workstreams with a reviewer among them, and that is not separation of duties.** The workstreams are technical divisions of labour directed by one maintainer; every one of them, and the review of all of them, resolves to the same person. All review recorded anywhere in this corpus — including the independent-reviewer step, the suppression reviews, and the gate records — is **maintainer-directed technical review**, not organizational separation of duties and not independent human review. The exit trigger remains a second *engineer*, not a second agent |

### EXC-002 — No certificate pinning in v1

| | |
|---|---|
| Deviation | Transport hardening beyond platform trust stores (mobile client) is not implemented in v1 |
| Reason | Accepted risk carried from the threat model (§4, challenge C11), retained from Plan v1; pinning's operational failure modes (bricked clients on rotation) were judged worse than the marginal gain at this scale |
| Compensating controls | TLS everywhere; token lifetimes short with server-side revocation — delivered as code at Phase 3, 2026-08-16 (KAR-CTL-067, 068, IMPLEMENTED [P3]: minimal ES256 access tokens with token-version invalidation, rotating refresh families with reuse detection); refreshed 2026-08-16 (Phase 3.5): a tenant switch now revokes the session **and its refresh family** atomically before issuing the replacement, so an intercepted token's useful life is bounded by the switch as well as by expiry and reuse detection (KAR-CTL-091). **Refreshed again 2026-08-18 (Phase 4), and the last clause of this row stopped being a promise:** *no sensitive value cached client-side beyond design rules* is now enforced code — one namespaced secure entry holding the tokens, expiries, and session id, with `first_unlock_this_device` on iOS and macOS keeping it out of iCloud Keychain and off restored backups and reset-on-error on Android, a separate preferences store that **refuses a credential-shaped key at construction**, and only key names reaching logs (KAR-CTL-097). Added at Phase 4: single-flight refresh over a separate raw transport with terminal failures wiping the credential (KAR-CTL-099), URIs logged with every query **value** replaced and generated DTOs printing type names only, and **no shipped artifact carrying a transport exception** — the iOS localhost exception exists only in a Debug plus LOCAL packaged bundle, and arbitrary loads fail the build in every configuration (KAR-CTL-108) |
| Risk link | KAR-RSK-013 (ACCEPTED) |
| Approved by | Platform Owner |
| Opened | 2026-08-15 (formalizing the existing threat-model acceptance) |
| Exit | Revisit at Phase 4 (Flutter network layer) and re-approve or supersede at Phase 20. **The Phase 4 revisit is done** — see the re-affirmation below — so the remaining exit is the Phase 20 re-approval or supersession |
| Status | OPEN |
| Re-affirmed | **2026-08-18 (Phase 4): revisited on this exception's own schedule, and the revisit changed a number rather than merely confirming a position.** The Flutter network layer exists, so what this exception exposes is no longer hypothetical: a real refresh token now lives in platform-backed storage on a device and is exchanged over a transport, which moved **KAR-RSK-013's impact 3 to 4 and its score 6 to 8 Moderate**. Likelihood stayed at 2 for a reason worth writing down — **no endpoint exists for any environment**, the only packages this repository can build are LOCAL ones, and there is no traffic to intercept; that argument expires the moment a DEV endpoint exists, and the risk row says so. **The acceptance stands on its original reasoning, unchanged:** pinning's operational failure mode is bricked clients on certificate rotation, and at this scale that remains the worse outcome. **No approval was given or renewed on the Platform Owner's behalf** — this is the recorded revisit the exit clause required, not a re-approval |

### EXC-003 — Local security scans are partial

| | |
|---|---|
| Deviation | Vulnerability-management-policy and secure-development-policy expect the security scan set to run before merge; locally, only a subset (lint, type checks, optional pre-commit secret scan) runs — the full set (SCA, secret scan, SBOM, architecture tests) executes only in CI |
| Reason | Keeping the local loop fast; duplicating every scanner locally costs more than it protects, given CI is merge-blocking |
| Compensating controls | CI runs the full set on every PR and blocks merge on the required checks (KAR-CTL-016, 020, 026, 027); KAR-CTL-025 (dependency audit) is currently report-only — the blocking dependency gate at the PR boundary is dependency-review (KAR-CTL-027). **Corrected 2026-08-18 (Phase 4): the phrase *blocks merge* is no longer true of the whole set, and re-affirming it as written would have been the error.** Three lanes that carry Phase 4 scans — `mobile-android` (unzipped-APK credential scan, merged-manifest comparison, release-assembly and unsigned-artifact assertions), `mobile-ios` (packaged-bundle transport and identity assertions), and `mobile-supply-chain` (a secret scan that is blocking **within its own job** plus report-only pub reporting) — **are not required status checks**, so each can be red on a mergeable pull request. The compensation therefore holds for the eight required checks and **not** for the artifact and mobile supply-chain evidence, which is exactly the evidence class this phase added because static inspection missed three defects. Tracked as KAR-CTL-113 (DESIGNED) and KAR-RSK-037, owner Engineering Owner, next branch-protection review |
| Risk link | KAR-RSK-004, KAR-RSK-005 (contributing condition) |
| Approved by | Security Owner |
| Opened | 2026-08-15 |
| Re-affirmed | 2026-08-15 (Phase 2): the local posture is unchanged — Phase 2 added platform unit/integration tests that do run locally against live PostgreSQL, but the security-scan set (SCA, secret scan, SBOM) still executes only in CI, which remains merge-blocking. Compensating controls unchanged; exception stands. 2026-08-16 (Phase 3.5): unchanged again. The local loop grew (full workspace suite, architecture runner, docs-check, format, and the Prisma mapping check all run locally) but the security-scan set is still CI-only, and CI is still merge-blocking. Exception stands. **2026-08-18 (Phase 4): the local posture is unchanged and the CI posture is not.** The local loop grew again — the full Flutter suite, the localization gate, the generated-client drift check, the architecture runner, docs-check, format, and the Prisma mapping check all run locally — while the security-scan set (SCA, secret scan, SBOM) is still CI-only. What changed is the compensating side rather than the deviation: **three of the lanes running those scans for the mobile surface do not gate a merge**, corrected in the compensating-controls row above and carried as KAR-RSK-037. The deviation itself is unamended and the exception stands |
| Exit | Re-evaluate when the team grows (more unmerged local work at risk) or if a merge-bypass path is ever discovered — the latter reopens this as a finding, not an exception |
| Status | OPEN |

## Closed exceptions

None yet.

**Phase 3 gate re-affirmation (2026-08-16):** EXC-001 OPEN (single maintainer; no exit trigger fired), EXC-002 compensating controls verified as delivered code, EXC-003 unchanged. Recorded in the Phase 3 gate record (phase-compliance-gate.md v0.4).

**Phase 3.5 re-affirmation (2026-08-16):** EXC-001 OPEN — single maintainer, no exit trigger fired, and the parallel agent workstreams of this phase are explicitly *not* the separation of duties the exception is about. EXC-002 OPEN with its compensating-control facts refreshed (switch-time refresh-family rotation). EXC-003 OPEN, unchanged. **No exception opened or closed**, and none was approved or re-approved on the Platform Owner's behalf. Confirmed against the Phase 3.5 residuals: none of them is a deviation from a stated control, so none of them became an exception.

**Phase 4 re-affirmation (2026-08-18) — a phase review, not a gate record.** All three exceptions re-read against the Phase 4 client, contract, and build deliverables. **All three OPEN. No exit trigger fired. No exception opened, closed, approved, or re-approved**, and nothing here was approved on the Platform Owner's behalf. EXC-001's exit trigger was checked specifically, because it is the one most likely to fire quietly, and the engineering team is still one person — eleven agent workstreams in a single phase is a larger number, not a different kind of thing. **Two rows were corrected rather than re-affirmed as written**, which is the substantive work at this version: EXC-001's compensating controls, because the mechanical reviewer does not reach the Dart client and three of the new lanes cannot block a merge; and EXC-003's, because the phrase "blocks merge" ceased to be true of the whole scan set. **EXC-002's Phase 4 revisit was performed on its own schedule** and re-scored KAR-RSK-013 from 6 to 8 Moderate with the acceptance standing. **Phase 4 is IN PROGRESS and no gate has executed**, so the gate half — verification of these re-affirmations at close — lands with the Phase 4 gate record, and none of this may be read as one.

**Phase 3.5 gate — executed 2026-08-16 (record in phase-compliance-gate.md v0.6).** The re-affirmation above was verified at the gate rather than assumed: all three exceptions re-read, **all three OPEN**, **no exit trigger fired**, and **no exception opened, closed, or re-approved at the gate**. EXC-001's exit trigger is checked specifically because it is the one most likely to fire quietly — the engineering team is still one person, so it has not. **Phase 3.5 is COMPLETE; Phase 4 is NOT STARTED**, and no exception's exit is scheduled against Phase 4.
