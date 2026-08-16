# Trust Services Mapping

**Status:** ACTIVE mapping view · **Owner:** Compliance Owner · **Version:** 0.4 · **Date:** 2026-08-16 · **Review:** every phase gate (mapping deltas per gate report §5)

**v0.4 (2026-08-16, Phase 3.5):** statuses re-quoted as of matrix v0.4; the Phase 3.5 controls (079–093, all I[P3.5]) mapped into CC6.x, CC7.x, CC8.1, CC9.2, C1.x, and the Privacy rows; gaps section extended with three new entries. **Four status forks corrected** after the Phase 3.5 independent review: KAR-CTL-004 quoted as `D` in CC1.2, CC3.4, and CC4.1–CC4.2 where the matrix now has it IMPLEMENTED, and KAR-CTL-016 quoted as `I[C1]` in CC8.1 where the matrix has it plain IMPLEMENTED. All 140 shorthand status pairs in this file were re-swept against the matrix; these four were the only disagreements, and all resolved toward the matrix.

**v0.3 (2026-08-16, Phase 3):** statuses re-quoted as of matrix v0.3 — KAR-CTL-010, 011, 049 now I[P3]; the Phase 3 controls (066–078) mapped into CC6.x, CC7.x, and the Privacy rows; gaps section updated.

Maps Karar controls to AICPA Trust Services Criteria identifiers. **Statuses are the [control matrix](../control-matrix.md)'s and are quoted here as of matrix v0.4 — the matrix is the source of truth; if this file and the matrix disagree, the matrix wins.** Criterion themes below are stated in Karar's own words, not the TSC text.

**No SOC 2 report exists, no examination has been performed, and no operating effectiveness is claimed anywhere in this file.** A Type II opinion rests on an observation window over an operating system; Karar has no system in operation, so what is mapped below is a control set with mechanisms, not a control set with a history.

Status shorthand: D = DESIGNED · I = IMPLEMENTED · I[C1] = implemented contingent on Phase-1 CI merge · I[P2] = implemented as Phase-2 code with tests run locally/CI, deployed nowhere · I[P3] = implemented as Phase-3 code with tests run locally against live PostgreSQL, deployed nowhere · I[P3.5] = implemented as Phase-3.5 code with tests executed locally against live PostgreSQL, deployed nowhere · DEF = DEFERRED(phase) · EXC = exception.

---

## Common criteria (Security)

| TSC | Theme (Karar wording) | Karar controls (status) | Notes |
|---|---|---|---|
| CC1.1 | Commitment to integrity via approved policies | KAR-CTL-001 (D) | 14 policies DRAFT; approval deferred at the Phase 2 gate to before the first non-local deployment |
| CC1.2 | Governance oversight of controls | KAR-CTL-002 (D), 004 (I) | No board exists; oversight = Platform Owner + recorded gates. Stated, not disguised. Three gate records now exist (Phases 1, 2, 3), which is why 004 reads IMPLEMENTED — but the reviewer and the reviewed are the same person (EXC-001), so this is recorded oversight, not independent oversight |
| CC1.3 | Structures, reporting lines, authorities | KAR-CTL-002 (D) | Role model + SoD triggers in control-owners.md |
| CC1.4 | Competence and its maintenance | KAR-CTL-002 (D) | Hiring-related practices activate at first hire (see SoA 6.1–6.6 PLANNED) |
| CC1.5 | Accountability for control responsibilities | KAR-CTL-002 (D), 005 (D) | Every control names an owner role; deviations to exceptions register |
| CC2.1 | Quality information for control operation | KAR-CTL-019 (I), 023 (I[C1]) | ADR corpus + docs checks |
| CC2.2 | Internal communication of objectives/responsibilities | KAR-CTL-019 (I), 023 (I[C1]), 001 (D) | Everything canonical in-repo is the communication mechanism at this size |
| CC2.3 | External communication, incl. reporting channels | KAR-CTL-006 (D), 043 (I) | Assurance-claim linkage; SECURITY.md intake |
| CC3.1–CC3.3 | Objectives set, risks identified and analysed, fraud considered | KAR-CTL-003 (D), 021 (D), 024 (D) | 5x5 methodology; threat-model-driven requirements; insider/fraud vectors are threat model T5 |
| CC3.4 | Changes that alter risk are assessed | KAR-CTL-003 (D), 004 (I) | Re-scoring at every phase gate is the mechanism, and it has run four times (EV-008 COLLECTED). 003 stays DESIGNED because its independence leg does not hold |
| CC4.1–CC4.2 | Controls are evaluated and deficiencies reported | KAR-CTL-004 (I), 014 (D) | Phase gates evaluate controls and their records exist. **Access reviews did not happen** — 014's claim was aspirational until the Phase 3.5 review caught it, and the gate report now carries a standing access-review section so it starts. Deficiency *reporting* now has a log too: the Clause 10 nonconformity register was empty across three gates and is backfilled (`../iso27001/continual-improvement.md`). Independent evaluation remains limited by EXC-001 until the team grows |
| CC5.1–CC5.3 | Control activities selected, deployed via policy | KAR-CTL-001 (D), 005 (D) + the matrix itself | The matrix is the deployment record |
| CC6.1 | Logical access restricted by design | KAR-CTL-007 (I), 008 (I), 009 (D), 010 (I[P3]), 011 (I[P3]), 012 (DEF 13), 013 (DEF 8/20), 033 (I[P2]), 036 (D), 052 (I[P2]), 053 (I[P2]), 066–072, 074 (I[P3]), 085, 086, 087, 088, 089, 091, 092 (I[P3.5]) | Layered model: `docs/security/access-control.md`. Phase 2 added the first enforced non-SCM access boundary (DML-only `karar_app` vs schema-owning `karar_migrator`); Phase 3 added application identity and tenancy isolation as tested code; Phase 3.5 adds the layer above them — what a deployment may offer whom, resolved through eight deny-by-default gates over a compile-time ceiling that configuration cannot widen, with the session's tenant binding itself sourced server-side. Nothing operates in any environment, and **no capability resolves available anywhere** |
| CC6.2 | Credentials issued/deprovisioned with authorization | KAR-CTL-007 (I), 014 (D), 013 (DEF), 068 (I[P3]), 073 (I[P3]), 074 (I[P3]), 088, 091 (I[P3.5]) | Trivial staff population today; the review still happens. Application-side issuance/revocation now exists as code: sessions revocable server-side, peer-gated role assignment, redeemer-bound invitations. Phase 3.5 adds tenant-scoped entitlement grant and revocation (revocation as a status with an append-only history, never a deleted row) and session rebinding that revokes the prior session and its refresh family atomically |
| CC6.3 | Access modification/removal, least privilege | KAR-CTL-009 (D), 014 (D), 013 (DEF), 053 (I[P2]), 071 (I[P3]), 072 (I[P3]), 073 (I[P3]), 079, 088, 091, 093 (I[P3.5]) | Database roles carry no SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE; RBAC denies by default against a closed catalogue with audited revocations. Phase 3.5 extends least privilege to the new tables by **withholding**: no `karar_app` write grant on the country, jurisdiction, or settings registers, and all four new permissions unseeded, so every mutating use case in these modules refuses today |
| CC6.4 | Physical access to facilities | — | No facilities exist; inherited from cloud provider at Phase 17+ (shared-responsibility model). Endpoint physical care: acceptable-use policy |
| CC6.5 | Disposal of assets/data | KAR-CTL-037 (DEF 5), asset-inventory rule 3, AUP §R7 | |
| CC6.6 | Defenses at the boundary against external actors | KAR-CTL-010 (I[P3]), 070 (I[P3]), 075 (I[P3]), 032 (DEF 17+), 081, 087 (I[P3.5]) | No deployed boundary exists yet; Phase 3 delivers its mechanisms as tested code — fail-closed pre-auth rate limits, ledger-derived lockout, trusted-proxy discipline, restrict-only kill switches (guard mounting verified at the Phase 3 gate, KAR-RSK-019). Phase 3.5 adds an environment boundary of a different kind: an unapproved policy pack cannot become operative outside `local`, and every capability gate denies by default — though the environment predicate reads the process's own configuration, so a mislabelled deployment would defeat it (KAR-RSK-023) |
| CC6.7 | Data protected in movement and on media | KAR-CTL-032 (DEF 17+), 034 (DEF), 036 (D), 064 (D), 069 (I[P3]) | Classification matrix defines in-transit rules; key-custody contracts are design-only, no key operations exist. MFA secrets encrypt through the `EncryptionProvider` seam under the local-only dev provider — custody unchanged, deliberately not advanced |
| CC6.8 | Unauthorized/malicious software prevented | KAR-CTL-028 (I[C1]), AUP §R5 | Pinning + reviewed updates are the current surface's realistic malware control |
| CC7.1 | Vulnerabilities and misconfigurations detected | KAR-CTL-025 (D — scan runs, report-only), 026 (I[C1]), 027 (I[C1]), 029 (I[C1]), 020 (I[C1]), 051 (I[P2]), 062 (I[P2]) | 025's blocking threshold is the open piece. Phase 2 adds misconfiguration detection at boot (fail-fast typed config) and truthful readiness |
| CC7.2 | Anomalies monitored and evaluated | KAR-CTL-041 (DEF 20), 039 (DEF 8 half), 040 (I[P2]), 056 (I[P2]), 057 (I[P2]), 058 (I[P2] — lag/DLQ metrics), 062 (I[P2]), 063 (I[P2]), 065 (D), 077 (I[P3]), 082, 083, 084 (I[P3.5]) | 2026-08-15: no longer empty — the audit trail, redacting telemetry, readiness, and queue metrics exist as tested code. 2026-08-16: the security-event ledger and audited authorization/kill-switch/consent trails widen the signal set; Phase 3.5 adds the pack-activation ledger, the two trigger-written entitlement/availability history tables, resolution provenance pins, and the legal-consequence pin block. **Still not monitoring:** nothing runs continuously and nothing alerts or pages (KAR-RSK-003); more tamper-evident records with nobody reading them is a wider record, not a wider control |
| CC7.3 | Security events evaluated and declared | KAR-CTL-042 (D), 043 (I), 077 (I[P3]) | Recording exists as code; evaluation is human-per-gate until monitoring lands |
| CC7.4 | Incidents responded to per program | KAR-CTL-042 (D), 075 (I[P3]) | Policy DRAFT; untested — no operations. Restrict-only kill switches exist as containment levers, mounted at phase integration (Phase 3 gate item 3) |
| CC7.5 | Recovery from incidents | KAR-CTL-042 (D), 045 (DEF 20) | |
| CC8.1 | Changes authorized, tested, approved, deployed controlled | KAR-CTL-015 (I), 016 (I), 017 (EXC), 018 (DEF 19), 019 (I), 020 (I[C1]), 031 (D), 054 (I[P2]), 055 (I[P2]), 080, 081, 085, 086, 093 (I[P3.5]) | EXC-001 is the material qualification on "approved" and it has not moved. Phase 2 extended change control to the schema: checksum-verified forward-only migrations, drift detection, destructive-op double guard. Phase 3.5 extends it to **policy**: packs and capability descriptors are reviewed code rather than rows, the registers and settings have no runtime write path, and unseeded permissions mean no operator can change any of it — so a policy change is necessarily a diff. Domain and DNS changes come under the same discipline by runbook rule rather than by mechanism |
| CC9.1 | Disruption risk mitigations | KAR-CTL-003 (D), 045 (DEF 20), 046 (D) | |
| CC9.2 | Vendor and business-partner risk managed | KAR-CTL-047 (D), 048 (DEF 20) | Register live; DPAs gated on personal data existing. 2026-08-16: Cloudflare added, scoped narrowly to registrar and authoritative DNS and explicitly **not** classified as a financial-data processor or subprocessor, with the five conditions that would change that classification written down — the first of which (enabling proxy/CDN/WAF) requires a DPA *before* the switch is flipped. The vendor's own security baseline is recorded TO_VERIFY, not assumed (EV-427, PENDING) |

## Availability

| TSC | Theme | Karar controls (status) |
|---|---|---|
| A1.1 | Capacity planned and monitored | KAR-CTL-030 (DEF 17–19), 041 (DEF 20) |
| A1.2 | Environmental/backup/recovery infrastructure in place | KAR-CTL-044 (DEF 17/20), 045 (DEF 20), 046 (D), 035 (DEF 13/20) |
| A1.3 | Recovery procedures tested | KAR-CTL-044 (DEF), 045 (DEF) — RTO must be **measured**, per Phase 20 gate |

## Processing Integrity

| TSC | Theme | Karar controls (status) |
|---|---|---|
| PI1.1 | Data/processing definitions support correct outputs | KAR-CTL-020 (I[C1]) — no-float money-path test; 021 (D); 058, 059, 060 (I[P2]) — transactional outbox with exactly-once-marked publication, leased idempotent jobs, receipt-based consumer idempotency |
| PI1.2–PI1.3 | Inputs and processing complete, accurate, timely | Deferred to the financial engine (Phase 6: `VerifiedFinancialFacts`, exhaustive calculator tests) and ingestion resource limits (threat model T7, architecture test 24). Phase 2's contribution: at-least-once delivery made safe by idempotency (KAR-CTL-060, I[P2]) — completeness plumbing, not content accuracy |
| PI1.4–PI1.5 | Outputs and stored items complete/accurate | Deferred: Phase 6 engine + Phase 5 provenance/dedup; staging passage for financial rules (KAR-CTL-018, DEF 19) |

Processing-integrity evidence for **financial content** begins to exist at Phases 5–6. As of Phase 2 (2026-08-15) the platform carries structural PI mechanisms — no event silently lost or double-applied, no job double-executed under concurrency (proven at 2 relays × 200 events, 2 workers × 100 jobs) — which is delivery integrity, not correctness of any business calculation, and is claimed as nothing more.

## Confidentiality

| TSC | Theme | Karar controls (status) |
|---|---|---|
| C1.1 | Confidential information identified and protected | KAR-CTL-033 (I[P2]), 034 (DEF), 012 (DEF 13), 038 (I), 040 (I[P2]), 057 (I[P2]), 061 (I[P2]), 063 (I[P2]), 084, 089, 090, 092 (I[P3.5]) — Phase 3.5's contribution is a CONFIDENTIAL class of data that did not exist before (the subject's own policy election, dual-GUC RLS'd, event-free, reader-free beyond the subject, audited by reference only) plus two client-facing omission boundaries |
| C1.2 | Confidential information disposed of when no longer needed | KAR-CTL-037 (DEF 5), 050 (DEF 5/16) — every Phase 2 and Phase 3 table declares retention and erasure (`packages/platform/db/DATA_LIFECYCLE.md`); the executing retention job is later-phase. 2026-08-16: Phase 3.5 turned the retention *placeholders* into typed PolicyPack slots, and `qa/v1` fills every one with an explicit `PENDING_LEGAL_REVIEW` — **no period was decided and no disposal mechanism was built**. Several Phase 3.5 records are deliberately never disposed of: append-only ledgers and immutable evidence rows are supersession-and-history by design (KAR-CTL-082, 088, 090) |

The `SEALED` class exceeds typical confidentiality commitments — confidential against the operator itself (ADR-0017); its controls are the ones most rigorously gated (Phase 20).

## Privacy

| TSC | Theme | Karar controls (status) |
|---|---|---|
| P1 | Notice of privacy practices | KAR-CTL-006 (D), 049 (I[P3]), 080 (I[P3.5]) — notice-vs-system reconciliation is the anti-P1 control; legal-document versioning with classification-gated publication exists as code, and a pack's disclosure obligations are now a typed slot that must carry a decision or an explicit pending state. `qa/v1`'s disclosure policy is `PENDING_LEGAL_REVIEW`, so **no notice content is decided for any jurisdiction** |
| P2 | Choice and consent | KAR-CTL-049 (I[P3]), 076 (I[P3]), 080, 084, 090 (I[P3.5]) — fail-closed gates, reviewed re-consent classification with no default, immutable entity/jurisdiction-pinned grants (ADR-0024). 2026-08-16: the **mechanism** for "which purposes legally require consent per jurisdiction" landed as typed pack slots, and consent grants now pin the pack version that produced them as a value/state pair; the subject's own elective choices are recorded as immutable, restrict-only, CONFIDENTIAL selections. **No pack decides any of it** — `qa/v1` carries every consent and processing-basis slot as `PENDING_LEGAL_REVIEW`, and the basis-reference table still fails closed |
| P3 | Collection limited to purpose | KAR-CTL-024 (D), 038 (I), 079, 090 (I[P3.5]) — jurisdiction assignment carries only source and verification (no location trail), and subject policy selections carry a pack-bounded option reference rather than capability content |
| P4 | Use, retention, disposal per commitments | KAR-CTL-037 (DEF 5), 050 (DEF 5/16) — ADR-0026 declarations; Phase 3.5's retention slots are declared unknowns awaiting legal review, not commitments |
| P5 | Subject access (export) | KAR-CTL-050 (DEF 16) — export reconciles with declared treatments |
| P6 | Third-party disclosure controlled | KAR-CTL-047 (D), 048 (DEF 20), 089, 092 (I[P3.5]) — the only outward disclosure surface that exists is the authenticated bootstrap response, and it is a closed field set that omits hidden capabilities and non-actionable reasons entirely |
| P7 | Data quality | Deferred — provenance/dedup at Phase 5 |
| P8 | Complaint handling and enforcement | KAR-CTL-043 (I), 042 (D) — consumer-facing privacy channel arrives with Phase 16 privacy flows |

**The Privacy category currently has almost no operating substance because no personal data is processed at all (KAR-CTL-038)** — which is itself the strongest privacy fact available at Phase 1.

## Gaps this mapping makes visible

1. **CC7.2 has signals but no monitoring** (updated 2026-08-15): Phase 2 delivered the emitting half — audit trail, redacting telemetry, queue and readiness metrics — but nothing runs continuously, and alerting/on-call remain Phase 20 (KAR-RSK-003). The gap narrowed; it did not close. Phase 3 widened the signal set (security-event ledger, kill-switch history) without changing this.
2. **CC8.1's approval leg rests on EXC-001** — the mechanical gates are real; independent human approval is not, yet.
3. **A1/PI evidence cannot exist before Phases 5–6/17–20** — the observation window starts after those, not before. Phase 2's delivery-integrity tests are design proof, not window evidence.
4. **CC6.7/8.24-adjacent cryptography is design-only** (2026-08-15): custody and canary contracts exist (KAR-CTL-064, 065, DESIGNED); nothing encrypts production data because none exists. Phase 3's MFA-secret encryption runs only under the local-only dev provider, which refuses to construct outside local (KAR-CTL-078).
5. **CC6.6's boundary is code, not a deployment** (2026-08-16): rate limits, lockout, and kill switches exist as tested mechanisms, but no boundary is deployed anywhere, and kill-switch guard mounting on routes is a Phase 3 gate verification (KAR-RSK-019), not a present claim.
6. **The Phase 3.5 access controls are proven against nothing that exists** (2026-08-16): every capability in the registry is `NOT_IMPLEMENTED` and deployed nowhere, and `qa/v1` clears none, so gate 1 denies all seven before any later gate is reached and the positive paths are exercised only over synthetic registries and packs. The gates' behaviour on a genuinely built, genuinely cleared capability is proven by construction and by test — **never by production traffic**, because there is none. This is the largest single caveat on CC6.1 and CC6.3 at this phase.
7. **Register hygiene was itself a gap, and CC4.2 is where it shows** (2026-08-16): across three closed gates, the Clause 10 nonconformity log stayed empty while two reviews produced findings, twenty-two evidence-status citations in the control matrix went stale, vendor review dates lapsed unraised, and an access review the control set claims happens every gate never happened once. All are now logged (`../iso27001/continual-improvement.md` CI-001…CI-006) and fixed forward. An examiner should read this as the honest shape of a young single-maintainer system: the controls exist, and the *checking* of the controls is the part that had no independent check.
8. **The Privacy category's new mechanisms hold no decisions** (2026-08-16): P1, P2, and P4 now have somewhere for a legal determination to live, and every such slot for the one drafted jurisdiction reads `PENDING_LEGAL_REVIEW`. Building the container is not filling it, and an examiner reading this mapping should read "the mechanism exists" as exactly that. No legal review has been performed, and no policy pack has been approved by anyone.
