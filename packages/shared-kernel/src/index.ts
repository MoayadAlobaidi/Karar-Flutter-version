// The ten universals (docs/architecture/clean-architecture.md §7, ADR-0003).
//
// This surface is capped at exactly ten exported names; architecture test 20
// fails the build on an eleventh. CalendarDay was the tenth (ADR-0027): a date
// on a statement is not an instant, and a `Date` cannot say so. Additions require an ADR. The admission rule: a
// type belongs here only if a module that has never heard of any other module
// still needs it.
//
// Supporting vocabulary (rounding modes, currency codes, typed errors, the
// fixed clock, Result combinators) is reachable as members of the nine via
// declaration merging — `Money.RoundingMode`, `Currency.Code`,
// `Currency.UnsupportedCurrencyError`, `Clock.Fixed`, `Result.ok`, … — so the
// export cap holds without hiding the toolbox.

export { Money } from './money';
export { Currency } from './currency';
export { Percentage } from './percentage';
export { ExchangeRate } from './exchange-rate';
export { Clock } from './clock';
export { CalendarDay } from './calendar-day';
export { Result } from './result';
export { DomainEvent } from './domain-event';
export { TenantId } from './tenant-id';
export { UserId } from './user-id';
