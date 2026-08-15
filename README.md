# Karar

A Qatar-first, API-first **extensible capability platform** for personal financial wellbeing, operating across multiple jurisdictions through multiple legal entities, with a Flutter client and a TypeScript backend.

> **Status: Phase 0 — architecture and decisions only.**
> No application code, no dependencies, no Docker, no migrations. Everything in this repository is a decision, not an implementation.

---

## Start here

| If you want to… | Read |
|---|---|
| Understand the system | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Know why something is the way it is | [`docs/adr/`](docs/adr/README.md) — 26 decision records |
| Onboard as an engineer | [`docs/onboarding/developer.md`](docs/onboarding/developer.md) |
| See how it extends | [`docs/architecture/extension-pattern.md`](docs/architecture/extension-pattern.md) |
| See it worked end to end | [`docs/scenarios/`](docs/scenarios/) — four scenarios |
| Understand the legacy system | [`docs/legacy/qarar-audit.md`](docs/legacy/qarar-audit.md) |
| Look up a term | [`docs/glossary.md`](docs/glossary.md) |

## What Karar is not

Stated plainly so nothing is inferred from silence.

| | |
|---|---|
| Karar does not hold funds | No custody, no wallet, no float |
| Karar executes no payment | Not for subscriptions, Zakat, Sadaqah, or bills |
| Karar makes no credit decision | No scoring, origination, or disbursement |
| Karar gives no investment advice | |
| Karar's AI is never the source of financial truth | It explains figures the engine computed. **It never writes a number** |
| Karar asserts no regulatory approval | No certification, licence, or clearance is claimed anywhere |
| Karar asserts no Sharia review | The Zakat work is engineering against a written specification. Nothing more should be inferred |

## The decisions everything follows from

1. **Clean Architecture, compiler-enforced.** `domain/` and the pure packages declare zero framework dependencies, so a forbidden import does not resolve. ([ADR-0001](docs/adr/0001-clean-architecture.md))
2. **Modular monolith** with real seams. One deployable; `sealed-vault` designed from day one to be extracted. ([ADR-0002](docs/adr/0002-modular-monolith.md))
3. **One authoritative financial engine.** Money is BIGINT minor units with a `Currency` carrying its ISO 4217 exponent. The client computes nothing authoritative. ([ADR-0006](docs/adr/0006-monetary-representation.md), [ADR-0007](docs/adr/0007-one-financial-engine.md))
4. **Policy is typed code; availability is audited configuration** — and **settings may only restrict what code permits, never expand it.** ([ADR-0015](docs/adr/0015-policy-packs.md))
5. **Deny by default.** A capability with no availability row is `DISABLED`. Code existing is never sufficient for exposure. ([ADR-0016](docs/adr/0016-capability-registry.md))

## Layout

```
apps/         api · worker · admin          entrypoints, no business logic
packages/     shared-kernel · financial-engine · jurisdiction-policy · state-machine · api-contracts
modules/      20 bounded contexts, each with public-api.ts and MODULE.md
app/          Flutter client
infra/        Terraform — dev · staging · production from Phase 1
docs/         architecture · adr · security · legacy · scenarios · onboarding
scripts/      verification, drills, helpers
```

Every significant directory has a `README.md` stating what it owns and what may import it.

## Roadmap

**The critical path to a shippable Qatar B2C v1 is Phases 0–9.** Phases 10–21 are an architectural *option*, not a schedule — the seams are what keep that option cheap.

See [`docs/roadmap.md`](docs/roadmap.md).

## Licence

Proprietary. All rights reserved.
