# jurisdiction — Presentation layer

**Exactly one route: `POST /jurisdiction/self-declaration`.**

A subject declares where they are, for themselves. The declaration is recorded
with source `USER_DECLARED` and verification status `UNVERIFIED`, both fixed by
the use case rather than supplied by the caller and both re-enforced by the
schema CHECKs on migration `0072`. An UNVERIFIED effective state is a
first-class denial in the capability ceiling, so a declaration changes the
denial reason a subject sees and clears nothing.

It exists because without it no user jurisdiction assignment can come into
being at runtime at all: every other write here is gated on
`jurisdiction.assignment.manage`, deliberately unseeded until the control
plane, so a subject would have no governing jurisdiction, no PolicyPack would
resolve, and consent acceptance could pin no provenance.

**Deliberately absent, and to stay absent:** operator assignment, verification,
jurisdiction-settings writes, and PolicyPack activation. Those are Super Admin
surfaces and mount behind the control-plane gateway (ADR-0021, Phase 8) behind
the permissions MODULE.md declares. Nothing here approves a jurisdiction,
activates a pack, or verifies anything.

## Import rules

This layer imports this module's `application/` only; never any module's
`domain/` for behaviour and never another module (architecture tests 3 and 6).
The principal arrives through an injected source bound by the composition root
— identity is never read from a query, a header, or a body field.

---

_The client reads its jurisdiction context through the authenticated bootstrap
endpoint; this route is the one write that context depends on._
