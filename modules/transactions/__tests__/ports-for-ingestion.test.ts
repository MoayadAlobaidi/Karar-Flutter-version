/**
 * The two ports the statement-ingestion workstream will bind, tested against
 * their LOCAL/TEST adapters.
 *
 * These are the properties the ingestion pipeline depends on and the ones a
 * production adapter must also satisfy, so they are asserted here rather than
 * left as prose in the port headers:
 *
 *  - the dedup fingerprint is KEYED (not recomputable from the column alone),
 *    PER SUBJECT (not a cross-subject join key), VERSIONED, deterministic,
 *    and unambiguous under field-boundary shifts;
 *  - HSF field encryption round-trips, produces a fresh nonce every time,
 *    carries the key version, and REFUSES a ciphertext moved to another row,
 *    another column, or another subject.
 */

import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { HsfField } from '../domain/hsf-field.js';
import type { FingerprintInput } from '../application/ports/dedup-fingerprint.js';
import { HsfFieldEncryptionError } from '../application/ports/hsf-field-encryption.js';
import {
  DEDUP_FINGERPRINT_VERSION,
  fingerprintsEqual,
  LocalKeyedDedupFingerprintProvider,
} from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { account, BOOKED, principal, syntheticMerchant } from './fakes/synthetic-fixtures.js';

const ROOT_KEY = Buffer.alloc(32, 7);
const ACCOUNT = account();

function input(overrides: Partial<FingerprintInput> = {}): FingerprintInput {
  return {
    accountRef: ACCOUNT,
    bookingDate: BOOKED,
    amountMinorUnits: -4500n,
    currencyCode: 'QAR',
    normalizedNarrative: syntheticMerchant('corner shop'),
    occurrenceOrdinal: 1,
    ...overrides,
  };
}

describe('dedup fingerprint', () => {
  const provider = new LocalKeyedDedupFingerprintProvider({ rootKey: ROOT_KEY });
  const alice = principal();

  it('is deterministic for the same principal and input', async () => {
    const first = await provider.fingerprint(alice, input());
    const second = await provider.fingerprint(alice, input());
    expect(fingerprintsEqual(first, second)).toBe(true);
    expect(first.version).toBe(DEDUP_FINGERPRINT_VERSION);
  });

  it('differs for a different subject with an identical transaction', async () => {
    // The cross-subject linkage property: two people buying the same thing
    // at the same moment must not produce the same column value, or the
    // column becomes a join key inside a shared table.
    const bob = principal();
    const forAlice = await provider.fingerprint(alice, input());
    const forBob = await provider.fingerprint(bob, input());
    expect(forAlice.value).not.toBe(forBob.value);
  });

  it('differs for a different tenant with the same user id', async () => {
    const sameUserOtherTenant = principal(undefined, alice.userId);
    const forAlice = await provider.fingerprint(alice, input());
    const forOther = await provider.fingerprint(sameUserOtherTenant, input());
    expect(forAlice.value).not.toBe(forOther.value);
  });

  it('is not recomputable without the key', async () => {
    // Two providers with different root keys produce different values for the
    // same input. A plain hash of the fields would produce the same value for
    // both — which is exactly the confirmation oracle the keying removes.
    const other = new LocalKeyedDedupFingerprintProvider({ rootKey: randomBytes(32) });
    const keyed = await provider.fingerprint(alice, input());
    const otherKeyed = await other.fingerprint(alice, input());
    expect(keyed.value).not.toBe(otherKeyed.value);
  });

  it('changes when any participating field changes', async () => {
    const base = await provider.fingerprint(alice, input());
    const variants: ReadonlyArray<[string, Partial<FingerprintInput>]> = [
      ['account', { accountRef: account() }],
      ['amount', { amountMinorUnits: -4501n }],
      ['currency', { currencyCode: 'KWD' }],
      ['narrative', { normalizedNarrative: syntheticMerchant('other shop') }],
      ['occurrence', { occurrenceOrdinal: 2 }],
      ['booking day', { bookingDate: new Date('2026-08-18T00:00:00.000Z') }],
    ];
    for (const [label, override] of variants) {
      const variant = await provider.fingerprint(alice, input(override));
      expect(variant.value, `${label} did not change the fingerprint`).not.toBe(base.value);
    }
  });

  it('ignores the time of day, because a statement states a date', async () => {
    const morning = await provider.fingerprint(
      alice,
      input({ bookingDate: new Date('2026-08-17T01:00:00.000Z') }),
    );
    const evening = await provider.fingerprint(
      alice,
      input({ bookingDate: new Date('2026-08-17T23:59:59.000Z') }),
    );
    expect(morning.value).toBe(evening.value);
  });

  it('is unambiguous under a field-boundary shift', async () => {
    // Plain concatenation collides: "ab"+"c" and "a"+"bc". A collision here
    // would silently refuse one of two genuinely different transactions.
    const left = await provider.fingerprint(
      alice,
      input({ currencyCode: 'QAR', normalizedNarrative: 'ab' }),
    );
    const right = await provider.fingerprint(
      alice,
      input({ currencyCode: 'QA', normalizedNarrative: 'Rab' }),
    );
    expect(left.value).not.toBe(right.value);
  });

  it('lets a genuine repeat through by occurrence ordinal', async () => {
    // "Exact duplicates are impossible" must not also mean "two identical
    // coffees on one day are impossible".
    const first = await provider.fingerprint(alice, input({ occurrenceOrdinal: 1 }));
    const second = await provider.fingerprint(alice, input({ occurrenceOrdinal: 2 }));
    expect(first.value).not.toBe(second.value);
  });

  it('refuses a short root key', () => {
    expect(() => new LocalKeyedDedupFingerprintProvider({ rootKey: randomBytes(8) })).toThrow();
  });

  it('compares values of different versions as unequal', () => {
    expect(
      fingerprintsEqual({ version: 'v1', value: 'abc' }, { version: 'v2', value: 'abc' }),
    ).toBe(false);
  });
});

describe('HSF field encryption', () => {
  const encryption = new LocalAesGcmFieldEncryptionProvider({
    key: Buffer.alloc(32, 3),
    keyVersion: 'karar-ref:key-version:test-hsf@v1',
  });
  const alice = principal();
  const context = { table: 'transactions', rowId: '55555555-5555-7555-8555-555555555555', field: 'merchant' } as const;

  it('round-trips a value through ciphertext', async () => {
    const plaintext = syntheticMerchant('Corner Shop');
    const encrypted = await encryption.encryptField(alice, HsfField.of(plaintext), context);
    const back = await encryption.decryptField(alice, encrypted, context);
    expect(back.reveal()).toBe(plaintext);
  });

  it('carries algorithm, key version, nonce and auth tag', async () => {
    const encrypted = await encryption.encryptField(
      alice,
      HsfField.of(syntheticMerchant('Corner Shop')),
      context,
    );
    expect(encrypted.algorithm).toBe('AES-256-GCM');
    expect(encrypted.keyVersion).toBe('karar-ref:key-version:test-hsf@v1');
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
  });

  it('produces a fresh nonce and a different ciphertext every time', async () => {
    // Nonce reuse under GCM is catastrophic, not merely weak; identical
    // ciphertexts for identical plaintexts would also be a searchable index.
    const field = HsfField.of(syntheticMerchant('Corner Shop'));
    const first = await encryption.encryptField(alice, field, context);
    const second = await encryption.encryptField(alice, field, context);
    expect(Buffer.from(first.nonce).equals(Buffer.from(second.nonce))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
  });

  it('refuses a ciphertext moved to a different column', async () => {
    const encrypted = await encryption.encryptField(
      alice,
      HsfField.of(syntheticMerchant('Corner Shop')),
      context,
    );
    await expect(
      encryption.decryptField(alice, encrypted, { ...context, field: 'description' }),
    ).rejects.toBeInstanceOf(HsfFieldEncryptionError);
  });

  it('refuses a ciphertext moved to a different row', async () => {
    const encrypted = await encryption.encryptField(
      alice,
      HsfField.of(syntheticMerchant('Corner Shop')),
      context,
    );
    await expect(
      encryption.decryptField(alice, encrypted, {
        ...context,
        rowId: '66666666-6666-7666-8666-666666666666',
      }),
    ).rejects.toBeInstanceOf(HsfFieldEncryptionError);
  });

  it('refuses a ciphertext replayed under a different subject', async () => {
    const encrypted = await encryption.encryptField(
      alice,
      HsfField.of(syntheticMerchant('Corner Shop')),
      context,
    );
    await expect(
      encryption.decryptField(principal(), encrypted, context),
    ).rejects.toBeInstanceOf(HsfFieldEncryptionError);
  });

  it('refuses a tampered ciphertext rather than returning garbage', async () => {
    const encrypted = await encryption.encryptField(
      alice,
      HsfField.of(syntheticMerchant('Corner Shop')),
      context,
    );
    const tampered = new Uint8Array(encrypted.ciphertext);
    tampered[0] = (tampered[0] as number) ^ 0xff;
    await expect(
      encryption.decryptField(alice, { ...encrypted, ciphertext: tampered }, context),
    ).rejects.toBeInstanceOf(HsfFieldEncryptionError);
  });

  it('refuses a ciphertext written under a key version it does not hold', async () => {
    const encrypted = await encryption.encryptField(
      alice,
      HsfField.of(syntheticMerchant('Corner Shop')),
      context,
    );
    await expect(
      encryption.decryptField(
        alice,
        { ...encrypted, keyVersion: 'karar-ref:key-version:test-hsf@v9' },
        context,
      ),
    ).rejects.toBeInstanceOf(HsfFieldEncryptionError);
  });

  it('refuses a 16-byte key rather than silently weakening', () => {
    expect(() => new LocalAesGcmFieldEncryptionProvider({ key: randomBytes(16) })).toThrow(
      HsfFieldEncryptionError,
    );
  });
});

describe('HSF values do not leak through ordinary rendering', () => {
  const plaintext = syntheticMerchant('Corner Shop');
  const field = HsfField.of(plaintext);

  it('redacts on string coercion, JSON, and inspection', () => {
    expect(`${field}`).not.toContain(plaintext);
    expect(String(field)).not.toContain(plaintext);
    expect(JSON.stringify({ merchant: field })).not.toContain(plaintext);
    expect(JSON.stringify(field)).not.toContain(plaintext);
  });

  it('reveals only through the explicit, grep-able call', () => {
    expect(field.reveal()).toBe(plaintext);
  });

  it('refuses a blank value rather than storing two encodings of absence', () => {
    expect(() => HsfField.of('   ')).toThrow();
    expect(HsfField.optional(null)).toBeNull();
  });

  it('refuses over-long input rather than truncating it', () => {
    expect(() => HsfField.of('a'.repeat(513))).toThrow();
  });
});
