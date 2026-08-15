// Authored contract surface (ADR-0009, ADR-0025).
//
// Phase 2 adds the domain event catalogue: types, the pure loader/validator,
// and the publish/subscribe guards. HTTP endpoint types are still authored
// into openapi/openapi.yaml first; generated SDK types are exported from here
// once generation exists.
export { assertConsumerAllowed, getEventEntry, parseEventCatalogue } from './events/catalogue.js';
export { defaultEventCataloguePath, readDefaultEventCatalogue } from './events/load.js';
export {
  assertPayloadMatchesSchema,
  validatePayloadAgainstSchema,
} from './events/payload-schema.js';
export {
  EVENT_CLASSIFICATIONS,
  EVENT_PAYLOAD_RULES,
  EventCatalogueError,
  PAYLOAD_FIELD_TYPES,
  PLATFORM_DIAGNOSTIC_PING,
  type EventCatalogue,
  type EventCatalogueEntry,
  type EventCatalogueErrorKind,
  type EventClassification,
  type EventPayloadExemption,
  type EventPayloadRule,
  type EventPayloadSchema,
  type PayloadFieldType,
} from './events/types.js';
