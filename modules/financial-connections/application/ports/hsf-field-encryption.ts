/**
 * The HSF field-encryption port for this module — declared INWARD here,
 * implemented in `infrastructure/providers`, consumed by this module's
 * repositories.
 *
 * ## Why this port exists at all
 *
 * Two fields in this module are `HIGHLY_SENSITIVE_FINANCIAL`: the label a
 * subject gave a connection, and the external account reference a source uses
 * to name one of their accounts. The second is the more serious of the two —
 * it is another party's identifier FOR this person, and holding it in
 * plaintext would put in one column exactly what
 * `modules/financial-accounts` bounds its mask column at eight bytes to keep
 * out.
 *
 * This contract deliberately MIRRORS the ports of the same name in
 * `modules/financial-accounts` and `modules/transactions`. It is restated
 * rather than imported because nothing crosses a module boundary except
 * through `public-api.ts` (architecture test 3), and a shared port would make
 * one module's key handling the other's problem. The three are intended to
 * stay recognisably the same shape; the differences are only the field
 * vocabulary and the domain-separation label an adapter binds.
 *
 * ## What an encrypted field carries, and why each part is required
 *
 * - `ciphertext` — the encrypted bytes. AES-256-GCM preserves length, which
 *   is what lets migration 0097 keep a 96-byte bound on the external
 *   reference meaningful in plaintext terms.
 * - `nonce` — the per-encryption IV, fresh for every encryption
 *   (data-model.md §9: AES-256-GCM with a fresh 12-byte IV). Stored beside
 *   the ciphertext because decryption needs it and it is not secret.
 * - `algorithm` — the provider-neutral name, stored per row rather than
 *   assumed globally: an algorithm migration must be able to read old rows.
 * - `keyVersion` — the exact key version that produced the ciphertext
 *   (ADR-0017: key and version provenance recorded for every encryption).
 *   Without it a rotation makes old rows unreadable, and here that means a
 *   source account nobody can recognise again.
 * - `authTag` — the AEAD authentication tag. Without it a modified ciphertext
 *   decrypts to garbage instead of failing, and a garbage external reference
 *   would silently start matching nothing at all.
 *
 * ## Why the context is bound as associated data
 *
 * `FieldEncryptionContext` names the row and the column a ciphertext belongs
 * to, and an implementation binds it — TOGETHER WITH the acting tenant and
 * user — as AEAD associated data. Five things are therefore authenticated:
 * tenant, user, table, row id, and field name. A `sourceAccountReference`
 * copied onto another link's row, or a row moved between two subjects inside
 * one tenant, fails authentication instead of decrypting into a plausible
 * wrong record.
 *
 * ## Deliberately absent
 *
 * No searchable, deterministic, or order-preserving encryption, and no
 * "encrypted index" — even though this module is the one place in the
 * codebase where a deterministic ciphertext would look convenient, because
 * equality over external references is exactly what it needs. That is the
 * reason it is refused: a deterministic ciphertext over a short guessable
 * identifier is a confirmation oracle, and it would be a worse one here than
 * anywhere else. Equality is the keyed, per-subject fingerprint instead, which
 * answers the same question without being recomputable by anyone holding only
 * the column.
 */

import type { HsfField } from '../../domain/hsf-field.js';
import type { ConnectionsPrincipal } from '../principal.js';

/** The two HSF columns this module encrypts. Closed set. */
export const HSF_FIELD_NAMES = ['displayLabel', 'sourceAccountReference'] as const;
export type HsfFieldName = (typeof HSF_FIELD_NAMES)[number];

/**
 * Which row and which column a ciphertext belongs to. Bound as associated
 * data, with the principal, so a ciphertext cannot be moved between rows,
 * between columns, or between subjects.
 */
export interface FieldEncryptionContext {
  /** The table the value is stored in, e.g. 'account_source_links'. */
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
    principal: ConnectionsPrincipal,
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
    principal: ConnectionsPrincipal,
    encrypted: EncryptedField,
    context: FieldEncryptionContext,
  ): Promise<HsfField>;
}

/**
 * The single typed failure of the port. Never carries a plaintext fragment, a
 * key, or a nonce — this message ends up in a log, and the whole point of the
 * port is that the log is not where an external account reference lives.
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
