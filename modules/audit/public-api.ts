/**
 * The audit module's only legal import surface (architecture test 3).
 *
 * Exported: the event type, the writer port, and the use case — what a
 * consuming module needs to record an audit event through the application
 * layer. Deliberately absent: the Postgres writer and the id source
 * (infrastructure implementations are wired by the composition root, not
 * imported across modules), the metadata guard (reachable only through the
 * use case, so no caller can "forget" it), and the domain internals.
 */

export {
  AUDIT_OUTCOMES,
  type AuditEvent,
  type AuditEventId,
  type AuditMetadata,
  type AuditOutcome,
} from './domain/audit-event.js';
export type {
  AuditWriteError,
  AuditWriteErrorKind,
  AuditWriter,
} from './application/ports/audit-writer.js';
export type { AuditEventIdSource } from './application/ports/audit-event-id-source.js';
export {
  InvalidAuditEventError,
  RecordAuditEvent,
  type RecordAuditEventInput,
} from './application/use-cases/record-audit-event.js';
export {
  AuditMetadataViolation,
  type AuditMetadataInput,
  type ClassifiedMetadataValue,
} from './application/audit-metadata-guard.js';
