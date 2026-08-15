# Module: users

## Purpose

Customer profile, preferences, and locale. Owns the person, not the credential.

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
| `users` | `CONFIDENTIAL` | `CASCADE_DELETE` | name, Arabic name, phone — encrypted at rest |
| `user_preferences` | `CONFIDENTIAL` | `CASCADE_DELETE` | locale, notification settings |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `UserProfileUpdated` | `CONFIDENTIAL` | audit, projections | identifiers only |

## Permissions

| Permission | Role(s) |
|---|---|
| `users.profile.read` | `SUPPORT` |
| `users.status.update` | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** No role may read another customer's financial detail through this module.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

Subject-elected policy selections do **not** live here. `SubjectPolicySelection` is a platform *mechanism* (versioning, pinning, provenance — ADR-0015); the selection **records and profile content are capability-scoped** and stored by the owning capability — e.g. Zakat's `zakat_methodology_selections`. Elections are potentially sensitive and purpose-limited; this module never aggregates or exposes them.

Legacy MOB-04: profile fields encrypted server-side were cached in plaintext on device. The Flutter client uses secure storage for anything CONFIDENTIAL or above.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
