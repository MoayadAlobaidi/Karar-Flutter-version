/**
 * The platform event envelope (docs/architecture/event-governance.md;
 * infrastructure-portability.md section 6).
 *
 * The envelope is OPAQUE and provider-neutral: plain JSON-serializable fields,
 * never a transport-specific message shape. Whatever bus a deployment profile
 * provides (the in-memory bus locally), adapters translate at the edge and the
 * envelope itself never changes.
 *
 * Two timestamps, two responsibilities:
 * - `occurredAt` — when the fact happened; stamped by `makeEnvelope` from the
 *   injected Clock (time arrives as an argument, never an ambient read).
 * - `recordedAt` — when the envelope was durably persisted; stamped by the
 *   transactional outbox at insert time (src/outbox). `makeEnvelope` therefore
 *   returns a `PendingEventEnvelope` — the type system says "not persisted
 *   yet" instead of a placeholder value saying it dishonestly.
 */
import { randomUUID } from 'node:crypto';

import {
  assertPayloadMatchesSchema,
  getEventEntry,
  type EventCatalogue,
  type EventClassification,
} from '@karar/api-contracts';
import type { Clock } from '@karar/shared-kernel';

import { assertEventPayloadAllowed } from '../classification/index.js';

export interface EventEnvelope {
  /** UUID of this occurrence; consumer idempotency keys on it (ADR-0012). */
  readonly eventId: string;
  /** Catalogue name, e.g. `platform.diagnostic.ping`. */
  readonly eventName: string;
  /** The catalogue entry's schemaVersion at publish time. */
  readonly schemaVersion: number;
  /** ISO-8601 UTC instant the fact happened (injected Clock). */
  readonly occurredAt: string;
  /** ISO-8601 UTC instant the envelope was persisted to the outbox. */
  readonly recordedAt: string;
  /** Correlates every envelope in one causal flow; generated when absent. */
  readonly correlationId: string;
  /** eventId of the envelope that directly caused this one, when there is one. */
  readonly causationId: string | null;
  /** Present only for tenant-scoped events. */
  readonly tenantId?: string;
  /** The publishing process, e.g. `karar-worker`. */
  readonly producer: string;
  /** Mirrors the catalogue entry; stamped here so consumers never re-derive it. */
  readonly classification: EventClassification;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** An envelope that has not been persisted yet — everything but `recordedAt`. */
export type PendingEventEnvelope = Omit<EventEnvelope, 'recordedAt'>;

export interface MakeEnvelopeInput {
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly tenantId?: string;
  readonly producer: string;
  readonly clock: Clock;
}

function assertNonEmpty(field: string, value: string): void {
  if (value.trim() === '') {
    throw new Error(`makeEnvelope requires a non-empty ${field}`);
  }
}

/**
 * Builds a validated envelope for a CATALOGUED event, or throws:
 * unknown name → `EventCatalogueError('unknown_event')`; payload outside the
 * entry's schema → `EventCatalogueError('payload_schema_violation')`; payload
 * the classification forbids → `EventPayloadViolation` (the classification
 * module owns those rules: SEALED identifiers/status only with no exemption,
 * HIGHLY_SENSITIVE_FINANCIAL identifier-only unless the CATALOGUE ENTRY
 * carries the {owner, reason, reviewer} exemption).
 */
export function makeEnvelope(
  catalogue: EventCatalogue,
  input: MakeEnvelopeInput,
): PendingEventEnvelope {
  const entry = getEventEntry(catalogue, input.name);
  assertPayloadMatchesSchema(entry, input.payload);
  assertEventPayloadAllowed(
    entry.classification,
    input.payload,
    entry.payloadExemption ?? undefined,
  );
  assertNonEmpty('producer', input.producer);
  if (input.correlationId !== undefined) assertNonEmpty('correlationId', input.correlationId);
  if (input.causationId !== undefined) assertNonEmpty('causationId', input.causationId);
  if (input.tenantId !== undefined) assertNonEmpty('tenantId', input.tenantId);

  return Object.freeze({
    eventId: randomUUID(),
    eventName: entry.name,
    schemaVersion: entry.schemaVersion,
    occurredAt: input.clock.now().toISOString(),
    correlationId: input.correlationId ?? randomUUID(),
    causationId: input.causationId ?? null,
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    producer: input.producer,
    classification: entry.classification,
    payload: Object.freeze({ ...input.payload }),
  });
}

/** Stamps `recordedAt`, completing a pending envelope. Used by the outbox at persist time. */
export function recordEnvelope(pending: PendingEventEnvelope, recordedAt: Date): EventEnvelope {
  return Object.freeze({ ...pending, recordedAt: recordedAt.toISOString() });
}
