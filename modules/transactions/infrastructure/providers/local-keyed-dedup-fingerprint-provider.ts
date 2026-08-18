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
 * The booking day enters as a `CalendarDay`, rendered as its own
 * `YYYY-MM-DD` string. Nothing is truncated, because a calendar day has no
 * time to truncate — which is the point. The previous definition took a
 * booking INSTANT and truncated it to a UTC day, and that is a rule with a
 * timezone hidden inside it: a row parsed as 2026-08-12T00:00 local in Doha
 * truncates to 2026-08-11 in UTC, so the same statement line could fingerprint
 * two different ways depending on where and how it was parsed. A calendar day
 * has nothing to shift by.
 *
 * ## What may not enter the input
 *
 * Nothing derived from key material, ciphertext, or a row id. Ciphertext
 * changes on every rotation and every fresh nonce, so a fingerprint derived
 * from it would silently change identity on rotation; a row id would make
 * every row unique and the constraint useless (packages/platform
 * keys/custody.ts states the rule).
 *
 * Nothing about OCCURRENCE. The digest answers "is this the same content?";
 * how many times that content occurred is
 * `transactions.occurrence_ordinal`, a separate column in the unique key
 * (migration 0090). Folding the ordinal in would give the second identical
 * coffee a second, unrelated content identity, after which "have I seen this
 * content before?" could not be asked without guessing every ordinal it might
 * have been filed under.
 *
 * Nothing about the INSTANT a movement happened — neither `eventOccurredAt`
 * nor `sourceTimezone`. Those say when something happened; content identity
 * says what it is. A source that exports a time on Monday and omits it on
 * Tuesday is describing the same two movements, and a digest that noticed the
 * difference would import the second copy as a new transaction.
 *
 * And no timezone at all: not the server's, not the host's, not one inferred
 * from a country. `canonicalEncoding` below never reads a clock and never
 * consults a zone, which is what makes the digest reproducible on any
 * machine.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  DedupFingerprint,
  DedupFingerprintPort,
  FingerprintInput,
} from '../../application/ports/dedup-fingerprint.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';

/**
 * The version this adapter mints, and the complete definition it names:
 *
 *   dedup/hmac-sha256/calendar-day/v3
 *     = HMAC-SHA256(subjectKey, canonicalEncoding), hex, where
 *       canonicalEncoding is the length-prefixed, '|'-joined sequence of
 *       EXACTLY these six strings in this order:
 *         1. accountRef.referenceType
 *         2. accountRef.accountId
 *         3. bookingDate as YYYY-MM-DD (a CalendarDay; no timezone involved)
 *         4. amountMinorUnits, signed, base 10
 *         5. currencyCode (ISO 4217 alphabetic)
 *         6. normalizedNarrative, as the caller's normalisation ruleset
 *            produced it
 *     and subjectKey = HMAC-SHA256(rootKey, SUBJECT_KEY_LABEL|tenant|user).
 *
 * Nothing else participates: not the occurrence ordinal, not
 * `eventOccurredAt` or `sourceTimezone`, not ciphertext, nonce or key
 * material, not the row id, and no server or device timezone.
 *
 * ## Why the identifier moved, twice
 *
 * The version names the WHOLE definition, so any change to it changes this
 * string — which starts a fresh namespace in the unique constraint rather
 * than colliding with values computed under the old rules.
 *
 * v1 folded the occurrence ordinal into the digest; v2 did not, and the
 * ordinal became a column of its own. v2 took a booking INSTANT and truncated
 * it to a UTC day; v3 takes a `CalendarDay` and uses it as it stands, because
 * a statement states a day and not a moment (ADR-0027). Both are changes to
 * what the input IS, and each took a new identifier — even though no value
 * under either predecessor ever reached a durable row outside a local test.
 * Reusing an identifier for a changed definition is precisely the silent
 * redefinition this versioning exists to prevent, and a version string whose
 * meaning depends on which commit produced it is not a version.
 *
 * The path segment says which rule the day follows, so the identifier is
 * readable at the point it matters: `.../utc-day/v2` truncated an instant in
 * UTC, `.../calendar-day/v3` has no timezone in it at all.
 */
export const DEDUP_FINGERPRINT_VERSION = 'dedup/hmac-sha256/calendar-day/v3';

const SUBJECT_KEY_LABEL = 'karar/transactions/dedup/v1';
const ROOT_KEY_BYTES = 32;

/**
 * Length-prefixed so no two different field lists can encode identically.
 *
 * Note what this function does NOT contain: no `Date`, no `now()`, no
 * `Intl`, no timezone, and no field beyond the six the version names. That
 * absence is the reproducibility guarantee — the same statement row digests
 * identically on a server in Doha and a laptop in Toronto — and the
 * ports-for-ingestion suite asserts it against this source text, because no
 * runtime call can demonstrate that a field is missing.
 */
function canonicalEncoding(input: FingerprintInput): string {
  const parts: readonly string[] = [
    input.accountRef.referenceType,
    input.accountRef.accountId,
    input.bookingDate.toString(),
    input.amountMinorUnits.toString(),
    input.currencyCode,
    input.normalizedNarrative,
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
