import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from './index';

describe('public surface', () => {
  it('is intentionally empty in Phase 1', () => {
    expect(Object.keys(contracts)).toHaveLength(0);
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
