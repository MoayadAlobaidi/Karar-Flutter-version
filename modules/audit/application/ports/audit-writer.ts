/**
 * The append port. Declared here, inward (clean-architecture.md; architecture
 * test 5): the use case names the capability it needs, and the persistence
 * adapter under infrastructure/ implements it against B's Postgres adapter.
 */

import type { Result } from '@karar/shared-kernel';

import type { AuditEvent } from '../../domain/audit-event.js';

export type AuditWriteErrorKind =
  /** The store is unreachable — outage, shutdown pool, network. */
  | 'unavailable'
  /** The store refused the write — a privilege or immutability boundary. */
  | 'denied'
  /** Anything else; `message` carries the mapped detail. */
  | 'unknown';

/**
 * A failed append as a value, never an exception: audit writes happen inside
 * other operations, and a caller must decide — visibly, in code — what its
 * operation does when the audit trail cannot be written. Swallowing this is
 * how audit gaps happen (legacy AZ5: unrecorded events cannot be recovered
 * later).
 */
export interface AuditWriteError {
  readonly kind: AuditWriteErrorKind;
  readonly message: string;
}

export interface AuditWriter {
  /** Appends exactly one record. Never updates, never upserts. */
  record(event: AuditEvent): Promise<Result<AuditEvent, AuditWriteError>>;
}
