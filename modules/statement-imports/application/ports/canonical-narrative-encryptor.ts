/**
 * `CanonicalNarrativeEncryptorPort` — the narrative columns of a CANONICAL
 * transaction, encrypted under the transactions module's own key and label.
 *
 * ## Why this is a second port and not this module's `HsfFieldEncryptionPort`
 *
 * The two bind different AEAD domain-separation labels
 * (`karar/statement-imports/hsf/v1` and `karar/transactions/hsf/v1`), and that
 * difference is the control. A staged row's description and a committed
 * transaction's description are the same text in two tables with two
 * lifetimes; if one key and one label covered both, a ciphertext could be
 * transplanted from a staged row onto a committed record — or the reverse —
 * and would authenticate. It would decrypt into a plausible wrong financial
 * record rather than failing.
 *
 * So the commit asks a DIFFERENT seam for the canonical columns, and a
 * deployment binds it to the same key-management provider
 * `modules/transactions` uses for its own writes.
 *
 * ## Why it takes plaintext strings
 *
 * Neither module's `HsfField` crosses the boundary. This module's would drag
 * its domain into an adapter for another module's rows; that module's would
 * drag its domain into this one's application layer. A string is the smaller
 * concession, and the value is HSF for exactly as long as the call takes.
 *
 * The implementation must not log, must not retain, and must produce a fresh
 * nonce per field — the same contract every HSF encryptor in this platform
 * carries.
 */

import type { ImportsPrincipal } from '../principal.js';

/** The canonical narrative columns, exactly as `public.transactions` stores them. */
export interface EncryptedNarrativeColumns {
  readonly hsfAlgorithm: string;
  readonly hsfKeyVersion: string;
  readonly descriptionCiphertext: Uint8Array;
  readonly descriptionNonce: Uint8Array;
  readonly descriptionAuthTag: Uint8Array;
  readonly merchantCiphertext: Uint8Array | null;
  readonly merchantNonce: Uint8Array | null;
  readonly merchantAuthTag: Uint8Array | null;
  /**
   * A note is a thing a PERSON writes on a transaction. A statement line has
   * none and never will, so these are `null` by type rather than by value —
   * an import that could write a note would be inventing one.
   */
  readonly noteCiphertext: null;
  readonly noteNonce: null;
  readonly noteAuthTag: null;
}

/**
 * WHICH ROW THE NARRATIVE IS BEING SEALED FOR, and it is not optional.
 *
 * A commit writes the same narrative twice: once onto `public.transactions`
 * and once onto the `public.transaction_revisions` row that records how the
 * transaction came to hold those values. The transactions module's readers
 * bind the TABLE NAME into the AEAD context of each — `toTransaction` opens
 * under `transactions`, `toRevision` under `transaction_revisions`.
 *
 * This type exists because the port used to take only a `rowId`, and the
 * adapter behind it sealed BOTH rows under `transactions` on the reasoning
 * that the row id already distinguishes them. The row id does distinguish
 * them; the reader still binds the table, and so every imported transaction's
 * revision narrative was written under a context nothing would ever open it
 * with. A closed union in a required position makes the choice one a caller
 * has to make rather than one an adapter can assume.
 */
export type CanonicalNarrativeTarget = {
  readonly table: 'transactions' | 'transaction_revisions';
  readonly rowId: string;
};

export interface CanonicalNarrativeEncryptorPort {
  encrypt(
    actor: ImportsPrincipal,
    target: CanonicalNarrativeTarget,
    narrative: { readonly description: string; readonly merchant: string | null },
  ): Promise<EncryptedNarrativeColumns>;
}
