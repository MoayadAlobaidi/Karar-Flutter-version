/**
 * The HSF field-encryption port for this module — declared INWARD here,
 * implemented in `infrastructure/providers`, consumed by this module's
 * repositories.
 *
 * ## Why this port exists at all
 *
 * `financial_accounts` is classified `HIGHLY_SENSITIVE_FINANCIAL`
 * (modules/financial-accounts/MODULE.md), and three of its fields carry
 * subject narrative: `display_name` (the name a person gave the account),
 * `user_supplied_institution_label` (the bank they typed when the reviewed
 * catalogue does not list it), and `mask` (the tail of the number). Until
 * this port existed, all three were plaintext `text` columns — while
 * `modules/transactions`, under the SAME classification, stored its three
 * narrative fields as ciphertext/nonce/auth-tag triples. Two modules, one
 * classification, opposite treatment; the weaker one decides what an attacker
 * gets from a stolen dump, so the weaker one was the defect.
 *
 * This contract deliberately MIRRORS
 * `modules/transactions/application/ports/hsf-field-encryption.ts`. It is
 * restated rather than imported because nothing crosses a module boundary
 * except through `public-api.ts` (architecture test 3), and a shared port
 * would make one module's key handling the other's problem. The two are
 * intended to stay recognisably the same shape, and the differences are only
 * the field vocabulary and the domain-separation label an adapter binds.
 *
 * ## What an encrypted field carries, and why each part is required
 *
 * - `ciphertext` — the encrypted bytes. AES-256-GCM preserves length, which
 *   is what lets migration 0088 keep a byte bound on the mask column and so
 *   keep a full PAN structurally unrepresentable even though the database can
 *   no longer read the characters.
 * - `nonce` — the per-encryption IV, fresh for every encryption
 *   (data-model.md §9: AES-256-GCM with a fresh 12-byte IV). Stored beside
 *   the ciphertext because decryption needs it and it is not secret.
 * - `algorithm` — the provider-neutral name, stored per row rather than
 *   assumed globally: an algorithm migration must be able to read old rows.
 * - `keyVersion` — the exact key version that produced the ciphertext
 *   (ADR-0017: key and version provenance recorded for every encryption).
 *   Without it a rotation makes old rows unreadable and the loss is
 *   discovered by a user rather than by an operator.
 * - `authTag` — the AEAD authentication tag. Without it a modified ciphertext
 *   decrypts to garbage instead of failing, and an account name that silently
 *   becomes garbage is worse than one that fails to load.
 *
 * ## Why the context is bound as associated data
 *
 * `FieldEncryptionContext` names the row and the column a ciphertext belongs
 * to, and an implementation binds it — TOGETHER WITH the acting tenant and
 * user — as AEAD associated data. Five things are therefore authenticated:
 * tenant, user, table, row id, and field name. That makes a ciphertext
 * non-transplantable in every direction that matters: a `mask` copied into
 * `display_name`, one account's name pasted onto another account's row, or a
 * row moved between two subjects inside one tenant all fail authentication
 * instead of decrypting into a plausible wrong record. Storage-level
 * tampering that a row checksum would miss becomes a decryption failure.
 *
 * ## Deliberately absent
 *
 * No searchable, deterministic, or order-preserving encryption, and no
 * "encrypted index". This module sorts accounts by `created_at` and looks
 * them up by primary key, so no ciphertext ever needs to be compared or
 * ordered; a deterministic ciphertext over a short guessable input — a
 * four-digit mask, above all — would be a confirmation oracle handed back in
 * the same change that removed the plaintext.
 */

import type { HsfField } from '../../domain/hsf-field.js';
import type { AccountsPrincipal } from '../principal.js';

/** The three HSF columns this module encrypts. Closed set. */
export const HSF_FIELD_NAMES = ['displayName', 'userSuppliedInstitutionLabel', 'mask'] as const;
export type HsfFieldName = (typeof HSF_FIELD_NAMES)[number];

/**
 * Which row and which column a ciphertext belongs to. Bound as associated
 * data, with the principal, so a ciphertext cannot be moved between rows,
 * between columns, or between subjects.
 */
export interface FieldEncryptionContext {
  /** The table the value is stored in, e.g. 'financial_accounts'. */
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
    principal: AccountsPrincipal,
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
    principal: AccountsPrincipal,
    encrypted: EncryptedField,
    context: FieldEncryptionContext,
  ): Promise<HsfField>;
}

/**
 * The single typed failure of the port.
 *
 * Never carries a plaintext fragment, a key, or a nonce — this message ends
 * up in a log, and the whole point of the port is that the log is not where
 * an account name lives.
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
