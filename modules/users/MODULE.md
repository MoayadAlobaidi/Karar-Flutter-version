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
| `users` | `CONFIDENTIAL` | `CASCADE` | name, Arabic name, phone — encrypted at rest |
| `user_preferences` | `CONFIDENTIAL` | `CASCADE` | locale, notification settings |
| `subject_policy_profiles` | `CONFIDENTIAL` | `CASCADE` | elected conventions; versioned and pinned into records |

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

`subject_policy_profiles` implements the fourth policy dimension (ADR-0015). Where a capability declares no elective options the profile is absent and costs nothing.

Legacy MOB-04: profile fields encrypted server-side were cached in plaintext on device. The Flutter client uses secure storage for anything CONFIDENTIAL or above.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
