/**
 * `EncryptedSourceStorePort` — where a subject's raw statement goes, said in a
 * way that never names where that is.
 *
 * ## What this port is for
 *
 * A CSV statement is the single most sensitive artefact this platform
 * handles: every movement on somebody's account for a month, in one file,
 * usually with an account number in the header and a name at the top. It has
 * to survive between "the person uploaded it" and "the person reviewed and
 * committed it", which can be minutes or days, and it must be re-readable at
 * commit so the commit works from the bytes that were reviewed rather than
 * from a re-upload nobody compared.
 *
 * ## The four things an implementation must do, and why each is not optional
 *
 * 1. **Authenticated encryption.** Not encryption plus a checksum — AEAD, so
 *    a modified object FAILS instead of decrypting to garbage. A financial
 *    file that silently becomes garbage is worse than one that fails to load,
 *    because the garbage gets parsed.
 * 2. **A fresh nonce per object.** Never a counter, never derived from the
 *    import id. Nonce reuse under GCM is catastrophic rather than merely
 *    weak, and a derived nonce is a counter with extra steps.
 * 3. **A recorded key version.** Without it a key rotation makes stored
 *    statements unreadable and the loss is discovered by a user rather than
 *    by an operator (ADR-0017).
 * 4. **An integrity checksum over the ciphertext**, returned at write and
 *    re-verified at read. The AEAD tag already authenticates the content; the
 *    checksum answers a different question — "is the object I am about to
 *    commit from the object I stored?" — cheaply, before any key material is
 *    touched, and it is the value the commit path re-checks.
 *
 * ## Provider-neutral means the ADDRESS never leaves the adapter
 *
 * `store` returns a `SourceObjectRef`, an opaque handle. It is not a URI, not
 * a bucket key, not a path — `SourceObjectRef.of` refuses a scheme separator
 * and migration 0100 carries the same refusal as a CHECK. Nothing in domain
 * or application ever learns which store is bound, so moving stores is a
 * composition change rather than a rewrite of every historical row.
 *
 * **No cloud object storage client is added by this module.** The LOCAL/TEST
 * adapter keeps ciphertext in process memory; a deployment binds whatever its
 * profile provides. `modules/documents` owns object storage for this platform
 * (architecture test 18), and a second module importing an S3 client would be
 * a second answer to a question that already has one.
 *
 * ## Reading is STREAMING, and that is part of the contract
 *
 * `open` returns an async iterable of chunks rather than a buffer. The parser
 * never holds the whole file, and a port that returned `Promise<Uint8Array>`
 * would make that impossible to honour no matter how carefully the parser was
 * written — the 10 MiB ceiling would be enforced by the heap rather than by
 * the declared policy.
 *
 * ## What must never happen inside an implementation
 *
 * No logging of bytes, no logging of a decrypted line, no metrics labelled
 * with a filename, and no error message carrying a fragment of the content.
 * The failure type below has one opaque kind for exactly that reason:
 * distinguishing "wrong key" from "tampered" for a caller would leak an
 * oracle, and describing what failed to decrypt would leak the thing itself.
 */

import type {
  IntegrityChecksumAlgorithm,
  SourceObjectRef,
  SourceStoreKind,
} from '../../domain/encrypted-source.js';
import type { ImportsPrincipal } from '../principal.js';

/**
 * The binding every operation on a stored object must present.
 *
 * WHY THIS IS NOW ON THE READ SIDE TOO, and why the port had to change rather
 * than the adapter.
 *
 * `store` has always bound tenant, user, import id and media type into the AEAD
 * associated data. `open`, `verify` and `erase` received only a `StoredSource`
 * descriptor, which carried none of that — so the only thing an implementation
 * could authenticate against was **the associated data it had stored beside the
 * ciphertext**, which authenticates an object against itself and proves nothing
 * about the caller. The subject half was recovered by comparing a prefix; the
 * import and media-type halves could not be recovered at all, because the port
 * never handed an implementation one.
 *
 * That is not a local-adapter shortcoming. An S3-plus-KMS implementation would
 * have been in exactly the same position, which is why widening the port is the
 * fix and hardening the adapter is not. Verified before the change: an object
 * replayed under a DIFFERENT import of the SAME subject decrypted successfully.
 * Cross-user and cross-tenant were correctly refused.
 *
 * The exploit precondition is row-level write — a tamper, a restore, a merge, a
 * future bug that swaps an `object_ref` between two of one person's imports.
 * Surviving exactly that is what an AEAD binding is for.
 */
export interface SourceBindingContext {
  /** Bound as AEAD associated data, so an object cannot be replayed under another import. */
  readonly importId: string;
  /** `text/csv`, always. Recorded so a later media type cannot arrive silently. */
  readonly mediaType: string;
}

/**
 * What a caller must say about an object before it is stored.
 *
 * Identical to the binding a reader must present, and deliberately the same
 * type: if writing and reading could describe an object differently, the
 * binding would be decorative.
 */
export type SourceStoreContext = SourceBindingContext;

/** What the store recorded about one written object. */
export interface StoredSource {
  readonly storeKind: SourceStoreKind;
  readonly objectRef: SourceObjectRef;
  readonly byteLength: number;
  readonly algorithm: string;
  readonly keyVersion: string;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly integrityChecksumAlgorithm: IntegrityChecksumAlgorithm;
  /** Over the CIPHERTEXT. Re-verified before the commit reads a byte. */
  readonly integrityChecksum: Uint8Array;
}

/** The single typed failure of the port. Never carries a fragment of the file. */
export class EncryptedSourceStoreError extends Error {
  override readonly name = 'EncryptedSourceStoreError';

  constructor(
    readonly kind:
      | 'write_failed'
      | 'read_failed'
      | 'not_found'
      | 'integrity_failed'
      | 'key_unavailable',
    message: string,
  ) {
    super(message);
  }
}

export interface EncryptedSourceStorePort {
  /** The algorithm new objects use. Recorded on every object produced. */
  readonly algorithm: string;

  /**
   * Encrypts and stores one statement, returning what the row must record.
   *
   * `plaintext` arrives as an async iterable so a large upload never has to be
   * materialised by the caller either. An implementation may still need the
   * whole ciphertext in hand to compute a tag; the declared byte ceiling
   * (`csvStatementImport.maxBytes`) is what bounds that, and the caller
   * enforces it before calling.
   */
  store(
    actor: ImportsPrincipal,
    context: SourceStoreContext,
    plaintext: AsyncIterable<Uint8Array>,
  ): Promise<StoredSource>;

  /**
   * Verifies the stored object's integrity checksum WITHOUT decrypting it.
   *
   * Separate from `open` because the commit path checks integrity as one of
   * its revalidations, before it decides to proceed at all. Doing it through
   * a decrypt would mean the check and the read were the same act, and a
   * caller could not verify without also holding the plaintext.
   *
   * THE AAD RULE BINDS THIS OPERATION TOO. It is stated in full on `open`, and
   * a delta reviewer pointed out that stating it there alone is how it gets
   * read as `open`'s rule: this operation must reconstruct the expected
   * binding from caller-owned context and must not treat anything stored
   * beside the ciphertext as authoritative. The reference adapter compares
   * against its own in-memory copy, which is safe only because that map is
   * process memory; a store keeping associated data in object metadata would
   * hand the same attacker both halves.
   */
  verify(
    actor: ImportsPrincipal,
    context: SourceBindingContext,
    stored: StoredSource,
  ): Promise<boolean>;

  /**
   * Decrypts and streams the object.
   *
   * Rejects on any authentication failure — wrong subject, wrong import, wrong
   * media type, wrong key, or tampering — with one opaque kind, because
   * distinguishing them for a caller would leak an oracle.
   *
   * The expected associated data is computed from [context] and [actor]. An
   * implementation may NOT authenticate against associated data it stored
   * beside the ciphertext: that authenticates the object against itself.
   *
   * THIS PROHIBITION BINDS `verify` AND `erase` TOO, and it was written here
   * for `open` alone. An independent review pointed out what that leaves: a
   * store whose associated data lives in object metadata — which is where the
   * S3-and-KMS adapter this port exists for would keep it — hands the same
   * attacker who can substitute the object the ability to substitute the
   * metadata beside it. `verify` would then answer `true` for a substituted
   * object and `erase` would delete another import's ciphertext, and neither
   * performs a cryptographic operation that would notice.
   *
   * The reference adapter is unaffected because its map is process memory,
   * unreachable by the row-level write the threat model describes. That is a
   * property of the adapter and not of the port, so the rule is stated here
   * rather than left to be rediscovered by whoever writes the second one:
   * **every operation that authenticates, opens, verifies or erases a source
   * must reconstruct the expected binding from caller-owned context, and must
   * not treat anything stored beside the ciphertext as authoritative.**
   */
  open(
    actor: ImportsPrincipal,
    context: SourceBindingContext,
    stored: StoredSource,
  ): AsyncIterable<Uint8Array>;

  /**
   * Deletes the object. Idempotent by contract: a second call finds nothing
   * and answers `false` rather than throwing.
   *
   * Erasure needs this. `ON DELETE CASCADE` reaches the row that names an
   * object; it cannot reach a byte the database does not hold, and a dangling
   * ciphertext nobody can name is still a subject's bank statement sitting in
   * a store.
   *
   * THE AAD RULE BINDS THIS OPERATION TOO. It is stated in full on `open`, and
   * a delta reviewer pointed out that stating it there alone is how it gets
   * read as `open`'s rule: this operation must reconstruct the expected
   * binding from caller-owned context and must not treat anything stored
   * beside the ciphertext as authoritative. The reference adapter compares
   * against its own in-memory copy, which is safe only because that map is
   * process memory; a store keeping associated data in object metadata would
   * hand the same attacker both halves.
   */
  erase(
    actor: ImportsPrincipal,
    context: SourceBindingContext,
    stored: StoredSource,
  ): Promise<boolean>;
}

/**
 * `SourceFileFingerprintPort` — the keyed, per-subject, versioned value that
 * recognises the same file arriving twice.
 *
 * Declared beside the store because it is computed over the same bytes in the
 * same pass, and separated from it because they answer different questions
 * and a deployment may satisfy them with different key material.
 *
 * **Keyed, and the reason is the same one migration 0097 records at length
 * for source-account references.** An unkeyed digest of a document is a
 * confirmation oracle: anybody holding a copy of a statement — a family
 * member, an employer, a former partner, whoever the file was originally
 * mailed to — could test whether a given person imported it, without
 * decrypting anything and without any access to the file this platform holds.
 *
 * **Per subject**, so the same file under two people produces unrelated
 * values. A platform-keyed value would make the column a cross-subject join
 * key inside a shared table: "these two accounts imported the same
 * statement", derivable across a whole database without touching a key.
 *
 * **Versioned**, because the definition will change and a redefinition must
 * start a fresh namespace rather than colliding with values computed under
 * the old rules.
 */
export interface SourceFileFingerprintPort {
  /** The version this implementation mints. Stored with every value it produces. */
  readonly version: string;

  /**
   * The fingerprint of these bytes for this principal. Deterministic for a
   * fixed principal, version and content — duplicate detection depends on it,
   * so an implementation that folded in a nonce or a clock reading would make
   * every upload a new file.
   */
  fingerprint(actor: ImportsPrincipal, plaintext: AsyncIterable<Uint8Array>): Promise<string>;
}
