/**
 * The keyed, per-subject, versioned fingerprint that recognises the same
 * statement file arriving twice.
 *
 * **This is the LOCAL/TEST adapter**: it holds a root key in process memory,
 * which a deployment must not do. A deployed environment derives the subject
 * key through the platform's key-management provider (ADR-0017). The
 * construction below is the one production must reproduce, so the tests
 * exercise the real contract rather than a stub.
 *
 * ## Why KEYED, and not a plain digest of the file
 *
 * `sha256(fileBytes)` looks obviously safe — it is a digest of a document,
 * not of a guessable field. It is not safe here, and the reason is who else
 * holds the document. A bank statement is mailed to the customer, saved by
 * whoever downloaded it, forwarded to an accountant, kept by a former
 * partner, and attached to a loan application. **Anyone holding a copy could
 * compute the digest and test whether a given person imported that exact file
 * into Karar** — without decrypting anything, and without any access to this
 * platform's copy. That is a confirmation oracle over a fact about a person,
 * available to precisely the people most likely to want it.
 *
 * A keyed MAC removes it: without the key the value cannot be recomputed, so
 * it cannot be tested against a document somebody already has.
 *
 * ## Why the key is derived PER SUBJECT
 *
 * A single platform key would still make the same file under two people
 * produce the same value — a cross-subject join key inside a shared table,
 * saying "these two accounts imported the same statement" without decrypting
 * anything. That is a real relationship between two people, derivable across
 * a whole database. Deriving per `(tenantId, userId)` makes the two values
 * unrelated, so the column can only ever answer the one question it exists to
 * answer: has THIS subject imported THIS file before.
 *
 * The per-subject arm matters most inside one tenant. Two members of a
 * household are two subjects whose imports sit in the same table, and a
 * tenant-only derivation would pass a cross-tenant test and fail exactly that
 * case.
 *
 * ## Why VERSIONED
 *
 * The definition is not eternal — whether whitespace-only differences count,
 * whether a BOM matters, whether the digest covers a normalised form. A value
 * whose definition is unrecorded becomes uninterpretable the moment the
 * definition moves, and a silent redefinition either resurrects duplicates or
 * hides genuine ones. The version travels with the value and is stored on the
 * row.
 *
 * ## Why the digest is over the RAW bytes
 *
 * Not over a normalised or parsed form. "The same file" means the same
 * bytes: two exports that differ by a line ending are two files, and a person
 * who re-downloads their statement and gets a byte-identical file is the case
 * this exists to catch. Normalising first would make the answer depend on the
 * parser, and a parser change would silently redefine what a duplicate is.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { SourceFileFingerprintPort } from '../../application/ports/encrypted-source-store.js';
import type { ImportsPrincipal } from '../../application/principal.js';

/**
 * The definition identifier. Bumped whenever anything about the construction
 * below changes — including the label, because the label IS the domain
 * separation.
 */
export const SOURCE_FILE_FINGERPRINT_VERSION = 'statement-source/hmac-sha256/raw-bytes/v1';

const SUBJECT_KEY_LABEL = 'karar/statement-imports/source-file/v1';
const ROOT_KEY_BYTES = 32;

export class LocalKeyedFileFingerprintProvider implements SourceFileFingerprintPort {
  readonly version = SOURCE_FILE_FINGERPRINT_VERSION;

  readonly #rootKey: Buffer;

  constructor(options: { readonly rootKey?: Uint8Array } = {}) {
    const rootKey = options.rootKey ?? randomBytes(ROOT_KEY_BYTES);
    if (rootKey.length !== ROOT_KEY_BYTES) {
      throw new Error(
        `the source-file fingerprint root key must be ${ROOT_KEY_BYTES} bytes, got ${rootKey.length}`,
      );
    }
    this.#rootKey = Buffer.from(rootKey);
  }

  /**
   * `subjectKey = HMAC(rootKey, label | tenant | user)`, then
   * `value = HMAC(subjectKey, bytes)`.
   *
   * The subject components are length-prefixed rather than joined by a
   * separator, so no pair of `(tenant, user)` values can produce the same
   * pre-image as a different pair. A `|` separator alone is a canonicalisation
   * bug waiting for an identifier that contains one.
   */
  async fingerprint(
    actor: ImportsPrincipal,
    plaintext: AsyncIterable<Uint8Array>,
  ): Promise<string> {
    const subjectKey = createHmac('sha256', this.#rootKey)
      .update(lengthPrefixed([SUBJECT_KEY_LABEL, actor.tenantId, actor.userId]))
      .digest();
    // Streamed: the file is never held here. The store holds it once, and one
    // copy of a subject's statement in memory is one more than this adapter
    // needs.
    const mac = createHmac('sha256', subjectKey);
    for await (const chunk of plaintext) mac.update(Buffer.from(chunk));
    return mac.digest('base64url');
  }
}

function lengthPrefixed(parts: readonly string[]): Buffer {
  const buffers: Buffer[] = [];
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length, 0);
    buffers.push(length, bytes);
  }
  return Buffer.concat(buffers);
}

/**
 * Equality between two fingerprints of the same version.
 *
 * Constant-time, and versions are compared first: comparing values across
 * versions is meaningless, and returning `true` for it would merge two
 * namespaces the version exists to keep apart.
 */
export function fileFingerprintsEqual(
  left: { readonly value: string; readonly version: string },
  right: { readonly value: string; readonly version: string },
): boolean {
  if (left.version !== right.version) return false;
  const a = Buffer.from(left.value, 'utf8');
  const b = Buffer.from(right.value, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
