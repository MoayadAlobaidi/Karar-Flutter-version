/**
 * Minimal, dependency-free payload validation against an
 * `EventPayloadSchema` (flat object, primitive fields, closed shape).
 * Violation messages name FIELDS and rules, never values — payloads may be
 * classified and these messages travel into logs and `last_error` columns.
 */
import { EventCatalogueError, type EventCatalogueEntry, type EventPayloadSchema } from './types.js';

/** Returns every violation; empty array means the payload conforms. */
export function validatePayloadAgainstSchema(
  schema: EventPayloadSchema,
  payload: unknown,
): string[] {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['payload must be a plain object'];
  }
  const violations: string[] = [];
  const record = payload as Record<string, unknown>;
  for (const field of schema.required) {
    if (!(field in record)) {
      violations.push(`missing required field '${field}'`);
    }
  }
  for (const [field, value] of Object.entries(record)) {
    const spec = schema.properties[field];
    if (spec === undefined) {
      violations.push(`unexpected field '${field}' (schema is closed: additionalProperties false)`);
      continue;
    }
    if (typeof value !== spec.type) {
      violations.push(`field '${field}' must be a ${spec.type}`);
    }
  }
  return violations;
}

/** Throws `EventCatalogueError('payload_schema_violation')` naming every violation. */
export function assertPayloadMatchesSchema(entry: EventCatalogueEntry, payload: unknown): void {
  const violations = validatePayloadAgainstSchema(entry.payloadSchema, payload);
  if (violations.length > 0) {
    throw new EventCatalogueError(
      'payload_schema_violation',
      `Payload for event '${entry.name}' (schemaVersion ${entry.schemaVersion}) violates its schema: ${violations.join('; ')}`,
    );
  }
}
