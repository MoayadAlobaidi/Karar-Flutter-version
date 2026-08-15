# ADR-0025 — Domain event governance and identifier-only payload rules

**Status:** ACCEPTED · **Phase:** 2

## Context

**Events couple systems as surely as imports do — and less visibly.** An import that reaches into a module's internals fails CI. An event whose payload quietly grows a field that three consumers come to depend on fails nothing, until the day it changes.

Events are also a data-egress path. An event carrying financial detail is that detail, replicated to every consumer, every log, and every dead-letter queue.

## Decision

**A central catalogue in `packages/api-contracts/events/`.** Every event declares name, schema version, owning module, classification, allowed consumers, PII flag, and retention.

**CI-enforced:**

- A published event absent from the catalogue **fails the build**.
- A consumer not in `allowedConsumers` **fails the build**.
- Schema changes must be additive or version-bumped.

**Payload rules by classification:**

| Classification | Rule |
|---|---|
| `SEALED` | **Identifier and status only. Mandatory. No exemption exists.** |
| `HIGHLY_SENSITIVE_FINANCIAL` | **Identifier-only by default.** Payload requires a `payloadExemption` naming owner, reason, and reviewer |
| Others | Payload permitted; schema versioned |

**Consumers** are idempotent, failure-isolated, and **write only their own module's data**.

Naming: `<Aggregate><PastTenseVerb>`.

## Consequences

**Positive**

- "Who listens to this?" is a declaration, not an archaeology exercise.
- Sealed data cannot leak through the event bus, by construction.
- Financial detail in an event is a named, reviewed decision rather than a default.
- The catalogue is a reviewable document describing the system's internal coupling.

**Negative — accepted**

- Adding a consumer requires touching the owning module's catalogue entry — a deliberate friction that makes coupling visible.
- Identifier-only events mean consumers must fetch what they need, costing a round trip.
- The catalogue must be maintained, and CI failures on it will occasionally feel bureaucratic.

## Alternatives rejected

**No catalogue; events defined at the publisher.** Rejected: no way to enforce payload rules, no way to know consumers, no way to review coupling.

**Fat events carrying full state.** Rejected: convenient and the fastest route to sealed or sensitive data in a dead-letter queue. It also couples consumers to the publisher's full shape.

**An exemption mechanism for `SEALED`.** Rejected deliberately. Not "an exemption requiring executive approval" — **none**. There is no field to set and no process to invoke, so there is no conversation in which someone argues for one.

**Runtime payload filtering by classification.** Rejected: it puts the control at the wrong end. A filter is a thing that can be misconfigured; a build failure is not.

**Allowing consumers to write across modules.** Rejected: an event handler writing another module's tables bypasses `public-api.ts` through the back door.
