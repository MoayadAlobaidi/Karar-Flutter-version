/**
 * **No real provider is seeded, none is VERIFIED, and no provider-specific
 * vocabulary exists in this module** — asserted against the shipped registry
 * and against this module's own SOURCE rather than against the intention
 * behind them.
 *
 * These are guarantees of ABSENCE, and an absence cannot fail a test by being
 * absent. They fail when somebody adds the missing thing later: a first real
 * profile pasted into the registry with a hopeful `VERIFIED` on it, a
 * convenience constant naming an issuer, a special case for one telco's
 * wallet. So the assertions are that the shapes are not there, checked over
 * the files as they are on disk — the style
 * `modules/payment-instruments/__tests__/no-money-arithmetic.test.ts`
 * established, for the same reason it gives.
 *
 * The scan also proves the third guarantee behind rule 3: this module imports
 * no other module AT ALL — not even a type — so there is no expression here
 * that could reach a repository, a connection, or a row. The vocabularies
 * other modules own are mirrored instead, and checked against their owners in
 * `__tests__/mirrored-vocabularies.test.ts`.
 *
 * Only production source is scanned. `__tests__` is excluded deliberately:
 * this file has to name the words it is looking for, and the fixtures have to
 * name synthetic issuers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isVerified } from '../domain/capability-assertion.js';
import {
  REVIEWED_CAPABILITY_PROFILES,
  assertValidReviewedProfiles,
} from '../domain/profile-registry.js';
import { ReviewedRegistryProfileSource } from '../infrastructure/registry/reviewed-registry-profile-source.js';
import { SYNTHETIC_MARKET, SYNTHETIC_TELCO_ALPHA } from './fixtures.js';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every production `.ts` file in the module, relative to the module root. */
function productionSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'dist' || entry.name === 'node_modules') {
          continue;
        }
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        found.push(path.relative(MODULE_ROOT, full));
      }
    }
  };
  walk(MODULE_ROOT);
  return found;
}

const SOURCES = productionSources();

const readRaw = (relative: string): string =>
  fs.readFileSync(path.join(MODULE_ROOT, relative), 'utf8');

/**
 * The file with comments and string literals blanked out.
 *
 * Necessary for the same reason `no-money-arithmetic.test.ts` gives: this
 * module's prose talks about APIs, providers, credentials and scraping
 * constantly, because explaining why none of them is here is most of what its
 * comments do. A scan over raw text would fire on the sentences that document
 * the guarantee, and the only way to keep it green would be to stop
 * explaining. What must not exist is a SYMBOL, so the scan looks at code.
 */
function readCode(relative: string): string {
  return readRaw(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

describe('the scan sees the files it is meant to see', () => {
  it('walks the whole module and strips prose without blanking the code', () => {
    // The positive control every absence test needs: a scanner pointed at
    // nothing passes silently, and would keep passing after the guarantee was
    // gone.
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(SOURCES).toContain('public-api.ts');
    expect(SOURCES).toContain(path.join('domain', 'capability-profile.ts'));
    expect(SOURCES).toContain(path.join('domain', 'data-rails.ts'));
    expect(SOURCES).toContain(
      path.join('infrastructure', 'registry', 'reviewed-registry-profile-source.ts'),
    );

    const stripped = readCode(path.join('domain', 'capability-profile.ts'));
    expect(stripped).toContain('export function capabilityProfile');
    expect(stripped).not.toContain('ADR-0028');
  });
});

describe('the shipped registry is empty', () => {
  it('carries not one profile', () => {
    expect(REVIEWED_CAPABILITY_PROFILES).toEqual([]);
    expect(Object.isFrozen(REVIEWED_CAPABILITY_PROFILES)).toBe(true);
  });

  it('has nothing VERIFIED in it, vacuously and checkably', () => {
    for (const profile of REVIEWED_CAPABILITY_PROFILES) {
      expect(isVerified(profile.regulatoryStanding)).toBe(false);
      for (const assertion of Object.values(profile.dataRails)) {
        expect(isVerified(assertion)).toBe(false);
      }
    }
  });

  it('validates vacuously, so the boot gate is already in the path', () => {
    expect(() => assertValidReviewedProfiles()).not.toThrow();
  });

  it('answers nothing for every query, through the real adapter', () => {
    const source = new ReviewedRegistryProfileSource();

    expect(
      source.findReviewedProfile({
        institutionRef: SYNTHETIC_TELCO_ALPHA,
        marketCountry: SYNTHETIC_MARKET,
        customerSegment: 'RETAIL',
      }),
    ).toBeNull();
  });

  it('holds no synthetic profile either — fixtures live in __tests__ and stay there', () => {
    const registrySource = readCode(path.join('domain', 'profile-registry.ts'));

    expect(registrySource).toContain('Object.freeze');
    expect(registrySource).not.toContain('capabilityProfile(');
    expect(registrySource).not.toContain('InstitutionRef.of');
  });
});

describe('no provider-specific vocabulary in production source', () => {
  // Real institutions, telco financial arms, wallet products and aggregators.
  // None of these may appear as a symbol, a constant, a branch or a comparison
  // anywhere in this module. The list is not exhaustive and cannot be — the
  // structural guarantee is that the profile type has NO name field, so there
  // is nowhere for one to live; this scan catches the case where somebody adds
  // a special case beside the type rather than inside it.
  const FORBIDDEN_NAMES = [
    'ooredoo',
    'vodafone',
    'etisalat',
    'zain',
    'orangemoney',
    'mpesa',
    'safaricom',
    'stcpay',
    'fawry',
    'qnb',
    'alrajhi',
    'emiratesnbd',
    'mashreq',
    'plaid',
    'tink',
    'truelayer',
    'yodlee',
    'finicity',
    'saltedge',
    'revolut',
    'monzo',
    'paypal',
    'adyen',
    'mastercard',
  ] as const;

  // Short or common letter runs ('visa', 'wise', 'mx') are deliberately NOT in
  // the list: the comparison strips punctuation and joins the file into one
  // letter run, so a four-letter name would eventually fire on two adjacent
  // identifiers and the list would be edited to make the noise stop. A check
  // people learn to silence is worse than one that catches less.

  it('names no real issuer, wallet product or aggregator', () => {
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      // Compare on letters only, so 'Al-Rajhi', 'AL_RAJHI' and 'alRajhi' are
      // all one thing and none of them slips through on punctuation.
      const letters = readCode(relative).toLowerCase().replace(/[^a-z]/g, '');
      for (const name of FORBIDDEN_NAMES) {
        if (letters.includes(name)) {
          offenders.push(`${relative}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scan would catch one — the check is not vacuous', () => {
    const letters = 'const OOREDOO_MONEY_WALLET = true;'.toLowerCase().replace(/[^a-z]/g, '');
    expect(FORBIDDEN_NAMES.some((name) => letters.includes(name))).toBe(true);
  });

  it('has no conditional keyed on an issuer, a market or a segment', () => {
    // A `switch` over an issuer reference is how provider branching begins.
    // There is none, and there is no equality comparison on an issuer id
    // either — the module reads profiles by key and never asks which one.
    const offenders = SOURCES.filter((relative) => {
      const code = readCode(relative);
      return (
        /\bswitch\s*\([^)]*\b(?:institution|issuer|provider)\w*/i.test(code) ||
        /\b(?:institution|issuer|provider)\w*\s*(?:===|!==)/i.test(code)
      );
    });
    expect(offenders).toEqual([]);
  });
});

describe('no runtime reach out of this module', () => {
  it('imports no other module at all — not even a type', () => {
    // Architecture test 1 forbids it in `domain/`; this asserts it across the
    // WHOLE module, including application and infrastructure, because the
    // vocabularies are mirrored (see `__tests__/mirrored-vocabularies.test.ts`)
    // and a stray import would silently make the mirror redundant and the
    // layering claim false.
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      for (const match of readRaw(relative).matchAll(/from\s+'(@karar\/[^']+)'/g)) {
        const specifier = match[1] ?? '';
        // The kernel is a pure package with no I/O of any kind and is the one
        // package dependency this module's code has.
        if (specifier === '@karar/shared-kernel') continue;
        offenders.push(`${relative}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('imports no ORM, no driver, no HTTP client and no platform runtime', () => {
    const FORBIDDEN_SPECIFIERS = [
      '@prisma/client',
      'prisma',
      'pg',
      'node:http',
      'node:https',
      'node:net',
      'node:fs',
      'node:child_process',
      'axios',
      'undici',
      'node-fetch',
      '@karar/platform',
    ];
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const code = readRaw(relative);
      for (const match of code.matchAll(/from\s+'([^']+)'/g)) {
        const specifier = match[1] ?? '';
        if (FORBIDDEN_SPECIFIERS.includes(specifier)) {
          offenders.push(`${relative}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('calls nothing that could leave the process', () => {
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const code = readCode(relative);
      for (const pattern of [
        /\bfetch\s*\(/,
        /\bXMLHttpRequest\b/,
        /\bWebSocket\b/,
        /\bexec\w*\s*\(\s*['"`]/,
        /\bhttps?:\/\//,
      ]) {
        if (pattern.test(code)) {
          offenders.push(`${relative}: ${String(pattern)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
