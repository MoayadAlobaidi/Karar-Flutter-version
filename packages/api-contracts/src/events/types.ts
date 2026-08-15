/**
 * Typed shape of the domain event catalogue (`events/catalogue.json`).
 *
 * The catalogue is the governance surface of ADR-0025 / ADR-0012
 * (docs/architecture/event-governance.md): every published event is declared
 * here with its owner, classification, allowed consumers, retention, and
 * payload contract. This package stays runtime-light on purpose — pure
 * functions, zero dependencies — so both CI checks and runtime enforcement
 * (packages/platform/src/events) consume the same declarations.
 *
 * schemaVersion policy (event-governance.md section 5):
 *
 * - Adding an OPTIONAL field is additive — same `schemaVersion`.
 * - Removing or renaming a field is a NEW `schemaVersion`; both versions are
 *   published during the migration window.
 * - A semantic change to an existing field is a NEW version too — same shape
 *   with different meaning is the worst break, because nothing fails and
 *   everything drifts.
 */

/**
 * The six data classifications, mirroring
 * docs/security/data-classification.md section 1 exactly. Declared locally
 * because this package depends on nothing; `@karar/platform` asserts the two
 * lists agree (packages/platform/src/events tests).
 */
export const EVENT_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'HIGHLY_SENSITIVE_FINANCIAL',
  'SECRET',
  'SEALED',
] as const;
export type EventClassification = (typeof EVENT_CLASSIFICATIONS)[number];

/**
 * What an event payload may carry (event-governance.md section 3):
 *
 * - `identifier-only`        — identifiers only; nothing else.
 * - `identifiers-and-status` — identifiers plus a status/state field.
 * - `payload-permitted`      — payload allowed, governed by `payloadSchema`.
 *
 * `SEALED` events are capped at `identifiers-and-status` with NO exemption
 * mechanism — there is no field to set and no process to invoke.
 * `HIGHLY_SENSITIVE_FINANCIAL` events default to `identifier-only`; anything
 * more requires a `payloadExemption` naming owner, reason, and reviewer.
 */
export const EVENT_PAYLOAD_RULES = [
  'identifier-only',
  'identifiers-and-status',
  'payload-permitted',
] as const;
export type EventPayloadRule = (typeof EVENT_PAYLOAD_RULES)[number];

/**
 * A named, reviewed decision to let a HIGHLY_SENSITIVE_FINANCIAL event carry
 * payload beyond identifiers. Lives IN the catalogue entry so the exemption is
 * reviewable where the event is declared.
 */
export interface EventPayloadExemption {
  readonly owner: string;
  readonly reason: string;
  readonly reviewer: string;
}

/** Primitive JSON types the minimal payload schema can require. */
export const PAYLOAD_FIELD_TYPES = ['string', 'number', 'boolean'] as const;
export type PayloadFieldType = (typeof PAYLOAD_FIELD_TYPES)[number];

/**
 * Deliberately minimal payload schema: flat object, primitive fields, closed
 * shape (`additionalProperties: false` always). Rich validation belongs to a
 * later phase if an event ever genuinely needs nesting; starting closed keeps
 * payloads reviewable and the validator dependency-free.
 */
export interface EventPayloadSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, { readonly type: PayloadFieldType }>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/** One catalogue entry — the full governance record for one event. */
export interface EventCatalogueEntry {
  /** Catalogue-unique event name, e.g. `platform.diagnostic.ping`. */
  readonly name: string;
  /** Positive integer; bumped per the policy in this file's header. */
  readonly schemaVersion: number;
  /** The module that owns (and alone publishes) this event. */
  readonly ownerModule: string;
  readonly classification: EventClassification;
  /** True when the payload carries PII — retention and redaction depend on it. */
  readonly piiFlag: boolean;
  /** Consumers that may subscribe; anything else is refused at subscribe time. */
  readonly allowedConsumers: readonly string[];
  /** ISO-8601 duration, e.g. `P7D`, `P7Y`. */
  readonly retention: string;
  readonly payloadRule: EventPayloadRule;
  /** Only ever non-null on HIGHLY_SENSITIVE_FINANCIAL entries. */
  readonly payloadExemption: EventPayloadExemption | null;
  readonly payloadSchema: EventPayloadSchema;
}

export interface EventCatalogue {
  readonly events: readonly EventCatalogueEntry[];
}

/** The platform-owned diagnostic event; the only catalogued event in Phase 2. */
export const PLATFORM_DIAGNOSTIC_PING = 'platform.diagnostic.ping';

export type EventCatalogueErrorKind =
  'invalid_catalogue' | 'unknown_event' | 'consumer_not_allowed' | 'payload_schema_violation';

/** Typed failure for every catalogue guard; `kind` is the machine-readable reason. */
export class EventCatalogueError extends Error {
  readonly kind: EventCatalogueErrorKind;

  constructor(kind: EventCatalogueErrorKind, message: string) {
    super(message);
    this.name = 'EventCatalogueError';
    this.kind = kind;
  }
}
