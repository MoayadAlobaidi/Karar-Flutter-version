/**
 * Data classification — the six canonical classes and the handling rules that
 * are enforceable as code (docs/security/data-classification.md, ADR-0017,
 * event-governance.md §3).
 *
 * This module is deliberately dependency-free — no imports, not even from
 * elsewhere in @karar/platform — because it is consumed from three directions:
 * the observability logger (log redaction), the event-catalogue validation
 * (payload rules), and the audit module's metadata guard. A helper that pulled
 * in a logger or an event type would create exactly the cycle it exists to
 * police.
 *
 * The six names below are canonical. `observability/classified.ts` carries a
 * thin local front of the same names and re-points here at integration; any
 * seventh name, or a rename, is a documentation change first (ADR-0017 added
 * the sixth class by ADR, not by edit).
 */

/** The six classes, in ascending order of handling restriction. */
export const DATA_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'HIGHLY_SENSITIVE_FINANCIAL',
  'SECRET',
  'SEALED',
] as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/** Replacement for a SEALED value anywhere one is about to leave its store. */
export const REDACTED_SEALED = '[sealed]';
/** Replacement for a SECRET value; the marker names the class so a leak is traceable to its rule. */
export const REDACTED_SECRET = '[redacted:secret]';
/** Replacement for a HIGHLY_SENSITIVE_FINANCIAL value outside an allow-listed position. */
export const REDACTED_HSF = '[redacted:hsf]';

/**
 * May a value of this classification appear in a log statement at all?
 *
 * `SECRET` and `SEALED` are `false`: the handling matrix says **never**, so a
 * logger consults this before accepting the field. `CONFIDENTIAL` and
 * `HIGHLY_SENSITIVE_FINANCIAL` are `true` — they may appear, but only in
 * redacted form; that per-sink redaction is the logger's job
 * (data-classification.md §2 row "In logs").
 */
export function isLoggable(classification: DataClassification): boolean {
  return classification !== 'SECRET' && classification !== 'SEALED';
}

/**
 * The mandatory value-level replacement for a classification, or `null` when
 * the value may pass through unchanged.
 *
 * `null` (passthrough) for `PUBLIC`, `INTERNAL`, and `CONFIDENTIAL` means
 * "no unconditional replacement exists" — CONFIDENTIAL still gets redacted at
 * specific sinks (logs), which is contextual policy owned by the sink, not a
 * property of the value.
 */
export function redactionFor(classification: DataClassification): string | null {
  switch (classification) {
    case 'SEALED':
      return REDACTED_SEALED;
    case 'SECRET':
      return REDACTED_SECRET;
    case 'HIGHLY_SENSITIVE_FINANCIAL':
      return REDACTED_HSF;
    case 'PUBLIC':
    case 'INTERNAL':
    case 'CONFIDENTIAL':
      return null;
  }
}

/** Applies `redactionFor`: the replacement string, or the value untouched. */
export function redact<T>(value: T, classification: DataClassification): T | string {
  return redactionFor(classification) ?? value;
}

/**
 * A declared HIGHLY_SENSITIVE_FINANCIAL payload exemption: a named, reviewed
 * decision (event-governance.md §3). All three fields must be non-empty; CI
 * fails a catalogue entry without them, and this module fails the same shape
 * at runtime call sites.
 */
export interface PayloadExemption {
  readonly owner: string;
  readonly reason: string;
  readonly reviewer: string;
}

/** Thrown when an event payload shape violates the classification's payload rule. A defect, not an outcome. */
export class EventPayloadViolation extends Error {
  override readonly name = 'EventPayloadViolation';
  readonly classification: DataClassification;
  readonly offendingFields: readonly string[];

  constructor(
    classification: DataClassification,
    offendingFields: readonly string[],
    message: string,
  ) {
    super(message);
    this.classification = classification;
    this.offendingFields = offendingFields;
  }
}

// Identifier-and-status vocabulary. The catalogue's canonical example uses
// snake_case (`case_id`, `occurred_at`, event-governance.md §3) while domain
// code uses camelCase, so both spellings are accepted.
const isIdField = (field: string): boolean =>
  field === 'id' || /Id$/.test(field) || /_id$/.test(field);
const isOccurredAtField = (field: string): boolean =>
  field === 'occurredAt' || field === 'occurred_at';

function fieldNames(payloadShape: readonly string[] | Record<string, unknown>): readonly string[] {
  return Array.isArray(payloadShape) ? payloadShape : Object.keys(payloadShape);
}

/**
 * Asserts an event payload shape is allowed under the classification's payload
 * rule (event-governance.md §3, data-classification.md §2):
 *
 * - `SEALED` — identifiers and status only: `id`, `status`, `*Id`/`*_id`,
 *   `occurredAt`/`occurred_at`. **No exemption mechanism exists**; a supplied
 *   `exemption` is ignored, never honoured.
 * - `SECRET` — never in an event at all; throws regardless of shape.
 * - `HIGHLY_SENSITIVE_FINANCIAL` — identifier-only (`id`, `*Id`/`*_id`,
 *   `occurredAt`/`occurred_at`) unless a complete {owner, reason, reviewer}
 *   exemption is declared.
 * - `PUBLIC`/`INTERNAL`/`CONFIDENTIAL` — payload permitted; schema versioning
 *   is the catalogue's concern, not this function's.
 *
 * `payloadShape` is the payload's field names (or an object whose keys are).
 * Throws `EventPayloadViolation`; returns nothing — an allowed shape is the
 * absence of an exception.
 */
export function assertEventPayloadAllowed(
  classification: DataClassification,
  payloadShape: readonly string[] | Record<string, unknown>,
  exemption?: PayloadExemption,
): void {
  const fields = fieldNames(payloadShape);

  if (classification === 'SECRET') {
    throw new EventPayloadViolation(
      'SECRET',
      fields,
      'SECRET data never appears in an event; there is no allowed payload shape (data-classification.md §2)',
    );
  }

  if (classification === 'SEALED') {
    const offending = fields.filter(
      (field) => !(isIdField(field) || field === 'status' || isOccurredAtField(field)),
    );
    if (offending.length > 0) {
      throw new EventPayloadViolation(
        'SEALED',
        offending,
        `SEALED events carry identifiers and status only; disallowed field(s): ${offending.join(', ')}. ` +
          'No exemption mechanism exists (event-governance.md §3)',
      );
    }
    return;
  }

  if (classification === 'HIGHLY_SENSITIVE_FINANCIAL') {
    const offending = fields.filter((field) => !(isIdField(field) || isOccurredAtField(field)));
    if (offending.length === 0) {
      return;
    }
    const complete =
      exemption !== undefined &&
      ([exemption.owner, exemption.reason, exemption.reviewer] as const).every(
        (part) => typeof part === 'string' && part.trim() !== '',
      );
    if (!complete) {
      throw new EventPayloadViolation(
        'HIGHLY_SENSITIVE_FINANCIAL',
        offending,
        `HIGHLY_SENSITIVE_FINANCIAL events are identifier-only by default; field(s) ${offending.join(', ')} ` +
          'require a declared payloadExemption naming owner, reason, and reviewer (event-governance.md §3)',
      );
    }
  }
}
