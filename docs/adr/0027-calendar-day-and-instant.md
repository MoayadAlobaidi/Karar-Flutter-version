# ADR-0027 — Calendar days and instants are different types

**Status:** ACCEPTED · **Phase:** 5 · **Irreversible in practice for stored ledger data**

## Context

A statement line says a payment was booked on 12 August. That is not a moment in time — it is what the institution wrote on its books. The Phase 5 foundation stored it as `timestamptz` anyway, because that is what every other temporal column in the system is and because TypeScript offers `Date` and nothing else.

Storing a calendar date as an instant forces a time onto it, and the moment a time exists the value acquires a timezone whether or not anyone chose one. The cost is not theoretical:

- Stored as midnight UTC, a purchase booked on the 12th reads as the 11th for any reader at a negative offset. **At a month boundary it moves to the previous month**, so a statement for August gains or loses a line depending on where it is read. Two people looking at one account would see different totals and both would be reading the data correctly.
- Grouping, filtering by date range, "this month's spending", and duplicate detection on `(date, amount, merchant)` all inherit the shift.
- It compounds with [ADR-0006](0006-monetary-representation.md): an exact amount on a date that moves is not an exact record.

The same conflation runs the other way. `created_at`, `recorded_at` and `captured_at` ARE instants — the moment this system learned something — and modelling them as dates would discard the ordering that provenance depends on.

This decision is taken now because [F3](../phases/phase-05.md) has just pinned every session to UTC. That pinning makes the *instant* columns correct and consistent; it does not make a calendar date into an instant, and a reader could easily conclude the timezone question is now closed. It is not: pinning the session removes the variation between readers, while this ADR removes the question of what the value means.

## Decision

**Two types, chosen by what the value IS, not by what is convenient to store.**

| Kind | Meaning | PostgreSQL | Domain |
|---|---|---|---|
| Calendar day | What an institution wrote on a statement | `date` | `CalendarDay` |
| Instant | A moment this system observed or recorded | `timestamptz` | `Date` |

- **`booking_date` and `value_date` are `date`.** They are the institution's dates, and they do not shift.
- **Everything else stays `timestamptz`**: `created_at`, `updated_at`, `recorded_at`, `captured_at`, `assigned_at`, `retired_at`, `superseded_at`, `as_of`. A balance "as of" a moment is an instant; the source observed it at a point in time.
- **`CalendarDay` becomes the tenth kernel universal.** It satisfies the kernel admission rule in [`index.ts`](../../packages/shared-kernel/src/index.ts): a module that has never heard of any other module still needs it. Architecture test 20's export cap moves from nine to ten, deliberately and once.
- **Converting an instant to a day requires naming a timezone.** `CalendarDay.fromInstant(instant, timeZone)` has no default and there is no `today()`. "What day is this instant on" has no answer until someone names a place — the same instant is Tuesday in Doha and Monday in Toronto. A required argument turns that ambiguity into something a reader of the call site can see and a reviewer can question.
- **`CalendarDay.parse` refuses a string carrying a time or a zone.** A caller holding `2026-08-12T00:00:00Z` has an instant and has not yet decided which zone turns it into a day; truncating the suffix would make that decision for them silently.
- **Invalid dates are refused, never rolled forward.** 31 April is an error, not 1 May, because that is how a wrong date becomes a plausible one.

## Consequences

- Migrations `0090` and `0091` change `booking_date` and `value_date` from `timestamptz` to `date`. They are unmerged and deployed nowhere; any disposable local database must be recreated.
- The wire format for these fields is `YYYY-MM-DD`, not an ISO instant. The generated Dart client carries them as a date-only type for the same reason the backend does.
- Date-range queries over a ledger are now timezone-independent by construction rather than by everyone remembering to normalize.
- A future timezone-aware feature — "what time of day do I spend" — needs a genuine instant captured at ingestion, and CSV statements largely do not carry one. That is a limit of the source data, and it is better stated than faked by reading a time out of a date.
- The kernel cap becomes ten. It does not become "whatever is useful next"; the admission rule and the ADR requirement are unchanged.
