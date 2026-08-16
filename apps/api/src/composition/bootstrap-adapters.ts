/**
 * Composition-root implementations of the two bootstrap ports that have no
 * module-side adapter: the audit trail and the request client context.
 *
 * The bootstrap module deliberately ships neither — the audit writer belongs
 * to the platform, and the client-context digest belongs to identity's edge
 * (trusted-proxy resolution plus the HMAC digester). Binding them here keeps
 * both out of the module's dependency surface.
 */

import { Result } from '@karar/shared-kernel';
import type { RecordAuditEvent } from '@karar/audit';
import type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from '@karar/bootstrap/dist/application/ports/audit-trail.js';

/** Maps the bootstrap entry onto the platform audit record, kinds included. */
export class BootstrapAuditTrail implements AuditTrail {
  constructor(
    private readonly recordAuditEvent: RecordAuditEvent,
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

/** What identity's edge context provides, structurally. */
export interface ClientContextSource {
  clientContext(request: never): {
    readonly ipDigest: string | null;
    readonly userAgentSummary: string | null;
  };
}

/**
 * Digested client facts for the security ledger. Raw addresses never leave
 * identity's edge: the digest is HMAC'd under the server pepper and the
 * user agent is coarsely summarized, both by the same code the /auth routes
 * use, so the ledger stays consistent across surfaces.
 */
export function clientContextOf(edge: ClientContextSource, request: unknown) {
  const resolved = edge.clientContext(request as never);
  return { ipDigest: resolved.ipDigest, userAgentSummary: resolved.userAgentSummary };
}
