// @karar/platform/outbox — the transactional outbox (ADR-0012;
// docs/architecture/event-governance.md section 4; backend.md section 8).
//
// Producer: `enqueueInTransaction` on the SAME TransactionClient as the state
// change. Delivery: `OutboxRelay` in apps/worker, publishing through the
// EventBus port. Consumers: `withIdempotency` keyed on event id.
export { enqueueInTransaction } from './enqueue.js';
export { withIdempotency, type IdempotentOutcome } from './receipts.js';
export {
  OUTBOX_METRIC_NAMES,
  OutboxRelay,
  type OutboxRelayOptions,
  type RelayRunReport,
} from './relay.js';
