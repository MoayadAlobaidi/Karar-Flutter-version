# ADR-0006 — Monetary representation

**Status:** ACCEPTED · **Phase:** 2 · **Irreversible in practice**

## Context

Karar operates across currencies with different ISO 4217 exponents: QAR, SAR, AED at 2 decimals; **KWD, BHD, OMR at 3**. Money representation is the one decision that cannot be corrected after data exists — a migration would have to reinterpret every stored amount, and any ambiguity about which values were already converted makes that migration unsafe.

## Decision

**`BIGINT` minor units + a `Currency` value object carrying its ISO 4217 exponent.**

```sql
amount_minor   BIGINT   NOT NULL,
currency_code  CHAR(3)  NOT NULL
```

```ts
class Money {
  private constructor(readonly minorUnits: bigint, readonly currency: Currency) {}
}
```

- **No floating point anywhere in the money path** — database, domain, API, or Dart. Architecture test 7.
- **The exponent lives on `Currency`**, never assumed to be 2.
- **Rounding is explicit at every boundary**, with the mode a declared input recorded in provenance.
- On the wire, `minorUnits` is a **string**, because a 64-bit integer does not survive JavaScript's number type.
- Weights, purities, ratios, and rates are **not** `Money` — `Percentage` and `ExchangeRate` are separate kernel types.

## Consequences

**Positive**

- Exact arithmetic. No accumulated representation error.
- Three-decimal currencies are correct by construction rather than by special case.
- `BIGINT` range is far beyond any plausible amount.
- Rounding is visible in code review because it must be written.

**Negative — accepted**

- `bigint` ergonomics in TypeScript are poor: no arithmetic operators with `number`, serialization needs care.
- The string-on-the-wire rule surprises API consumers and must be documented prominently.
- Every division needs an explicit rounding decision. This is a feature.

## Alternatives rejected

**Floating point (`double`, `float`, `REAL`).** Rejected absolutely. Binary floating point cannot represent 0.1 exactly; errors accumulate; comparisons become approximate. In a system whose first priority is financial correctness this is disqualifying.

**`DECIMAL`/`NUMERIC` with a decimal library.** Genuinely defensible — the legacy uses exact `BigDecimal` successfully. Rejected because minor units make the exponent question **unavoidable**: a developer cannot write `1000` without knowing which currency it is. With `DECIMAL`, a two-decimal assumption compiles, runs, and is wrong only for KWD, BHD, and OMR — which is exactly the bug that survives testing in Qatar.

**Storing a formatted string.** Rejected: no arithmetic, no ordering, locale ambiguity.

**A single platform currency with conversion at the edge.** Rejected: it destroys the customer's actual figures and makes historical reporting depend on a rate that changed.
