/**
 * Every availability/entitlement state change — and every security-relevant
 * DENIAL (an attempted expansion above the ceiling) — lands in the audit
 * trail through `@karar/audit`'s RecordAuditEvent. A failed append returns
 * `AUDIT_APPEND_FAILED`, loudly: the mutation (or the denial decision)
 * happened, its trail did not, and the caller must see that (legacy AZ5).
 */

import { Result } from '@karar/shared-kernel';
import type { AuditMetadataInput, AuditOutcome, RecordAuditEvent } from '@karar/audit';

import type { AuditAppendFailed } from './errors.js';

export interface CapabilityAuditEntry {
  readonly occurredAt: Date;
  readonly actorRef: string;
  readonly tenantRef?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome: AuditOutcome;
  readonly reason?: string | null;
  readonly beforeMetadata?: AuditMetadataInput | null;
  readonly afterMetadata?: AuditMetadataInput | null;
}

export class CapabilityAuditTrail {
  constructor(
    private readonly recordAuditEvent: RecordAuditEvent,
    private readonly environment: string,
  ) {}

  async record(entry: CapabilityAuditEntry): Promise<Result<void, AuditAppendFailed>> {
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
      outcome: entry.outcome,
    });
    if (!written.ok) {
      return Result.err({
        kind: 'AUDIT_APPEND_FAILED',
        message: `capability state change persisted but its audit record did not: ${written.error.message}`,
      });
    }
    return Result.ok(undefined);
  }
}
