/**
 * The HSF field-encryption port for this module — declared INWARD here,
 * implemented in `infrastructure/providers`, consumed by this module's
 * repositories.
 *
 * ## Why this port exists at all
 *
 * Four fields on a staged row are `HIGHLY_SENSITIVE_FINANCIAL`: the statement
 * narrative, the merchant, the source's own transaction reference, and the
 * instrument mask the line named. The last two are the more serious: both are
 * another party's identifiers FOR this person, and holding either in
 * plaintext would put in one column exactly what
 * `modules/financial-accounts` bounds its mask column at eight bytes to keep
 * out.
 *
 * A staged row is not a lesser copy of a transaction. It carries the same
 * narrative, for the same person, on the same account, and it can sit in the
 * database for days between upload and review — so it gets the same treatment
 * `public.transactions` gets, and for the same reasons.
 *
 * This contract deliberately MIRRORS the ports of the same name in
 * `modules/financial-accounts`, `modules/transactions` and
 * `modules/financial-connections`. It is restated
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
 *   staged statement whose lines nobody can read back at commit.
 * - `authTag` — the AEAD authentication tag. Without it a modified ciphertext
 *   decrypts to garbage instead of failing, and a garbage narrative would be
 *   committed as somebody's transaction description.
 *
 * ## Why the context is bound as associated data
 *
 * `FieldEncryptionContext` names the row and the column a ciphertext belongs
 * to, and an implementation binds it — TOGETHER WITH the acting tenant and
 * user — as AEAD associated data. Five things are therefore authenticated:
 * tenant, user, table, row id, and field name. A `merchant`
 * value copied into a `description` column, or a row moved between two
 * subjects inside one tenant, fails authentication instead of decrypting into
 * a plausible wrong record.
 *
 * ## Deliberately absent
 *
 * No searchable, deterministic, or order-preserving encryption, and no
 * "encrypted index". A deterministic ciphertext over a short guessable input
 * — a merchant name from a short list, an amount to two decimals — is a
 * confirmation oracle, and this module has no need of one: duplicate
 * detection uses the keyed dedup fingerprint from `modules/transactions`, and
 * ordering uses the line number the file already supplies.
 */

import type { HsfField } from '../../domain/hsf-field.js';
import type { ImportsPrincipal } from '../principal.js';

/** The four HSF columns this module encrypts. Closed set. */
export const HSF_FIELD_NAMES = [
  'description',
  'merchant',
  'sourceReference',
  'instrumentMask',
] as const;
export type HsfFieldName = (typeof HSF_FIELD_NAMES)[number];

/**
 * Which row and which column a ciphertext belongs to. Bound as associated
 * data, with the principal, so a ciphertext cannot be moved between rows,
 * between columns, or between subjects.
 */
export interface FieldEncryptionContext {
  /** The table the value is stored in, e.g. 'statement_import_rows'. */
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
    principal: ImportsPrincipal,
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
    principal: ImportsPrincipal,
    encrypted: EncryptedField,
    context: FieldEncryptionContext,
  ): Promise<HsfField>;
}

/**
 * The single typed failure of the port. Never carries a plaintext fragment, a
 * key, or a nonce — this message ends up in a log, and the whole point of the
 * port is that the log is not where a line of somebody's bank statement lives.
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
