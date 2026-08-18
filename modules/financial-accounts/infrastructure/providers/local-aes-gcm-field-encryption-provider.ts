/**
 * LOCAL AND TEST field encryption for this module's HSF columns.
 *
 * **This is the LOCAL/TEST adapter. It is not a production key custody
 * story, and it refuses to exist anywhere it could be mistaken for one.** It
 * holds key material in process memory, which is exactly what a deployment
 * must not do: dev, staging and production bind `HsfFieldEncryptionPort` to
 * an adapter over the platform's `KeyManagementProvider` (ADR-0017), with the
 * custody, rotation and recovery policies a readiness review checks and with
 * the sealed-integrity canary that detects key unavailability before a user
 * does. Nothing here provides any of that, so the constructor throws outside
 * `KARAR_ENV=local` — the same posture as the platform's
 * `LocalDevEncryptionProvider` and notifications' `LocalMailSink`. Refusing
 * to construct is the guarantee; a comment saying "do not use in production"
 * is not.
 *
 * What it DOES provide, deliberately, is the real cryptographic contract, so
 * the tests exercise the shape production must satisfy:
 *
 * - standard `node:crypto` AES-256-GCM only — a test double that invents
 *   cryptography teaches the wrong contract (the platform's
 *   `InMemoryTestEncryptionProvider` and the transactions module's local
 *   adapter make the same choice for the same reason);
 * - a fresh random 12-byte nonce per encryption, never a counter and never
 *   reused: nonce reuse under GCM is catastrophic, not merely weak;
 * - the 16-byte auth tag stored separately, so the column shape carries
 *   integrity metadata rather than an opaque blob;
 * - tenant, user, table, row id and field bound as ASSOCIATED DATA, so a
 *   ciphertext moved between subjects, rows or columns fails authentication
 *   instead of decrypting into a plausible wrong record;
 * - one opaque failure kind on any authentication failure — distinguishing
 *   "wrong key" from "tampered" for a caller would leak an oracle.
 *
 * There is no way to read the key back out, and no serialization of it.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
} from '../../application/ports/hsf-field-encryption.js';
import type { AccountsPrincipal } from '../../application/principal.js';
import { HsfField } from '../../domain/hsf-field.js';

const ALGORITHM = 'AES-256-GCM';
const NODE_CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The domain-separation label. Distinct from the transactions module's
 * `karar/transactions/hsf/v1` on purpose: even if the two modules were ever
 * wired to the same key, a ciphertext could not be replayed from one module's
 * table into the other's.
 */
const ASSOCIATED_DATA_LABEL = 'karar/financial-accounts/hsf/v1';

export class LocalHsfEncryptionEnvironmentError extends Error {
  override readonly name = 'LocalHsfEncryptionEnvironmentError';

  constructor(env: string) {
    super(
      `LocalAesGcmFieldEncryptionProvider is local-development-only and refuses to exist in ` +
        `KARAR_ENV='${env}' — it keeps key material in process memory, which is not custody. Wire ` +
        `the deployment profile's key-management provider (ADR-0017) for this environment`,
    );
  }
}

/**
 * Associated data. The principal is included alongside the row coordinates so
 * a ciphertext cannot be replayed under a different subject either — and that
 * arm is load-bearing here, because two members of one household tenant are
 * two different subjects whose accounts sit in the same table.
 */
function associatedData(
  principal: AccountsPrincipal,
  context: FieldEncryptionContext,
): Buffer {
  return Buffer.from(
    [
      ASSOCIATED_DATA_LABEL,
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
   * `env` is required and is checked before anything else: an adapter whose
   * environment guard can be skipped by omitting an argument has no guard.
   * `keyVersion` is an opaque provenance label stored on every row this
   * instance writes — a local run passes a stable label; a test passes
   * whatever it needs to assert rotation behaviour.
   */
  constructor(options: {
    readonly env: string;
    readonly key?: Uint8Array;
    readonly keyVersion?: string;
  }) {
    if (options.env !== 'local') {
      throw new LocalHsfEncryptionEnvironmentError(options.env);
    }
    const key = options.key ?? randomBytes(KEY_BYTES);
    if (key.length !== KEY_BYTES) {
      throw new HsfFieldEncryptionError(
        'key_unavailable',
        `AES-256-GCM requires a ${KEY_BYTES}-byte key, got ${key.length}`,
      );
    }
    this.#key = Buffer.from(key);
    this.#keyVersion = options.keyVersion ?? 'karar-ref:key-version:local-accounts-hsf@v1';
  }

  encryptField(
    principal: AccountsPrincipal,
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
    principal: AccountsPrincipal,
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
      // Wrong key, wrong subject, wrong context, or tampering — one opaque
      // kind, no plaintext fragment, no oracle.
      return Promise.reject(
        new HsfFieldEncryptionError('decryption_failed', 'authenticated decryption failed'),
      );
    }
  }
}

/**
 * The single seam a composition root uses to obtain the port.
 *
 * `local` gets the in-process adapter above. **Every other environment must
 * supply an approved provider, and gets a throw when it does not** — there is
 * no fallback, no "temporarily use the local one", and no silently disabled
 * encryption. The failure is at construction, before a single subject's
 * account name has been handled, because the alternative failure mode is a
 * deployment that quietly writes plaintext-equivalent rows and discovers it
 * during an incident.
 */
export function resolveHsfFieldEncryptionPort(options: {
  readonly env: string;
  /** The deployment's key-management-backed adapter, when one is wired. */
  readonly approvedProvider?: HsfFieldEncryptionPort | null;
  readonly localKeyVersion?: string;
}): HsfFieldEncryptionPort {
  const approved = options.approvedProvider ?? null;
  if (approved !== null) return approved;
  if (options.env !== 'local') {
    throw new HsfFieldEncryptionError(
      'key_unavailable',
      `no approved HSF field-encryption provider is wired for KARAR_ENV='${options.env}', and ` +
        `there is no fallback: financial_accounts is HIGHLY_SENSITIVE_FINANCIAL and its display ` +
        `name, institution label and mask exist only as ciphertext. Wire the environment's ` +
        `key-management-backed adapter (ADR-0017) — the local adapter keeps keys in process ` +
        `memory and refuses to construct here for the same reason`,
    );
  }
  return new LocalAesGcmFieldEncryptionProvider({
    env: options.env,
    ...(options.localKeyVersion !== undefined ? { keyVersion: options.localKeyVersion } : {}),
  });
}
