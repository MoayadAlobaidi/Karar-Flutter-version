import { describe, expect, it } from 'vitest';

import { assertConsumerAllowed, getEventEntry, parseEventCatalogue } from './catalogue';
import { readDefaultEventCatalogue } from './load';
import { assertPayloadMatchesSchema, validatePayloadAgainstSchema } from './payload-schema';
import { EventCatalogueError, PLATFORM_DIAGNOSTIC_PING } from './types';

/** A valid entry to derive invalid variants from. */
const validEntry = {
  name: 'platform.diagnostic.ping',
  schemaVersion: 1,
  ownerModule: 'platform',
  classification: 'INTERNAL',
  piiFlag: false,
  allowedConsumers: ['platform-tests', 'worker-diagnostics'],
  retention: 'P7D',
  payloadRule: 'payload-permitted',
  payloadExemption: null,
  payloadSchema: {
    type: 'object',
    properties: { pingId: { type: 'string' }, note: { type: 'string' } },
    required: ['pingId'],
    additionalProperties: false,
  },
};

function catalogueWith(overrides: Record<string, unknown>): unknown {
  return { events: [{ ...validEntry, ...overrides }] };
}

function parseFailure(raw: unknown): EventCatalogueError {
  try {
    parseEventCatalogue(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(EventCatalogueError);
    expect((error as EventCatalogueError).kind).toBe('invalid_catalogue');
    return error as EventCatalogueError;
  }
  throw new Error('expected parseEventCatalogue to throw');
}

describe('parseEventCatalogue', () => {
  it('accepts the valid entry and freezes the result', () => {
    const catalogue = parseEventCatalogue({ events: [validEntry] });
    expect(catalogue.events).toHaveLength(1);
    expect(Object.isFrozen(catalogue)).toBe(true);
    expect(Object.isFrozen(catalogue.events[0])).toBe(true);
    expect(catalogue.events[0]?.allowedConsumers).toEqual(['platform-tests', 'worker-diagnostics']);
  });

  it('rejects a non-object document and a missing events array', () => {
    expect(parseFailure(null).message).toContain("'events' array");
    expect(parseFailure({ events: 'nope' }).message).toContain("'events' array");
  });

  it('collects EVERY problem at once instead of stopping at the first', () => {
    const failure = parseFailure({
      events: [{ ...validEntry, schemaVersion: 0, retention: 'seven days', piiFlag: 'no' }],
    });
    expect(failure.message).toContain("'schemaVersion' must be a positive integer");
    expect(failure.message).toContain('ISO-8601 duration');
    expect(failure.message).toContain("'piiFlag' must be a boolean");
  });

  it('rejects duplicate event names', () => {
    const failure = parseFailure({ events: [validEntry, validEntry] });
    expect(failure.message).toContain("duplicate event 'platform.diagnostic.ping'");
  });

  it('rejects an empty or repeated consumer list', () => {
    expect(parseFailure(catalogueWith({ allowedConsumers: [] })).message).toContain(
      'non-empty array',
    );
    expect(parseFailure(catalogueWith({ allowedConsumers: ['a', 'a'] })).message).toContain(
      'must not repeat',
    );
  });

  it('rejects an unknown classification and an unknown payloadRule', () => {
    expect(parseFailure(catalogueWith({ classification: 'TOP_SECRET' })).message).toContain(
      "'classification' must be one of",
    );
    expect(parseFailure(catalogueWith({ payloadRule: 'anything-goes' })).message).toContain(
      "'payloadRule' must be one of",
    );
  });

  it('rejects a payload schema that is open or nested', () => {
    expect(
      parseFailure(
        catalogueWith({
          payloadSchema: { ...validEntry.payloadSchema, additionalProperties: true },
        }),
      ).message,
    ).toContain('additionalProperties must be false');
    expect(
      parseFailure(
        catalogueWith({
          payloadSchema: {
            ...validEntry.payloadSchema,
            properties: { nested: { type: 'object' } },
            required: [],
          },
        }),
      ).message,
    ).toContain("properties['nested']");
  });

  it('rejects required fields that are not declared as properties', () => {
    expect(
      parseFailure(
        catalogueWith({
          payloadSchema: { ...validEntry.payloadSchema, required: ['ghost'] },
        }),
      ).message,
    ).toContain("undeclared field 'ghost'");
  });

  describe('classification governance (event-governance.md section 3)', () => {
    it('SEALED: payload-permitted is refused — identifiers and status only', () => {
      const failure = parseFailure(
        catalogueWith({ classification: 'SEALED', payloadRule: 'payload-permitted' }),
      );
      expect(failure.message).toContain('identifiers and status only');
    });

    it('SEALED: accepts identifier-only and identifiers-and-status', () => {
      for (const payloadRule of ['identifier-only', 'identifiers-and-status']) {
        const catalogue = parseEventCatalogue(
          catalogueWith({ classification: 'SEALED', payloadRule }),
        );
        expect(catalogue.events[0]?.payloadRule).toBe(payloadRule);
      }
    });

    it('SEALED: an exemption is refused even alongside a legal payloadRule — no mechanism exists', () => {
      const failure = parseFailure(
        catalogueWith({
          classification: 'SEALED',
          payloadRule: 'identifier-only',
          payloadExemption: { owner: 'x', reason: 'y', reviewer: 'z' },
        }),
      );
      expect(failure.message).toContain('mechanism does not exist');
    });

    it('HIGHLY_SENSITIVE_FINANCIAL: beyond identifier-only requires a full exemption', () => {
      const failure = parseFailure(catalogueWith({ classification: 'HIGHLY_SENSITIVE_FINANCIAL' }));
      expect(failure.message).toContain('requires a payloadExemption');

      const incomplete = parseFailure(
        catalogueWith({
          classification: 'HIGHLY_SENSITIVE_FINANCIAL',
          payloadExemption: { owner: 'x', reason: '', reviewer: 'z' },
        }),
      );
      expect(incomplete.message).toContain('owner, reason, and reviewer');

      const exempted = parseEventCatalogue(
        catalogueWith({
          classification: 'HIGHLY_SENSITIVE_FINANCIAL',
          payloadExemption: {
            owner: 'finance-lead',
            reason: 'projection needs the amount to compute totals',
            reviewer: 'security-lead',
          },
        }),
      );
      expect(exempted.events[0]?.payloadExemption?.reviewer).toBe('security-lead');
    });

    it('HIGHLY_SENSITIVE_FINANCIAL: identifier-only needs no exemption', () => {
      const catalogue = parseEventCatalogue(
        catalogueWith({
          classification: 'HIGHLY_SENSITIVE_FINANCIAL',
          payloadRule: 'identifier-only',
        }),
      );
      expect(catalogue.events[0]?.payloadExemption).toBeNull();
    });

    it('other classifications must not carry an exemption', () => {
      const failure = parseFailure(
        catalogueWith({ payloadExemption: { owner: 'x', reason: 'y', reviewer: 'z' } }),
      );
      expect(failure.message).toContain('only meaningful on HIGHLY_SENSITIVE_FINANCIAL');
    });
  });
});

describe('publish and subscribe guards', () => {
  const catalogue = parseEventCatalogue({ events: [validEntry] });

  it('resolves a catalogued event for publishing', () => {
    const entry = getEventEntry(catalogue, PLATFORM_DIAGNOSTIC_PING);
    expect(entry.ownerModule).toBe('platform');
    expect(entry.classification).toBe('INTERNAL');
  });

  it('refuses an unknown event name at publish time', () => {
    expect(() => getEventEntry(catalogue, 'platform.diagnostic.uncatalogued')).toThrowError(
      expect.objectContaining({ name: 'EventCatalogueError', kind: 'unknown_event' }),
    );
  });

  it('allows a declared consumer and refuses an undeclared one at subscribe time', () => {
    expect(
      assertConsumerAllowed(catalogue, PLATFORM_DIAGNOSTIC_PING, 'worker-diagnostics').name,
    ).toBe(PLATFORM_DIAGNOSTIC_PING);
    expect(() =>
      assertConsumerAllowed(catalogue, PLATFORM_DIAGNOSTIC_PING, 'projections'),
    ).toThrowError(
      expect.objectContaining({ name: 'EventCatalogueError', kind: 'consumer_not_allowed' }),
    );
  });

  it('subscribe to an unknown event fails as unknown_event, not silently', () => {
    expect(() =>
      assertConsumerAllowed(catalogue, 'no.such.event', 'worker-diagnostics'),
    ).toThrowError(expect.objectContaining({ kind: 'unknown_event' }));
  });
});

describe('payload schema validation', () => {
  const catalogue = parseEventCatalogue({ events: [validEntry] });
  const entry = getEventEntry(catalogue, PLATFORM_DIAGNOSTIC_PING);

  it('accepts a conforming payload, with and without the optional field', () => {
    expect(validatePayloadAgainstSchema(entry.payloadSchema, { pingId: 'p-1' })).toEqual([]);
    expect(
      validatePayloadAgainstSchema(entry.payloadSchema, { pingId: 'p-1', note: 'hello' }),
    ).toEqual([]);
  });

  it('names every violation: missing required, unexpected field, wrong type', () => {
    const violations = validatePayloadAgainstSchema(entry.payloadSchema, {
      note: 7,
      extra: true,
    });
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing required field 'pingId'"),
        expect.stringContaining("field 'note' must be a string"),
        expect.stringContaining("unexpected field 'extra'"),
      ]),
    );
  });

  it('rejects non-object payloads', () => {
    for (const payload of [null, 'text', 7, ['a']]) {
      expect(validatePayloadAgainstSchema(entry.payloadSchema, payload)).toEqual([
        'payload must be a plain object',
      ]);
    }
  });

  it('assertPayloadMatchesSchema throws a typed error naming the event', () => {
    expect(() => assertPayloadMatchesSchema(entry, {})).toThrowError(
      expect.objectContaining({
        name: 'EventCatalogueError',
        kind: 'payload_schema_violation',
        message: expect.stringContaining("'platform.diagnostic.ping'"),
      }),
    );
  });
});

describe('the canonical catalogue file', () => {
  it('parses, and holds exactly the events declared so far', () => {
    // An exhaustive list, deliberately. A `toContain` would let an event be
    // added without anyone reading its classification or payload rule, and the
    // catalogue is the one place those are reviewed.
    const catalogue = readDefaultEventCatalogue();
    expect(catalogue.events.map((entry) => entry.name)).toEqual([
      PLATFORM_DIAGNOSTIC_PING,
      'statement_import.committed',
    ]);
    const ping = catalogue.events[0];
    expect(ping?.classification).toBe('INTERNAL');
    expect(ping?.piiFlag).toBe(false);
    expect(ping?.allowedConsumers).toEqual(['platform-tests', 'worker-diagnostics']);
  });

  it('the statement-import notice carries identifiers and nothing else', () => {
    // The first HIGHLY_SENSITIVE_FINANCIAL event. Its payload is two ids
    // because everything else a commit knows — how many rows, how much money,
    // which merchant — is a fact about someone's spending rather than a
    // reference to it. An earlier draft carried the committed-row count and
    // the platform's payload rule refused it, which is the rule working.
    const entry = readDefaultEventCatalogue().events.find(
      (candidate) => candidate.name === 'statement_import.committed',
    );
    expect(entry?.classification).toBe('HIGHLY_SENSITIVE_FINANCIAL');
    expect(entry?.payloadRule).toBe('identifier-only');
    expect(entry?.payloadExemption).toBeNull();
    expect(Object.keys(entry?.payloadSchema.properties ?? {}).sort()).toEqual([
      'accountId',
      'importId',
    ]);
  });
});
