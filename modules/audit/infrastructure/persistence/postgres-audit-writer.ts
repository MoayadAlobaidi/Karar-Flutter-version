/**
 * PostgresAuditWriter — the AuditWriter port against the platform's single
 * persistence adapter, connected as the runtime role (`karar_app`), which
 * holds INSERT and SELECT on audit.audit_events and nothing else (migration
 * 0010; db/migrations/README.md grant convention).
 *
 * Append is a single INSERT — deliberately not inside the caller's
 * transaction in Phase 2: an audit row records that an attempt happened,
 * including attempts whose transaction rolled back (denied reads, failed
 * mutations). Callers that need commit-coupled auditing pass a
 * TransactionClient-backed adapter in a later phase.
 *
 * Store failures return Result.err — the caller decides what its operation
 * does when the trail cannot be written; nothing is swallowed here.
 */

import { Result } from '@karar/shared-kernel';
import {
  PgError,
  type PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';

import type { AuditEvent } from '../../domain/audit-event.js';
import type {
  AuditWriteError,
  AuditWriteErrorKind,
  AuditWriter,
} from '../../application/ports/audit-writer.js';

const INSERT_SQL = `
INSERT INTO audit.audit_events (
  audit_event_id, occurred_at, environment, actor_ref, tenant_ref,
  action, resource_type, resource_id, reason,
  request_id, trace_id, correlation_id,
  before_metadata, after_metadata, outcome
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
`;

function toWriteError(error: unknown): AuditWriteError {
  if (error instanceof PgError) {
    const kind: AuditWriteErrorKind =
      error.code === 'connection_failure'
        ? 'unavailable'
        : error.code === 'insufficient_privilege'
          ? 'denied'
          : 'unknown';
    return { kind, message: `audit append failed (${error.code}): ${error.message}` };
  }
  return {
    kind: 'unknown',
    message: `audit append failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

export class PostgresAuditWriter implements AuditWriter {
  constructor(private readonly adapter: PostgresPersistenceAdapter) {}

  async record(event: AuditEvent): Promise<Result<AuditEvent, AuditWriteError>> {
    try {
      await this.adapter.query(INSERT_SQL, [
        event.auditEventId,
        event.occurredAt,
        event.environment,
        event.actorRef,
        event.tenantRef,
        event.action,
        event.resourceType,
        event.resourceId,
        event.reason,
        event.requestId,
        event.traceId,
        event.correlationId,
        event.beforeMetadata === null ? null : JSON.stringify(event.beforeMetadata),
        event.afterMetadata === null ? null : JSON.stringify(event.afterMetadata),
        event.outcome,
      ]);
      return Result.ok(event);
    } catch (error) {
      return Result.err(toWriteError(error));
    }
  }
}
