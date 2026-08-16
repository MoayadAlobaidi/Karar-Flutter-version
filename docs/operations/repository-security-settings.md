# Repository Security Settings

This document lists the GitHub repository settings that cannot be expressed in
code and therefore must be configured (and periodically re-verified) in the
GitHub UI or via the API. It is the companion to the workflows in
`.github/workflows/` and to `.github/dependabot.yml`.

Rows record their verification state and date; anything not yet verified stays **UNVERIFIED**: this file must not claim a setting is
active until someone has actually checked. The Engineering Owner verifies each
row with the listed `gh api` command (run from a checkout of this repository so
`{owner}/{repo}` resolve automatically; most commands need repository admin
scope) and updates the status column with the date. Evidence for all rows is
tracked as **EV-007** in `docs/compliance/evidence-register.md` (maintained in
parallel).

## Required settings

| Setting | Required state | Current status | Owner | Verification method | Evidence |
| --- | --- | --- | --- | --- | --- |
| Branch protection on `main`: require pull request before merging | Enabled. Approving-review count follows EXC-001: 0 while the team is one person; raised to 1 (with stale-approval dismissal) when the team reaches 2 | VERIFIED 2026-08-15 — enabled, count 0 per EXC-001 | Engineering Owner | `gh api repos/{owner}/{repo}/branches/main/protection/required_pull_request_reviews` | EV-007 |
| Branch protection on `main`: required status checks | Enabled, "require branches to be up to date" on, with exactly these checks: `workspace`, `architecture`, `mobile`, `codeql`, `secrets`, `dependency-review`, `iac-and-containers`, `sbom` | VERIFIED 2026-08-15 — all 8 required, strict up-to-date on | Engineering Owner | `gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks` | EV-007 |
| Branch protection on `main`: no direct pushes, no bypass | "Do not allow bypassing the above settings" enabled (applies to admins); merges only via PR | VERIFIED 2026-08-15 — enforce_admins true | Engineering Owner | `gh api repos/{owner}/{repo}/branches/main/protection --jq .enforce_admins` | EV-007 |
| Branch protection on `main`: force pushes and deletion blocked | `allow_force_pushes: false`, `allow_deletions: false` | VERIFIED 2026-08-15 | Engineering Owner | `gh api repos/{owner}/{repo}/branches/main/protection --jq '{allow_force_pushes, allow_deletions}'` | EV-007 |
| Branch protection on `main`: linear history | **Disabled** (documented choice, see below): phase PRs merge with a merge commit so phase history stays visible | VERIFIED 2026-08-15 — required_linear_history false | Engineering Owner | `gh api repos/{owner}/{repo}/branches/main/protection --jq .required_linear_history` and `gh api repos/{owner}/{repo} --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'` | EV-007 |
| Signed commits on `main` | NOT required (documented choice, see below); commit signing recommended to all contributors | VERIFIED 2026-08-15 — required_signatures false | Engineering Owner | `gh api repos/{owner}/{repo}/branches/main/protection/required_signatures --jq .enabled` (expected: `false`) | EV-007 |
| Secret scanning | Enabled | VERIFIED 2026-08-15 | Engineering Owner | `gh api repos/{owner}/{repo} --jq .security_and_analysis.secret_scanning.status` | EV-007 |
| Secret scanning push protection | Enabled | VERIFIED 2026-08-15 | Engineering Owner | `gh api repos/{owner}/{repo} --jq .security_and_analysis.secret_scanning_push_protection.status` | EV-007 |
| Dependabot alerts | Enabled | VERIFIED 2026-08-15 — enabled during Phase 1 | Engineering Owner | `gh api repos/{owner}/{repo}/vulnerability-alerts -i` (HTTP 204 = enabled, 404 = disabled) | EV-007 |
| Dependabot security updates | Enabled | VERIFIED 2026-08-15 — enabled during Phase 1 | Engineering Owner | `gh api repos/{owner}/{repo}/automated-security-fixes` | EV-007 |
| Actions policy: allowed actions | "Allow {owner}, and select non-{owner}, actions" with "Allow actions created by GitHub" plus this allowlist: `pnpm/action-setup@*`, `subosito/flutter-action@*`, `gitleaks/gitleaks-action@*`, `anchore/sbom-action@*`, `aquasecurity/trivy-action@*`, `aquasecurity/setup-trivy@*` (transitive sub-action of trivy-action, discovered on the first CI run) | VERIFIED 2026-08-15 — selected policy, 6 patterns | Engineering Owner | `gh api repos/{owner}/{repo}/actions/permissions` then `gh api repos/{owner}/{repo}/actions/permissions/selected-actions` | EV-007 |
| Actions policy: default workflow token permissions | Read-only (`default_workflow_permissions: read`); workflows must not be able to approve PRs (`can_approve_pull_request_reviews: false`) | VERIFIED 2026-08-15 | Engineering Owner | `gh api repos/{owner}/{repo}/actions/permissions/workflow` | EV-007 |
| Fork PR workflow approval | Require approval for all external contributors before their workflow runs execute | VERIFIED 2026-08-15 — all_external_contributors | Engineering Owner | `gh api repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval` (if the endpoint 404s on this GitHub plan, verify in Settings -> Actions -> General -> "Fork pull request workflows") | EV-007 |

## Required status checks (exact names)

The check names below are the job `name:` values from the workflows and are
what must be entered in branch protection. Workflow file names or display
names are not part of the check name.

Blocking (add all of these as required checks):

- `workspace` (ci.yml)
- `architecture` (ci.yml)
- `mobile` (ci.yml)
- `codeql` (security.yml)
- `secrets` (security.yml)
- `dependency-review` (security.yml; runs on PRs only, skipped on push — a skipped run satisfies branch protection)
- `iac-and-containers` (security.yml)
- `sbom` (security.yml)

Report-only (do NOT add as required checks; they are designed never to block):

- `dependency-audit` (security.yml) — see tightening TODO below
- `licenses` (security.yml)

## Documented choices

### Linear history: disabled — merge commits for phase PRs

Linear history is optional per policy; the choice here is **disabled**. Phase
PRs merge with a merge commit so that phase boundaries remain visible in
`main`'s first-parent history (the architecture PR was merged this way
deliberately). The cost — a less strictly linear graph — is accepted; the
phase-per-PR discipline keeps `main` navigable. Revisit explicitly if the
branch model changes, rather than toggling silently.

### Signed commits: recommended, not required

Requiring signature verification on `main` would block any contributor whose
local signing is not configured (including routine reverts and cherry-picks),
and its assurance value is limited until a key-management and verification
policy exists. Commits created through the GitHub web UI and by Dependabot are
already signed by GitHub. Decision: recommend contributors enable commit
signing and vigilant mode; revisit making it required once the contributor
base grows beyond the founding team and a key policy is written.

### docs.yml folded into ci.yml

There is no separate docs workflow. The docs check
(`node scripts/checks/docs-check.mjs`) runs inside the `architecture` job of
`ci.yml`, and `ci.yml` deliberately has **no `paths:` filter**, so
markdown-only PRs run the docs check too. A separate paths-filtered workflow
would either skip silently on docs PRs or leave a required check stuck in
"Expected". If CI cost ever forces paths filtering, the docs check must move
to its own always-running workflow first.

## CI secrets and credentials policy

- The only secret available to CI is the workflow-scoped `GITHUB_TOKEN`, which
  is read-only at the workflow level; individual jobs elevate only
  `security-events: write` for SARIF uploads (CodeQL, Trivy).
- No workflow requires or receives GCP, AWS, or any other cloud credentials.
- No workflow uses `pull_request_target`, and no PR-triggered job checks out
  untrusted code with elevated permissions.
- Contingency: if this repository moves into a GitHub organization,
  `gitleaks/gitleaks-action` requires a `GITLEAKS_LICENSE` repository secret
  (free for personal accounts). Adding that secret is an Engineering Owner
  decision and must be recorded here when it happens.

## Tightening TODO: pnpm audit is currently report-only

The `dependency-audit` job in `security.yml` runs
`pnpm audit --audit-level high` with `continue-on-error: true`: failures are
visible as step annotations and the JSON report is uploaded as the
`dependency-audit` artifact, but the job never blocks a merge.

- Why report-only now: the lockfile is brand new and the advisory baseline is
  not yet established; meanwhile `dependency-review` already blocks newly
  introduced high-severity dependencies at the PR boundary, so the residual
  exposure is advisories published against already-merged dependencies.
- Tightening criterion: remove `continue-on-error: true` (making the job
  blocking and adding `dependency-audit` to required checks) once the audit
  has run clean at high severity on `main` for 14 consecutive days, or once
  every remaining finding has a documented exception in the evidence register.
- Owner: Engineering Owner. Review no later than Phase 2 kickoff.

## Phase 3 close — security-suppression review (2026-08-16, EV-318)

Every Phase 3 suppression was re-reviewed before merging PR #5. Scope and
findings:

- **Gitleaks** (2 entries in `.gitleaksignore`): both fingerprints are
  commit+file+rule+line exact; both historical lines were re-read at their
  pinned commits and are documentation prose (the tenancy data-lifecycle
  description and the prior revision of the ignore file's own comment). No
  credential, token, private key, MFA seed, verification/recovery code, or
  password exists at either location, and per-occurrence fingerprints cannot
  suppress future findings. No regex, path, directory, or rule-level
  suppression exists anywhere.
- **CodeQL** (1 dismissed alert, recorded below): the dismissal is
  per-alert; the workflow runs plain `codeql-action init`/`analyze` with no
  query exclusions, path ignores, or configuration file — no global
  suppression exists. Actual password hashing is argon2id with versioned
  parameters (`Argon2PasswordHasher`); the flagged path digests rate-limit
  subject keys.
- **Regression pair**: `modules/identity/__tests__/password-hash-format.test.ts`
  pins passwords to versioned argon2id PHC strings (never a bare digest) and
  `packages/platform/src/ratelimit/ratelimit.test.ts` pins subject keys to
  HMAC digests (never the raw identifier) — a change that confused the two
  purposes fails one of them.

This review is maintainer-directed agent review, not organizationally
independent human assurance. Registered as EV-318.

## Code-scanning dismissal record — CodeQL alert 1 (2026-08-16)

CodeQL flagged `js/insufficient-password-hash` (high) on the rate-limit key
digester (`packages/platform/src/ratelimit/keys.ts`), tracing the refresh
flow's `idKey(tokenHash)` call. Dismissed as a false positive with this
rationale: the digested value is the SHA-256 of a 256-bit random refresh
token — not a human-chosen password — and the HMAC-SHA256-under-pepper
digest is a pseudonymized rate-limit bucket key, not a verification hash.
Key-stretching defends low-entropy secrets against brute force; it adds
nothing against a 256-bit random and would break constant-key lookups.
Passwords themselves are hashed with argon2id with parameter versioning
(`modules/identity`, KAR-CTL-066). Dismissals are per-alert, reasoned, and
reversible in the code-scanning UI; never dismiss without a written
rationale here.

## Dependency-management note — @types/node majors (2026-08-16)

Dependabot PR #3 (`@types/node` 25 → 26) was closed without merging: the types
major must track the supported runtime major, and the runtime is pinned to
Node 25. `.github/dependabot.yml` now ignores `version-update:semver-major`
for `@types/node`; patch/minor updates within the supported major continue to
arrive normally. A Node runtime major upgrade is its own reviewed change and
is never combined with a feature phase.
