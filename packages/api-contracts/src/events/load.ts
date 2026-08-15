/**
 * The one I/O seam in this package: reads `events/catalogue.json` from the
 * package itself (node builtins only — the package keeps zero dependencies).
 * Everything downstream works on the parsed, validated `EventCatalogue`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEventCatalogue } from './catalogue.js';
import type { EventCatalogue } from './types.js';

/** Absolute path of the canonical catalogue file inside this package. */
export function defaultEventCataloguePath(): string {
  // src/events/ and dist/events/ are both two levels below the package root,
  // so the same relative path serves compiled and test execution.
  return join(__dirname, '..', '..', 'events', 'catalogue.json');
}

/** Reads and validates the canonical catalogue; throws on any invalidity. */
export function readDefaultEventCatalogue(): EventCatalogue {
  const raw: unknown = JSON.parse(readFileSync(defaultEventCataloguePath(), 'utf8'));
  return parseEventCatalogue(raw);
}
