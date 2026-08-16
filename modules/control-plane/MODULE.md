# Module: control-plane

## Purpose

Security gateway for administrative access: identity, environment scoping, reason capture,
approval, and short-lived token minting (Phase 8). **Phase 3 ships one slice of it:
restrict-only kill switches** — the closed switch registry, the pre-auth read path with an
explicit fail-closed store-outage policy, the audited operate use case, and the
`RequireOperationAllowed(...)` guard identity/tenancy routes mount.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3_
- **Technical owner:** _unassigned — solo team, Phase 3_
- **Status:** ACTIVE (kill-switch slice) — Phase 3 implemented `public.kill_switches` +
  `public.kill_switch_history` (migration `0053`: closed id registry, version-increment and
  history-append triggers, append-only ledger), the `CheckKillSwitch` read path behind the
  exported `KillSwitchPort`, the `OperateKillSwitch` use case gated on
  `controlplane.killswitch.operate`, and the guard. The gateway itself (admin identities,
  scoped tokens) remains PLANNED, Phase 8.
- **Phase:** 3 (kill-switch slice) / 8 (gateway)
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL (Phase 3 tables are INTERNAL; the Phase 8 gateway
  tables below carry the module's ceiling)

## Vocabulary

- **Kill switch** — a RESTRICT-ONLY operational control: it can only DENY its operation.
  `INACTIVE`, an expired `ACTIVE_RESTRICTION`, and a missing row all mean "no restriction
  recorded" — the operation proceeds as if the mechanism did not exist. No state enables,
  widens, or bypasses anything.
- **Store-unavailable policy** — distinct from absence: when switch state CANNOT BE READ, a
  switch-guarded operation fails CLOSED (503 `DEPENDENCY_UNAVAILABLE`) — an outage must not
  silently enable. Absence of a restriction is an answer; absence of the store is not.
- **Ledger** — `kill_switch_history`: one append-only row per (switch, version), written only
  by the database trigger.

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25). Phase 3
rows are mirrored in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md) because
migration `0053` created the tables. The Phase 8 tables are declared now (the template's point:
lifecycle is answered before the schema exists) and carry no migration yet.

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `public.kill_switches` | `NON_PERSONAL` | restrict-only operational switches — deny specific operations during incidents, with reason and accountability (migration 0053) | `INTERNAL` | current operational state lives with the platform; PolicyPack owns any bound (Phase 3.5) | n/a — no subject owns an operational switch | `NON_PERSONAL_BY_DESIGN` |
| `public.kill_switch_history` | `NON_PERSONAL` | append-only state ledger — every switch state that ever held, with actor, reason, version (migration 0053) | `INTERNAL` | operational history explains every past denial; PolicyPack owns any bound (Phase 3.5) | n/a | `RETAIN_WITH_BASIS` |
| `admin_identities` (planned, Phase 8) | `SUBJECT_OWNED` | staff identity for the separately-deployed gateway — who may request scoped access | `CONFIDENTIAL` | employment relationship plus the PolicyPack's post-departure period (Phase 3.5 machinery; never a code constant) | excluded (staff operational record, not customer content; the export coverage note names this omission) | `RETAIN_WITH_BASIS` |
| `control_plane_audit` (planned, Phase 8) | `SUBJECT_DERIVED` | append-only record of privileged administrative actions with captured reasons | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); same discipline as audit.audit_events | excluded (integrity record about staff actions; the export coverage note names this omission) | `RETAIN_WITH_BASIS` |
| `scoped_tokens` (planned, Phase 8) | `SUBJECT_DERIVED` | short-lived, single-environment, purpose-scoped credentials minted by the gateway | `SECRET` | minutes-scale token lifetime plus a short forensic window; PolicyPack owns the numbers (Phase 3.5) | excluded (credential material; the export coverage note names this omission) | `CASCADE_DELETE` |

`NON_PERSONAL_BY_DESIGN` for `kill_switches`, demonstrated: rows hold switch state, a reason, and
an operator reference acting in official capacity; no subject data exists and no linkage can be
restored. `RETAIN_WITH_BASIS` for the ledger: operational accountability — every past denial of a
guarded operation must be explainable (which restriction, whose decision, what reason, when).

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `PrivilegedActionPerformed` (planned, Phase 8) | `CONFIDENTIAL` | audit | payload permitted — reason captured |

_Phase 3 publishes no bus events._ Kill-switch operations are recorded through the audit module
(`controlplane.killswitch.activated` / `.deactivated`; refused attempts with DENIED outcome).

## Events consumed

_None._

## APIs exposed

**None — deliberately.** There is no kill-switch HTTP surface in Phase 3: the control-plane UI is
Phase 8, and `OperateKillSwitch` is invoked from runbooks and tests until then — so no
`packages/api-contracts/openapi/paths/` fragment exists for this module yet. The read path is not
an endpoint either: identity/tenancy flows consume the exported `KillSwitchPort`
(`assertOperationAllowed`) or mount `RequireOperationAllowed(...)` on their own routes.

Routes that deliberately do not exist: nothing exposes switch state unauthenticated as an API
(clients learn of a restriction by the guarded operation answering 503), and no route ever
ENABLES anything — there is nothing to expose that could.

## Permissions

| Permission | Role(s) |
|---|---|
| `controlplane.killswitch.operate` | `OPERATOR` |
| `controlplane.environment.access` (planned, Phase 8 — not in the seeded catalogue) | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** No permission ENABLES an operation — the switch mechanism is
restrict-only, and no "override/bypass a restriction" permission exists for any role. No browser
session holds an environment credential (Phase 8 gateway rule, unchanged).

## Kill-switch semantics (the decisions, recorded)

- **The four switches and the operations they deny:** `NEW_REGISTRATIONS` → identity
  registration; `PASSWORD_LOGIN` → identity password login; `SESSION_REFRESH` → identity token
  refresh; `TENANT_INVITATIONS` → tenancy invitation create/redeem. The registry is CLOSED at
  compile time AND at the database (id CHECK); a new switch is a reviewed migration plus a code
  change.
- **Restrict-only invariant, test-asserted:** the evaluation type has two arms — unrestricted
  (carrying nothing) or restricted-with-reason; the port's success arm is `void`. There is no
  code path by which a switch enables anything.
- **Expiry is honored by the read path:** an activation may carry `expires_at` so a forgotten
  switch lapses into the unrestricted ground state instead of restricting forever.
- **Every change is versioned, ledgered, audited:** version increments by exactly one
  (DB-trigger-enforced, optimistic concurrency in the use case), the history row is appended by a
  SECURITY DEFINER trigger (the app role holds no INSERT on the ledger), and the operation is
  audited with actor and reason. Reason and actor are REQUIRED.
- **Store outage fails closed** (503 `DEPENDENCY_UNAVAILABLE`), tested against a closed pool.
  Pre-auth readability is why both tables are allow-listed from RLS
  ([`rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json)).

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Consumes `@karar/platform`
(Prisma handle), `@karar/audit` (`RecordAuditEvent` behind this module's `AuditTrail` port), and
`@karar/shared-kernel`. The `PolicyService` port is declared inward here and implemented by the
authorization module (dev-dependency only, for the reconciliation test). `apps/admin` carries no
database driver, CI-enforced.

## Ports declared

| Port | Implementations |
|---|---|
| `KillSwitchStore` (inward) | `PrismaKillSwitchStore` |
| `PolicyService` (inward) | authorization module's `RbacPolicyService`, wired by the composition root |
| `AuditTrail` (inward) | `RecordAuditEventAuditTrail` over `@karar/audit` |
| `KillSwitchPort` (provided — identity/tenancy flows consume it) | `CheckKillSwitch` |

## Tests

Registry closure and evaluation rules (INACTIVE / missing / expired all unrestricted; active
restricts with reason); the restrict-only shape; operate authorization (allow, deny + DENIED
audit), reason/expiry validation, version conflict; integration on a scratch database: each of the
four switches blocks via port and guard, deactivate unblocks, version+ledger+audit per change,
expiry honored, store-unavailable fail-closed via a closed pool, cannot-enable probes (unknown
state/id refused by CHECKs, ledger immutable even for the owner, no app INSERT/DELETE).

## Notes and known limitations

For LOCAL and DEV the control plane runs as a module inside `apps/api` — same process, gateway
contract already in place. **A separately deployed control plane with independent credentials is a
hard gate on production launch (Phase 20).** Stated rather than glossed.

**Lead wiring note (Phase 3 integration):** identity and tenancy declared no kill-switch port of
their own, so enforcement is wired at composition: mount `RequireOperationAllowed('…')` on
identity's register/login/refresh routes and tenancy's invitation routes (or call
`KillSwitchPort.assertOperationAllowed` at the top of those use cases — HTTP is not the only
caller). Until wired, the switches restrict nothing; the mechanism, its tests, and its audit trail
are complete and waiting.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
