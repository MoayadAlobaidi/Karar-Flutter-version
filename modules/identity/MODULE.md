# Module: identity

## Purpose

Authentication, sessions, multi-factor, and credential lifecycle. Owns who a principal is; owns nothing about what they may do.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3_
- **Technical owner:** _unassigned — solo team, Phase 3_
- **Status:** ACTIVE — Phase 3 implemented accounts + e-mail verification, argon2id password
  authentication with parameter versioning and a derived non-resetting lockout, server-side
  sessions with rotating one-time refresh-token families and reuse detection, password
  recovery/change with documented revocation policies, TOTP MFA with encrypted secrets and
  one-time recovery codes, the append-only authentication security ledger
  (migrations `0030`–`0034`), and the HTTP surface (`IdentityApiModule`).
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** SECRET (credential material at rest; encrypted or hashed, never rendered)

## Vocabulary

- **Account** — the authenticatable principal. `identity_accounts.id` **IS the platform
  `UserId`**: the same UUID the shared kernel brands and every other module stores as an owner
  reference, and the value the `app.user_id` RLS GUC carries. There is no second user id
  (contract with the users and tenancy modules).
- **Session** — server-side, revocable sign-in state. Never process memory (legacy AUTHN-16).
- **Refresh-token family** — the rotation lineage of one session grant; the unit revoked when
  token reuse is detected.
- **Security ledger** — `authentication_security_events`, the append-only record of
  authentication occurrences; also the lockout counter (counted, never mutated).

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25).
The same rows are mirrored in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md)
because platform migrations `0030`–`0034` created the tables; full field-level headers live in
those migration files.

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `public.identity_accounts` | `SUBJECT_OWNED` | authentication identity — e-mail, verification state, status, MFA requirement, token version | `CONFIDENTIAL` | life of the account; post-closure grace from the PolicyPack per jurisdiction (Phase 3.5) | included — the subject's own account record | `CASCADE_DELETE` |
| `public.password_credentials` | `SUBJECT_OWNED` | argon2id hash with the parameter version that produced it (upgrade-on-login) | `SECRET` | life of the credential; replaced in place | excluded (credential material, not subject content; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.email_verifications` | `SUBJECT_DERIVED` | e-mail ownership proof — HMAC-hashed one-time codes, attempt-capped, 30-minute expiry | `CONFIDENTIAL` | short operational window; purged by the later-phase retention job on the interim 30-day policy-configuration placeholder (PolicyPack owns the number from Phase 3.5) | excluded (verification plumbing; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.password_reset_requests` | `SUBJECT_DERIVED` | password recovery — HMAC-hashed one-time tokens, attempt-capped, requester IP digest | `CONFIDENTIAL` | same short window and 30-day interim placeholder as email_verifications | excluded (recovery plumbing; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.sessions` | `SUBJECT_OWNED` | server-side session state — expiry, revocation, minimized client metadata (digests/summaries only) | `CONFIDENTIAL` | absolute lifetime plus a short forensic window; purged on the interim 90-days-after-expiry policy-configuration placeholder (PolicyPack owns the number from Phase 3.5) | excluded (security-operational metadata, meaningless outside the platform; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.refresh_token_families` | `SUBJECT_OWNED` | rotation lineage — one family per session grant; the reuse-revocation unit | `CONFIDENTIAL` | with the owning session; same purge discipline | excluded (token plumbing; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.refresh_tokens` | `SUBJECT_OWNED` | refresh credential at rest — SHA-256 of a 32-byte one-time token, expiry, successor linkage | `SECRET` | with the owning family; same purge discipline | excluded (credential material; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.mfa_enrolments` | `SUBJECT_OWNED` | TOTP secret ciphertext with key-version provenance (ADR-0017), confirmation state | `SECRET` | life of the enrolment; replaced in place on re-enrolment | excluded (credential material; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.mfa_recovery_codes` | `SUBJECT_OWNED` | SHA-256 hashes of ten one-time 128-bit recovery codes, attempt-limited | `SECRET` | life of the code set; replaced wholesale on regeneration or disable | excluded (credential material; export coverage note names this omission) | `CASCADE_DELETE` |
| `public.authentication_security_events` | `SUBJECT_DERIVED` | security investigation and lockout derivation — append-only authentication occurrences, digested metadata | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); local development placeholder 13 months, held in policy configuration, never a code constant | excluded (integrity record about the account, not subject content; export coverage note names this omission) | `RETAIN_WITH_BASIS` |

Legal basis for `RETAIN_WITH_BASIS` on the ledger: security obligations survive account closure
for the retention period; `account_id` is an opaque reference (no foreign key) that resolves to
nothing once the subject is erased. The ledger is also the lockout counter — deleting rows would
erase the failed-attempt history the derivation counts (legacy AUTHN-11).

### Row-level security stance

Identity tables are keyed by **account**, not tenant (tenant RLS belongs to the tenancy module).
Every table above is RLS **ENABLEd and FORCEd** with policies against
`public.karar_current_user_id()` (the transaction-local `app.user_id` GUC — set by repositories,
never from client input). Authentication begins before a principal exists, so specific tables
carry a **bootstrap arm** admitting a no-principal transaction; every bootstrap arm is recorded
with its justification and compensating controls in
[`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json).
Sessions and MFA tables carry **no** bootstrap arm: an unscoped query sees zero rows (proven
adversarially on non-empty data in `__tests__/sessions-refresh.integration.test.ts`).

## Events published

_None in Phase 3._ Security occurrences are recorded to the append-only
`authentication_security_events` table and to the audit trail via `@karar/audit` — deliberately
not bus events yet; catalogued domain events (e.g. `UserRegistered` for the users module) arrive
with the consumer that needs them, under event-governance rules.

## Events consumed

_None._

## APIs exposed

| Route | Audience | Capability required |
|---|---|---|
| `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification` | consumer (pre-auth) | — (platform) |
| `POST /auth/login`, `/auth/refresh` | consumer (pre-auth) | — (platform) |
| `POST /auth/forgot-password`, `/auth/reset-password` | consumer (pre-auth) | — (platform) |
| `POST /auth/logout`, `/auth/change-password` | consumer (session) | — (platform) |
| `POST /auth/mfa/enroll`, `/auth/mfa/confirm`, `/auth/mfa/disable` | consumer (session) | — (platform) |
| `POST /auth/mfa/challenge`, `/auth/mfa/recovery` | consumer (challenge token) | — (platform) |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others` | consumer (session) | — (platform) |

Admin routes that deliberately **do not** exist: no route returns a password hash, a refresh
token, a TOTP secret, a recovery code, or a verification/reset code to ANY caller; no admin
route lists or searches accounts (that is the users/control-plane surface, built on projections).

## Permissions

| Permission | Role(s) |
|---|---|
| `identity.session.revoke` | `PLATFORM_ADMIN` |
| `identity.mfa.reset` | `PLATFORM_ADMIN` |
| `identity.account.disable` / `identity.account.enable` | `PLATFORM_ADMIN` |

The disable/enable use cases exist in this module as mechanisms; the RBAC module enforces which
roles may invoke them (deny by default).

**Permissions deliberately absent:** No permission returns credential material to any role.
No permission reads a TOTP secret, a recovery code, or a token hash.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references carry a
raw UUID plus a reference type declared **in this module**.

Consumes `@karar/platform` (Prisma runtime via `createPrismaClient`, typed config/SecretValue,
errors, keys/EncryptionProvider, notifications port, ratelimit, trusted-proxy http),
`@karar/audit` (`RecordAuditEvent`), and `@karar/shared-kernel` (`UserId`, `Result`, `Clock`).
Depends on no other module.

Kill switches gate the authentication surface through a port THIS module declares
(`presentation/http/operation-gate.ts`, dependency inversion — no dependency on the
control-plane module): `POST /auth/register` carries
`RequireOperationAllowed('NEW_REGISTRATIONS')`, `POST /auth/login` `'PASSWORD_LOGIN'`, and
`POST /auth/refresh` `'SESSION_REFRESH'`. The composition root binds the control-plane's
`CheckKillSwitch`, which satisfies the port structurally; `IdentityApiModuleOptions` makes the
gate REQUIRED so the routes cannot mount unguarded
(`__tests__/kill-switch-mounts.test.ts`).

## Notes and known limitations

**Sessions are issued with `tenant_binding = null`; binding it is an explicit post-issuance
step (Phase 3.5, closes KAR-RSK-021).** The column (0031) is the only tenant source the
fail-closed RLS design permits at the edge; this module transports it opaquely on
`AuthenticatedPrincipal.tenantBinding` — tenancy owns the semantics and verifies membership
BEFORE calling. The mechanics live in `application/use-cases/session-tenant-binding.ts`:
`BindSessionTenant` (first bind, null → tenant, NO token rotation — per-request re-reads pick
the binding up; guarded null → value only) and `RebindSessionTenant` (switch, A → B or A → null:
atomically revokes the old session and its refresh-token families, then issues a brand-new
session carrying the new binding — old access tokens die with the revoked sid, old refresh
tokens with the family). Both write the security ledger (`session_tenant_bound` /
`session_tenant_rebound`) and the audit trail. Consumed by tenancy/bootstrap through ports THEY
declare; exported via public-api for the composition root only. Login still issues unbound
sessions — bind-at-login is deliberately absent (tenant resolution is tenancy's, not this
module's).

**`AuthenticateRequest` slides the session idle window on every successful call** — one
`touchSession` UPDATE per bearer-carrying request, from both `AccessTokenGuard` and the
composition root's enrichment guard. Sliding-idle-on-any-authenticated-activity is the intended
semantic; making the touch conditional (skip far from expiry) is deferred to the first
performance-sensitive phase.

Roles are re-derived from the database on every request rather than carried in the token, so a
revoked grant takes effect immediately — access tokens carry `{sub, sid, iss, aud, iat, exp, tv}`
and nothing else. Carried forward from the legacy, which got this right.

Inherited requirements, now implemented and pinned by tests:

- **AUTHN-11** — the lockout counter cannot reset when the lock applies: lockout is a COUNT over
  append-only ledger rows per (account, IP digest); engaging the lock writes `login_locked` and
  erases nothing (`__tests__/login-lockout.integration.test.ts`).
- **Per-account reset cooldown** — 60s between reset requests, plus a 3/h send budget
  (`__tests__/password-recovery.integration.test.ts`).
- **AUTHN-04 (second half)** — recovery-code verification has a derived attempt counter and lock
  (5/15m, non-resetting) (`__tests__/mfa.integration.test.ts`).
- **AUTHN-08** — disabling an account revokes its sessions and refresh-token families and bumps
  the token version; re-enabling resurrects nothing
  (`__tests__/sessions-refresh.integration.test.ts`).
- **AUTHN-16** — no session or pending-MFA state lives in process memory: sessions are rows, the
  MFA intermediate is a signed 5-minute challenge token, and the request guard re-reads the
  database every time.

Local-only providers (`LocalDevKeyProvider`, platform `LocalDevEncryptionProvider`,
`LocalMailSink`) throw at construction outside `KARAR_ENV=local`; a deployment profile must wire
real key management, encryption, and notification providers. The local signing keypair and
encryption keys are per-process: a local restart signs everyone out and requires local MFA
re-enrolment — stated cost, not a surprise.

Argon2id parameters are versioned (`password_credentials.params_version`, registry in
`infrastructure/crypto/argon2-password-hasher.ts` with the benchmark evidence); hashes under an
older set are upgraded during login.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
