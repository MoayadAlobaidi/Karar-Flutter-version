import { describe, expect, it } from 'vitest';

import { Result } from '@karar/shared-kernel';

import {
  AuditMetadataGuard,
  AuditMetadataViolation,
  MAX_METADATA_BYTES,
} from '../application/audit-metadata-guard.js';
import type { AuditWriteError, AuditWriter } from '../application/ports/audit-writer.js';
import {
  InvalidAuditEventError,
  RecordAuditEvent,
  type RecordAuditEventInput,
} from '../application/use-cases/record-audit-event.js';
import type { AuditEvent } from '../domain/audit-event.js';
import { uuidv7, Uuidv7AuditEventIdSource } from '../infrastructure/persistence/uuidv7-audit-event-id-source.js';

class CapturingWriter implements AuditWriter {
  readonly events: AuditEvent[] = [];

  record(event: AuditEvent): Promise<Result<AuditEvent, AuditWriteError>> {
    this.events.push(event);
    return Promise.resolve(Result.ok(event));
  }
}

class FailingWriter implements AuditWriter {
  constructor(private readonly error: AuditWriteError) {}

  record(): Promise<Result<AuditEvent, AuditWriteError>> {
    return Promise.resolve(Result.err(this.error));
  }
}

const idSource = new Uuidv7AuditEventIdSource();

const baseInput: RecordAuditEventInput = {
  occurredAt: new Date('2026-08-15T10:00:00.000Z'),
  environment: 'test',
  actorRef: 'staff:reviewer-1',
  tenantRef: 'tenant:qa-tenant',
  action: 'user.record.read',
  resourceType: 'user',
  resourceId: 'user-123',
  traceId: 'trace-abc',
  outcome: 'SUCCESS',
};

describe('RecordAuditEvent', () => {
  it('appends a well-formed event and returns it as Result.ok', async () => {
    const writer = new CapturingWriter();
    const result = await new RecordAuditEvent(writer, idSource).execute(baseInput);
    expect(result.ok).toBe(true);
    expect(writer.events).toHaveLength(1);
    const event = writer.events[0] as AuditEvent;
    expect(event.action).toBe('user.record.read');
    expect(event.traceId).toBe('trace-abc');
    expect(event.reason).toBeNull(); // absent optionals normalize to null
    expect(event.auditEventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('surfaces a writer failure as Result.err — visible, not swallowed', async () => {
    const failure: AuditWriteError = { kind: 'unavailable', message: 'store down' };
    const result = await new RecordAuditEvent(new FailingWriter(failure), idSource).execute(
      baseInput,
    );
    expect(result.ok).toBe(false);
    expect(Result.isErr(result) && result.error).toEqual(failure);
  });

  it('throws on defective shapes: bad outcome, empty action, invalid instant', async () => {
    const uc = new RecordAuditEvent(new CapturingWriter(), idSource);
    await expect(
      uc.execute({ ...baseInput, outcome: 'MAYBE' as never }),
    ).rejects.toBeInstanceOf(InvalidAuditEventError);
    await expect(uc.execute({ ...baseInput, action: '  ' })).rejects.toBeInstanceOf(
      InvalidAuditEventError,
    );
    await expect(
      uc.execute({ ...baseInput, occurredAt: new Date('nonsense') }),
    ).rejects.toBeInstanceOf(InvalidAuditEventError);
  });

  it('rejects secret-pattern metadata keys before anything is written', async () => {
    const writer = new CapturingWriter();
    const uc = new RecordAuditEvent(writer, idSource);
    for (const key of ['password', 'apiKey', 'api_key', 'refreshToken', 'signing_key']) {
      await expect(
        uc.execute({ ...baseInput, afterMetadata: { [key]: 'x' } }),
      ).rejects.toBeInstanceOf(AuditMetadataViolation);
    }
    expect(writer.events).toHaveLength(0);
  });

  it('rejects SEALED-marked and SECRET-marked metadata values', async () => {
    const uc = new RecordAuditEvent(new CapturingWriter(), idSource);
    await expect(
      uc.execute({
        ...baseInput,
        beforeMetadata: { obligation: { classification: 'SEALED', value: 'never' } },
      }),
    ).rejects.toBeInstanceOf(AuditMetadataViolation);
    await expect(
      uc.execute({
        ...baseInput,
        beforeMetadata: { providerCreds: { classification: 'SECRET', value: 'never' } },
      }),
    ).rejects.toBeInstanceOf(AuditMetadataViolation);
  });

  it('stores HSF values redacted, passing identifier-keyed references through', async () => {
    const writer = new CapturingWriter();
    await new RecordAuditEvent(writer, idSource).execute({
      ...baseInput,
      afterMetadata: {
        newBalance: { classification: 'HIGHLY_SENSITIVE_FINANCIAL', value: '1234567' },
        accountId: { classification: 'HIGHLY_SENSITIVE_FINANCIAL', value: 'acc-42' },
        status: 'RECATEGORISED',
      },
    });
    expect((writer.events[0] as AuditEvent).afterMetadata).toEqual({
      newBalance: '[redacted:hsf]',
      accountId: 'acc-42',
      status: 'RECATEGORISED',
    });
  });

  it('rejects unclassified financial-shaped keys and nested payloads (shape guard)', async () => {
    const uc = new RecordAuditEvent(new CapturingWriter(), idSource);
    await expect(
      uc.execute({ ...baseInput, afterMetadata: { amountMinor: 120050 } }),
    ).rejects.toBeInstanceOf(AuditMetadataViolation);
    await expect(
      uc.execute({
        ...baseInput,
        afterMetadata: { transaction: { lines: [1, 2, 3] } as never },
      }),
    ).rejects.toBeInstanceOf(AuditMetadataViolation);
  });

  it('rejects payload-sized metadata (size guard)', () => {
    const guard = new AuditMetadataGuard();
    const oversized = { statementText: 'x'.repeat(MAX_METADATA_BYTES + 1) };
    expect(() => guard.apply(oversized)).toThrow(AuditMetadataViolation);
    // At the boundary, small scalar context is fine.
    expect(guard.apply({ note: 'small' })).toEqual({ note: 'small' });
    expect(guard.apply(null)).toBeNull();
    expect(guard.apply(undefined)).toBeNull();
  });
});

describe('uuidv7', () => {
  it('produces RFC 9562 v7 ids that order by time', () => {
    const random = new Uint8Array(10).fill(0xab);
    const earlier = uuidv7(Date.parse('2026-08-15T10:00:00.000Z'), random);
    const later = uuidv7(Date.parse('2026-08-15T10:00:00.001Z'), random);
    expect(earlier).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(earlier < later).toBe(true); // lexicographic order follows time
    expect(() => uuidv7(Date.now(), new Uint8Array(4))).toThrow(/10 random bytes/);
  });
});
