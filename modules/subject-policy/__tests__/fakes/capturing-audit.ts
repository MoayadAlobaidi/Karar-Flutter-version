/**
 * Unit-test audit capture that keeps the REAL pipeline: a capturing
 * AuditWriter behind the real RecordAuditEvent, so the metadata guard runs
 * on every entry exactly as in production — the leak-regression assertions
 * then inspect what actually survived the guard, not a mock's echo.
 */

import { Result } from '@karar/shared-kernel';
import {
  RecordAuditEvent,
  type AuditEvent,
  type AuditEventIdSource,
  type AuditWriteError,
  type AuditWriter,
} from '@karar/audit';

import { SubjectPolicyAuditTrail } from '../../application/audit-trail.js';

class CapturingAuditWriter implements AuditWriter {
  readonly events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<Result<AuditEvent, AuditWriteError>> {
    this.events.push(event);
    return Result.ok(event);
  }
}

class SequentialAuditEventIdSource implements AuditEventIdSource {
  private counter = 0;

  nextId(): ReturnType<AuditEventIdSource['nextId']> {
    this.counter += 1;
    const hex = this.counter.toString(16).padStart(12, '0');
    return `00000000-0000-7000-8000-${hex}` as ReturnType<AuditEventIdSource['nextId']>;
  }
}

export function capturingAuditTrail(environment = 'unit-test'): {
  readonly trail: SubjectPolicyAuditTrail;
  readonly events: ReadonlyArray<AuditEvent>;
} {
  const writer = new CapturingAuditWriter();
  const trail = new SubjectPolicyAuditTrail(
    new RecordAuditEvent(writer, new SequentialAuditEventIdSource()),
    environment,
  );
  return { trail, events: writer.events };
}
