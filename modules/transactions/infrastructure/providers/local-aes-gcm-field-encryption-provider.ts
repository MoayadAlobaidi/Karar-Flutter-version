/**
 * LOCAL AND TEST field encryption for the module's HSF columns, and the
 * fail-closed seam every environment passes through to reach it.
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
 * ## Why the environment guard is in THIS file
 *
 * It used to be nowhere. This adapter constructed anywhere, minting a random
 * key for itself when the caller supplied none, and the only thing keeping it
 * out of a deployed process was that the composition root happened to build
 * four other, guarded providers on earlier lines. That is security by line
 * ordering: reordering the file, extracting a helper, constructing lazily, or
 * composing this module from a second entry point would all have enabled
 * in-process key material in a deployed environment with nothing failing.
 *
 * Two changes remove the ordering dependency, and neither can be undone by
 * moving a line:
 *
 * 1. **This adapter no longer mints key material.** `key` is a required
 *    argument with no default. `new LocalAesGcmFieldEncryptionProvider()` —
 *    the exact expression the composition root used to contain — no longer
 *    compiles, so no accident of ordering or refactoring can produce a
 *    working local provider.
 * 2. **`resolveHsfFieldEncryptionPort` below is the only path that mints
 *    one**, and it throws outside `KARAR_ENV=local` unless a deployment has
 *    wired an approved provider. The refusal is a property of the call, not
 *    of where the call sits.
 *
 * The random key that a local run gets is minted INSIDE that local branch and
 * nowhere else. It is never a fallback for a missing approved provider: a
 * generated key nobody can reproduce would leave every stored ciphertext
 * unreadable at the next restart, which is a worse outcome than refusing to
 * boot and is indistinguishable from success until a subject asks for their
 * data back.
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
import { LOCAL_ENVIRONMENT } from './local-environment.js';

const ALGORITHM = 'AES-256-GCM';
const NODE_CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** The provenance label a local run stamps on every row it writes. */
export const LOCAL_HSF_KEY_VERSION = 'karar-ref:key-version:local-transactions-hsf@v1';

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
   * `key` is REQUIRED and has no default. An adapter that quietly generates
   * its own key when handed none is an adapter that works everywhere,
   * including the places it must not exist — and the ciphertext it writes is
   * unreadable the moment the process restarts. The caller either owns key
   * material it can reproduce, or it goes through
   * `resolveHsfFieldEncryptionPort`, which mints one only for `local`.
   *
   * `keyVersion` is an opaque provenance label, stored on every row this
   * instance writes. A local run takes the default; a test passes whatever it
   * needs to assert rotation behaviour.
   */
  constructor(options: { readonly key: Uint8Array; readonly keyVersion?: string }) {
    const key = options.key;
    if (key.length !== KEY_BYTES) {
      throw new HsfFieldEncryptionError(
        'key_unavailable',
        `AES-256-GCM requires a ${KEY_BYTES}-byte key, got ${key.length}`,
      );
    }
    this.#key = Buffer.from(key);
    this.#keyVersion = options.keyVersion ?? LOCAL_HSF_KEY_VERSION;
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

/**
 * The single seam a composition root uses to obtain the port.
 *
 * `local` gets the in-process adapter above, with a key minted here and
 * nowhere else. **Every other environment must supply an approved provider,
 * and gets a throw when it does not** — there is no fallback, no "temporarily
 * use the local one", and no silently disabled encryption. The failure is at
 * resolution, before a single subject's merchant name has been handled,
 * because the alternative failure mode is a deployment that writes rows
 * nobody can ever read back.
 *
 * The guard is HERE rather than at the call site on purpose. A composition
 * root that reorders its lines, extracts a helper, defers a construction, or
 * grows a second entry point cannot move this refusal, because the refusal
 * belongs to the resolver rather than to the position it is called from.
 *
 * `localKey` exists for a local run that wants its ciphertext to survive a
 * restart. Omitted, the key is random per process — the same stated cost the
 * platform's `LocalDevEncryptionProvider` carries, and acceptable only
 * because a local database is disposable.
 */
export function resolveHsfFieldEncryptionPort(options: {
  readonly env: string;
  /** The deployment's key-management-backed adapter, when one is wired. */
  readonly approvedProvider?: HsfFieldEncryptionPort | null;
  readonly localKey?: Uint8Array;
  readonly localKeyVersion?: string;
}): HsfFieldEncryptionPort {
  const approved = options.approvedProvider ?? null;
  if (approved !== null) return approved;
  if (options.env !== LOCAL_ENVIRONMENT) {
    throw new HsfFieldEncryptionError(
      'key_unavailable',
      `no approved HSF field-encryption provider is wired for KARAR_ENV='${options.env}', and ` +
        `there is no fallback: merchant, description and note are HIGHLY_SENSITIVE_FINANCIAL and ` +
        `exist only as ciphertext. Wire the environment's key-management-backed adapter ` +
        `(ADR-0017) — the local adapter keeps keys in process memory, and a key generated here ` +
        `to keep the boot going would make every row it wrote unreadable at the next restart`,
    );
  }
  return new LocalAesGcmFieldEncryptionProvider({
    key: options.localKey ?? randomBytes(KEY_BYTES),
    ...(options.localKeyVersion !== undefined ? { keyVersion: options.localKeyVersion } : {}),
  });
}
