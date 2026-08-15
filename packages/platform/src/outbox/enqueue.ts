/**
 * Producer side of the transactional outbox (ADR-0012): the envelope insert
 * SHARES THE CALLER'S TRANSACTION. `enqueueInTransaction` takes the
 * `TransactionClient` from `PostgresPersistenceAdapter.withTransaction`, so a
 * state change and its event commit or roll back together — there is no path
 * that publishes an event for a change that did not commit, and none that
 * commits a change whose event is lost.
 */
import type { Clock } from '@karar/shared-kernel';

import type { TransactionClient } from '../db/adapter.js';
import {
  recordEnvelope,
  type EventEnvelope,
  type PendingEventEnvelope,
} from '../events/envelope.js';

/**
 * Persists `pending` into `platform.outbox_events` on the caller's
 * transaction, stamping `recordedAt` from the injected clock (persist time).
 * Returns the completed envelope exactly as the relay will publish it.
 */
export async function enqueueInTransaction(
  client: TransactionClient,
  pending: PendingEventEnvelope,
  clock: Clock,
): Promise<EventEnvelope> {
  const envelope = recordEnvelope(pending, clock.now());
  await client.query(
    `INSERT INTO platform.outbox_events (id, event_name, schema_version, envelope, classification)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      envelope.eventId,
      envelope.eventName,
      envelope.schemaVersion,
      JSON.stringify(envelope),
      envelope.classification,
    ],
  );
  return envelope;
}
