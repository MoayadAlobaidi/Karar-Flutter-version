/**
 * AuditTrail — this module's port onto the platform audit record (wired to
 * the audit module's RecordAuditEvent by the composition root, so entries
 * pass its metadata guard). Declared locally: ports are declared inward, in
 * the consumer, even when a sibling module declares an identical shape.
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
