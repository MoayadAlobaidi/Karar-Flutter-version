/**
 * TEST-ONLY encryption provider. NOT for any real data, any environment, or
 * any persistence path — it exists solely to prove the port contracts
 * (roundtrip, version provenance, rotation, clean failure) in unit tests
 * without a key-management service.
 *
 * Deliberate properties:
 * - standard `node:crypto` AES-256-GCM only — no custom or reduced algorithm;
 *   a test double that invents cryptography teaches the wrong contract;
 * - a fresh random 256-bit key per instance and per version: nothing is
 *   derivable, nothing survives the process, ciphertexts are useless the
 *   moment the test ends;
 * - key material lives only in this object's private map; there is no export,
 *   no serialization, and no way to construct the provider with a fixed key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import {
  KeyManagementError,
  type CiphertextEnvelope,
  type EncryptionProvider,
  type KeyDescriptor,
  type KeyManagementProvider,
  type WrappedDek,
} from './ports.js';
import { keyVersionRef, versionOf, type KeyRef, type KeyVersionRef } from './refs.js';

const IV_BYTES = 12; // AES-256-GCM, fresh IV per encryption (data-model.md §9)
const TAG_BYTES = 16; // 128-bit auth tag

interface KeyState {
  /** version ordinal -> 32-byte key material (test-only, in-memory). */
  readonly versions: Map<number, Buffer>;
  currentVersion: number;
}

export class InMemoryTestEncryptionProvider implements EncryptionProvider, KeyManagementProvider {
  private readonly keys = new Map<KeyRef, KeyState>();

  getKey(ref: KeyRef, version?: KeyVersionRef): Promise<KeyDescriptor> {
    const state = this.stateFor(ref);
    let ordinal = state.currentVersion;
    if (version !== undefined) {
      ordinal = versionOf(version);
      if (!state.versions.has(ordinal)) {
        return Promise.reject(
          new KeyManagementError('unknown_key_version', `no such version: ${version}`),
        );
      }
    }
    return Promise.resolve({
      ref,
      version: keyVersionRef(ref, ordinal),
      algorithm: 'AES-256-GCM',
      state: 'ENABLED',
    });
  }

  currentVersion(ref: KeyRef): Promise<KeyVersionRef> {
    const state = this.stateFor(ref);
    return Promise.resolve(keyVersionRef(ref, state.currentVersion));
  }

  rotate(ref: KeyRef): Promise<KeyVersionRef> {
    const state = this.stateFor(ref);
    state.currentVersion += 1;
    state.versions.set(state.currentVersion, randomBytes(32));
    return Promise.resolve(keyVersionRef(ref, state.currentVersion));
  }

  encrypt(plaintext: Uint8Array, keyRef: KeyRef): Promise<CiphertextEnvelope> {
    const state = this.stateFor(keyRef);
    const version = state.currentVersion;
    const key = state.versions.get(version) as Buffer;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Promise.resolve({
      ciphertext: new Uint8Array(Buffer.concat([iv, tag, data])),
      keyVersion: keyVersionRef(keyRef, version),
    });
  }

  decrypt(envelope: CiphertextEnvelope, keyRef: KeyRef): Promise<Uint8Array> {
    const state = this.stateFor(keyRef);
    const ordinal = versionOf(envelope.keyVersion);
    const key = state.versions.get(ordinal);
    if (key === undefined) {
      return Promise.reject(
        new KeyManagementError(
          'unknown_key_version',
          `envelope references ${envelope.keyVersion}, which this provider does not hold`,
        ),
      );
    }
    const raw = Buffer.from(envelope.ciphertext);
    if (raw.length < IV_BYTES + TAG_BYTES) {
      return Promise.reject(
        new KeyManagementError('decryption_failed', 'ciphertext shorter than IV plus auth tag'),
      );
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const data = raw.subarray(IV_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Promise.resolve(
        new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()])),
      );
    } catch {
      // Wrong version material, wrong key, or tampering — one opaque kind,
      // no plaintext fragment, no oracle (ports.ts).
      return Promise.reject(
        new KeyManagementError('decryption_failed', 'authenticated decryption failed'),
      );
    }
  }

  wrap(dek: Uint8Array, kekRef: KeyRef): Promise<WrappedDek> {
    return this.encrypt(dek, kekRef).then((envelope) => ({
      ciphertext: envelope.ciphertext,
      kekVersion: envelope.keyVersion,
    }));
  }

  unwrap(wrapped: WrappedDek, kekRef: KeyRef): Promise<Uint8Array> {
    return this.decrypt({ ciphertext: wrapped.ciphertext, keyVersion: wrapped.kekVersion }, kekRef);
  }

  private stateFor(ref: KeyRef): KeyState {
    let state = this.keys.get(ref);
    if (state === undefined) {
      state = { versions: new Map([[1, randomBytes(32)]]), currentVersion: 1 };
      this.keys.set(ref, state);
    }
    return state;
  }
}
