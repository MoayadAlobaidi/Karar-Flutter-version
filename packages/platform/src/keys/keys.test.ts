import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertSyntheticCanaryPlaintext,
  CanaryPlaintextError,
  integrityCanaryContract,
} from './canary.js';
import { KEY_CUSTODY_MODELS } from './custody.js';
import { InMemoryTestEncryptionProvider } from './in-memory-test-encryption-provider.js';
import { KeyManagementError } from './ports.js';
import {
  InvalidKeyVersionRefError,
  keyRefOf,
  keyVersionRef,
  parseKeyRef,
  parseKeyVersionRef,
  versionOf,
} from './refs.js';

const kek = parseKeyRef('karar-ref:key:jurisdiction-qa-kek');

describe('key and key-version references', () => {
  it('builds and parses karar-ref:key-version refs aligned with the karar-ref scheme', () => {
    const ref = keyVersionRef(kek, 3);
    expect(ref).toBe('karar-ref:key-version:jurisdiction-qa-kek@v3');
    expect(parseKeyVersionRef(ref)).toBe(ref);
    expect(keyRefOf(ref)).toBe(kek);
    expect(versionOf(ref)).toBe(3);
  });

  it('rejects malformed version refs and non-positive versions', () => {
    expect(() => parseKeyVersionRef('karar-ref:key:oops@v1')).toThrow(InvalidKeyVersionRefError);
    expect(() => parseKeyVersionRef('karar-ref:key-version:x@v0')).toThrow(
      InvalidKeyVersionRefError,
    );
    expect(() => parseKeyVersionRef('gcp://kms/whatever')).toThrow(InvalidKeyVersionRefError);
    expect(() => keyVersionRef(kek, 0)).toThrow(InvalidKeyVersionRefError);
    expect(() => keyVersionRef(kek, 1.5)).toThrow(InvalidKeyVersionRefError);
  });

  it('pins the four custody models of ADR-0017', () => {
    expect(KEY_CUSTODY_MODELS).toEqual([
      'CLOUD_KMS_MANAGED',
      'BYOK_IMPORTED_WITH_EXTERNAL_CUSTODY',
      'EXTERNAL_KEY_MANAGER',
      'HSM_MANAGED',
    ]);
  });
});

describe('InMemoryTestEncryptionProvider — the port contract', () => {
  const text = (value: string): Uint8Array => new TextEncoder().encode(value);

  it('roundtrips: decrypt(encrypt(p)) === p', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const envelope = await provider.encrypt(text('contract-proof plaintext'), kek);
    const back = await provider.decrypt(envelope, kek);
    expect(new TextDecoder().decode(back)).toBe('contract-proof plaintext');
  });

  it('carries key-version provenance on every encrypt and wrap result', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const envelope = await provider.encrypt(text('p'), kek);
    expect(envelope.keyVersion).toBe(await provider.currentVersion(kek));

    const wrapped = await provider.wrap(text('a-32-byte-dek-stand-in'), kek);
    expect(wrapped.kekVersion).toBe(await provider.currentVersion(kek));
    expect(new TextDecoder().decode(await provider.unwrap(wrapped, kek))).toBe(
      'a-32-byte-dek-stand-in',
    );
  });

  it('rotate() changes the current version and new results carry it', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const before = await provider.currentVersion(kek);
    const rotated = await provider.rotate(kek);
    expect(rotated).not.toBe(before);
    expect(versionOf(rotated)).toBe(versionOf(before) + 1);
    expect(await provider.currentVersion(kek)).toBe(rotated);

    const envelope = await provider.encrypt(text('after rotation'), kek);
    expect(envelope.keyVersion).toBe(rotated);
    // Old envelopes stay readable: destruction, not rotation, retires a version.
  });

  it('keeps pre-rotation envelopes decryptable via their recorded version', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const oldEnvelope = await provider.encrypt(text('sealed before rotation'), kek);
    await provider.rotate(kek);
    const back = await provider.decrypt(oldEnvelope, kek);
    expect(new TextDecoder().decode(back)).toBe('sealed before rotation');
  });

  it('fails cleanly on a wrong or unknown key version — typed error, no partial plaintext', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const envelope = await provider.encrypt(text('distinctive-XYZZY-plaintext'), kek);

    // Unknown version: the envelope names a version this provider never made.
    const unknown = await provider
      .decrypt({ ciphertext: envelope.ciphertext, keyVersion: keyVersionRef(kek, 99) }, kek)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(unknown).toBeInstanceOf(KeyManagementError);
    expect((unknown as KeyManagementError).kind).toBe('unknown_key_version');

    // Wrong version material: v2 exists but did not produce this ciphertext.
    const v2 = await provider.rotate(kek);
    const wrong = await provider
      .decrypt({ ciphertext: envelope.ciphertext, keyVersion: v2 }, kek)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(wrong).toBeInstanceOf(KeyManagementError);
    expect((wrong as KeyManagementError).kind).toBe('decryption_failed');
    expect((wrong as KeyManagementError).message).not.toContain('XYZZY'); // no plaintext echo
  });

  it('describes keys without ever exposing material', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const descriptor = await provider.getKey(kek);
    expect(descriptor).toEqual({
      ref: kek,
      version: keyVersionRef(kek, 1),
      algorithm: 'AES-256-GCM',
      state: 'ENABLED',
    });
    await expect(provider.getKey(kek, keyVersionRef(kek, 7))).rejects.toMatchObject({
      name: 'KeyManagementError',
      kind: 'unknown_key_version',
    });
  });

  it('rotation changes ciphertext while a content-derived identifier stays stable', async () => {
    // The rotation-vs-identifier rule (custody.ts): fingerprints and business
    // identifiers derive from content, never from key material or ciphertext.
    const provider = new InMemoryTestEncryptionProvider();
    const content = text('statement line: LULU HYPERMARKET 42.00 QAR');
    const contentHash = (): string => createHash('sha256').update(content).digest('hex');

    const first = await provider.encrypt(content, kek);
    const hashBefore = contentHash();
    await provider.rotate(kek);
    const second = await provider.encrypt(content, kek);

    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(first.keyVersion).not.toBe(second.keyVersion);
    expect(contentHash()).toBe(hashBefore); // the identifier no rotation can move
  });
});

describe('integrity canary contract', () => {
  it('accepts only synthetic KARAR-CANARY- plaintext', () => {
    expect(() => assertSyntheticCanaryPlaintext('KARAR-CANARY-qa-kek-001')).not.toThrow();
    for (const bad of [
      'canary',
      'customer statement text',
      ' KARAR-CANARY-leading-space',
      'karar-canary-lowercase',
    ]) {
      expect(() => assertSyntheticCanaryPlaintext(bad)).toThrow(CanaryPlaintextError);
    }
  });

  it('refuses to construct a contract around non-marker plaintext', () => {
    const verify = async () => ({
      ok: true,
      keyVersion: keyVersionRef(kek, 1),
      durationMs: 1,
    });
    expect(() => integrityCanaryContract(kek, 'not synthetic', 'R/PT6H', verify)).toThrow(
      CanaryPlaintextError,
    );

    const contract = integrityCanaryContract(kek, 'KARAR-CANARY-qa-001', 'R/PT6H', verify);
    expect(contract.canaryRef).toBe(kek);
    expect(contract.schedule).toBe('R/PT6H');
    expect(Object.isFrozen(contract)).toBe(true);
  });

  it('verify exercises the real decrypt path and reports without plaintext', async () => {
    const provider = new InMemoryTestEncryptionProvider();
    const plaintext = 'KARAR-CANARY-qa-kek-2026';
    const envelope = await provider.encrypt(new TextEncoder().encode(plaintext), kek);

    const contract = integrityCanaryContract(kek, plaintext, 'R/PT6H', async () => {
      const started = performance.now();
      try {
        const decrypted = await provider.decrypt(envelope, kek);
        const ok = new TextDecoder().decode(decrypted) === plaintext;
        return {
          ok,
          keyVersion: envelope.keyVersion,
          durationMs: performance.now() - started,
          ...(ok ? {} : { failure: 'plaintext_mismatch' }),
        };
      } catch (error) {
        return {
          ok: false,
          keyVersion: envelope.keyVersion,
          durationMs: performance.now() - started,
          failure: error instanceof KeyManagementError ? error.kind : 'unknown',
        };
      }
    });

    const outcome = await contract.verify();
    expect(outcome.ok).toBe(true);
    expect(outcome.keyVersion).toBe(envelope.keyVersion);
    expect(JSON.stringify(outcome)).not.toContain(plaintext); // never logs plaintext

    // Simulated key loss: a fresh provider holds no version for the envelope —
    // exactly what the canary exists to detect (key unavailability).
    const lost = new InMemoryTestEncryptionProvider();
    const failed = await lost.decrypt(envelope, kek).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failed).toBeInstanceOf(KeyManagementError);
  });
});
