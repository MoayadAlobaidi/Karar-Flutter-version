// Data classification surface: the six canonical classes and the enforceable
// handling rules. Consumed by the observability logger (redaction), the event
// catalogue validation (payload rules), and the audit metadata guard.
// Dependency-free by design — see classification.ts.

export {
  DATA_CLASSIFICATIONS,
  EventPayloadViolation,
  REDACTED_HSF,
  REDACTED_SEALED,
  REDACTED_SECRET,
  assertEventPayloadAllowed,
  isLoggable,
  redact,
  redactionFor,
  type DataClassification,
  type PayloadExemption,
} from './classification.js';
