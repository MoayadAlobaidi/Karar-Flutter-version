/**
 * AuditTrail — this module's port onto the platform audit record. The
 * composition root wires it to the audit module's `RecordAuditEvent` use case
 * (through @karar/audit's public API), so every entry passes that module's
 * metadata guard; tests use an in-memory fake.
 *
 * Failure discipline: recording returns rather than throws, but the CALLER
 * decides what its operation does when the trail cannot be written — nothing
 * is swallowed here (legacy AZ5: unrecorded events cannot be recovered).
 */

import type { Result } from '@karar/shared-kernel';

export interface AuditTrailEntry {
  readonly occurredAt: Date;
  readonly actorRef: string;
  readonly tenantRef: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly reason?: string | null;
  readonly requestId?: string | null;
  readonly beforeMetadata?: Readonly<Record<string, string>> | null;
  readonly afterMetadata?: Readonly<Record<string, string>> | null;
  readonly outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
}

export interface AuditTrailFailure {
  readonly kind: 'audit_unavailable' | 'audit_denied' | 'audit_unknown';
  readonly message: string;
}

export interface AuditTrail {
  record(entry: AuditTrailEntry): Promise<Result<void, AuditTrailFailure>>;
}
