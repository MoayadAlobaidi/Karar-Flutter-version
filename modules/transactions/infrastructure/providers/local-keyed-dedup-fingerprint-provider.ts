/**
 * LOCAL AND TEST keyed dedup fingerprint.
 *
 * **This is the LOCAL/TEST adapter.** It holds a root key in process memory;
 * production binds `DedupFingerprintPort` to an adapter that resolves the
 * root key through the platform's key-management provider (ADR-0017), with
 * the same custody and rotation story as any other key. Everything else here
 * — the derivation, the canonical encoding, the version handling — IS the
 * production design, because those are what the unique constraint depends on.
 *
 * ## The construction
 *
 *   subjectKey = HMAC-SHA256(rootKey, "karar/transactions/dedup/v1|tenant|user")
 *   value      = HMAC-SHA256(subjectKey, canonicalEncoding(input))
 *
 * Two derivations rather than one, for two different reasons:
 *
 *   1. KEYED, so the value cannot be recomputed by anyone holding only the
 *      column. A plain `sha256(date|amount|merchant)` is a confirmation
 *      oracle over a tiny, guessable input space: read the column, guess a
 *      merchant and an amount, and get a definitive yes — handing back the
 *      behaviour that the ciphertext columns exist to protect.
 *   2. PER SUBJECT, so identical purchases by two different people produce
 *      unrelated values. A single platform key would make the column a
 *      cross-subject join key inside a shared table: "these two accounts
 *      bought the same thing at the same moment", derivable without
 *      decrypting anything.
 *
 * ## The canonical encoding
 *
 * Fields are length-prefixed and joined with a separator that cannot appear
 * unescaped in a field. Plain concatenation is ambiguous — `"ab" + "c"` and
 * `"a" + "bc"` collide — and a collision here means one of two genuinely
 * different transactions silently refuses to commit.
 *
 * The booking instant is truncated to a UTC calendar day. A statement states
 * a date, not a timestamp, so keeping the time component would make the same
 * row fingerprint differently depending on what the parser happened to put in
 * it. The truncation rule is part of the VERSION: change it and the version
 * moves, so old values are not silently reinterpreted.
 *
 * ## What may not enter the input
 *
 * Nothing derived from key material, ciphertext, or a row id. Ciphertext
 * changes on every rotation and every fresh nonce, so a fingerprint derived
 * from it would silently change identity on rotation; a row id would make
 * every row unique and the constraint useless (packages/platform
 * keys/custody.ts states the rule).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  DedupFingerprint,
  DedupFingerprintPort,
  FingerprintInput,
} from '../../application/ports/dedup-fingerprint.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';

/**
 * The version this adapter mints. It names the whole definition — which
 * fields participate, how they are encoded, and how the date is truncated.
 * Changing any of those changes this string, which starts a fresh namespace
 * in the unique constraint rather than colliding with the old one.
 */
export const DEDUP_FINGERPRINT_VERSION = 'dedup/hmac-sha256/utc-day/v1';

const SUBJECT_KEY_LABEL = 'karar/transactions/dedup/v1';
const ROOT_KEY_BYTES = 32;

/** Length-prefixed so no two different field lists can encode identically. */
function canonicalEncoding(input: FingerprintInput): string {
  const utcDay = new Date(
    Date.UTC(
      input.bookingDate.getUTCFullYear(),
      input.bookingDate.getUTCMonth(),
      input.bookingDate.getUTCDate(),
    ),
  )
    .toISOString()
    .slice(0, 10);
  const parts: readonly string[] = [
    input.accountRef.referenceType,
    input.accountRef.accountId,
    utcDay,
    input.amountMinorUnits.toString(),
    input.currencyCode,
    input.normalizedNarrative,
    input.occurrenceOrdinal.toString(),
  ];
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

export class LocalKeyedDedupFingerprintProvider implements DedupFingerprintPort {
  readonly version = DEDUP_FINGERPRINT_VERSION;

  readonly #rootKey: Buffer;

  constructor(options?: { readonly rootKey?: Uint8Array }) {
    const key = options?.rootKey ?? randomBytes(ROOT_KEY_BYTES);
    if (key.length < ROOT_KEY_BYTES) {
      throw new Error(
        `the dedup root key must be at least ${ROOT_KEY_BYTES} bytes; a short MAC key weakens every fingerprint derived from it`,
      );
    }
    this.#rootKey = Buffer.from(key);
  }

  fingerprint(
    principal: TransactionsPrincipal,
    input: FingerprintInput,
  ): Promise<DedupFingerprint> {
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
 * Exposed because comparing digests with `===` is a habit worth not forming:
 * the database does the comparison that matters, but any application-side
 * check should not be a timing side channel over another subject's data.
 */
export function fingerprintsEqual(left: DedupFingerprint, right: DedupFingerprint): boolean {
  if (left.version !== right.version) return false;
  const a = Buffer.from(left.value, 'utf8');
  const b = Buffer.from(right.value, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
