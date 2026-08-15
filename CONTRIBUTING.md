# Contributing

---

## Before you write code

1. **Read [`docs/architecture/overview.md`](docs/architecture/overview.md).** It is the entry point and links everything else.
2. **Know the greenfield rule** — [`docs/architecture/greenfield-rule.md`](docs/architecture/greenfield-rule.md). Karar V2 is built from scratch. The legacy repo is a requirements, evidence, and test-case source — **never a code source**. No file in this repository may be a port of legacy application code; reimplement from the documented requirement.
3. **Check the ADRs.** An accepted ADR is not revisited without new information. If you have new information, write a superseding ADR — do not edit the old one.
4. **If you are adding a capability, write `MODULE.md` first** — all seventeen checklist points, before any code. Six of them are governance decisions and several need a legal answer.

## The rules CI enforces

You cannot merge past these, so knowing them saves a round trip.

| Rule | Why |
|---|---|
| `domain/` imports `shared-kernel` and nothing else | ADR-0001 |
| Cross-module imports resolve to `public-api.ts` only | ADR-0002 |
| No Prisma type outside `infrastructure/` | ADR-0005 |
| No float, `number`, or `double` in a monetary position | ADR-0006 |
| No country- or jurisdiction-keyed **business branching** outside `packages/jurisdiction-policy` | ADR-0014 |
| Every module directory has a `MODULE.md` | — |
| Every published event is in the catalogue with declared consumers | ADR-0025 |
| `SEALED` never in projections, events, logs, analytics, or AI context *(active from Phase 13)* | ADR-0017 |
| Sealed reads require a `SealAccessGrant`, at the type level *(active from Phase 13)* | ADR-0017 |
| Every persistent dataset declares its lifecycle — subject relationship, purpose, classification, retention, export treatment, erasure strategy *(CI enforces the erasure column today; the full six fields deepen with the schema phases)* | ADR-0026 |
| Every declared guard has a call site *(active from Phase 2)* | — |
| Ingestion and rendering paths declare explicit resource limits *(active from Phase 5)* | — |
| No cloud SDK, provider client, or provider URI in `domain/` or `application/` | ADR-0023 |
| The Assurance Claim Registry stays referentially intact (every claim has evidence and an owner; referenced tests exist) | — |
| `shared-kernel` exports exactly nine symbols | ADR-0003 |

Full list: [`docs/testing/architecture-tests.md`](docs/testing/architecture-tests.md).

Run everything locally before pushing: `make verify`. `make help` lists the rest of the targets; the setup path is in the [README quick start](README.md#developer-quick-start).

## Things that are easy to get wrong

**Country codes are permitted; branching on them is not.** `'QA'` in a localization table, a currency reference, a phone formatter, or a test fixture is fine. `if (country === 'QA')` in `application/` is not. The rule targets the conditional, not the literal — because a rule that fires on legitimate reference data is a rule people learn to suppress.

**`infrastructure/` depends on `application/`, not the reverse.** A repository implementation imports the port the use case declared. If you find yourself importing a repository into a use case, the dependency is backwards.

**Cross-module references carry a raw UUID plus a reference type declared in *your* module.** Do not import another module's ID type, and do not promote it to `shared-kernel`. The apparent duplication is the point: it makes the coupling local and visible.

**Capability checks go in two places** — the controller boundary and inside the use case. HTTP is not the only caller; jobs and AI tools call use cases directly.

**Every control needs a test that fails when the control is removed.** Not a test that the control exists — a test that the *attack* fails. The legacy has a guard class with two documented protections that have no call site anywhere; they read as live controls and are not.

**Adversarial isolation tests assert on non-empty expected data.** A cross-tenant test that passes because nothing came back has verified nothing — *an empty result is indistinguishable from correct isolation.*

## Adding a capability

The seam is real or it is not, and the way to find out is to try it and refuse to work around it.

```bash
git diff --name-only main... | grep -E 'modules/(transactions|budgets|goals|insights|zakat)/|packages/financial-engine/|apps/mobile/lib/app/'
```

**Empty output, or the seam is wrong and gets fixed before you proceed.** This is a stop-work condition, not a preference.

## Commits and branches

- Branch from `main`. Never commit directly to `main`.
- Conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- A pull request that changes behaviour states what it changes and why. A pull request that changes a *rule* links the ADR.

## Pull requests

- All required CI checks must pass — they block the merge, not merely the workflow run.
- Complete the [pull request template](.github/pull_request_template.md), every section. "None" is an answer; an empty section is not.
- Documentation changes ship in the same PR as the change they describe.
- At a phase boundary, the closing PR performs the **phase-end documentation ritual** — the fixed file set in [`docs/phases/README.md`](docs/phases/README.md). A phase is not complete while any of those files is stale.

## Documentation

The [documentation style guide](docs/documentation-style-guide.md) is **binding** — terminology (with [`docs/glossary.md`](docs/glossary.md) as the vocabulary source), ownership, diagram conventions, claim labelling, and the prohibitions on promotional prose and AI signatures all live there.

**Derive documentation from source, not from the previous version of the document.**

The legacy's own feature matrix records what happens otherwise: an earlier version *"was re-derived from itself rather than from the code, and had drifted"* — it listed endpoints that did not exist and marked built capabilities absent.

**Label evidence** when making a factual claim about the system:

| Label | Meaning |
|---|---|
| **CODE** | A file in this repository says so, and it was read |
| **RUNTIME** | Observed on a running system |
| **INFRASTRUCTURE** | A provider or dashboard claim. **Not verified and not verifiable from the repository** |
| **ABSENT** | Searched for and not found. The absence is the evidence |

> An INFRASTRUCTURE claim must never be read as a verified one.

## Security

Do not open a public issue for a security concern. See [`SECURITY.md`](SECURITY.md).
