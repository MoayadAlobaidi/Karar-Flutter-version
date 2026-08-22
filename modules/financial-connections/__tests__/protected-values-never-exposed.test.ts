/**
 * The two values that must never leave this module: the external account
 * reference, and the source-account fingerprint.
 *
 * Types do not survive to runtime, so a narrower return type is not evidence
 * of anything. These assertions are over `Object.keys` of the value a read
 * path actually produces, and over this module's own production SOURCE TEXT
 * for the logging claim — because no runtime call can demonstrate that a log
 * line is absent.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';

import {
  createAccountSourceLink,
  toAccountSourceLinkView,
} from '../domain/account-source-link.js';
import { HSF_REDACTION } from '../domain/hsf-field.js';
import { CanonicalAccountRef, type AccountSourceLinkId, type FinancialConnectionId } from '../domain/refs.js';
import { SYNTHETIC_SOURCE_REF_ONE, TENANT_A, USER_A1 } from './fixtures.js';

const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));
const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function buildLink() {
  const built = createAccountSourceLink({
    id: '05050505-0000-4000-8000-000000005001' as AccountSourceLinkId,
    tenantId: TENANT_A,
    userId: USER_A1,
    accountRef: CanonicalAccountRef.of('ac000000-0000-4000-8000-0000000000a1'),
    connectionId: '0c0c0c0c-0000-4000-8000-00000000c001' as FinancialConnectionId,
    connectionRail: 'USER_FILE_UPLOAD',
    sourceAuthority: 'UNVERIFIED',
    sourceAccountReference: SYNTHETIC_SOURCE_REF_ONE,
    referenceScheme: 'SOURCE_ACCOUNT_REFERENCE',
    fingerprint: { version: 'v-test', value: 'deadbeefdeadbeef' },
    matchBasis: 'PROBABLE',
    observedAt: clock.now(),
  });
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('unreachable');
  return built.value;
}

/**
 * Comments stripped, because these scans are about CODE. The headers in this
 * module discuss `console.log`, passwords and access tokens at length —
 * precisely because none of them exists — and a scan that matched prose would
 * fail on the documentation of the guarantee it is checking.
 */
function strippedSource(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every .ts file under this module that is NOT a test or a fixture. */
function productionSources(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) found.push(full);
    }
  };
  walk(MODULE_ROOT);
  return found;
}

describe('the read model carries neither protected value', () => {
  it('omits the reference and the fingerprint from the view, at runtime', () => {
    const link = buildLink();
    const view = toAccountSourceLinkView(link);
    const keys = Object.keys(view);

    expect(keys).not.toContain('sourceAccountReference');
    expect(keys).not.toContain('fingerprint');
    expect(keys).not.toContain('referenceScheme');
    // And nothing that merely looks like either of them under another name.
    for (const key of keys) {
      expect(key).not.toMatch(/fingerprint|reference$|externalRef/i);
    }
  });

  it('survives serialization without either value appearing', () => {
    const serialized = JSON.stringify(toAccountSourceLinkView(buildLink()));
    expect(serialized).not.toContain(SYNTHETIC_SOURCE_REF_ONE);
    expect(serialized).not.toContain('deadbeefdeadbeef');
  });

  it('still carries every field a caller legitimately needs', () => {
    const view = toAccountSourceLinkView(buildLink());
    for (const key of [
      'id',
      'accountRef',
      'connectionId',
      'connectionRail',
      'sourceAuthority',
      'matchBasis',
      'status',
      'subjectConfirmedAt',
      'sourcePriority',
      'observation',
      'historyCoverage',
      'capabilities',
      'version',
    ]) {
      expect(Object.keys(view), key).toContain(key);
    }
  });
});

describe('the entity redacts the reference on every accidental path', () => {
  it('renders a marker through toString, JSON and template coercion', () => {
    const link = buildLink();
    expect(String(link.sourceAccountReference)).toBe(HSF_REDACTION);
    expect(JSON.stringify(link.sourceAccountReference)).toBe(`"${HSF_REDACTION}"`);
    expect(`${link.sourceAccountReference}`).toBe(HSF_REDACTION);
    expect(JSON.stringify(link)).not.toContain(SYNTHETIC_SOURCE_REF_ONE);
    // The real characters are reachable only through an explicit, grep-able
    // call, which is the entire design.
    expect(link.sourceAccountReference.reveal()).toBe(SYNTHETIC_SOURCE_REF_ONE);
  });
});

describe('neither value is logged', () => {
  it('has no console call anywhere in this module production source', () => {
    const offenders = productionSources().filter((file) =>
      /\bconsole\s*\.\s*(log|info|warn|error|debug|trace|dir)\s*\(/.test(strippedSource(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('has no logger call that could carry a fingerprint or a reference', () => {
    const offenders = productionSources().filter((file) =>
      /\b(logger|log)\s*\.\s*(info|warn|error|debug|trace)\s*\(/.test(strippedSource(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('never interpolates a fingerprint into an error message', () => {
    // The store-failure and refusal messages are the places a fingerprint
    // would most plausibly be interpolated "for debugging".
    const offenders = productionSources().filter((file) => {
      const source = strippedSource(file);
      return (
        /\$\{[^}]*fingerprint[^}]*\.value[^}]*\}/i.test(source) ||
        /\$\{[^}]*sourceAccountReference[^}]*\}/i.test(source) ||
        /\$\{[^}]*\.reveal\(\)[^}]*\}/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });
});

describe('no credential vocabulary exists in this module source', () => {
  it('declares no field, type or property named for a secret', () => {
    // Word-boundary matches on identifier-shaped occurrences, so the prose in
    // the headers — which discusses these words at length precisely because
    // the columns do not exist — does not trip it.
    const forbidden =
      /\b(password|passphrase|mpin|otp|accessToken|refreshToken|clientSecret|sessionToken|cookieJar|scrapingState|syncCursor|credentialRef)\b\s*[:?]/i;
    const offenders = productionSources().filter((file) => forbidden.test(strippedSource(file)));
    expect(offenders).toEqual([]);
  });
});
