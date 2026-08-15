/**
 * RecordAuditEvent — the single application entrance for appending an audit
 * record (data-model.md §10). Every caller — HTTP interceptors, the worker,
 * staff-read auditing, sealed-access recording — comes through here, so the
 * metadata rules hold no matter which entrance was used.
 *
 * Failure discipline: a rejected shape (bad outcome, secret in metadata) is
 * a defect at the call site and **throws**; a store failure is an expected
 * outcome the caller must visibly handle and returns `Result.err` — never
 * swallowed, never logged-and-forgotten here (legacy AZ5).
 */

import { Result } from '@karar/shared-kernel';

import {
  AUDIT_OUTCOMES,
  type AuditEvent,
  type AuditOutcome,
} from '../../domain/audit-event.js';
import { AuditMetadataGuard, type AuditMetadataInput } from '../audit-metadata-guard.js';
import type { AuditEventIdSource } from '../ports/audit-event-id-source.js';
import type { AuditWriteError, AuditWriter } from '../ports/audit-writer.js';

export interface RecordAuditEventInput {
  readonly occurredAt: Date;
  readonly environment: string;
  readonly actorRef?: string | null;
  readonly tenantRef?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly reason?: string | null;
  readonly requestId?: string | null;
  readonly traceId?: string | null;
  readonly correlationId?: string | null;
  readonly beforeMetadata?: AuditMetadataInput | null;
  readonly afterMetadata?: AuditMetadataInput | null;
  readonly outcome: AuditOutcome;
}

export class InvalidAuditEventError extends Error {
  override readonly name = 'InvalidAuditEventError';
}

function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidAuditEventError(`audit event requires a non-empty '${field}'`);
  }
  return value;
}

export class RecordAuditEvent {
  private readonly guard = new AuditMetadataGuard();

  constructor(
    private readonly writer: AuditWriter,
    private readonly idSource: AuditEventIdSource,
  ) {}

  async execute(input: RecordAuditEventInput): Promise<Result<AuditEvent, AuditWriteError>> {
    if (!AUDIT_OUTCOMES.includes(input.outcome)) {
      throw new InvalidAuditEventError(
        `audit outcome must be one of ${AUDIT_OUTCOMES.join(', ')}, got '${String(input.outcome)}'`,
      );
    }
    if (Number.isNaN(input.occurredAt.getTime())) {
      throw new InvalidAuditEventError('audit event requires a valid occurredAt instant');
    }

    const event: AuditEvent = Object.freeze({
      auditEventId: this.idSource.nextId(),
      occurredAt: input.occurredAt,
      environment: requireNonEmpty('environment', input.environment),
      actorRef: input.actorRef ?? null,
      tenantRef: input.tenantRef ?? null,
      action: requireNonEmpty('action', input.action),
      resourceType: requireNonEmpty('resourceType', input.resourceType),
      resourceId: requireNonEmpty('resourceId', input.resourceId),
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
      correlationId: input.correlationId ?? null,
      // The guard is the only path metadata takes into an event; a violation
      // throws here, at the defective call site, before anything is written.
      beforeMetadata: this.guard.apply(input.beforeMetadata),
      afterMetadata: this.guard.apply(input.afterMetadata),
      outcome: input.outcome,
    });

    return this.writer.record(event);
  }
}
