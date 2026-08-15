import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from './index';

describe('public surface', () => {
  it('exposes the event catalogue surface (Phase 2); HTTP types await SDK generation', () => {
    for (const name of [
      'parseEventCatalogue',
      'readDefaultEventCatalogue',
      'getEventEntry',
      'assertConsumerAllowed',
      'assertPayloadMatchesSchema',
      'validatePayloadAgainstSchema',
      'EventCatalogueError',
      'EVENT_CLASSIFICATIONS',
      'EVENT_PAYLOAD_RULES',
      'PLATFORM_DIAGNOSTIC_PING',
    ]) {
      expect(contracts, `missing export '${name}'`).toHaveProperty(name);
    }
  });
});

describe('event catalogue', () => {
  it('parses and declares an events array', () => {
    const raw = readFileSync(join(__dirname, '..', 'events', 'catalogue.json'), 'utf8');
    const catalogue: unknown = JSON.parse(raw);
    expect(catalogue).toHaveProperty('events');
    expect(Array.isArray((catalogue as { events: unknown }).events)).toBe(true);
  });
});
