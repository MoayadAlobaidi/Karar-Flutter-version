// The nine universals (docs/architecture/clean-architecture.md §7).
// Phase 1: type declarations only — starting points for Phase 2 domain work,
// not implementations. This surface is capped at exactly nine exports
// (architecture test 20); additions require an ADR.

/** ISO 4217 alphabetic code. Phase 2 narrows this to the supported set. */
export type Currency = string & { readonly __brand: 'Currency' };

/**
 * Integer minor units in a named currency. Monetary amounts are never floats
 * and never bare `number` (architecture test 7).
 */
export interface Money {
  readonly minorUnits: bigint;
  readonly currency: Currency;
}

/** Basis points: 10000n = 100%. Integer arithmetic only. */
export interface Percentage {
  readonly basisPoints: bigint;
}

/** A conversion rate scaled to an integer: rate / 10^scale, valid as of a moment. */
export interface ExchangeRate {
  readonly from: Currency;
  readonly to: Currency;
  readonly rate: bigint;
  readonly scale: number;
  readonly asOf: Date;
}

/**
 * Time arrives as an argument. Domain code never reads the system clock
 * (architecture test 11); implementations live in infrastructure.
 */
export interface Clock {
  now(): Date;
}

/**
 * Expected business outcomes are values, not exceptions
 * (docs/architecture/backend.md §9).
 */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Minimal event envelope. The catalogue in packages/api-contracts/events governs what may be published. */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly tenantId: TenantId;
}

export type TenantId = string & { readonly __brand: 'TenantId' };

export type UserId = string & { readonly __brand: 'UserId' };
