# Phase 1 — Foundation

**Branch:** `claude/karar-v2-phase-1-foundation` · **Started:** 15 August 2026 · **Status:** in progress
**Roadmap row:** [`../roadmap.md`](../roadmap.md) Phase 1 — monorepo, tooling, Compose, CI, architecture tests, docs; Terraform `deployments/qa/{dev,staging,production}` compositions.

Verification sections (Tests executed, Build results, Evidence produced) were filled by the phase lead after running the commands — they record executed results, never intentions.

---

## Objective

Turn the approved Phase 0/0.5 architecture into an executable foundation: a working monorepo with tooling, local infrastructure, CI, the architecture-test harness, the compliance readiness framework, and the human-facing documentation layer — with no product capability implemented.

## Scope

- Executable monorepo: workspace configuration across `apps/`, `packages/`, `modules/`; pinned toolchain (`.tool-versions`); `Makefile` entry points (`doctor`, `bootstrap`, `dev`, `verify`, `help`, and supporting targets).
- Local infrastructure via Docker Compose: `postgres`, `redis`, `minio`, `otel-collector` — zero cloud dependency.
- CI: merge-blocking workflows under `.github/workflows/` — lint, type-check, tests, architecture tests, security scans, SBOM.
- Architecture-test registry: the 26 tests of [`../testing/architecture-tests.md`](../testing/architecture-tests.md) registered with per-test activation phases; tests whose guarded structure does not yet exist are registered but inactive.
- Terraform structure: `infra/terraform` contracts/providers/deployments layout with `deployments/qa/{dev,staging,production}` compositions — structure only, nothing provisioned.
- Compliance foundation: `docs/compliance/` (control matrix, evidence register, phase compliance gate) and `docs/policies/`.
- Documentation layer: root `README.md` rewrite, `CONTRIBUTING.md` update, PR template, documentation style guide, phase-report system (this directory), onboarding updates.

## Out of scope

- Any product capability — no budgets, transactions, Zakat, AI, or any consumer feature.
- Database schema and migrations (Phase 2), RLS (Phase 3), identity and tenancy (Phase 3).
- Cloud provisioning of any kind; every non-local row of the [country deployment matrix](../architecture/country-deployment-matrix.md) remains a decision not yet made.
- Flutter feature work; the mobile app is bootstrap-level only, and native iOS/Android builds are not exercised in Phase 1 CI.
- Any provider adapter beyond local/mock implementations.

## Agent/workstream ownership

| Workstream | Owner | Responsibility |
|---|---|---|
| Lead | Phase lead | Integration, verification runs, phase gates, final merge |
| Workspace | Workspace agent | Monorepo tooling, Makefile, Compose, `.tool-versions`, app/package scaffolding |
| Architecture enforcement | Architecture-enforcement agent | Architecture-test harness, test registry with activation phases |
| CI / supply chain | CI–supply-chain agent | Workflows, required checks, scans, SBOM, merge blocking |
| Security & compliance | Security-compliance agent | `docs/compliance/`, `docs/policies/`, control matrix, evidence register, phase compliance gate |
| Documentation | Documentation agent | Root README, CONTRIBUTING, PR template, style guide, phase reports, onboarding |
| Independent review | Independent reviewer | Reviews the integrated result without having built it |

All workstreams currently resolve to a single maintainer directing agent workstreams — see Known limitations.

## Deliverables

| Deliverable | Location |
|---|---|
| Workspace configuration and toolchain pins | repository root, `.tool-versions` |
| Make targets (`doctor`, `bootstrap`, `dev`, `verify`, `help`) | `Makefile` |
| Local infra composition (postgres, redis, minio, otel-collector) | `docker-compose.yml` |
| CI workflows and required checks | `.github/workflows/` |
| Architecture-test harness + registry (26 tests, activation phases) | test tooling + [`../testing/architecture-tests.md`](../testing/architecture-tests.md) |
| Terraform compositions `qa/{dev,staging,production}` | `infra/terraform/` |
| Compliance framework (control matrix, evidence register, phase gate) | [`../compliance/`](../compliance/README.md), [`../policies/`](../policies/README.md) |
| Documentation layer (README, CONTRIBUTING, PR template, style guide, phases, onboarding) | root, `.github/`, [`../documentation-style-guide.md`](../documentation-style-guide.md), this directory |
| API/worker skeletons with health endpoints | `apps/api`, `apps/worker` |

## Architecture changes

**None to the approved architecture.** Phase 1 is foundation work strictly within the architecture consolidated in Phase 0.5 ([`../phase-05-consolidation.md`](../phase-05-consolidation.md)). No canonical rule, boundary, or diagram changed.

## ADRs added/amended

None. The record stands at ADR-0001–0026.

## Code and package changes

First executable artifacts, derived from the architecture documents per the [greenfield rule](../architecture/greenfield-rule.md) — no legacy file copied:

- `apps/api`, `apps/worker`: bootable skeletons exposing health endpoints; no business logic.
- `apps/admin`, `apps/mobile`: bootstrap scaffolding only.
- `packages/*`: five packages initialized with their import-rule boundaries; no business content beyond what the architecture tests need to enforce structure.
- `modules/*`: directory skeletons with `MODULE.md` (from Phase 0) brought under workspace tooling; no implementations.
- Test harness code for the architecture-test registry.

## Database migrations

None. The first migrations arrive in Phase 2; any new database must then be creatable from zero per [`../architecture/database-portability.md` §6](../architecture/database-portability.md).

## API changes

Health endpoints only. No business endpoint exists; the authored OpenAPI contract work begins with the platform phases.

## Security controls

- Merge-blocking CI — gates block the merge, not merely the workflow run.
- Secret hygiene: `.gitignore` deny rules, CI secret scanning, `.env.example`-only pattern.
- Supply-chain: dependency scanning and SBOM generation in CI.
- Architecture tests as structural security controls (layer isolation, no cloud SDK in business layers, module boundaries) — registered with activation phases.
- Branch discipline: no direct commits to `main`; PR template requires security/compliance impact statements.

Canonical security documents are unchanged this phase (`docs/security/`).

## SOC 2 mapping

Phase 1 controls fall in the change-management and secure-SDLC area. Authoritative IDs and criterion mapping are owned by the compliance workstream in [`../compliance/control-matrix.md`](../compliance/control-matrix.md); this report defers to that matrix rather than duplicating it. Mapping is readiness work — **no SOC 2 attestation is claimed**.

## ISO 27001 mapping

As above: Phase 1 maps into the secure-development, change-management, and supplier/supply-chain control areas per [`../compliance/control-matrix.md`](../compliance/control-matrix.md). **No ISO/IEC 27001 certification is claimed.**

## Evidence produced

Local machine-readable reports exist at `scripts/checks/.out/architecture-report.json` and `scripts/checks/.out/docs-report.json` (gitignored; regenerated on every run). CI artifacts (architecture-report, sbom, dependency-audit, licenses, SARIF uploads) are produced by the first workflow run on the Phase 1 PR; the corresponding entries EV-001 through EV-006 in [`../compliance/evidence-register.md`](../compliance/evidence-register.md) remain PENDING until that run completes and its URL is recorded. EV-007 (repository security settings) was verified during Phase 1 via the GitHub API, row by row: branch protection on `main` applied and confirmed (8 required checks, strict up-to-date, admins bound, PR-only with approving-review count per EXC-001, no force push or deletion), secret scanning and push protection enabled, Dependabot alerts and automated security fixes enabled during this phase, default workflow permissions read-only, Actions restricted to GitHub-owned plus the five pinned third-party patterns, and fork-PR workflow approval required for all external contributors. Observed values and dates are in [`../operations/repository-security-settings.md`](../operations/repository-security-settings.md).

## Tests executed

All executed locally by the phase lead on 2026-08-15 (macOS arm64, toolchain per `.tool-versions`); CI repeats the same suites on the PR.

| Suite | Where | Result |
|---|---|---|
| Workspace unit tests (vitest) | local | 8 files, 14 tests, all pass |
| Flutter widget tests | local | all pass (`flutter test`, apps/mobile) |
| Flutter analyze | local | 0 issues |
| Architecture tests | local | 17 passed, 0 failed, 11 deferred by activation phase; 16 of 26 canonical tests ACTIVE per [`../testing/architecture-test-registry.json`](../testing/architecture-test-registry.json); self-test confirms all 16 checkers fail on seeded violations |
| Documentation checks | local | 7/7 (243 markdown files; internal links, phase/ADR/module references, mermaid fence sanity) |
| Lint / format / typecheck / build | local | pass, 8/8 workspace projects build |

## Build results

`make verify` passes end to end (format:check, lint, typecheck, build, test, architecture-test, docs-check). Two integration failures occurred and were fixed during the lead pass, recorded here rather than hidden: the check scripts were initially unformatted (Prettier) and one `no-useless-assignment` lint error existed in `architecture.mjs`. `make doctor` reports all four tools at pinned versions. `docker compose up -d --wait` brought all four local services (postgres, redis, minio, otel-collector) to healthy; `make down` removed them cleanly. Runtime smoke (by the workspace agent, re-used here): `apps/api` served `/healthz` and `/readyz`; `apps/worker` booted and exited cleanly on SIGTERM. CI run links are attached to the Phase 1 PR once it opens; no clean-machine walkthrough by a second person exists yet (single-maintainer limitation below).

## Independent review

The independent reviewer inspected the complete Phase 1 diff after integration, re-executing the check scripts, test suites, and GitHub API verifications rather than trusting reported results. Findings: **0 BLOCKING, 2 HIGH, 6 MEDIUM, 6 LOW, 4 INFORMATIONAL** — all HIGH and MEDIUM findings were remediated before this PR opened (repository-visibility corrections in five compliance locations; committable Terraform composition stubs; stale Phase 0 stamps; branch protection applied and recorded rather than claimed; exception-trigger alignment; CI-enforcement wording matched to the activation registry). Of the LOW/INFORMATIONAL items, five were fixed (stale tool comments, asset-inventory stack description, placeholder-erasure hardening in test 25, loopback-bound Compose ports, narrowed zip ignore) and the remainder were accepted with rationale: the pre-existing roadmap checkmarks are grandfathered until that document's next substantive edit, and the phase-branch naming stands as a factual record. The reviewer's clean-area verifications (supply-chain pinning, non-vacuous architecture checkers, compliance referential integrity, greenfield sweep) matched the implementing agents' claims exactly.

## Known limitations

- **Single maintainer.** Every workstream role resolves to one person; independent review is a role, not yet a separate party. Bus factor 1.
- **Security scans partial locally.** The full scan set runs in CI; the local `make verify` runs the subset that is practical on a laptop.
- **Flutter native builds not exercised in Phase 1 CI.** The mobile workspace is analyzed/tested at bootstrap level; iOS/Android builds enter CI with the Flutter foundation work (Phase 4, per [`../architecture/environments.md` §8](../architecture/environments.md)).
- **Archive.zip history note.** A user backup archive (`Archive.zip`) entered repository history in commit `cc9b0d7` (the pre-merge architecture commit) and was removed from tracking and git-ignored in Phase 1. It is a user backup, not source; it remains in past history because history was deliberately not rewritten. Benign; documented here.
- **Staging is a Compose profile, not an environment.** Pre-cloud, the staging discipline is rehearsed locally per [`../architecture/environments.md` §1](../architecture/environments.md); no cloud staging exists.
- Verification numbers are in Tests executed / Build results above. No timed clean-machine walkthrough by a second engineer exists — the onboarding claim is verified only from the maintainer's machine until a second person joins.

## Accepted risks

| Risk | Owner |
|---|---|
| Single-maintainer bus factor across all roles | Maintainer |
| Architecture tests registered but inactive until their guarded structure exists — a window where a rule is documented but not yet enforced | Maintainer (architecture-enforcement workstream) |
| `Archive.zip` remains in past git history (content reviewed as benign backup material) | Maintainer |

## Deferred work

- Integration tests against real PostgreSQL, and the first migrations — Phase 2.
- Repository-port contract tests (local Docker first; managed-provider runs when those environments exist) — Phase 2+, per [`../architecture/database-portability.md` §7](../architecture/database-portability.md).
- RLS and adversarial tenant tests — Phase 3.
- Flutter CI builds — Phase 4.
- Cloud provisioning and cloud CI — Phase 17+.

## Documentation updated

Per the [phase-end ritual](README.md):

- Root `README.md` status block — done (this phase's rewrite).
- [`../roadmap.md`](../roadmap.md) Phase 1 row marked in progress; marked complete at phase close.
- This report — in progress; completed at verification.
- [`../onboarding/developer.md`](../onboarding/developer.md) — updated for the make-target workflow and Phase 1 quality-gate questions.
- [`../compliance/evidence-register.md`](../compliance/evidence-register.md) — populated at verification.

## Next-phase entry criteria

Phase 2 may start when:

- The Phase 1 PR is merged to `main` and CI required checks are active and green on `main`.
- `make doctor && make bootstrap && make dev && make verify` succeed on a clean machine (the recorded walkthrough).
- The architecture-test registry runs in CI with the Phase 1-active subset passing.
- The Phase 1 compliance gate is passed per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md).
- This report's verification sections are filled and the phase-end ritual is complete.
