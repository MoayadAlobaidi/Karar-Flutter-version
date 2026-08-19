/**
 * Where a stored statement lives, expressed so that the domain never learns
 * where that is.
 *
 * ## Why an opaque handle and not a URI
 *
 * The obvious column is `s3://karar-statements/2026/08/abc.csv.enc`, and it
 * is wrong in three ways at once. It names a provider inside a subject-owned
 * row, so moving stores means rewriting every historical row rather than
 * changing a composition binding. It puts a bucket name and a key layout into
 * every backup, export and support query. And it makes the application layer
 * a party to storage topology — the first `if (ref.startsWith('s3://'))` is
 * one incident away, and after it the port is decoration.
 *
 * `SourceObjectRef` is therefore an opaque token minted by whatever store the
 * deployment binds, with a shape rule that refuses a scheme separator and
 * whitespace, and migration 0100 carries the same refusal as a CHECK so a
 * direct INSERT cannot do what the domain will not.
 *
 * ## What travels beside it, and why each part is required
 *
 * - `algorithm`, `keyVersion`, `nonce`, `authTag` — the AEAD parameters, per
 *   object (ADR-0017 provenance). Without the key version a rotation makes
 *   old statements unreadable and the loss is discovered by a user rather
 *   than an operator; without the auth tag a modified object decrypts to
 *   garbage instead of failing, and a financial file that silently becomes
 *   garbage is worse than one that fails to load.
 * - `integrityChecksum` — SHA-256 over the CIPHERTEXT, re-verified before the
 *   commit reads a single byte. A plain digest is correct here precisely
 *   because ciphertext is indistinguishable from random: digesting it
 *   confirms nothing about the statement, which is exactly what a digest that
 *   sits beside the object needs to be true of it.
 * - `fileFingerprint` + `fileFingerprintVersion` — the KEYED, per-subject,
 *   versioned value that recognises the same file arriving twice. Keyed
 *   because a plain digest of a document is a confirmation oracle: anyone
 *   holding a copy of a statement could test whether a given person uploaded
 *   it, without decrypting anything.
 *
 * ## What is deliberately absent
 *
 * No plaintext, no size-in-a-comment, no filename, no upload IP, no
 * content-type sniffed from the bytes. The media type is `text/csv` because
 * that is the only thing this path accepts, not because anything inspected
 * the file to decide.
 *
 * Pure: no clock, no randomness, no I/O.
 */

export class InvalidSourceObjectRefError extends Error {
  override readonly name = 'InvalidSourceObjectRefError';
}

/** Matches the database CHECK in migration 0100. */
export const MAX_SOURCE_OBJECT_REF_LENGTH = 200;

/** An opaque handle to one stored, encrypted statement. Never a URI. */
export type SourceObjectRef = string & { readonly __brand: 'SourceObjectRef' };

export const SourceObjectRef = {
  of(value: string): SourceObjectRef {
    if (typeof value !== 'string' || value === '') {
      throw new InvalidSourceObjectRefError('a source object reference must be a non-empty string');
    }
    if (value.length > MAX_SOURCE_OBJECT_REF_LENGTH) {
      throw new InvalidSourceObjectRefError(
        `a source object reference is bounded at ${MAX_SOURCE_OBJECT_REF_LENGTH} characters`,
      );
    }
    if (value.includes('://')) {
      throw new InvalidSourceObjectRefError(
        'a source object reference may not be a URI: a provider address in a subject-owned row ' +
          'names a provider inside somebody else’s financial data, and moving stores would ' +
          'mean rewriting every historical row rather than changing one composition binding',
      );
    }
    if (/\s/.test(value)) {
      throw new InvalidSourceObjectRefError(
        'a source object reference may not contain whitespace — a handle with a space in it is a ' +
          'path or a sentence, and neither is an opaque token',
      );
    }
    return value as SourceObjectRef;
  },

  /** True when the value would be accepted. For validation paths that must not throw. */
  isValid(value: string): boolean {
    try {
      SourceObjectRef.of(value);
      return true;
    } catch {
      return false;
    }
  },
};

/** Which kind of store minted a handle. Closed set; extending it is reviewed. */
export const SOURCE_STORE_KINDS = ['LOCAL_ENCRYPTED_BUFFER', 'EXTERNAL_ENCRYPTED_OBJECT'] as const;
export type SourceStoreKind = (typeof SOURCE_STORE_KINDS)[number];

/** The integrity digest algorithms this module accepts. */
export const INTEGRITY_CHECKSUM_ALGORITHMS = ['SHA-256'] as const;
export type IntegrityChecksumAlgorithm = (typeof INTEGRITY_CHECKSUM_ALGORITHMS)[number];

/**
 * Everything recorded about one stored statement. The bytes themselves are
 * not here and are not in PostgreSQL — this describes where they are and how
 * to know they have not changed.
 */
export interface StoredSourceDescriptor {
  readonly storeKind: SourceStoreKind;
  readonly objectRef: SourceObjectRef;
  readonly byteLength: number;
  readonly algorithm: string;
  readonly keyVersion: string;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly integrityChecksumAlgorithm: IntegrityChecksumAlgorithm;
  /** Over the CIPHERTEXT. Re-verified before commit reads a byte. */
  readonly integrityChecksum: Uint8Array;
  /** Keyed, per-subject, versioned. Over the PLAINTEXT. Never exposed, never logged. */
  readonly fileFingerprint: string;
  readonly fileFingerprintVersion: string;
}

/**
 * Constant-time-ish equality over two checksums.
 *
 * Length is compared first and then every byte is visited without an early
 * return. The value is not a secret — it is a digest of ciphertext — so the
 * timing property is belt-and-braces rather than load-bearing; it costs
 * nothing and removes the need for the next reader to work out whether it
 * mattered here.
 */
export function checksumsEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
