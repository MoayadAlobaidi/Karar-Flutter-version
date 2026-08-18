/**
 * LOCAL AND TEST field encryption for the module's HSF columns.
 *
 * **This is the LOCAL/TEST adapter. It is not a production key custody
 * story.** It holds its key material in process memory, which is exactly what
 * a deployment must not do: production binds `HsfFieldEncryptionPort` to an
 * adapter over the platform's `KeyManagementProvider` (ADR-0017), with the
 * custody, rotation and recovery policies a readiness review checks and with
 * the sealed-integrity canary that detects key unavailability before a user
 * does. Nothing here provides any of that, and it says so rather than
 * implying otherwise.
 *
 * What it DOES provide, deliberately, is the real cryptographic contract, so
 * the tests exercise the shape production must satisfy:
 *
 * - standard `node:crypto` AES-256-GCM only — a test double that invents
 *   cryptography teaches the wrong contract (the platform's
 *   `InMemoryTestEncryptionProvider` makes the same choice for the same
 *   reason);
 * - a fresh random 12-byte nonce per encryption, never a counter and never
 *   reused: nonce reuse under GCM is catastrophic, not merely weak;
 * - the 16-byte auth tag stored separately, so the column shape carries
 *   integrity metadata rather than an opaque blob;
 * - `(table, rowId, field)` bound as ASSOCIATED DATA, so a ciphertext moved
 *   between rows or columns fails authentication instead of decrypting into a
 *   plausible wrong record;
 * - one opaque failure kind on any authentication failure — distinguishing
 *   "wrong key" from "tampered" for a caller would leak an oracle.
 *
 * There is no way to read the key back out, and no serialization of it.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

import { HsfField } from '../../domain/hsf-field.js';
import {
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
} from '../../application/ports/hsf-field-encryption.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';

const ALGORITHM = 'AES-256-GCM';
const NODE_CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Associated data. The principal is included alongside the row coordinates so
 * a ciphertext cannot be replayed under a different subject either — the
 * column values alone are not enough to authenticate a value that arrived
 * from somewhere else.
 */
function associatedData(
  principal: TransactionsPrincipal,
  context: FieldEncryptionContext,
): Buffer {
  return Buffer.from(
    [
      'karar/transactions/hsf/v1',
      principal.tenantId,
      principal.userId,
      context.table,
      context.rowId,
      context.field,
    ].join('|'),
    'utf8',
  );
}

export class LocalAesGcmFieldEncryptionProvider implements HsfFieldEncryptionPort {
  readonly algorithm = ALGORITHM;

  readonly #key: Buffer;
  readonly #keyVersion: string;

  /**
   * `keyVersion` is an opaque provenance label, stored on every row this
   * instance writes. A local run passes a stable label; a test passes
   * whatever it needs to assert rotation behaviour.
   */
  constructor(options?: { readonly key?: Uint8Array; readonly keyVersion?: string }) {
    const key = options?.key ?? randomBytes(KEY_BYTES);
    if (key.length !== KEY_BYTES) {
      throw new HsfFieldEncryptionError(
        'key_unavailable',
        `AES-256-GCM requires a ${KEY_BYTES}-byte key, got ${key.length}`,
      );
    }
    this.#key = Buffer.from(key);
    this.#keyVersion = options?.keyVersion ?? 'karar-ref:key-version:local-transactions-hsf@v1';
  }

  encryptField(
    principal: TransactionsPrincipal,
    field: HsfField,
    context: FieldEncryptionContext,
  ): Promise<EncryptedField> {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(NODE_CIPHER, this.#key, nonce);
    cipher.setAAD(associatedData(principal, context));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(field.reveal(), 'utf8')),
      cipher.final(),
    ]);
    return Promise.resolve({
      ciphertext: new Uint8Array(ciphertext),
      nonce: new Uint8Array(nonce),
      algorithm: ALGORITHM,
      keyVersion: this.#keyVersion,
      authTag: new Uint8Array(cipher.getAuthTag()),
    });
  }

  decryptField(
    principal: TransactionsPrincipal,
    encrypted: EncryptedField,
    context: FieldEncryptionContext,
  ): Promise<HsfField> {
    if (encrypted.algorithm !== ALGORITHM) {
      return Promise.reject(
        new HsfFieldEncryptionError(
          'decryption_failed',
          `stored algorithm '${encrypted.algorithm}' is not the one this adapter implements`,
        ),
      );
    }
    // Constant-time comparison on the key version: a length-varying string
    // compare here would be a trivial side channel over key provenance.
    const stored = Buffer.from(encrypted.keyVersion, 'utf8');
    const expected = Buffer.from(this.#keyVersion, 'utf8');
    if (stored.length !== expected.length || !timingSafeEqual(stored, expected)) {
      return Promise.reject(
        new HsfFieldEncryptionError(
          'key_unavailable',
          'the ciphertext was produced under a key version this adapter does not hold; ' +
            'a production adapter resolves the version through the key-management provider instead',
        ),
      );
    }
    if (encrypted.nonce.length !== NONCE_BYTES || encrypted.authTag.length !== TAG_BYTES) {
      return Promise.reject(
        new HsfFieldEncryptionError('decryption_failed', 'malformed nonce or authentication tag'),
      );
    }
    try {
      const decipher = createDecipheriv(NODE_CIPHER, this.#key, Buffer.from(encrypted.nonce));
      decipher.setAAD(associatedData(principal, context));
      decipher.setAuthTag(Buffer.from(encrypted.authTag));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext)),
        decipher.final(),
      ]);
      return Promise.resolve(HsfField.of(plaintext.toString('utf8')));
    } catch {
      // Wrong key, wrong context, or tampering — one opaque kind, no
      // plaintext fragment, no oracle.
      return Promise.reject(
        new HsfFieldEncryptionError('decryption_failed', 'authenticated decryption failed'),
      );
    }
  }
}
