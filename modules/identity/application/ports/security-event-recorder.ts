/**
 * The append port for the authentication security ledger (migration 0033) —
 * and the read side the lockout derivation counts on. Declared inward; the
 * Prisma adapter implements it.
 *
 * Failure discipline mirrors the audit writer: a shape violation (a key that
 * smells like a secret in metadata) throws at the call site; a store failure
 * is returned as a value for the caller to decide about visibly.
 */

import type { Result } from '@karar/shared-kernel';

import type { SecurityEvent, SecurityEventType } from '../../domain/security-event.js';

export interface SecurityEventWriteError {
  readonly kind: 'unavailable' | 'denied' | 'unknown';
  readonly message: string;
}

export interface SecurityEventCountQuery {
  readonly accountId: string;
  readonly eventTypes: readonly SecurityEventType[];
  /** When present, count only rows carrying exactly this digest. */
  readonly ipDigest?: string;
  readonly since: Date;
}

export interface SecurityEventRecorder {
  record(event: SecurityEvent): Promise<Result<void, SecurityEventWriteError>>;
  /** The lockout derivation: rows matching the query, counted, never mutated. */
  countSince(query: SecurityEventCountQuery): Promise<number>;
}
