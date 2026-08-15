# Module: control-plane

## Purpose

Security gateway for administrative access: identity, environment scoping, reason capture, approval, and short-lived token minting.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 8
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `admin_identities` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` |  |
| `control_plane_audit` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | append-only |
| `scoped_tokens` | `SECRET` | `CASCADE` | short-lived, single-environment, purpose-scoped |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `PrivilegedActionPerformed` | `CONFIDENTIAL` | audit | payload permitted — reason captured |

## Permissions

| Permission | Role(s) |
|---|---|
| `controlplane.environment.access` | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** No browser session holds an environment credential.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

For LOCAL and DEV the control plane runs as a module inside `apps/api` — same process, gateway contract already in place. **A separately deployed control plane with independent credentials is a hard gate on production launch (Phase 20).** Stated rather than glossed.

`apps/admin` carries no database driver, CI-enforced.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
