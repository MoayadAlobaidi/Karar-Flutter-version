/**
 * The three value types this surface must serialize by hand, and why each one
 * would be wrong if it were serialized by default.
 *
 * MONEY. `Money` holds a `bigint` and has no `toJSON`, so `JSON.stringify`
 * THROWS on it rather than emitting something wrong — which is the right
 * failure, and the reason nothing here relies on the default. The wire form
 * is the exact integer count of minor units as CHARACTERS, with the currency
 * and its ISO 4217 exponent beside it (ADR-0006). A JSON number would be a
 * float, and a float is not a ledger value: 0.1 + 0.2 is not 0.3, and a
 * balance is not a place to discover that.
 *
 * CALENDAR DAYS. `CalendarDay` is a class with `year`, `month` and `day`
 * fields, so the default serialization would emit an object nobody asked for.
 * `toString()` is its only serialization, on the wire and in the database
 * (ADR-0027). A day is deliberately NOT sent as an instant: stored or sent as
 * midnight UTC, a purchase booked on the 12th reads as the 11th for anyone at
 * a negative offset, and at a month boundary it moves to the previous MONTH.
 *
 * HOLDER-SENSITIVE FIELDS. `HsfField` DEFENDS itself: its `toString`,
 * `toJSON` and inspect hooks all return the redaction marker, and the
 * plaintext is a private field reachable only through `reveal()`. That means
 * a forgotten mapping produces `[HIGHLY_SENSITIVE_FINANCIAL redacted]` on the
 * wire rather than a leak — a safe failure, but still a failure. Every place
 * this surface renders one, it calls `reveal()` deliberately, for the field's
 * OWNER and nobody else, and that call is the visible decision to disclose.
 *
 * WHAT IS NOT HERE, and must not be added: any function that serializes an
 * `EncryptedField` (ciphertext, nonce, algorithm, key version, auth tag), a
 * fingerprint of any kind, a stored-source descriptor, or a raw parsed row.
 * Those types never reach this layer, and there is deliberately no helper
 * that would make it convenient if one did.
 */

import type { CalendarDay, Money } from '@karar/shared-kernel';

/** The wire shape of an exact amount. */
export interface AmountWire {
  readonly minorUnits: string;
  readonly currency: string;
  readonly exponent: number;
}

/** Anything that reveals a plaintext holder-sensitive value to its owner. */
export interface RevealableField {
  reveal(): string;
}

export function amountWire(money: Money): AmountWire {
  return {
    minorUnits: money.toWireString(),
    currency: money.currency.code,
    exponent: money.currency.exponent,
  };
}

/** An amount built from parts the module hands over as a bigint plus a code. */
export function amountWireOfParts(
  minorUnits: bigint,
  currencyCode: string,
  exponent: number,
): AmountWire {
  return { minorUnits: minorUnits.toString(), currency: currencyCode, exponent };
}

/** `YYYY-MM-DD`. The only serialization a calendar day has. */
export function dayWire(day: CalendarDay): string {
  return day.toString();
}

export function nullableDayWire(day: CalendarDay | null): string | null {
  return day === null ? null : day.toString();
}

/** An instant, with an explicit offset. Never used for a calendar day. */
export function instantWire(instant: Date): string {
  return instant.toISOString();
}

export function nullableInstantWire(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}

/** Discloses a holder-sensitive value to the principal who owns it. */
export function revealWire(field: RevealableField): string {
  return field.reveal();
}

export function nullableRevealWire(field: RevealableField | null): string | null {
  return field === null ? null : field.reveal();
}
