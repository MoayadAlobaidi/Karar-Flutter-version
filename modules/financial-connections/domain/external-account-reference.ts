/**
 * The external account reference — the one value in this module that must
 * never leave it, and the rules that decide what may become one.
 *
 * ## What it is
 *
 * A source's own OPAQUE name for one of the subject's accounts: whatever
 * token appears in the header of an uploaded statement, or would appear in an
 * API response if one existed. It exists for exactly one purpose — to
 * recognise "the same account from this source next time" — and it is stored
 * encrypted and compared through a keyed fingerprint, never read back to a
 * client.
 *
 * ## Why a length bound cannot be the guarantee
 *
 * `modules/financial-accounts` keeps a full account number unrepresentable by
 * bounding its mask column at eight ciphertext bytes: under a length-
 * preserving cipher that is eight characters, and no PAN or IBAN fits. That
 * argument is not available here, because an opaque source-side reference is
 * legitimately about as long as an IBAN. A byte bound cannot tell a
 * 24-character provider token from a 24-character IBAN, and a comment
 * claiming otherwise would be a guarantee that does not hold.
 *
 * So the guarantee is split, and both halves are real:
 *
 *   * **the SHAPE rule below**, applied in the domain before anything is
 *     encrypted, refuses the identifier shapes outright — an IBAN, a card
 *     number, a bank account number, a wallet phone number;
 *   * **the CHARSET and the bound**, which restrict a reference to an
 *     identifier token rather than prose, so the column cannot quietly become
 *     narrative storage (migration 0097 carries the matching 96-byte
 *     ciphertext bound, which 64 ASCII characters cannot exceed).
 *
 * The shape rule errs toward refusal on purpose. A legitimate opaque
 * reference that trips it costs the caller one hashing or prefixing step; a
 * real account number that slips past it costs the subject an identifier this
 * platform promised never to hold.
 *
 * ## Normalisation is minimal, and the omission is the interesting part
 *
 * `normalizeExternalReference` trims surrounding whitespace and uppercases
 * ASCII letters. That is all. It deliberately does NOT strip separators:
 * folding `1234-5678` and `12345678` together would make two references that
 * are merely SIMILAR compare as EXACTLY EQUAL — and an exact match is the one
 * thing this module is allowed to link automatically, without asking the
 * person. A normalisation rule that manufactures exactness is a rule that
 * auto-links on a guess, which is precisely the failure ADR-0028 makes the
 * probable-match path exist to prevent.
 *
 * The ruleset is named by the fingerprint version, so changing it is a
 * version bump and a fresh namespace rather than a silent redefinition.
 */

/**
 * What KIND of external reference a value is. It participates in the
 * fingerprint, so a future scheme cannot collide with this one. Closed set.
 */
export const EXTERNAL_REFERENCE_SCHEMES = ['SOURCE_ACCOUNT_REFERENCE'] as const;
export type ExternalReferenceScheme = (typeof EXTERNAL_REFERENCE_SCHEMES)[number];

export function isExternalReferenceScheme(value: string): value is ExternalReferenceScheme {
  return (EXTERNAL_REFERENCE_SCHEMES as readonly string[]).includes(value);
}

/**
 * 64 characters of the identifier charset. In UTF-8 that is at most 64 bytes,
 * comfortably inside migration 0097's 96-byte ciphertext bound — the two are
 * derived from one number rather than drifting apart.
 */
export const MAX_EXTERNAL_REFERENCE_LENGTH = 64;

/**
 * An identifier token, not prose: letters, digits, and the four separators
 * that appear in real opaque references. No spaces, no punctuation, no
 * non-ASCII. This is what stops a caller trying to be helpful from writing a
 * statement line, an account holder's name, or an explanation into a column
 * whose entire purpose is opacity.
 */
const IDENTIFIER_TOKEN = /^[A-Za-z0-9._:-]+$/;

/**
 * ISO 13616: two letters, two check digits, then 11 to 30 alphanumerics. An
 * IBAN names a real account at a real bank and is enough to initiate a
 * transfer in many schemes; it has no business being here under any framing.
 */
const IBAN_SHAPE = /^[A-Za-z]{2}[0-9]{2}[A-Za-z0-9]{11,30}$/;

/**
 * Eight or more consecutive digits, anywhere in the value.
 *
 * Eight is the shortest thing that must be excluded: an E.164 subscriber
 * number in this region. Everything longer that a source would use to name an
 * account — a domestic account number, a 13-to-19-digit PAN, a wallet
 * MSISDN — is caught by the same rule. An opaque reference that genuinely
 * needs eight consecutive digits is carrying a number rather than a token,
 * and this module does not hold numbers that identify accounts outside Karar.
 */
const LONG_DIGIT_RUN = /[0-9]{8,}/;

/** Why a candidate external reference was refused. Machine-readable. */
export type ExternalReferenceRefusal =
  | 'blank'
  | 'too_long'
  | 'not_an_identifier_token'
  | 'looks_like_an_iban'
  | 'looks_like_an_account_or_card_or_phone_number';

/**
 * The shape verdict for one candidate, computed on the value AS SUPPLIED —
 * before normalisation, because normalising first could only ever make a
 * rejected shape look acceptable.
 *
 * `null` means acceptable.
 */
export function checkExternalReferenceShape(value: string): ExternalReferenceRefusal | null {
  if (typeof value !== 'string' || value.trim() === '') return 'blank';
  const trimmed = value.trim();
  if (trimmed.length > MAX_EXTERNAL_REFERENCE_LENGTH) return 'too_long';
  if (!IDENTIFIER_TOKEN.test(trimmed)) return 'not_an_identifier_token';
  if (IBAN_SHAPE.test(trimmed)) return 'looks_like_an_iban';
  if (LONG_DIGIT_RUN.test(trimmed)) {
    return 'looks_like_an_account_or_card_or_phone_number';
  }
  return null;
}

/** True when a value may be stored as an external account reference. */
export function isStorableExternalReference(value: string): boolean {
  return checkExternalReferenceShape(value) === null;
}

/**
 * The reference as the fingerprint sees it: trimmed, ASCII-uppercased, and
 * otherwise untouched. See the header for why nothing else happens here.
 *
 * `toUpperCase` is safe under the identifier charset because the charset is
 * ASCII: there is no Turkish dotless i, no German sharp s, and no locale in
 * which the mapping differs, so the result is the same on every machine.
 */
export function normalizeExternalReference(value: string): string {
  return value.trim().toUpperCase();
}
