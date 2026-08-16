/**
 * Every state change in this module lands in the audit trail through
 * `@karar/audit`'s RecordAuditEvent use case — the module's single audited
 * entrance. A failed append is returned as `AUDIT_APPEND_FAILED`, loudly:
 * the mutation persisted, its trail did not, and the caller must see that
 * (legacy AZ5 — never logged-and-forgotten).
 */

import { Result } from '@karar/shared-kernel';
import type { AuditMetadataInput, RecordAuditEvent } from '@karar/audit';

import type { AuditAppendFailed } from './errors.js';

export interface AuditEntry {
  readonly occurredAt: Date;
  readonly actorRef: string;
  readonly tenantRef?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly reason?: string | null;
  readonly beforeMetadata?: AuditMetadataInput | null;
  readonly afterMetadata?: AuditMetadataInput | null;
}

export class EntityAuditTrail {
  constructor(
    private readonly recordAuditEvent: RecordAuditEvent,
    private readonly environment: string,
  ) {}

  async record(entry: AuditEntry): Promise<Result<void, AuditAppendFailed>> {
    const written = await this.recordAuditEvent.execute({
      occurredAt: entry.occurredAt,
      environment: this.environment,
      actorRef: entry.actorRef,
      tenantRef: entry.tenantRef ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      reason: entry.reason ?? null,
      beforeMetadata: entry.beforeMetadata ?? null,
      afterMetadata: entry.afterMetadata ?? null,
      outcome: 'SUCCESS',
    });
    if (!written.ok) {
      return Result.err({
        kind: 'AUDIT_APPEND_FAILED',
        message: `state change persisted but its audit record did not: ${written.error.message}`,
      });
    }
    return Result.ok(undefined);
  }
}
