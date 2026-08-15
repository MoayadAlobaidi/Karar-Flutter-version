import { Clock } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';
import { EVENT_CLASSIFICATIONS, parseEventCatalogue } from '@karar/api-contracts';
import type { EventCatalogue } from '@karar/api-contracts';

import {
  assertEventPayloadAllowed,
  DATA_CLASSIFICATIONS,
  EventPayloadViolation,
} from '../classification/index.js';
import { makeEnvelope, recordEnvelope } from './envelope.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const openSchema = {
  type: 'object',
  properties: {
    pingId: { type: 'string' },
    note: { type: 'string' },
    accountId: { type: 'string' },
    status: { type: 'string' },
    amount: { type: 'number' },
  },
  required: [],
  additionalProperties: false,
} as const;

function catalogueWith(overrides: Record<string, unknown> = {}): EventCatalogue {
  return parseEventCatalogue({
    events: [
      {
        name: 'platform.diagnostic.ping',
        schemaVersion: 3,
        ownerModule: 'platform',
        classification: 'INTERNAL',
        piiFlag: false,
        allowedConsumers: ['platform-tests'],
        retention: 'P7D',
        payloadRule: 'payload-permitted',
        payloadExemption: null,
        payloadSchema: openSchema,
        ...overrides,
      },
    ],
  });
}

const clock = new Clock.Fixed(new Date('2026-08-15T10:00:00.000Z'));

describe('makeEnvelope', () => {
  const catalogue = catalogueWith();

  it('stamps identity, time, version, and classification from catalogue + clock', () => {
    const pending = makeEnvelope(catalogue, {
      name: 'platform.diagnostic.ping',
      payload: { pingId: 'p-1' },
      producer: 'platform-tests',
      clock,
    });
    expect(pending.eventId).toMatch(UUID);
    expect(pending.eventName).toBe('platform.diagnostic.ping');
    expect(pending.schemaVersion).toBe(3);
    expect(pending.occurredAt).toBe('2026-08-15T10:00:00.000Z');
    expect(pending.correlationId).toMatch(UUID);
    expect(pending.causationId).toBeNull();
    expect(pending.producer).toBe('platform-tests');
    expect(pending.classification).toBe('INTERNAL');
    expect('tenantId' in pending).toBe(false);
    expect('recordedAt' in pending).toBe(false);
    expect(Object.isFrozen(pending)).toBe(true);
    expect(Object.isFrozen(pending.payload)).toBe(true);
  });

  it('threads correlation, causation, and tenant through unchanged', () => {
    const pending = makeEnvelope(catalogue, {
      name: 'platform.diagnostic.ping',
      payload: { pingId: 'p-2' },
      correlationId: 'corr-1',
      causationId: 'cause-1',
      tenantId: 'tenant-1',
      producer: 'platform-tests',
      clock,
    });
    expect(pending.correlationId).toBe('corr-1');
    expect(pending.causationId).toBe('cause-1');
    expect(pending.tenantId).toBe('tenant-1');
  });

  it('generates a fresh eventId per call', () => {
    const input = {
      name: 'platform.diagnostic.ping',
      payload: { pingId: 'p-3' },
      producer: 'platform-tests',
      clock,
    };
    expect(makeEnvelope(catalogue, input).eventId).not.toBe(makeEnvelope(catalogue, input).eventId);
  });

  it('refuses an uncatalogued event name', () => {
    expect(() =>
      makeEnvelope(catalogue, {
        name: 'platform.diagnostic.unknown',
        payload: {},
        producer: 'platform-tests',
        clock,
      }),
    ).toThrowError(expect.objectContaining({ name: 'EventCatalogueError', kind: 'unknown_event' }));
  });

  it('refuses a payload outside the entry schema', () => {
    expect(() =>
      makeEnvelope(catalogue, {
        name: 'platform.diagnostic.ping',
        payload: { smuggled: 'field' },
        producer: 'platform-tests',
        clock,
      }),
    ).toThrowError(
      expect.objectContaining({ name: 'EventCatalogueError', kind: 'payload_schema_violation' }),
    );
  });

  it('refuses empty identity fields by name', () => {
    const base = {
      name: 'platform.diagnostic.ping',
      payload: { pingId: 'p' },
      producer: 'platform-tests',
      clock,
    };
    expect(() => makeEnvelope(catalogue, { ...base, producer: ' ' })).toThrowError(/producer/);
    expect(() => makeEnvelope(catalogue, { ...base, correlationId: '' })).toThrowError(
      /correlationId/,
    );
    expect(() => makeEnvelope(catalogue, { ...base, tenantId: ' ' })).toThrowError(/tenantId/);
  });

  it('recordEnvelope completes the pending envelope at persist time', () => {
    const pending = makeEnvelope(catalogue, {
      name: 'platform.diagnostic.ping',
      payload: { pingId: 'p-4' },
      producer: 'platform-tests',
      clock,
    });
    const recorded = recordEnvelope(pending, new Date('2026-08-15T10:00:01.500Z'));
    expect(recorded.recordedAt).toBe('2026-08-15T10:00:01.500Z');
    expect(recorded.eventId).toBe(pending.eventId);
    expect(Object.isFrozen(recorded)).toBe(true);
  });
});

describe('classification payload rules at envelope time (../classification owns them)', () => {
  it('SEALED: identifiers and status pass; anything else is refused', () => {
    const sealed = catalogueWith({
      classification: 'SEALED',
      payloadRule: 'identifiers-and-status',
    });
    const ok = makeEnvelope(sealed, {
      name: 'platform.diagnostic.ping',
      payload: { accountId: 'a-1', status: 'AUTHORIZED' },
      producer: 'platform-tests',
      clock,
    });
    expect(ok.classification).toBe('SEALED');

    expect(() =>
      makeEnvelope(sealed, {
        name: 'platform.diagnostic.ping',
        payload: { accountId: 'a-1', note: 'the obligation itself' },
        producer: 'platform-tests',
        clock,
      }),
    ).toThrowError(EventPayloadViolation);
  });

  it('SEALED: a smuggled exemption is ignored — no mechanism exists', () => {
    // parseEventCatalogue refuses SEALED+exemption; call the classification
    // rule directly to prove the runtime guard stands on its own.
    expect(() =>
      assertEventPayloadAllowed(
        'SEALED',
        { note: 'detail' },
        {
          owner: 'x',
          reason: 'y',
          reviewer: 'z',
        },
      ),
    ).toThrowError(EventPayloadViolation);
  });

  it('HIGHLY_SENSITIVE_FINANCIAL: identifier-only by default', () => {
    const hsf = catalogueWith({
      classification: 'HIGHLY_SENSITIVE_FINANCIAL',
      payloadRule: 'identifier-only',
    });
    const ok = makeEnvelope(hsf, {
      name: 'platform.diagnostic.ping',
      payload: { accountId: 'a-1' },
      producer: 'platform-tests',
      clock,
    });
    expect(ok.payload).toEqual({ accountId: 'a-1' });

    expect(() =>
      makeEnvelope(hsf, {
        name: 'platform.diagnostic.ping',
        payload: { accountId: 'a-1', amount: 12_345 },
        producer: 'platform-tests',
        clock,
      }),
    ).toThrowError(EventPayloadViolation);
  });

  it('HIGHLY_SENSITIVE_FINANCIAL: the exemption in THE CATALOGUE ENTRY permits payload', () => {
    const exempted = catalogueWith({
      classification: 'HIGHLY_SENSITIVE_FINANCIAL',
      payloadRule: 'payload-permitted',
      payloadExemption: {
        owner: 'finance-lead',
        reason: 'projection needs the amount to compute totals',
        reviewer: 'security-lead',
      },
    });
    const ok = makeEnvelope(exempted, {
      name: 'platform.diagnostic.ping',
      payload: { accountId: 'a-1', amount: 12_345 },
      producer: 'platform-tests',
      clock,
    });
    expect(ok.payload['amount']).toBe(12_345);

    // The same payload WITHOUT an exemption refuses — the exemption lives in
    // the catalogue entry, nowhere else.
    expect(() =>
      assertEventPayloadAllowed('HIGHLY_SENSITIVE_FINANCIAL', { amount: 12_345 }),
    ).toThrowError(EventPayloadViolation);
  });

  it('SECRET: never in an event at all, whatever the payload shape', () => {
    const secret = catalogueWith({ classification: 'SECRET' });
    expect(() =>
      makeEnvelope(secret, {
        name: 'platform.diagnostic.ping',
        payload: { pingId: 'p-1' },
        producer: 'platform-tests',
        clock,
      }),
    ).toThrowError(EventPayloadViolation);
  });
});

describe('classification vocabulary', () => {
  it('api-contracts mirrors the canonical six classifications exactly', () => {
    // api-contracts declares the list locally because it depends on nothing
    // (runtime-light by rule); this pins it to the canonical source in
    // platform/src/classification so the two can never drift silently.
    expect([...EVENT_CLASSIFICATIONS]).toEqual([...DATA_CLASSIFICATIONS]);
  });
});
