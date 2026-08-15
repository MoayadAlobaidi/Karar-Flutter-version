# ADR-0021 — Control Plane as security gateway

**Status:** ACCEPTED · **Phase:** 8 (module), 20 (separate deployment gate)

## Context

Super Admin operates across LOCAL, DEV, STAGING, and PRODUCTION. The obvious design gives the admin browser a credential per environment. That makes the browser — the least trustworthy component, exposed to extensions, XSS, and a shared machine — the holder of production credentials.

The legacy shows an adjacent failure: its admin sign-in tokens live in one JVM's heap, so admin sign-in *"does not survive a restart and would break on a second instance"* (AUTHN-16), and admin sign-out is **client-side only**, so *"the highest-privilege session cannot be revoked server-side"* (AUTHN-07).

## Decision

**The browser holds a session with the control plane only, and never an environment credential.**

Per request, the control plane mints a **short-lived, single-environment, purpose-scoped token**.

```
Browser ──session──> Control Plane ──short-lived scoped token──> Environment gateway
Browser ──✗ FORBIDDEN──────────────────────────────────────────> Production
```

The control plane owns admin identity and MFA, RBAC with environment scope, **reason capture**, approval workflow, its own audit, and token minting.

**Production sits behind a stricter gateway:** reason required, optional second approval, reauthentication, network restriction, and a persistent production indicator in the UI.

**Pragmatic implementation, stated honestly:** for LOCAL and DEV the control plane runs as a module inside `apps/api` — same process, gateway contract already in place.

> **A separately deployed control plane with independent credentials is a hard gate on production launch (Phase 20).**

**`apps/admin` carries no database driver**, CI-enforced.

## Consequences

**Positive**

- Browser compromise does not yield production access.
- Every privileged action has a reason, an actor, and an audit record, in one place.
- Production access is auditable and revocable centrally; server-side revocation works for admin sessions.
- The gateway contract exists from Phase 8, so the Phase 20 split is a deployment change rather than a redesign.

**Negative — accepted**

- An extra hop on every admin request.
- The control plane is a high-value target and needs its own hardening.
- Running it in-process before Phase 20 means the trust boundary is contractual rather than physical in the interim. **Stated rather than glossed.**

## Alternatives rejected

**Admin browser holds per-environment tokens.** Rejected: puts production credentials in the least trustworthy component.

**One credential for all environments.** Rejected: no blast-radius containment, and no way to grant DEV access without granting production.

**Direct database access for admin tooling.** Rejected: bypasses RLS, audit, and capability gates. `apps/admin` carrying no driver is enforced for this reason.

**Deferring the control plane until a second engineer exists.** Rejected: the gateway contract must exist before production, and retrofitting it means re-plumbing every admin surface.

**Shipping production with the in-process control plane.** Rejected — hence the Phase 20 gate.
