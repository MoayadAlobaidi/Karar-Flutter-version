# ADR-0007 — One authoritative financial engine

**Status:** ACCEPTED · **Phase:** 6

## Context

Financial figures appear on the Flutter client, in the API, in reports, in AI explanations, in projections, and in scheduled jobs. Any of these could compute its own version. Two implementations of a financial rule drift — and the one on the device cannot be fixed without a store review.

## Decision

**All authoritative financial math happens once, in `packages/financial-engine`** — a pure TypeScript package with no I/O, no clock read, no randomness, and no framework dependency.

> **The Flutter client performs no authoritative financial math.**

**One engine, never forked per country.** Jurisdiction differences enter as **typed policy inputs** — thresholds, ratios, permitted assumptions — never as branches (architecture test 12).

The client may compute layout, pagination, animation, client-side filtering of already-fetched data, and input validation that is re-validated server-side. It may not compute anything a user would treat as a financial fact.

## Consequences

**Positive**

- One definition of income, spend, savings rate, and category share, so **no two screens can disagree**.
- Exhaustive table-driven testing with no database.
- A recommendation is reproducible from its inputs and ruleset version, which is what makes provenance meaningful.
- The same engine runs at every deployment rung and in every jurisdiction.

**Negative — accepted**

- The client cannot compute optimistically; a figure requires a round trip.
- Offline financial computation is impossible. Accepted — the product has a read-only offline cache and no offline mutation queue.
- More API surface: every derived figure needs an endpoint or a field.

## Alternatives rejected

**Duplicate the calculation client-side for responsiveness.** Rejected: this is the drift scenario in its purest form, and the client copy is the one that cannot be hot-fixed.

**Compute in SQL.** Rejected: untestable without a database, unversionable in a way provenance can record, and it would place business rules in the layer furthest from review.

**Fork the engine per jurisdiction.** Rejected: two engines become four. A correction to a universal calculator would need applying N times, and the day one is missed is invisible.

**Let the AI compute.** Rejected categorically — see ADR-0010 and ADR-0019.
