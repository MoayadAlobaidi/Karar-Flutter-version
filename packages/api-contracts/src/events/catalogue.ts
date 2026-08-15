/**
 * Catalogue loader and guards (ADR-0025). Pure functions over an
 * already-parsed JSON value; the only I/O lives in `load.ts`.
 *
 * `parseEventCatalogue` validates the document shape AND the governance rules
 * so an invalid catalogue never becomes a usable object:
 *
 * - `SEALED` entries carry identifiers and status only, and carry NO
 *   `payloadExemption` — the mechanism deliberately does not exist.
 * - `HIGHLY_SENSITIVE_FINANCIAL` entries beyond `identifier-only` need a
 *   `payloadExemption` naming owner, reason, and reviewer.
 * - No other classification may carry an exemption (it would be decoration).
 *
 * The same rules are asserted by architecture test 15
 * (scripts/checks/architecture.mjs#checkEventCatalogue) at build time; this
 * module enforces them at load time so a hand-edited catalogue fails the
 * process that reads it, not only CI.
 */
import {
  EVENT_CLASSIFICATIONS,
  EVENT_PAYLOAD_RULES,
  EventCatalogueError,
  PAYLOAD_FIELD_TYPES,
  type EventCatalogue,
  type EventCatalogueEntry,
  type EventClassification,
  type EventPayloadExemption,
  type EventPayloadRule,
  type EventPayloadSchema,
} from './types.js';

/** ISO-8601 duration (subset: no negative, at least one component). */
const RETENTION_PATTERN = /^P(?=.)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=.)(\d+H)?(\d+M)?(\d+S)?)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function parsePayloadSchema(where: string, raw: unknown, problems: string[]): EventPayloadSchema {
  const empty: EventPayloadSchema = Object.freeze({
    type: 'object',
    properties: Object.freeze({}),
    required: Object.freeze([]),
    additionalProperties: false,
  });
  if (!isRecord(raw)) {
    problems.push(`${where}: payloadSchema must be an object`);
    return empty;
  }
  if (raw['type'] !== 'object') {
    problems.push(`${where}: payloadSchema.type must be 'object'`);
  }
  if (raw['additionalProperties'] !== false) {
    problems.push(`${where}: payloadSchema.additionalProperties must be false (closed shape)`);
  }
  const properties: Record<string, { type: (typeof PAYLOAD_FIELD_TYPES)[number] }> = {};
  if (!isRecord(raw['properties'])) {
    problems.push(`${where}: payloadSchema.properties must be an object`);
  } else {
    for (const [field, spec] of Object.entries(raw['properties'])) {
      const type = isRecord(spec) ? spec['type'] : undefined;
      if (
        !isRecord(spec) ||
        Object.keys(spec).length !== 1 ||
        !PAYLOAD_FIELD_TYPES.includes(type as (typeof PAYLOAD_FIELD_TYPES)[number])
      ) {
        problems.push(
          `${where}: payloadSchema.properties['${field}'] must be exactly { type: ${PAYLOAD_FIELD_TYPES.join('|')} }`,
        );
        continue;
      }
      properties[field] = { type: type as (typeof PAYLOAD_FIELD_TYPES)[number] };
    }
  }
  const required: string[] = [];
  if (!Array.isArray(raw['required'])) {
    problems.push(`${where}: payloadSchema.required must be an array`);
  } else {
    for (const field of raw['required']) {
      if (!nonEmptyString(field)) {
        problems.push(`${where}: payloadSchema.required entries must be non-empty strings`);
      } else if (!(field in properties)) {
        problems.push(`${where}: payloadSchema.required names undeclared field '${field}'`);
      } else {
        required.push(field);
      }
    }
  }
  return Object.freeze({
    type: 'object',
    properties: Object.freeze(properties),
    required: Object.freeze(required),
    additionalProperties: false,
  });
}

function parseExemption(
  where: string,
  raw: unknown,
  problems: string[],
): EventPayloadExemption | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (
    !isRecord(raw) ||
    !nonEmptyString(raw['owner']) ||
    !nonEmptyString(raw['reason']) ||
    !nonEmptyString(raw['reviewer'])
  ) {
    problems.push(`${where}: payloadExemption must be null or name owner, reason, and reviewer`);
    return null;
  }
  return Object.freeze({ owner: raw['owner'], reason: raw['reason'], reviewer: raw['reviewer'] });
}

function parseEntry(index: number, raw: unknown, problems: string[]): EventCatalogueEntry | null {
  const where = `events[${index}]`;
  if (!isRecord(raw)) {
    problems.push(`${where}: entry must be an object`);
    return null;
  }
  if (!nonEmptyString(raw['name']) || /\s/.test(raw['name'])) {
    problems.push(`${where}: 'name' must be a non-empty string without whitespace`);
    return null;
  }
  const name = raw['name'];
  const at = `${where} (${name})`;

  const schemaVersion = raw['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    problems.push(`${at}: 'schemaVersion' must be a positive integer`);
  }
  if (!nonEmptyString(raw['ownerModule'])) {
    problems.push(`${at}: 'ownerModule' must be a non-empty string`);
  }
  const classification = raw['classification'];
  if (!EVENT_CLASSIFICATIONS.includes(classification as EventClassification)) {
    problems.push(`${at}: 'classification' must be one of ${EVENT_CLASSIFICATIONS.join('|')}`);
  }
  if (typeof raw['piiFlag'] !== 'boolean') {
    problems.push(`${at}: 'piiFlag' must be a boolean`);
  }
  const consumers = raw['allowedConsumers'];
  if (!Array.isArray(consumers) || consumers.length === 0 || !consumers.every(nonEmptyString)) {
    problems.push(`${at}: 'allowedConsumers' must be a non-empty array of non-empty strings`);
  } else if (new Set(consumers).size !== consumers.length) {
    problems.push(`${at}: 'allowedConsumers' must not repeat a consumer`);
  }
  if (!nonEmptyString(raw['retention']) || !RETENTION_PATTERN.test(raw['retention'])) {
    problems.push(`${at}: 'retention' must be an ISO-8601 duration (e.g. P7D, P7Y)`);
  }
  const payloadRule = raw['payloadRule'];
  if (!EVENT_PAYLOAD_RULES.includes(payloadRule as EventPayloadRule)) {
    problems.push(`${at}: 'payloadRule' must be one of ${EVENT_PAYLOAD_RULES.join('|')}`);
  }
  const payloadExemption = parseExemption(at, raw['payloadExemption'], problems);
  const payloadSchema = parsePayloadSchema(at, raw['payloadSchema'], problems);

  // Governance rules by classification (event-governance.md section 3).
  if (classification === 'SEALED') {
    if (payloadRule !== 'identifier-only' && payloadRule !== 'identifiers-and-status') {
      problems.push(`${at}: SEALED events carry identifiers and status only — no exemption exists`);
    }
    if (payloadExemption !== null) {
      problems.push(
        `${at}: SEALED events cannot carry a payloadExemption — the mechanism does not exist`,
      );
    }
  } else if (classification === 'HIGHLY_SENSITIVE_FINANCIAL') {
    if (payloadRule !== 'identifier-only' && payloadExemption === null) {
      problems.push(
        `${at}: HIGHLY_SENSITIVE_FINANCIAL payload beyond identifier-only requires a payloadExemption naming owner, reason, and reviewer`,
      );
    }
  } else if (payloadExemption !== null) {
    problems.push(
      `${at}: payloadExemption is only meaningful on HIGHLY_SENSITIVE_FINANCIAL entries`,
    );
  }

  if (problems.length > 0) {
    return null;
  }
  return Object.freeze({
    name,
    schemaVersion: schemaVersion as number,
    ownerModule: raw['ownerModule'] as string,
    classification: classification as EventClassification,
    piiFlag: raw['piiFlag'] as boolean,
    allowedConsumers: Object.freeze([...(consumers as string[])]),
    retention: raw['retention'] as string,
    payloadRule: payloadRule as EventPayloadRule,
    payloadExemption,
    payloadSchema,
  });
}

/**
 * Validates a parsed JSON document into an `EventCatalogue`, or throws
 * `EventCatalogueError('invalid_catalogue')` naming EVERY problem at once.
 */
export function parseEventCatalogue(raw: unknown): EventCatalogue {
  const problems: string[] = [];
  const entries: EventCatalogueEntry[] = [];
  if (!isRecord(raw) || !Array.isArray(raw['events'])) {
    problems.push(`catalogue must be an object with an 'events' array`);
  } else {
    const seen = new Set<string>();
    raw['events'].forEach((rawEntry, index) => {
      const entry = parseEntry(index, rawEntry, problems);
      if (entry === null) {
        return;
      }
      if (seen.has(entry.name)) {
        problems.push(`events[${index}]: duplicate event '${entry.name}'`);
        return;
      }
      seen.add(entry.name);
      entries.push(entry);
    });
  }
  if (problems.length > 0) {
    throw new EventCatalogueError(
      'invalid_catalogue',
      `Event catalogue is invalid:\n- ${problems.join('\n- ')}`,
    );
  }
  return Object.freeze({ events: Object.freeze(entries) });
}

/**
 * Publish-side guard: resolves the catalogue entry for `eventName` or throws
 * `EventCatalogueError('unknown_event')`. Publishing an uncatalogued event is
 * an error, never a warning (event-governance.md section 2).
 */
export function getEventEntry(catalogue: EventCatalogue, eventName: string): EventCatalogueEntry {
  const entry = catalogue.events.find((candidate) => candidate.name === eventName);
  if (entry === undefined) {
    throw new EventCatalogueError(
      'unknown_event',
      `Event '${eventName}' is not in the catalogue (packages/api-contracts/events/catalogue.json); ` +
        'catalogue the event before publishing it',
    );
  }
  return entry;
}

/**
 * Subscribe-side guard: throws `EventCatalogueError('consumer_not_allowed')`
 * unless `consumerName` appears in the entry's `allowedConsumers`. Adding a
 * consumer is a deliberate edit to the owning module's catalogue entry.
 */
export function assertConsumerAllowed(
  catalogue: EventCatalogue,
  eventName: string,
  consumerName: string,
): EventCatalogueEntry {
  const entry = getEventEntry(catalogue, eventName);
  if (!entry.allowedConsumers.includes(consumerName)) {
    throw new EventCatalogueError(
      'consumer_not_allowed',
      `Consumer '${consumerName}' is not in allowedConsumers for event '${eventName}' ` +
        `(allowed: ${entry.allowedConsumers.join(', ')}); add it to the catalogue entry deliberately`,
    );
  }
  return entry;
}
