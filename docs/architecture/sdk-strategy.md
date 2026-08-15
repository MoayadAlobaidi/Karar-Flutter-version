# API and SDK Strategy

**ADR:** 0009 · **Phase:** 12 (partner API), Dart SDK from Phase 4

---

## 1. OpenAPI-first

The contract in `packages/api-contracts` is **authored, not generated from code**. SDKs are generated from it.

| | |
|---|---|
| Dart client | Generated, committed, consumed by the Flutter app |
| TypeScript client | Generated, for the admin SPA and partners |
| Hand-editing a generated client | **CI failure** |
| Contract change | Reviewed like code; breaking changes version the API |

Authoring the contract first means the API is designed rather than emitted. A contract generated from controllers describes whatever the controllers happen to do — including the accidents.

## 2. Versioning

`/api/v1/…`. Additive changes stay in `v1`; breaking changes create `v2` and both run during migration.

**Breaking** means: removing or renaming a field, narrowing a type, adding a required request field, changing a status code's meaning, or **changing the semantics of an existing field**. The last is the most dangerous because nothing fails — the shape is identical and the meaning drifted.

## 3. Namespaces

| Namespace | Audience |
|---|---|
| `/api/v1/…` | Consumer |
| `/api/v1/admin/…` | Platform staff, via the control plane |
| `/api/v1/tenant-admin/…` | Partner administrators, tenant-scoped |
| `/api/v1/partner/…` | Partner integrations (Phase 12) |

## 4. Capability scoping narrows the surface automatically

A client's reachable surface is derived from its **entitlements**, not from a flag.

- A partner tenant with no Amanat entitlement receives **no Amanat client code**.
- An endpoint for an unavailable capability returns a typed denial with a machine-readable reason, never a bare 404 that leaves the client guessing.
- **`sdkExposure` is declared per capability** in its descriptor and defaults to `false`.

Amanat's is `false` and stays false until the legal and partner models are settled (checklist point 16).

## 5. Money on the wire

```json
{ "amount": { "minorUnits": "1234567", "currency": "QAR" } }
```

`minorUnits` is a **string**, because a 64-bit integer does not survive JavaScript's number type. A generated TypeScript SDK that silently truncates a balance is a defect no test catches until the amounts get large.

## 6. Errors

RFC 7807 problem responses. **Every capability denial carries a machine-readable reason** — `CAPABILITY_UNAVAILABLE`, `PENDING_LEGAL_REVIEW`, `CONSENT_REQUIRED`, `ENTITLEMENT_MISSING` — so a client can render an honest state rather than an unexplained absence.

## 7. Partner authentication (Phase 12)

| | |
|---|---|
| API clients | Per-tenant, scoped to entitled capabilities |
| Credentials | Rotatable, with expiry |
| Webhooks | Signed, replay-protected, with delivery audit |
| Rate limits | Per client, on the **normalised, decoded** path |

## 8. Documented, not merely published

The contract carries examples, error catalogues, and capability-availability semantics — so a partner can tell "not entitled" from "not yet available in your jurisdiction" from "consent required" without asking.

## 9. Deferred

| | Seam |
|---|---|
| Swift / Kotlin SDKs | The OpenAPI contract |
| Embedded SDK host integration | Phase 15 |
| Public developer portal | Phase 12+ |
| Certificate pinning | Challenge C11 — recorded acceptance, not oversight |
