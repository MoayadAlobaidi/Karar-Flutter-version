# Risk Register

**Status:** ACTIVE register · **Owner:** Security Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate (EV-008)

Scored per [risk-methodology.md](risk-methodology.md) — residual, with current gates and compensating controls in place, over a horizon of the next two phases. Treatments and target phases are expanded in the [treatment plan](treatment-plan.md).

---

## Open risks

| ID | Risk | Category | L | I | Score | Treatment | Owner | Target phase | Status |
|---|---|---|---|---|---|---|---|---|---|
| KAR-RSK-001 | **Key-person concentration.** One person holds every role, credential, and unwritten context; incapacity stalls the project and could strand accounts and evidence | Governance | 3 | 5 | 15 High | MITIGATE — documentation-first discipline (everything canonical in-repo), credential recovery paths verified, role structure ready for handover; residual ACCEPTED until team growth | Platform Owner | SoD trigger (≥3 eng) | OPEN |
| KAR-RSK-002 | **No independent review of security-relevant changes.** Author and approver are the same person; a reasoning error survives to merge | Change management | 4 | 3 | 12 High | MITIGATE — EXC-001 compensating controls: merge-blocking CI, architecture tests, independent-reviewer-agent step in the phase process | Engineering Owner | Team ≥ 2 | OPEN |
| KAR-RSK-003 | **No monitoring or alerting pre-production.** Defects, misconfigurations, or CI compromise would be discovered by inspection, not detection | Operations | 3 | 3 | 9 Moderate | ACCEPT until runtime exists; monitoring lands with environments, on-call is a Phase 20 gate (KAR-CTL-041) | Operations Owner | 17–20 | OPEN |
| KAR-RSK-004 | **Supply-chain compromise** via npm, pub.dev, Docker Hub, or a base image — malicious package, typosquat, or poisoned update entering the toolchain | Supply chain | 3 | 4 | 12 High | MITIGATE — lockfile pinning, reviewed updates, SCA, SBOM, secret-scanned CI (KAR-CTL-025–028); digest pinning to verify at Phase 1 gate | Security Owner | 1 ongoing | OPEN |
| KAR-RSK-005 | **Secret leakage via CI misconfiguration** — over-scoped tokens, secrets echoed into logs, or workflow injection from untrusted input | CI / secrets | 3 | 4 | 12 High | MITIGATE — least-privilege CI credentials (KAR-CTL-009), secret scanning (026), secrets-handling rules (036); workflow review at Phase 1 gate | Security Owner | 1 ongoing | OPEN |
| KAR-RSK-006 | **Data residency undetermined.** Where customer data may lawfully live and flow is an open legal question; a late adverse answer reshapes architecture and vendors | Legal / regulatory | 3 | 4 | 12 High | MITIGATE — provider-portable design (DeploymentProfile, jurisdiction-scoped KEKs) keeps answers cheap; legal opinion is a Phase 20 gate; no residency claim is made (AC-015) | Platform Owner (legal counsel pending) | 20 | OPEN |
| KAR-RSK-007 | **Zakat Sharia review absent.** No Sharia scholar has reviewed the Zakat methodology; outputs could be religiously incorrect or be mistaken for a fatwa | Legal / Sharia | 2 | 4 | 8 Moderate | MITIGATE — external review gates Zakat launch (roadmap non-engineering gate); outputs never represented as a fatwa (AC-010) | Platform Owner (external reviewer pending) | 9 launch gate | OPEN |
| KAR-RSK-008 | **Amanat legal clearance absent.** The sealed-obligation product has no per-jurisdiction legal clearance; building it before clearance risks rework or non-launch | Legal | 2 | 5 | 10 High | MITIGATE — Phase 14 gated on clearance; ships `PENDING_LEGAL_REVIEW` until cleared; disclosure-not-access model documented for counsel | Platform Owner (legal counsel pending) | 14 gate | OPEN |
| KAR-RSK-009 | **Sealed-data key custody unimplemented until Phases 13/20.** Between sealed-vault build and custody approval, the ENC-2 failure class (irrecoverable, undetectable key loss) exists as a design risk | Data protection | 2 | 5 | 10 High | MITIGATE — hard gates: approved `KeyCustodyStrategy` and running canary before any production `SEALED` data (KAR-CTL-035, ADR-0017); rotation designed in from Phase 2 | Security Owner | 13, 20 | OPEN |
| KAR-RSK-010 | **Documentation drift.** The docs corpus is large and precedes the code; published promises can diverge from what gets built — the legacy's most consequential finding class (P1) | Documentation | 4 | 3 | 12 High | MITIGATE — Assurance Claim Registry linkage (KAR-CTL-006), architecture test 26 from Phase 2, docs checks in CI (023), phase-gate reconciliation | Compliance Owner | 2 onward | OPEN |
| KAR-RSK-011 | **GitHub as single point of dependence** — SCM, CI, and interim evidence store in one vendor account; suspension or compromise halts delivery and could orphan evidence | Vendor / availability | 2 | 4 | 8 Moderate | MITIGATE — full-clone recoverability (KAR-CTL-046), per-phase evidence export, evidence-store decision by Phase 2 gate | Operations Owner | 2 | OPEN |
| KAR-RSK-012 | **Accidental content in git history.** Files not meant for the repository can be committed and persist in history; one benign incident predates Phase 1 (`Archive.zip`, present in git history at commit `cc9b0d7`; untracked and git-ignored as of Phase 1) | Data hygiene | 3 | 3 | 9 Moderate | MITIGATE — secret scanning (026), synthetic-data rule (038), `.gitignore` discipline, repo-hygiene check at each phase gate; disposition recorded at Phase 1 close: history deliberately not rewritten, file untracked and ignored | Engineering Owner | 1 close | OPEN |
| KAR-RSK-013 | **No certificate pinning in v1.** Mobile clients rely on platform trust stores; a compromised CA or intercepting proxy is not additionally defended against | Mobile security | 2 | 3 | 6 Moderate | ACCEPT — carried from threat model §4 (challenge C11); recorded as EXC-002; revisit at Phase 4 and again pre-launch | Platform Owner | revisit 4, 20 | ACCEPTED |

## Notes

- **KAR-RSK-012:** the archive incident involved no secrets or personal data as far as inspection shows; it is recorded because the *mechanism* (accidental commit, permanent history) is the risk, and pre-production is the cheap time to fix the habit. This register does not itself remove the file; that action belongs to the Platform Owner at Phase 1 close.
- Risks 006, 007, 008 are **not engineering-closable** — their treatments are legal/external engagements the roadmap already names as non-engineering gates.
- Nothing here is scored against a production environment, because none exists; Phase 17/19/20 gates force rescoring at each step onto real infrastructure.

## Closed risks

None yet.
