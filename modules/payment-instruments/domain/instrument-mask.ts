/**
 * The instrument mask — the ONE value in this module that could be a payment
 * credential if the rules below were absent, and the rules that keep it from
 * being one.
 *
 * ## What it is
 *
 * The few characters a person recognises their own card by: the last digits,
 * usually with masking characters in front of them. Nothing else. It exists
 * so that two virtual cards on one wallet can be told apart, and it is stored
 * encrypted like every other `HIGHLY_SENSITIVE_FINANCIAL` field in this
 * platform.
 *
 * ## What it must NEVER be
 *
 * **A PAN.** A card number is the single most damaging value a personal
 * finance product could hold, and a column called `mask` is exactly where one
 * arrives — supplied by a caller trying to be helpful, by an importer that
 * did not truncate, or by a test fixture copied from real data.
 *
 * **A CVV, an expiry, or a network token.** None of these has a column
 * anywhere in this module (migration 0098), and none may be smuggled into
 * this one: a "mask" of `123` that is really a CVV would be indistinguishable
 * from a legitimate three-digit tail by shape alone, so the shape rule below
 * is not what stops it — the ABSENCE of any field named for one, and the
 * refusal of any value that is not mask-shaped, are.
 *
 * ## Two independent mechanisms, and why neither alone would do
 *
 * 1. **The SHAPE rule here**, applied in the domain before anything is
 *    encrypted. It reuses the reasoning
 *    `modules/financial-connections/domain/external-account-reference.ts`
 *    established for the opaque source reference — reject long digit runs and
 *    identifier shapes at the door, so a real identifier never reaches a key.
 *    Here it can be stricter, because unlike an opaque provider token a mask
 *    has no legitimate long form: the value must MATCH a mask shape, rather
 *    than merely fail to look like something forbidden.
 *
 * 2. **The eight-byte ciphertext bound in migration 0098.** AES-256-GCM
 *    preserves length, so eight ciphertext bytes is eight plaintext
 *    characters, and no 13-to-19-digit PAN, no IBAN and no MSISDN fits. This
 *    is the argument `modules/financial-accounts` makes for its account mask,
 *    and it holds here for the same reason: the column is too small to
 *    contain the thing it must never contain.
 *
 * The first mechanism refuses the value; the second makes the refusal
 * structural even for a writer that skipped the first. `MAX_INSTRUMENT_MASK_
 * LENGTH` and the migration's bound are the same number said twice, and a
 * test asserts they agree.
 *
 * ## The refusal is deliberately eager
 *
 * A legitimate mask that trips a rule costs the caller one edit. A real card
 * number that slips past costs the subject the value this platform promised
 * never to hold, and the cost is not recoverable by deleting the row later:
 * it was in a log, a backup, and a replica by then.
 *
 * **No message in this file quotes the offending value.** A PAN that was
 * rejected is still a PAN, and an error string that echoes the input is the
 * shortest path from a refusal to a plaintext log line.
 */

/**
 * Longest plaintext a mask may be, IN BYTES — the same eight as migration
 * 0098's `payment_instruments_mask_bound_check`.
 *
 * Bytes, not characters. AES-256-GCM preserves byte length, and the column
 * bounds `octet_length`, so a character bound is only the same statement while
 * every accepted character is one byte. `MASK_SHAPE` permits `•` (U+2022,
 * three bytes), and `••••1234` is eight characters and SIXTEEN bytes: the
 * domain accepted it and the write then died on the CHECK as an unhandled
 * constraint violation instead of a typed refusal. Measured before the fix:
 * `•••12` 11 bytes, `##••1234` 12, `••••1234` 16 — all shape-legal, all over
 * the column bound. The two bounds are now one statement said twice for real,
 * and a test asserts they agree on multi-byte input rather than on ASCII,
 * where they cannot disagree.
 */
export const MAX_INSTRUMENT_MASK_BYTES = 8;

/**
 * Kept as the old name for callers that read it. It is the same number, and
 * it is a BYTE count.
 */
export const MAX_INSTRUMENT_MASK_LENGTH = MAX_INSTRUMENT_MASK_BYTES;

/**
 * A mask is at most four digits, optionally preceded by masking characters.
 *
 * Deliberately strict, and identical in intent to the account mask shape in
 * `modules/financial-accounts`: the point is not to accept every plausible
 * masking convention but to make it impossible for a card number, an account
 * number or an IBAN to be stored under a field named for a fragment of one.
 * The two-digit minimum exists because a single digit identifies nothing and
 * would only ever be a truncation accident.
 */
const MASK_SHAPE = /^[*xX#•]{0,4}[0-9]{2,4}$/;

/**
 * Twelve to nineteen consecutive digits — the length range of every card
 * number in use. Checked BEFORE the mask shape so the refusal can say what it
 * recognised: "that is a card number" and "that is not a mask" send a caller
 * to two different remedies, and the first is the one that must be logged as
 * a near miss rather than a typo.
 */
const CARD_NUMBER_SHAPE = /[0-9]{12,19}/;

/**
 * Eight or more consecutive digits, anywhere in the value.
 *
 * Eight is the shortest thing that must be excluded: an E.164 subscriber
 * number in this region. Everything longer that could identify an instrument
 * or an account outside Karar — a domestic account number, a PAN, a wallet
 * MSISDN — is caught by the same rule. The bound above already makes eight
 * digits unrepresentable, and the rule is written anyway so the REFUSAL names
 * the real problem instead of arriving as a length complaint.
 */
const LONG_DIGIT_RUN = /[0-9]{8,}/;

/** Why a candidate mask was refused. Machine-readable; never the value. */
export type InstrumentMaskRefusal =
  | 'blank'
  | 'too_long'
  | 'looks_like_a_card_number'
  | 'looks_like_an_account_or_phone_number'
  | 'not_a_mask';

/**
 * The shape verdict for one candidate, computed on the value AS SUPPLIED
 * apart from surrounding whitespace — never on a normalised form, because
 * normalising first could only ever make a rejected shape look acceptable.
 *
 * `null` means acceptable. The order of the checks is the order of severity,
 * so the answer names the worst thing recognised rather than the first thing
 * noticed.
 */
export function checkInstrumentMaskShape(value: string): InstrumentMaskRefusal | null {
  if (typeof value !== 'string' || value.trim() === '') return 'blank';
  const trimmed = value.trim();
  // Severity first: a 16-digit input is a card number that happens to be too
  // long, and reporting it as 'too_long' would file a leaked PAN as a
  // formatting mistake.
  if (CARD_NUMBER_SHAPE.test(trimmed)) return 'looks_like_a_card_number';
  if (LONG_DIGIT_RUN.test(trimmed)) return 'looks_like_an_account_or_phone_number';
  // Measured in bytes, as the column measures it.
  if (utf8Bytes(trimmed) > MAX_INSTRUMENT_MASK_BYTES) return 'too_long';
  if (!MASK_SHAPE.test(trimmed)) return 'not_a_mask';
  return null;
}

/** UTF-8 byte length, which is what the column's `octet_length` bound counts. */
function utf8Bytes(value: string): number {
  let total = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    total += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return total;
}

/** True when a value may be stored as an instrument mask. */
export function isInstrumentMask(value: string): boolean {
  return checkInstrumentMaskShape(value) === null;
}

/**
 * The mask as it will be stored: surrounding whitespace removed and nothing
 * else. No separator stripping, no case folding, no substitution of one
 * masking character for another — the person supplied a shape they recognise,
 * and rewriting it would hand them back something they do not.
 */
export function normalizeInstrumentMask(value: string): string {
  return value.trim();
}

/**
 * One sentence per refusal, chosen by KIND and never composed from the input.
 * Exported so the application layer and any future presentation layer say the
 * same thing, and so the wording cannot drift into quoting the value.
 */
export function instrumentMaskRefusalMessage(refusal: InstrumentMaskRefusal): string {
  switch (refusal) {
    case 'blank':
      return (
        'an instrument mask is required and may not be blank: it is the only thing that lets a ' +
        'person tell two cards on one account apart, and an absent one would be filled in by ' +
        'whoever needed a label first'
      );
    case 'too_long':
      return (
        `an instrument mask is at most ${MAX_INSTRUMENT_MASK_LENGTH} characters — four masking ` +
        'characters and four digits. Longer input is refused, never truncated: truncating would ' +
        'store part of whatever was supplied under a field that promises to hold only a fragment ' +
        'the person already sees on their own card'
      );
    case 'looks_like_a_card_number':
      return (
        'that is a card number, not a mask. No full card number is stored anywhere in this ' +
        'platform, in any column, encrypted or otherwise — supply only the last two to four ' +
        'digits, with or without masking characters in front of them'
      );
    case 'looks_like_an_account_or_phone_number':
      return (
        'that value carries a run of eight or more digits, which is long enough to be an account ' +
        'number, a card number or a phone number. None of those is stored here; supply only the ' +
        'last two to four digits of the instrument'
      );
    case 'not_a_mask':
      return (
        'that is not a mask. A mask is two to four digits, optionally preceded by up to four ' +
        'masking characters — nothing else may be stored in this field, because a field that ' +
        'accepts free text is a field that will eventually hold a card number'
      );
  }
}
