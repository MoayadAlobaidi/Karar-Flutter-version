/**
 * The HSF field-encryption port — declared here, consumed by this module's
 * repositories and by the statement ingestion workstream when it stages and
 * commits narrative text.
 *
 * Merchant, description, and note are `HIGHLY_SENSITIVE_FINANCIAL`
 * (MODULE.md): encrypted at rest, never stored as plaintext, and never
 * carried in an event payload or an audit record. The domain holds them as
 * `HsfField` values; turning those into storable bytes is entirely an
 * infrastructure concern, and this port is the seam.
 *
 * ## What an encrypted field carries, and why each part is required
 *
 * - `ciphertext` — the encrypted bytes. May legitimately be zero-length for a
 *   zero-length plaintext, so no non-empty check exists on it.
 * - `nonce` — the per-encryption IV. Fresh for every encryption
 *   (data-model.md §9: AES-256-GCM with a fresh 12-byte IV). Stored beside
 *   the ciphertext because decryption needs it and it is not secret.
 * - `algorithm` — the provider-neutral name. Stored per row rather than
 *   assumed globally: an algorithm migration must be able to read old rows,
 *   and "everything is AES-256-GCM" is true right up until it is not.
 * - `keyVersion` — the exact key version that produced the ciphertext
 *   (ADR-0017: key and version provenance recorded for every encryption).
 *   Without it, a key rotation makes old rows unreadable and the loss is
 *   discovered by a user, not by an operator.
 * - `authTag` — the AEAD authentication tag. This is the integrity metadata:
 *   without it a modified ciphertext decrypts to garbage instead of failing,
 *   and a financial narrative that silently becomes garbage is worse than one
 *   that fails to load.
 *
 * ## Why the context is bound as associated data
 *
 * `FieldEncryptionContext` names the row and the column a ciphertext belongs
 * to, and an implementation binds it as AEAD associated data. That makes a
 * ciphertext non-transplantable: a `merchant` value copied into a
 * `description` column, or one transaction's narrative pasted onto another
 * row, fails authentication instead of decrypting into a plausible wrong
 * record. Storage-level tampering that a row-level checksum would miss
 * becomes a decryption failure.
 *
 * ## Deliberately absent
 *
 * No searchable or deterministic encryption, and no "encrypted index". A
 * deterministic ciphertext over a small guessable input is the same
 * confirmation oracle described in `dedup-fingerprint.ts`, and this module
 * does not need one: duplicate detection uses the keyed fingerprint, and
 * ordering uses booking date and id. data-model.md §9 records the one place
 * the legacy hit this (a `merchant_rules.pattern` column sorted by
 * `LENGTH(pattern)`) — the catalogue tables here carry no subject narrative
 * at all, so the constraint does not arise.
 */

import type { HsfField } from '../../domain/hsf-field.js';
import type { TransactionsPrincipal } from './principal-context.js';

/** The three HSF columns this module encrypts. Closed set. */
export const HSF_FIELD_NAMES = ['merchant', 'description', 'note'] as const;
export type HsfFieldName = (typeof HSF_FIELD_NAMES)[number];

/**
 * Which row and which column a ciphertext belongs to. Bound as associated
 * data so a ciphertext cannot be moved between rows or columns.
 */
export interface FieldEncryptionContext {
  /** The table the value is stored in, e.g. 'transactions'. */
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
    principal: TransactionsPrincipal,
    field: HsfField,
    context: FieldEncryptionContext,
  ): Promise<EncryptedField>;

  /**
   * Decrypts under the ciphertext's OWN key version, so rows written before a
   * rotation stay readable. Rejects on any authentication failure — wrong
   * key, wrong context, or tampering — with one opaque failure kind, because
   * distinguishing them for a caller would leak an oracle.
   */
  decryptField(
    principal: TransactionsPrincipal,
    encrypted: EncryptedField,
    context: FieldEncryptionContext,
  ): Promise<HsfField>;
}

/** The single typed failure of the port. Never carries plaintext fragments. */
export class HsfFieldEncryptionError extends Error {
  override readonly name = 'HsfFieldEncryptionError';

  constructor(
    readonly kind: 'encryption_failed' | 'decryption_failed' | 'key_unavailable',
    message: string,
  ) {
    super(message);
  }
}
