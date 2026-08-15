// @karar/platform/events — the platform event envelope and the local
// in-memory bus (ADR-0012, ADR-0025; docs/architecture/event-governance.md).
// The transactional outbox that persists envelopes lives in ../outbox;
// classification payload rules live in ../classification and are applied by
// makeEnvelope.
export {
  makeEnvelope,
  recordEnvelope,
  type EventEnvelope,
  type MakeEnvelopeInput,
  type PendingEventEnvelope,
} from './envelope.js';
export {
  InMemoryEventBus,
  type ConsumerFailure,
  type EventHandler,
  type EventPublisher,
  type InMemoryEventBusOptions,
} from './bus.js';
