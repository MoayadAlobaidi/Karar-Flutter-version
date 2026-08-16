/**
 * RecordAuditEventAuditTrail — the authorization AuditTrail port wired to the
 * audit module's RecordAuditEvent use case (via @karar/audit's public API),
 * so every grant/revoke entry passes the audit metadata guard.
 */

import type { RecordAuditEvent } from '@karar/audit';
import { Result } from '@karar/shared-kernel';

import type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from '../../application/ports/audit-trail.js';

export class RecordAuditEventAuditTrail implements AuditTrail {
  constructor(
    private readonly recordAuditEvent: RecordAuditEvent,
    /** Asserted environment identity (data-model.md §13), from configuration. */
    private readonly environment: string,
  ) {}

  async record(entry: AuditTrailEntry): Promise<Result<void, AuditTrailFailure>> {
    const written = await this.recordAuditEvent.execute({
      occurredAt: entry.occurredAt,
      environment: this.environment,
      actorRef: entry.actorRef,
      tenantRef: entry.tenantRef,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      reason: entry.reason ?? null,
      requestId: entry.requestId ?? null,
      beforeMetadata: entry.beforeMetadata ?? null,
      afterMetadata: entry.afterMetadata ?? null,
      outcome: entry.outcome,
    });
    if (written.ok) {
      return Result.ok(undefined);
    }
    const kind: AuditTrailFailure['kind'] =
      written.error.kind === 'unavailable'
        ? 'audit_unavailable'
        : written.error.kind === 'denied'
          ? 'audit_denied'
          : 'audit_unknown';
    return Result.err({ kind, message: written.error.message });
  }
}
