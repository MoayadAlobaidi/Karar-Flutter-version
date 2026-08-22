/**
 * The keyed, per-subject, versioned source-account fingerprint.
 *
 * The assertion that carries the most weight is CROSS-SUBJECT
 * NON-CORRELATION: the same external account reference, under two different
 * subjects, must produce DIFFERENT values. If it did not, this column would
 * be a cross-subject join key inside a shared table — "these two subjects
 * hold the same external account", derivable across a whole database without
 * decrypting anything, which is a worse disclosure than any single row.
 *
 * The two members of ONE tenant are the important pair. A derivation keyed on
 * the tenant alone would pass a cross-tenant check and fail exactly there,
 * which is the household case this platform is built for.
 */

import { describe, expect, it } from 'vitest';

import {
  LocalKeyedSourceAccountFingerprintProvider,
  SOURCE_ACCOUNT_FINGERPRINT_VERSION,
  sourceAccountFingerprintsEqual,
} from '../infrastructure/providers/local-keyed-source-account-fingerprint-provider.js';
import { normalizeExternalReference } from '../domain/external-account-reference.js';
import { fingerprintsMatch } from '../domain/account-source-link.js';
import { ACTOR_A1, ACTOR_A2, ACTOR_B1, SYNTHETIC_FINGERPRINT_ROOT_KEY } from './fixtures.js';

const provider = new LocalKeyedSourceAccountFingerprintProvider({
  rootKey: SYNTHETIC_FINGERPRINT_ROOT_KEY,
});

const REFERENCE = {
  scheme: 'SOURCE_ACCOUNT_REFERENCE' as const,
  normalizedReference: normalizeExternalReference('SYNTHETIC-SRC-ACCT-ALPHA'),
};

describe('cross-subject non-correlation', () => {
  it('produces different values for one reference under two subjects in ONE tenant', async () => {
    const a1 = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const a2 = await provider.fingerprint(ACTOR_A2, REFERENCE);

    expect(a1.value).not.toEqual(a2.value);
    expect(fingerprintsMatch(a1, a2)).toBe(false);
    expect(sourceAccountFingerprintsEqual(a1, a2)).toBe(false);
  });

  it('produces different values for one reference across two tenants', async () => {
    const a1 = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const b1 = await provider.fingerprint(ACTOR_B1, REFERENCE);

    expect(a1.value).not.toEqual(b1.value);
  });

  it('produces three unrelated values across the three principals', async () => {
    const values = await Promise.all(
      [ACTOR_A1, ACTOR_A2, ACTOR_B1].map(async (actor) =>
        (await provider.fingerprint(actor, REFERENCE)).value,
      ),
    );
    expect(new Set(values).size).toBe(3);
  });

  it('shares no prefix between two subjects — not merely unequal', async () => {
    // A digest that differed only in a suffix would still correlate under a
    // prefix comparison, and prefix comparisons are what an index does.
    const a1 = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const a2 = await provider.fingerprint(ACTOR_A2, REFERENCE);
    expect(a1.value.slice(0, 8)).not.toEqual(a2.value.slice(0, 8));
  });
});

describe('determinism, without which the unique constraint means nothing', () => {
  it('is stable for one principal and one reference', async () => {
    const first = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const second = await provider.fingerprint(ACTOR_A1, REFERENCE);
    expect(second.value).toEqual(first.value);
    expect(sourceAccountFingerprintsEqual(first, second)).toBe(true);
  });

  it('is stable across two provider instances holding the same root key', async () => {
    const other = new LocalKeyedSourceAccountFingerprintProvider({
      rootKey: SYNTHETIC_FINGERPRINT_ROOT_KEY,
    });
    const mine = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const theirs = await other.fingerprint(ACTOR_A1, REFERENCE);
    expect(theirs.value).toEqual(mine.value);
  });

  it('separates two different references for one subject', async () => {
    const alpha = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const beta = await provider.fingerprint(ACTOR_A1, {
      scheme: 'SOURCE_ACCOUNT_REFERENCE',
      normalizedReference: normalizeExternalReference('SYNTHETIC-SRC-ACCT-BETA'),
    });
    expect(alpha.value).not.toEqual(beta.value);
  });

  it('is case-insensitive through normalisation, and separator-sensitive', async () => {
    // Uppercasing is safe: no source distinguishes two accounts by letter
    // case. Separator stripping is NOT applied, and this is the assertion
    // that says so — folding them would make two merely SIMILAR references
    // compare as exactly equal, and an exact match is the one thing this
    // module links without asking.
    const lower = await provider.fingerprint(ACTOR_A1, {
      scheme: 'SOURCE_ACCOUNT_REFERENCE',
      normalizedReference: normalizeExternalReference('synthetic-src-acct-alpha'),
    });
    expect(lower.value).toEqual((await provider.fingerprint(ACTOR_A1, REFERENCE)).value);

    const unseparated = await provider.fingerprint(ACTOR_A1, {
      scheme: 'SOURCE_ACCOUNT_REFERENCE',
      normalizedReference: normalizeExternalReference('SYNTHETICSRCACCTALPHA'),
    });
    expect(unseparated.value).not.toEqual((await provider.fingerprint(ACTOR_A1, REFERENCE)).value);
  });
});

describe('the version, and what it names', () => {
  it('travels with every value', async () => {
    const value = await provider.fingerprint(ACTOR_A1, REFERENCE);
    expect(value.version).toBe(SOURCE_ACCOUNT_FINGERPRINT_VERSION);
    expect(provider.version).toBe(SOURCE_ACCOUNT_FINGERPRINT_VERSION);
  });

  it('makes two values of different versions unequal even if the digests match', () => {
    const left = { version: 'source-account/hmac-sha256/opaque-reference/v1', value: 'abc' };
    const right = { version: 'source-account/hmac-sha256/opaque-reference/v2', value: 'abc' };
    expect(fingerprintsMatch(left, right)).toBe(false);
    expect(sourceAccountFingerprintsEqual(left, right)).toBe(false);
  });

  it('names the whole definition, including the hash and the input kind', () => {
    // A version that said only "v1" would be a number whose meaning depends
    // on which commit produced it, which is not a version.
    expect(SOURCE_ACCOUNT_FINGERPRINT_VERSION).toContain('hmac-sha256');
    expect(SOURCE_ACCOUNT_FINGERPRINT_VERSION).toContain('opaque-reference');
  });
});

describe('the key itself', () => {
  it('refuses a root key shorter than 32 bytes', () => {
    expect(
      () => new LocalKeyedSourceAccountFingerprintProvider({ rootKey: new Uint8Array(16) }),
    ).toThrow(/at least 32 bytes/);
  });

  it('makes two different root keys produce unrelated values for one subject', async () => {
    const other = new LocalKeyedSourceAccountFingerprintProvider({
      rootKey: new Uint8Array(32).fill(99),
    });
    const mine = await provider.fingerprint(ACTOR_A1, REFERENCE);
    const theirs = await other.fingerprint(ACTOR_A1, REFERENCE);
    expect(theirs.value).not.toEqual(mine.value);
  });

  it('is not recoverable from a value: the digest is a fixed-width hex MAC', async () => {
    const value = await provider.fingerprint(ACTOR_A1, REFERENCE);
    expect(value.value).toMatch(/^[0-9a-f]{64}$/);
    // And it carries nothing of the input: the reference does not appear.
    expect(value.value).not.toContain('SYNTHETIC');
    expect(value.value.toUpperCase()).not.toContain('ALPHA');
  });
});
