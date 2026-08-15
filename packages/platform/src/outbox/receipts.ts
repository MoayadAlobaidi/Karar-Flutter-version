/**
 * Consumer idempotency receipts (ADR-0012: at-least-once delivery, idempotent
 * consumers keyed on event ID).
 *
 * `withIdempotency` MUST run inside the consumer's own transaction: the
 * receipt insert and the consumer's effects then commit atomically. A
 * duplicate delivery finds the receipt (`ON CONFLICT DO NOTHING` inserts
 * zero rows) and skips; a rolled-back consumer rolls its receipt back too, so
 * the next delivery genuinely retries.
 */
import type { TransactionClient } from '../db/adapter.js';

export type IdempotentOutcome<T> =
  { readonly executed: true; readonly result: T } | { readonly executed: false };

/**
 * Runs `fn` exactly once per (consumerName, eventId) pair. Returns
 * `{ executed: false }` when a receipt already exists — the duplicate path is
 * a successful no-op, never an error.
 */
export async function withIdempotency<T>(
  client: TransactionClient,
  consumerName: string,
  eventId: string,
  fn: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  const inserted = await client.query(
    `INSERT INTO platform.event_consumer_receipts (consumer_name, event_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [consumerName, eventId],
  );
  if ((inserted.rowCount ?? 0) === 0) {
    return { executed: false };
  }
  const result = await fn();
  return { executed: true, result };
}
