# ADR-0022 — Row Level Security in Phase 3

**Status:** ACCEPTED · **Phase:** 3 · **Supersedes** Plan v1's Phase 11 placement

## Context

Plan v1 scheduled RLS for Phase 11, alongside white-label work. The reasoning was that isolation matters most when a second tenant exists.

The legacy audit refutes it with direct evidence. Qarar retrofitted RLS across V9, V30, and V40, and at HEAD:

- **24 of 69 tables have no RLS** — 13 correctly public, 5 documented bootstrap exclusions, and **6 unexplained, `users` among them**.
- Four tenant tables were passed over by V40 *"without comment; no migration, document or test states a position either way."*
- `tenant_invitations` holds a bearer invite code and **has no RLS at all**.
- The admin audit log is **FORCEd but not enabled** — a shape *"no existing guard detects."*
- Isolation is proved for **3 of 45 tables**, and **UPDATE has never been exercised at all**.

A retrofit is never quite complete, and the gaps are invisible because a missing policy looks exactly like a working one.

## Decision

**RLS is built in Phase 3, with tenancy, before any consumer data model exists.**

- Every `public` table is `ENABLE` **and** `FORCE ROW LEVEL SECURITY`, or on an explicit allow-list with a written reason and a reviewer.
- Application role has **no `BYPASSRLS`**; migrations run as a separate role.
- `SET LOCAL app.tenant_id` per transaction, bound **from the caller's own record**, never from client input.
- **Architecture test 22** detects all three failure shapes: *no RLS*, *enabled-without-policy*, and **FORCEd-without-enabled**.
- Adversarial cross-tenant tests in CI **assert on non-empty expected data** and exercise **SELECT, UPDATE, and DELETE**.

## Consequences

**Positive**

- Every table is born with RLS. There is no retrofit and no invisible gap.
- A new table shipping without RLS **fails the build**.
- Staff access gets a genuine second layer, closing the legacy's AZ1 shape.
- The transaction wrapper's cost is absorbed into the initial design rather than imposed on existing code.

**Negative — accepted**

- Phase 3 is larger. Roughly one increment, against a platform-wide retrofit later.
- Every tenant-scoped query runs in an interactive transaction (ADR-0005). Documented, accepted.
- Local development runs the same policies, so a developer can hit an isolation error on a laptop. **This is the control working.**

## Alternatives rejected

**RLS at Phase 11 (v1).** Rejected on the legacy's evidence.

**Application-layer filtering only.** Rejected: defeated by any path that forgets the filter.

**RLS in production only.** Rejected: a control tested only in production is a control tested in production.

**A guard testing only for "enabled but no policy".** Rejected: that is precisely the legacy's guard, and it misses both other shapes — including the one on its own audit table.

**Adversarial tests asserting only that cross-tenant reads return nothing.** Rejected: *"an empty roster is indistinguishable from correct isolation."* Tests must assert non-empty expected data for the legitimate tenant.
