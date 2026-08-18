/**
 * The HSF field-encryption port for this module — declared INWARD here,
 * implemented in `infrastructure/providers`, consumed by this module's
 * repository.
 *
 * ## Why this port exists at all
 *
 * Two fields in this module are `HIGHLY_SENSITIVE_FINANCIAL`: the mask a
 * person recognises an instrument by, and the name they gave it. The first is
 * a fragment of a card number, which is why migration 0098 bounds its
 * ciphertext at EIGHT bytes and the domain refuses PAN-shaped input before a
 * key is ever used — the encryption here is the third mechanism, not the
 * first.
 *
 * This contract deliberately MIRRORS the ports of the same name in
 * `modules/financial-accounts`, `modules/transactions` and
 * `modules/financial-connections`. It is restated rather than imported
 * because nothing crosses a module boundary except through `public-api.ts`
 * (architecture test 3), and a shared port would make one module's key
 * handling the other's problem. The four are intended to stay recognisably
 * the same shape; the differences are only the field vocabulary and the
 * domain-separation label an adapter binds.
 *
 * ## What an encrypted field carries, and why each part is required
 *
 * - `ciphertext` — the encrypted bytes. AES-256-GCM preserves length, which
 *   is what lets migration 0098 keep an eight-byte bound on the mask
 *   meaningful in plaintext terms: eight bytes is eight characters, and no
 *   card number fits in eight characters.
 * - `nonce` — the per-encryption IV, fresh for every encryption
 *   (data-model.md §9: AES-256-GCM with a fresh 12-byte IV). Stored beside
 *   the ciphertext because decryption needs it and it is not secret.
 * - `algorithm` — the provider-neutral name, stored per row rather than
 *   assumed globally: an algorithm migration must be able to read old rows.
 * - `keyVersion` — the exact key version that produced the ciphertext
 *   (ADR-0017: key and version provenance recorded for every encryption).
 *   Without it a rotation makes old rows unreadable, and here that means a
 *   person's own cards becoming unrecognisable to them.
 * - `authTag` — the AEAD authentication tag. Without it a modified ciphertext
 *   decrypts to garbage instead of failing, and a garbage mask would be
 *   rendered to the person as though it were their card.
 *
 * ## Why the context is bound as associated data
 *
 * `FieldEncryptionContext` names the row and the column a ciphertext belongs
 * to, and an implementation binds it — TOGETHER WITH the acting tenant and
 * user — as AEAD associated data. Five things are therefore authenticated:
 * tenant, user, table, row id, and field name. A `mask` copied onto another
 * instrument's row, or a row moved between two subjects inside one tenant,
 * fails authentication instead of decrypting into a plausible wrong record —
 * and inside one household tenant, two members' cards sit in the same table.
 *
 * ## Deliberately absent
 *
 * No searchable, deterministic, or order-preserving encryption. A
 * deterministic ciphertext over a four-digit tail is a confirmation oracle
 * over an input space of ten thousand values, which is to say no protection
 * at all. Nothing in this module needs equality over masks, and if something
 * ever appears to, the answer is a keyed per-subject fingerprint of the kind
 * `modules/financial-connections` uses — never a deterministic ciphertext.
 */

import type { HsfField } from '../../domain/hsf-field.js';
import type { InstrumentsPrincipal } from '../principal.js';

/** The two HSF columns this module encrypts. Closed set. */
export const HSF_FIELD_NAMES = ['instrumentMask', 'displayLabel'] as const;
export type HsfFieldName = (typeof HSF_FIELD_NAMES)[number];

/**
 * Which row and which column a ciphertext belongs to. Bound as associated
 * data, with the principal, so a ciphertext cannot be moved between rows,
 * between columns, or between subjects.
 */
export interface FieldEncryptionContext {
  /** The table the value is stored in, e.g. 'payment_instruments'. */
  readonly table: string;
  /** The row identity the value belongs to. */
  readonly rowId: string;
  readonly field: HsfFieldName;
}

/** One encrypted field, exactly as the row stores it. */
export interface EncryptedField {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  /** Provider-neutral algorithm name, e.g. 'AES-256-GCM'. */
  readonly algorithm: string;
  /** The key version that produced this ciphertext (ADR-0017 provenance). */
  readonly keyVersion: string;
  /** AEAD authentication tag — the integrity metadata. */
  readonly authTag: Uint8Array;
}

export interface HsfFieldEncryptionPort {
  /** The algorithm new ciphertexts use. Recorded on every value produced. */
  readonly algorithm: string;

  encryptField(
    principal: InstrumentsPrincipal,
    field: HsfField,
    context: FieldEncryptionContext,
  ): Promise<EncryptedField>;

  /**
   * Decrypts under the ciphertext's OWN key version, so rows written before a
   * rotation stay readable. Rejects on any authentication failure — wrong
   * key, wrong context, wrong subject, or tampering — with one opaque failure
   * kind, because distinguishing them for a caller would leak an oracle.
   */
  decryptField(
    principal: InstrumentsPrincipal,
    encrypted: EncryptedField,
    context: FieldEncryptionContext,
  ): Promise<HsfField>;
}

/**
 * The single typed failure of the port. Never carries a plaintext fragment, a
 * key, or a nonce — this message ends up in a log, and the whole point of the
 * port is that the log is not where a card mask lives.
 */
export class HsfFieldEncryptionError extends Error {
  override readonly name = 'HsfFieldEncryptionError';

  constructor(
    readonly kind: 'encryption_failed' | 'decryption_failed' | 'key_unavailable',
    message: string,
  ) {
    super(message);
  }
}
