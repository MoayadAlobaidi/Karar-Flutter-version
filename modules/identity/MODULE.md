# Module: identity

## Purpose

Authentication, sessions, multi-factor, and credential lifecycle. Owns who a principal is; owns nothing about what they may do.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `users_auth` | `CONFIDENTIAL` | `CASCADE_DELETE` | credential material, hashed |
| `sessions` | `CONFIDENTIAL` | `CASCADE_DELETE` | refresh tokens, revocable server-side |
| `mfa_enrolments` | `CONFIDENTIAL` | `CASCADE_DELETE` | TOTP secrets are SECRET-handled |
| `verification_codes` | `CONFIDENTIAL` | `CASCADE_DELETE` | salted hash, attempt-capped |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `UserRegistered` | `CONFIDENTIAL` | users, notifications, audit | identifiers only |
| `SessionRevoked` | `INTERNAL` | audit | identifiers only |

## Permissions

| Permission | Role(s) |
|---|---|
| `identity.session.revoke` | `PLATFORM_ADMIN` |
| `identity.mfa.reset` | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** No permission returns credential material to any role.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

Roles are re-derived from the database on every request rather than carried in the token, so a revoked grant takes effect immediately. Carried forward from the legacy, which got this right.

Inherited requirements: lockout counter must not reset when the lock applies (legacy AUTHN-11); password reset needs a per-account cooldown; recovery-code verification needs an attempt counter and lock (the second half of HIGH AUTHN-04); disabling an account revokes its refresh tokens (AUTHN-08); admin session state is never held in process memory (AUTHN-16).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
