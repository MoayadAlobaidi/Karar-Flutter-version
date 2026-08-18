/**
 * LOCAL AND TEST keyed source-account fingerprint.
 *
 * **This is the LOCAL/TEST adapter.** It holds a root key in process memory;
 * production binds `SourceAccountFingerprintPort` to an adapter that resolves
 * the root key through the platform's key-management provider (ADR-0017),
 * with the same custody and rotation story as any other key. Everything else
 * here — the derivation, the canonical encoding, the version handling — IS
 * the production design, because those are what the unique constraint and the
 * auto-link decision depend on.
 *
 * ## The construction
 *
 *   subjectKey = HMAC-SHA256(rootKey, "karar/financial-connections/source-account/v1|tenant|user")
 *   value      = HMAC-SHA256(subjectKey, canonicalEncoding(input))
 *
 * Two derivations rather than one, for two different reasons:
 *
 *   1. KEYED, so the value cannot be recomputed by anyone holding only the
 *      column. A plain `sha256(accountReference)` is a confirmation oracle
 *      over an identifier that names a real account outside Karar: read the
 *      column, guess an account number in a known format, and get a
 *      definitive yes. The ciphertext column exists precisely so that reading
 *      the table reveals nothing, and an unkeyed digest hands it back in a
 *      form that survives encryption entirely.
 *   2. PER SUBJECT, so the SAME external account reference under two
 *      different people produces unrelated values. A single platform key
 *      would make this column a cross-subject join key inside a shared table:
 *      "these two subjects hold the same external account", derivable across
 *      a whole database without decrypting anything. That is a worse
 *      disclosure than any single row, and it is the property the tests
 *      assert directly — for two tenants AND for two members of one tenant,
 *      which is the case a tenant-only derivation would get wrong.
 *
 * ## The canonical encoding
 *
 * Fields are length-prefixed and joined with a separator, so no two different
 * field lists can encode identically. Plain concatenation is ambiguous —
 * `"ab" + "c"` and `"a" + "bc"` collide — and a collision here means two
 * different source accounts are treated as one, which is the account merge
 * this module exists to prevent.
 *
 * ## What may not enter the input
 *
 * Nothing derived from key material, ciphertext, a nonce or a row id
 * (packages/platform keys/custody.ts states the rule): a fresh nonce per
 * encryption means a ciphertext-derived value would change identity on every
 * write, and a row-id-derived one would make every row unique and the
 * constraint useless.
 *
 * And nothing about the CONNECTION. That absence is the mechanism, not an
 * oversight: ADR-0028's rule is that an exact match WITHIN ONE PRINCIPAL may
 * link automatically, so the value has to be comparable across that
 * principal's connections. Folding the connection in would make the same
 * source account, seen through a CSV connection and later through an API
 * connection, two different source accounts — and the redesign whose entire
 * purpose is to stop that from creating a second account would achieve
 * nothing.
 *
 * `canonicalEncoding` reads no clock, consults no timezone and calls no
 * locale-sensitive function, which is what makes the value reproducible on
 * any machine.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  SourceAccountFingerprintInput,
  SourceAccountFingerprintPort,
} from '../../application/ports/source-account-fingerprint.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import type { SourceAccountFingerprint } from '../../domain/account-source-link.js';

/**
 * The version this adapter mints, and the complete definition it names:
 *
 *   source-account/hmac-sha256/opaque-reference/v1
 *     = HMAC-SHA256(subjectKey, canonicalEncoding), hex, where
 *       canonicalEncoding is the length-prefixed, '|'-joined sequence of
 *       EXACTLY these two strings in this order:
 *         1. scheme
 *         2. normalizedReference — trimmed and ASCII-uppercased by
 *            `domain/external-account-reference.ts`, and nothing else, so a
 *            merely SIMILAR reference never compares as exactly equal
 *     and subjectKey = HMAC-SHA256(rootKey, SUBJECT_KEY_LABEL|tenant|user).
 *
 * Nothing else participates: not the connection, not the account, not
 * ciphertext, nonce or key material, not the row id, and no clock or timezone.
 *
 * The version names the WHOLE definition, including the normalisation
 * ruleset, so any change to it changes this string — which starts a fresh
 * namespace in the unique constraint rather than colliding with values
 * computed under the old rules. Reusing an identifier for a changed
 * definition is precisely the silent redefinition this versioning exists to
 * prevent, and a version string whose meaning depends on which commit
 * produced it is not a version.
 */
export const SOURCE_ACCOUNT_FINGERPRINT_VERSION =
  'source-account/hmac-sha256/opaque-reference/v1';

const SUBJECT_KEY_LABEL = 'karar/financial-connections/source-account/v1';
const ROOT_KEY_BYTES = 32;

/** Length-prefixed so no two different field lists can encode identically. */
function canonicalEncoding(input: SourceAccountFingerprintInput): string {
  const parts: readonly string[] = [input.scheme, input.normalizedReference];
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

export class LocalKeyedSourceAccountFingerprintProvider
  implements SourceAccountFingerprintPort
{
  readonly version = SOURCE_ACCOUNT_FINGERPRINT_VERSION;

  readonly #rootKey: Buffer;

  constructor(options?: { readonly rootKey?: Uint8Array }) {
    const key = options?.rootKey ?? randomBytes(ROOT_KEY_BYTES);
    if (key.length < ROOT_KEY_BYTES) {
      throw new Error(
        `the source-account fingerprint root key must be at least ${ROOT_KEY_BYTES} bytes; a ` +
          'short MAC key weakens every fingerprint derived from it, and these are the values ' +
          'that decide whether two rows describe one account',
      );
    }
    this.#rootKey = Buffer.from(key);
  }

  fingerprint(
    principal: ConnectionsPrincipal,
    input: SourceAccountFingerprintInput,
  ): Promise<SourceAccountFingerprint> {
    const subjectKey = createHmac('sha256', this.#rootKey)
      .update(`${SUBJECT_KEY_LABEL}|${principal.tenantId}|${principal.userId}`, 'utf8')
      .digest();
    const value = createHmac('sha256', subjectKey)
      .update(canonicalEncoding(input), 'utf8')
      .digest('hex');
    return Promise.resolve({ version: this.version, value });
  }
}

/**
 * Constant-time equality for two fingerprint values of the same version.
 *
 * Exposed because comparing these with `===` is a habit worth not forming:
 * the database does the comparison that matters, but any application-side
 * check should not be a timing side channel over another subject's data.
 */
export function sourceAccountFingerprintsEqual(
  left: SourceAccountFingerprint,
  right: SourceAccountFingerprint,
): boolean {
  if (left.version !== right.version) return false;
  const a = Buffer.from(left.value, 'utf8');
  const b = Buffer.from(right.value, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
