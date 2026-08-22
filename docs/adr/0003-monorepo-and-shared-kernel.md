# ADR-0003 — Monorepo layout, package boundaries, and shared-kernel composition

**Status:** ACCEPTED · **Phase:** 1

## Context

Karar spans a backend, a Flutter client, generated SDKs, pure domain packages, and infrastructure code. Plan v1 placed all domain identifier types in `shared-kernel`. Experience with shared kernels is that they accumulate: every type that two modules touch becomes a candidate, and the kernel becomes a second, invisible coupling surface.

## Decision

**Monorepo** with `apps/`, `packages/`, `modules/`, `infra/`, `docs/`.

**All buildable or deployable application entrypoints live under `apps/`** — `apps/mobile/` (Flutter client), `apps/api/`, `apps/worker/`, `apps/admin/`. There is no singular `app/` directory; a client is an entrypoint like any other. `worker` remains a second entrypoint over the same module graph (ADR-0013), not a separate business application.

**`shared-kernel` contains exactly ten universals:**

```
Money · CalendarDay · Currency · Percentage · ExchangeRate · Clock · Result · DomainEvent · TenantId · UserId
```

CI caps the export surface (architecture test 20). Additions require an ADR. The tenth, `CalendarDay`, was added in [ADR-0027](0027-calendar-day-and-instant.md) and approved by the Platform Owner for one specific semantic distinction — a calendar day is not an instant. That approval does not widen the cap: an eleventh universal needs its own ADR, architecture justification, an architecture-test change and Platform Owner approval, exactly as the tenth did.

**Removed from the v1 kernel:** `AccountId`, `TransactionId`, `BudgetId`, `GoalId`, `FinancialPeriod`.

**The admission rule:** a type belongs in `shared-kernel` only if a module that has never heard of any other module still needs it.

- `UserId` qualifies — it appears in audit, consent, and nearly every tenant-owned aggregate. Forcing each domain to declare its own `OwnerRef` would produce duplication without buying isolation.
- `TransactionId` does not — it appears in `transactions` and in whatever consumes transactions, and that consumption is precisely the coupling that should be visible.

**Cross-module references** carry a raw UUID plus a reference type **declared in the consuming module**.

**`FinancialPeriod` moves to `financial-engine`** because it encodes calendar policy — when a month begins for budgeting, how a Hijri year is bounded — which is a business rule, not a universal.

## Consequences

**Positive**

- The kernel cannot grow into a second coupling surface without an ADR and a failing test.
- Cross-module coupling is **local and visible**: one file in the consumer declares the dependency.
- Severing a dependency later touches exactly one file.
- `FinancialPeriod` living with the engine means calendar decisions have one owner.

**Negative — accepted**

- Apparent duplication: several modules declare their own `TransactionRef`. This is the intended cost — it makes ambient coupling explicit.
- A monorepo needs task orchestration and caching to stay fast.

## Alternatives rejected

**Kernel containing all domain IDs (v1).** Rejected: it makes every module a silent participant in every other module's identity model, and it is the standard route by which a shared kernel becomes a distributed god object.

**Empty kernel; duplicate `Money` per module.** Rejected: `Money` correctness is the single most important invariant in the system. Two implementations would eventually disagree, and the disagreement would be about money.

**Polyrepo.** Rejected: cross-cutting changes — a new classification, a new pinning field, a policy clause — would become coordinated multi-repo releases for a team of one.

**`FinancialPeriod` in the kernel.** Rejected: a Hijri year boundary is a business rule with a jurisdiction and a subject preference attached. Universals do not have owners; this does.
