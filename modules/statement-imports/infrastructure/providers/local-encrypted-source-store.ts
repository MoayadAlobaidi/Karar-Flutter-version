/**
 * LOCAL AND TEST storage for a subject's encrypted statement.
 *
 * **This is the LOCAL/TEST adapter. It is not a production custody story, and
 * it refuses to exist anywhere it could be mistaken for one.** It holds key
 * material AND ciphertext in process memory, which is exactly what a
 * deployment must not do: dev, staging and production bind
 * `EncryptedSourceStorePort` to an adapter over the platform's key-management
 * provider (ADR-0017) and whatever object store the profile provides. Nothing
 * here provides either, so the constructor throws outside `KARAR_ENV=local`.
 * Refusing to construct is the guarantee; a comment saying "do not use in
 * production" is not.
 *
 * What it DOES provide, deliberately, is the real cryptographic contract, so
 * the tests exercise the shape production must satisfy:
 *
 * - standard `node:crypto` AES-256-GCM only — a test double that invents
 *   cryptography teaches the wrong contract;
 * - a fresh random 12-byte nonce per object, never a counter and never
 *   derived from the import id: nonce reuse under GCM is catastrophic rather
 *   than merely weak, and a derived nonce is a counter with extra steps;
 * - the 16-byte auth tag kept separately, so the row carries integrity
 *   metadata rather than an opaque blob;
 * - tenant, user, import id and media type bound as ASSOCIATED DATA, so an
 *   object moved between subjects or replayed under another import fails
 *   authentication instead of decrypting into a plausible wrong statement;
 * - a SHA-256 checksum over the CIPHERTEXT, so integrity can be verified
 *   without a key and without producing the plaintext;
 * - one opaque failure kind on any authentication failure — distinguishing
 *   "wrong key" from "tampered" for a caller would leak an oracle, and
 *   describing what failed to decrypt would leak the thing itself.
 *
 * **The handle is opaque and is not derived from the content.** A handle
 * derived from a digest of the file would be a confirmation oracle in a
 * column that is not even encrypted — anyone who could read `object_ref`
 * could test whether a given statement had been uploaded. It is random.
 *
 * **This module adds no object-storage client.** `modules/documents` owns
 * object storage for this platform (architecture test 18), and a second
 * module importing an S3 client would be a second answer to a question that
 * already has one.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  EncryptedSourceStoreError,
  type EncryptedSourceStorePort,
  type SourceStoreContext,
  type StoredSource,
} from '../../application/ports/encrypted-source-store.js';
import type { ImportsPrincipal } from '../../application/principal.js';
import { SourceObjectRef } from '../../domain/encrypted-source.js';

const ALGORITHM = 'AES-256-GCM';
const NODE_CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HANDLE_BYTES = 16;

/** Domain separation, distinct from every field-encryption label. */
const ASSOCIATED_DATA_LABEL = 'karar/statement-imports/source/v1';

export class LocalSourceStoreEnvironmentError extends Error {
  override readonly name = 'LocalSourceStoreEnvironmentError';

  constructor(env: string) {
    super(
      `LocalEncryptedSourceStore is local-development-only and refuses to exist in ` +
        `KARAR_ENV='${env}' — it keeps key material and a subject's entire bank statement in ` +
        `process memory, which is neither custody nor storage. Wire the deployment profile's ` +
        `key-management provider and object store (ADR-0017) for this environment`,
    );
  }
}

/**
 * The subject half of the associated data: everything before the import id.
 *
 * `open`, `verify` and `erase` receive a `StoredSource` descriptor that does
 * NOT carry the import id or media type, so they cannot rebuild the whole AAD
 * to authenticate against. They used the AAD stored beside the ciphertext
 * instead — which authenticates the object against itself and therefore
 * authenticates nothing about the CALLER. The header claims "an object moved
 * between subjects or replayed under another import fails authentication
 * instead of decrypting into a plausible wrong statement"; the import half of
 * that held, and the subject half did not.
 *
 * Comparing this prefix restores the subject half without changing the port.
 */
function subjectAssociatedDataPrefix(principal: ImportsPrincipal): Buffer {
  return Buffer.from(`${ASSOCIATED_DATA_LABEL}|${principal.tenantId}|${principal.userId}|`, 'utf8');
}

/**
 * Refuses a descriptor whose stored object was bound to a different subject.
 *
 * Constant-time over the prefix, and it throws the SAME opaque kind a failed
 * decryption throws, so "wrong subject" and "wrong key" are indistinguishable
 * to a caller.
 */
function assertSubjectMatches(principal: ImportsPrincipal, aad: Buffer): void {
  const expected = subjectAssociatedDataPrefix(principal);
  const actual = aad.subarray(0, expected.length);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new EncryptedSourceStoreError('read_failed', 'authenticated decryption failed');
  }
}

function associatedData(principal: ImportsPrincipal, context: SourceStoreContext): Buffer {
  return Buffer.from(
    [
      ASSOCIATED_DATA_LABEL,
      principal.tenantId,
      principal.userId,
      context.importId,
      context.mediaType,
    ].join('|'),
    'utf8',
  );
}

/** The associated data a stored object must be opened under. */
interface StoredEntry {
  readonly ciphertext: Buffer;
  readonly aad: Buffer;
}

export class LocalEncryptedSourceStore implements EncryptedSourceStorePort {
  readonly algorithm = ALGORITHM;

  readonly #key: Buffer;
  readonly #keyVersion: string;
  /** Ciphertext only. There is no path here that holds plaintext after `store`. */
  readonly #objects = new Map<string, StoredEntry>();

  constructor(options: {
    readonly env: string;
    readonly key?: Uint8Array;
    readonly keyVersion?: string;
  }) {
    if (options.env !== 'local') throw new LocalSourceStoreEnvironmentError(options.env);
    const key = options.key ?? randomBytes(KEY_BYTES);
    if (key.length !== KEY_BYTES) {
      throw new EncryptedSourceStoreError(
        'key_unavailable',
        `AES-256-GCM requires a ${KEY_BYTES}-byte key, got ${key.length}`,
      );
    }
    this.#key = Buffer.from(key);
    this.#keyVersion = options.keyVersion ?? 'karar-ref:key-version:local-statement-source@v1';
  }

  async store(
    actor: ImportsPrincipal,
    context: SourceStoreContext,
    plaintext: AsyncIterable<Uint8Array>,
  ): Promise<StoredSource> {
    const nonce = randomBytes(NONCE_BYTES);
    const aad = associatedData(actor, context);
    const cipher = createCipheriv(NODE_CIPHER, this.#key, nonce);
    cipher.setAAD(aad);
    const parts: Buffer[] = [];
    let byteLength = 0;
    for await (const chunk of plaintext) {
      byteLength += chunk.byteLength;
      parts.push(cipher.update(Buffer.from(chunk)));
    }
    parts.push(cipher.final());
    const ciphertext = Buffer.concat(parts);
    const authTag = cipher.getAuthTag();

    // Random, never derived from the content — see the header.
    const objectRef = SourceObjectRef.of(`local-src-${randomBytes(HANDLE_BYTES).toString('hex')}`);
    this.#objects.set(objectRef, { ciphertext, aad });

    return {
      storeKind: 'LOCAL_ENCRYPTED_BUFFER',
      objectRef,
      byteLength,
      algorithm: ALGORITHM,
      keyVersion: this.#keyVersion,
      nonce: new Uint8Array(nonce),
      authTag: new Uint8Array(authTag),
      integrityChecksumAlgorithm: 'SHA-256',
      integrityChecksum: new Uint8Array(createHash('sha256').update(ciphertext).digest()),
    };
  }

  /**
   * Integrity WITHOUT decryption, which is what makes it usable as a
   * revalidation before the commit decides to proceed at all.
   *
   * `false` rather than a throw for a mismatch: "the bytes changed" is an
   * expected outcome the commit path handles, and an exception would make it
   * indistinguishable from the store being down.
   */
  verify(actor: ImportsPrincipal, stored: StoredSource): Promise<boolean> {
    const entry = this.#objects.get(stored.objectRef);
    if (entry === undefined) return Promise.resolve(false);
    // Another subject's object answers exactly as an absent one does: false,
    // not an exception, so verify stays free of an existence oracle.
    try {
      assertSubjectMatches(actor, entry.aad);
    } catch {
      return Promise.resolve(false);
    }
    const digest = createHash('sha256').update(entry.ciphertext).digest();
    if (digest.length !== stored.integrityChecksum.length) return Promise.resolve(false);
    let difference = 0;
    for (let index = 0; index < digest.length; index += 1) {
      difference |= (digest[index] ?? 0) ^ (stored.integrityChecksum[index] ?? 0);
    }
    return Promise.resolve(difference === 0);
  }

  /**
   * Decrypts and streams.
   *
   * The plaintext is produced in one authenticated piece because GCM
   * authenticates the whole message: yielding decrypted bytes before the tag
   * has been checked would hand a parser data that has not been verified,
   * which is the failure mode the tag exists to prevent. It is then handed
   * over in bounded chunks so the consumer's own streaming stays honest.
   */
  async *open(actor: ImportsPrincipal, stored: StoredSource): AsyncIterable<Uint8Array> {
    const entry = this.#objects.get(stored.objectRef);
    if (entry === undefined) {
      throw new EncryptedSourceStoreError('not_found', 'no stored object with that handle');
    }
    // The subject the bytes were sealed for, checked BEFORE the key is used.
    assertSubjectMatches(actor, entry.aad);
    if (stored.algorithm !== ALGORITHM) {
      throw new EncryptedSourceStoreError(
        'read_failed',
        `stored algorithm '${stored.algorithm}' is not the one this adapter implements`,
      );
    }
    if (stored.nonce.length !== NONCE_BYTES || stored.authTag.length !== TAG_BYTES) {
      throw new EncryptedSourceStoreError('read_failed', 'malformed nonce or authentication tag');
    }
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv(NODE_CIPHER, this.#key, Buffer.from(stored.nonce));
      decipher.setAAD(entry.aad);
      decipher.setAuthTag(Buffer.from(stored.authTag));
      plaintext = Buffer.concat([decipher.update(entry.ciphertext), decipher.final()]);
    } catch {
      // Wrong key, wrong subject, wrong import, or tampering — one opaque
      // kind, no fragment of the file, no oracle.
      throw new EncryptedSourceStoreError('read_failed', 'authenticated decryption failed');
    }
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < plaintext.length; offset += chunkSize) {
      yield new Uint8Array(plaintext.subarray(offset, Math.min(offset + chunkSize, plaintext.length)));
    }
  }

  /** Idempotent by contract: a second call finds nothing and answers `false`. */
  erase(actor: ImportsPrincipal, stored: StoredSource): Promise<boolean> {
    const entry = this.#objects.get(stored.objectRef);
    if (entry === undefined) return Promise.resolve(false);
    // One subject must not erase another's bytes, and must not learn that they
    // exist by being told so. Same answer as an absent object.
    try {
      assertSubjectMatches(actor, entry.aad);
    } catch {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.#objects.delete(stored.objectRef));
  }

  /** How many objects are held. A test affordance; nothing in the pipeline reads it. */
  get storedObjectCount(): number {
    return this.#objects.size;
  }
}

/**
 * The single seam a composition root uses to obtain the port.
 *
 * `local` gets the in-process adapter above. **Every other environment must
 * supply an approved provider, and gets a throw when it does not** — there is
 * no fallback, no "temporarily use the local one", and no silently disabled
 * encryption. The failure is at construction, before a single statement has
 * been handled, because the alternative failure mode is a deployment that
 * quietly writes plaintext statements and discovers it during an incident.
 */
export function resolveEncryptedSourceStorePort(options: {
  readonly env: string;
  readonly approvedProvider?: EncryptedSourceStorePort | null;
  readonly localKeyVersion?: string;
}): EncryptedSourceStorePort {
  const approved = options.approvedProvider ?? null;
  if (approved !== null) return approved;
  if (options.env !== 'local') {
    throw new EncryptedSourceStoreError(
      'key_unavailable',
      `no approved encrypted-source store is wired for KARAR_ENV='${options.env}', and there is ` +
        'no fallback: an uploaded statement is the single most sensitive artefact this platform ' +
        'handles — every movement on somebody’s account for a month, in one file. Wire the ' +
        'environment’s key-management-backed store (ADR-0017); the local adapter keeps keys and ' +
        'ciphertext in process memory and refuses to construct here for the same reason',
    );
  }
  return new LocalEncryptedSourceStore({
    env: options.env,
    ...(options.localKeyVersion !== undefined ? { keyVersion: options.localKeyVersion } : {}),
  });
}
