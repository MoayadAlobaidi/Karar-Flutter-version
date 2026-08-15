/**
 * The audit record — the module's one aggregate (data-model.md §10).
 *
 * An AuditEvent is a statement of fact about an action: who (as an opaque
 * reference), did what, to which resource, when, with what outcome, in which
 * environment. It is not a DomainEvent — nothing subscribes to it, it is
 * never published on the bus, and it exists to be written exactly once and
 * read by security review. Append-only-ness is a property of the store
 * (revoked grants and a trigger), not of this type; what this type fixes is
 * the shape a record must have before the writer will accept it.
 *
 * Framework-free and dependency-free: identifiers here are declared in this
 * module (data-model.md §2), references to other modules' subjects travel as
 * opaque strings, and time arrives from the caller.
 */

declare const auditEventIdBrand: unique symbol;
/** UUID v7 identity of one audit record; minted by the id-source port. */
export type AuditEventId = string & { readonly [auditEventIdBrand]: 'AuditEventId' };

export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'FAILURE'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Guarded metadata: a flat record of small scalar facts about the state
 * before/after the audited action. The application layer's
 * AuditMetadataGuard is the only path that produces one of these from caller
 * input — payloads, secrets, and sealed values never survive it.
 */
export type AuditMetadata = Readonly<Record<string, string | number | boolean | null>>;

export interface AuditEvent {
  readonly auditEventId: AuditEventId;
  /** When the audited action happened, from the caller's clock. */
  readonly occurredAt: Date;
  /** Asserted environment identity (data-model.md §13). */
  readonly environment: string;
  /** Opaque actor reference; null for system-initiated actions. */
  readonly actorRef: string | null;
  /** Opaque tenant reference; null for platform-level actions. */
  readonly tenantRef: string | null;
  /** Dotted action name, e.g. 'user.record.read', 'capability.availability.changed'. */
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  /** Operator-supplied reason where a gateway captures one. */
  readonly reason: string | null;
  readonly requestId: string | null;
  readonly traceId: string | null;
  readonly correlationId: string | null;
  readonly beforeMetadata: AuditMetadata | null;
  readonly afterMetadata: AuditMetadata | null;
  readonly outcome: AuditOutcome;
}
