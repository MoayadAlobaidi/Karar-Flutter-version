/**
 * `SourceAccountFingerprintPort` — how "the same source account" is decided,
 * declared INWARD here and implemented in `infrastructure/providers`.
 *
 * ## Why KEYED, and not a plain hash of the reference
 *
 * The obvious implementation is `sha256(externalReference)`. It is also a
 * **confirmation oracle over an identifier that names a real account outside
 * Karar**. The input space is small and entirely guessable — an account
 * number in a known format, a card tail, a phone number in a known country —
 * so anyone who can read the fingerprint column (a backup, a replica, a
 * support export, a compromised read-only credential) can test "does this
 * person hold account 01234567 at this institution?" offline and get a
 * definitive yes. The ciphertext column exists precisely so that reading the
 * table reveals nothing; an unkeyed digest of the same value hands it back in
 * a form that survives encryption entirely.
 *
 * A keyed MAC removes the oracle: without the key the digest cannot be
 * recomputed, so it cannot be tested against a guess.
 *
 * ## Why the key is derived PER SUBJECT
 *
 * A single platform key would still let the SAME external account reference
 * belonging to two different people produce the SAME digest — turning this
 * column into a cross-subject join key inside a shared table. "These two
 * subjects hold the same external account", or "this account belongs to both
 * of them", derivable across a whole database without decrypting anything, is
 * a worse disclosure than any single row. Deriving the MAC key per
 * `(tenantId, userId)` makes those two values unrelated, so the column can
 * only answer the one question it exists to answer: has THIS subject seen
 * THIS source account before.
 *
 * That property is not left to the comment. `fingerprint` is asserted by test
 * to produce DIFFERENT values for one external reference under two different
 * subjects — both across tenants and, more importantly, for two members of
 * ONE tenant, which is the case a tenant-only derivation would get wrong.
 *
 * ## Why VERSIONED
 *
 * The definition is not eternal: which fields participate and how the
 * reference is normalised will change. The version travels with the value, is
 * stored on the row, and participates in the unique constraint — so a version
 * bump starts a fresh namespace instead of colliding with values computed
 * under the old rules. A digest whose definition is unrecorded becomes
 * uninterpretable the moment the definition moves, and a silent redefinition
 * either resurrects duplicate links or hides genuine new ones.
 *
 * ## What may not enter the input
 *
 * Nothing derived from key material, ciphertext, a nonce, or a row id
 * (packages/platform keys/custody.ts states the rule). A fresh nonce per
 * encryption means a ciphertext-derived value would change identity on every
 * write; a row-id-derived one would make every row unique and the constraint
 * useless. Nothing about the connection either: the ADR's rule is that an
 * exact match WITHIN ONE PRINCIPAL may link automatically, so the value has
 * to be comparable across that principal's connections — which is the entire
 * mechanism by which a CSV-created account later receives API data without
 * becoming a second account. Folding the connection in would make the same
 * source account, seen through two connections, two different source
 * accounts, and the redesign would achieve nothing.
 *
 * ## Where it is never allowed to go
 *
 * Not into a response, not into an event payload, not into an audit record,
 * and not into a log line. It is a keyed value that means nothing outside
 * this platform and everything inside it: it is the one column that can say
 * "these two rows are about the same external account".
 */

import type { SourceAccountFingerprint } from '../../domain/account-source-link.js';
import type { ExternalReferenceScheme } from '../../domain/external-account-reference.js';
import type { ConnectionsPrincipal } from '../principal.js';

/**
 * The content a fingerprint is computed over: **these two fields and nothing
 * else.** The list is exhaustive by design, and every absence is a decision
 * rather than an omission — see the header for the connection, the row id and
 * the ciphertext.
 */
export interface SourceAccountFingerprintInput {
  /**
   * What KIND of reference this is. Participates so that a second scheme,
   * when one exists, starts a namespace of its own instead of colliding with
   * this one on a coincidentally equal string.
   */
  readonly scheme: ExternalReferenceScheme;
  /**
   * The external reference AFTER the normalisation the version names —
   * trimmed and ASCII-uppercased, and nothing else, because a normalisation
   * that folds separators away would make two merely SIMILAR references
   * compare as exactly equal and auto-link on a guess
   * (`domain/external-account-reference.ts`).
   */
  readonly normalizedReference: string;
}

export interface SourceAccountFingerprintPort {
  /** The version this implementation mints. Stored with every value it produces. */
  readonly version: string;

  /**
   * The fingerprint of `input` for `principal`. Deterministic for a fixed
   * principal, version and input — the unique constraint depends on it, so an
   * implementation that folded in a nonce or a clock reading would make every
   * proposal a new link and every re-import a duplicate.
   */
  fingerprint(
    principal: ConnectionsPrincipal,
    input: SourceAccountFingerprintInput,
  ): Promise<SourceAccountFingerprint>;
}
