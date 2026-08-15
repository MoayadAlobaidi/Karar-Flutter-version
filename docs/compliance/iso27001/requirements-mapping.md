# ISO/IEC 27001:2022 Clauses 4–10 — Mapping to Karar Artefacts

**Status:** DRAFT · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

Where each management-system requirement area is satisfied — or will be, with the phase named. Clause numbers are identifiers; the descriptions are Karar's own words. Statuses reflect the same honesty as the [control matrix](../control-matrix.md): a young system, mostly designed, nothing certified.

---

| Clause | Requirement area (Karar wording) | Satisfied by | State |
|---|---|---|---|
| 4.1 | Understand the organization and its internal/external issues (incl. climate per Amd 1:2024) | [isms-scope.md](isms-scope.md) §Context; risk register for the issue list | Written; revisited each gate |
| 4.2 | Identify interested parties and their requirements | isms-scope §Context; roadmap non-engineering gates (legal, Sharia, regulator) | Written; legal parties not yet engaged |
| 4.3 | Determine ISMS scope | isms-scope §Scope statement + exclusions | Written; widens by amendment at 17/20 |
| 4.4 | Establish and maintain the ISMS and its processes | This directory as a whole; [phase-compliance-gate.md](../phase-compliance-gate.md) as the operating rhythm | Skeleton established; first cycle is the Phase 1 gate |
| 5.1 | Leadership commitment | Platform Owner approval duty over policies, accepted risks, and gates ([control-owners.md](../control-owners.md)) | Structure defined; approvals pending (policies DRAFT) |
| 5.2 | An information security policy | [information-security-policy.md](../../policies/information-security-policy.md) (the apex policy) | DRAFT, approval at Phase 2 gate |
| 5.3 | Roles, responsibilities, authorities | control-owners.md — six roles, single-person reality, SoD triggers | Written |
| 6.1.1–6.1.2 | Risk assessment process | [risk-methodology.md](../risk-methodology.md) (5x5, appetite, cadence) | Written; first recorded review = EV-008 at Phase 1 gate |
| 6.1.3 | Risk treatment and the Statement of Applicability | [treatment-plan.md](../treatment-plan.md); [statement-of-applicability.md](statement-of-applicability.md) | Written; SoA v0.1 covers all 93 Annex A controls |
| 6.2 | Security objectives and planning | Phase gates as objective checkpoints; roadmap phase gates as the measurable plan | Operating informally via roadmap; formalized per gate report §8 |
| 6.3 | Planned changes to the ISMS | Change-management-policy applied to `docs/compliance/**` itself (changes via PR) | Written |
| 7.1–7.2 | Resources and competence | Solo reality recorded (KAR-RSK-001); onboarding doc `docs/onboarding/developer.md`; hiring-linked controls PLANNED (SoA 6.1–6.6) | Honest gap until team grows |
| 7.3 | Awareness | Policies + CONTRIBUTING as the awareness surface; acknowledgment at first hire (acceptable-use-policy §R9) | Written; trivially satisfied solo |
| 7.4 | Communication | In-repo canonical docs; SECURITY.md external channel; gate reports | Written |
| 7.5 | Documented information — creation, control | Docs conventions + CI docs checks (KAR-CTL-023); PR-controlled changes; version blocks on policies/registers | Tooling lands Phase 1 CI |
| 8.1 | Operational planning and control | Secure-development, change-management policies; CONTRIBUTING CI rules; MODULE.md intake (KAR-CTL-024) | Designed; enforcement accretes from Phase 1 CI |
| 8.2–8.3 | Risk assessments performed; treatments implemented | Per-gate register review (EV-008); treatment plan execution tracked per phase | First cycle pending |
| 9.1 | Monitoring, measurement, analysis | Phase gate report §§1–2 (control status + evidence deltas); later: runtime monitoring (KAR-CTL-041, Phase 20) | Designed |
| 9.2 | Internal audit | **Gap, stated:** no independent internal auditor exists (EXC-001 reality). Interim: independent-reviewer-agent findings per phase + the gate's structured self-review. A genuine internal-audit function is a certification precondition — planned no earlier than the ≥5 SoD trigger | Open gap, recorded |
| 9.3 | Management review | Phase gate report reviewed and signed by Platform Owner (gate §7 residual-risk statement is the review's core input) | Designed; first at Phase 1 close |
| 10.1 | Continual improvement | [continual-improvement.md](continual-improvement.md) improvement loop | Log established (zero entries) |
| 10.2 | Nonconformity and corrective action | Same log — NC/CA schema with per-gate review | Log established (zero entries) |

## Reading this honestly

Three structural facts an auditor would find, so they are stated first here: **(1)** internal audit (9.2) does not independently exist yet and cannot while one person holds all roles; **(2)** management review (9.3) and leadership (5.1) collapse into the same person — the gate structure gives the review form, not independence; **(3)** the ISMS has not completed one full Plan-Do-Check-Act cycle — the first check arrives with the Phase 1 gate. None of these are disqualifying for readiness work; all of them would be findings against a certification claim, which is one more reason no such claim is made.
