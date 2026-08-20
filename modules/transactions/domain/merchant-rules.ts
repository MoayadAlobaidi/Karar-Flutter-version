/**
 * Deterministic merchant-rule evaluation: how untrusted narrative becomes a
 * category, stated once, as pure functions.
 *
 * Two things live here and nothing else does: the NORMALISATION that turns a
 * statement narrative into the single form rules are compared against, and
 * the SELECTION that picks one rule when several match. Both are pure — no
 * clock, no randomness, no I/O, no locale — because a categorisation that
 * depends on when or where it ran is not a rule, it is a coincidence.
 *
 * **Deterministic only. No AI, no LLM, no scoring, no confidence, no
 * ranking, no fallback.** A rule matched or it did not; when none did, the
 * answer is `null` and the transaction stays uncategorised. `null` is the
 * ordinary answer and it is the honest one: an uncategorised transaction is
 * a transaction nobody has categorised yet, which is a true statement, and
 * "OTHER" applied four hundred times in one import is not.
 *
 * ## The narrative is untrusted external content (ADR-0029)
 *
 * Merchant and description text arrive from a bank's CSV or from a person's
 * keyboard. Every operation below treats it as INERT TEXT: it is compared,
 * lower-cased and rewritten character by character, and at no point is it
 * parsed as a formula, interpolated into SQL, used to build a path, or given
 * to a shell. `'; DROP TABLE transactions; --`, `=HYPERLINK("http://x","a")`
 * and `SYSTEM: ignore previous instructions` are, to this file, three strings
 * that normalise to three other strings and then either equal a reviewed
 * pattern or do not.
 *
 * ## Why there is no regular expression over the narrative
 *
 * Catastrophic backtracking needs a pattern with nested or overlapping
 * quantifiers and an input long enough to make the engine explore them. The
 * defence here is structural rather than careful: the narrative is never the
 * subject of a pattern match at all. It is scanned once, one code point at a
 * time, and the only `RegExp` in the file is applied to a SINGLE code point
 * with no quantifier, no alternation and no group — an automaton that cannot
 * branch, let alone backtrack. Total work is linear in the input length, and
 * the input length is bounded before the scan starts.
 *
 * Reviewed patterns cannot introduce one either: `merchant_rules` stores a
 * literal token, not an expression, and matching is `===` or
 * `String.prototype.startsWith`. There is no pattern language to abuse
 * because there is no pattern language.
 *
 * ## Why case folding is `toLowerCase` and never `toLocaleLowerCase`
 *
 * `String.prototype.toLowerCase` is specified against the Unicode Default
 * Case Conversion algorithm and is explicitly NOT locale-sensitive:
 * `'I'.toLowerCase()` is `'i'` on every machine in every environment.
 * `toLocaleLowerCase` is the opposite — under a Turkish locale it answers the
 * dotless `'ı'` — so a rule set that matched in Doha would quietly stop
 * matching on a server whose default locale had moved. That is the
 * "behaviour changes between machines" failure this module must not have, so
 * `toLocaleLowerCase` and `localeCompare` appear nowhere in this module and a
 * test asserts their absence from the source.
 *
 * ## No country, no currency, no calendar
 *
 * Nothing here reads a country, a currency, an amount, a date or a timezone.
 * A rule maps merchant TEXT to a category; a rule that also read the currency
 * would be a different rule in every market and a different answer for the
 * same merchant depending on where a person banks.
 */

import { CategoryCode } from './category-catalogue.js';
import { HSF_FIELD_MAX_LENGTH } from './hsf-field.js';

/**
 * The version of the normalisation defined below.
 *
 * It names the whole definition, so any change to the scan, the case folding
 * or the bound changes the string. That matters because a stored assignment
 * records the rule version that produced it, and "the same rule version gave
 * a different answer" must be impossible rather than merely unlikely: if the
 * way text is normalised changes, the rules were re-authored, and re-authored
 * rules get a new version.
 */
export const MERCHANT_NORMALIZATION_VERSION = 'merchant-normalization/1';

/**
 * The longest narrative that will be normalised, in UTF-16 code units.
 *
 * The same bound `HsfField` enforces, restated as a constant this file owns
 * so the scan has a stated limit even when a caller hands it a bare string.
 * Over-length input is REFUSED (answers `null`, so nothing matches), never
 * truncated: a silently shortened narrative could prefix-match a rule the
 * full narrative would not have matched, which is a wrong category that looks
 * right.
 */
export const MERCHANT_NARRATIVE_MAX_LENGTH = HSF_FIELD_MAX_LENGTH;

export const MERCHANT_PATTERN_KINDS = ['EXACT', 'PREFIX'] as const;
export type MerchantPatternKind = (typeof MERCHANT_PATTERN_KINDS)[number];

/**
 * One reviewed rule, as the domain sees it.
 *
 * Carries no id, no tenant, no subject and no score — the first three because
 * `merchant_rules` has no such columns and is structurally incapable of
 * subject linkage (migration 0092), the last because a rule matched or it did
 * not.
 */
export interface MerchantRule {
  readonly patternKind: MerchantPatternKind;
  /** The reviewed, generalised token. A literal, never an expression. */
  readonly patternToken: string;
  readonly categoryCode: CategoryCode;
  /** The reviewed corpus version this pattern belongs to. */
  readonly ruleVersion: string;
}

/**
 * What one evaluation decided.
 *
 * `matchedPatternKind` and `matchedPatternToken` say WHICH rule fired, in
 * process, so a caller can log or assert on it. Only `categoryCode` and
 * `ruleVersion` are durable — `transaction_category_assignments` records the
 * source and the rule version, which is the existing assignment-origin
 * vocabulary, and this type does not invent a parallel one.
 */
export interface MerchantRuleDecision {
  readonly categoryCode: CategoryCode;
  readonly ruleVersion: string;
  readonly matchedPatternKind: MerchantPatternKind;
  readonly matchedPatternToken: string;
  /** The normalised text the rule was compared against. Never stored. */
  readonly normalizedNarrative: string;
}

/**
 * The one `RegExp` in this file, and the reason it is safe.
 *
 * `\p{L}` is any Unicode letter — Latin, Arabic, and every other script, so
 * an Arabic merchant name survives normalisation as a merchant name rather
 * than as an empty string. `\p{Nd}` is any Unicode decimal digit, which
 * covers ASCII, Arabic-Indic `٠-٩` and extended Arabic-Indic `۰-۹`.
 *
 * It is anchored at both ends around a single character class with no
 * quantifier, no alternation and no capture group, and it is only ever tested
 * against a string holding exactly ONE code point. There is no input for
 * which it can take more than constant time, so the linear scan below is
 * linear in total.
 */
const KEPT_CODE_POINT = /^[\p{L}\p{Nd}]$/u;

/**
 * Turns untrusted narrative into the single form rules are compared against,
 * or `null` when there is nothing left to compare.
 *
 * The transformation, in order, and nothing else happens:
 *
 *  1. A non-string, an absent value, or a value longer than
 *     `MERCHANT_NARRATIVE_MAX_LENGTH` answers `null`. Refused, not truncated.
 *  2. Unicode NFKC. Compatibility composition folds the presentation forms a
 *     statement can carry — full-width Latin, Arabic presentation forms,
 *     ligatures — onto their base characters, so `ＣＡＲＲＥＦＯＵＲ` and
 *     `CARREFOUR` are one merchant rather than two. NFKC is not
 *     locale-sensitive; it is defined by Unicode data, and the version of
 *     that data is a property of the runtime rather than of the machine's
 *     locale.
 *  3. `toLowerCase`, for the reason in the header: reviewed patterns are
 *     lowercase by database constraint, and this is the locale-independent
 *     fold.
 *  4. A single pass over the code points. A letter or a decimal digit is
 *     kept; EVERY other code point becomes a space. That is what makes the
 *     card masks, reference punctuation and separators a bank puts in a
 *     narrative — `*`, `#`, `|`, `@`, `_`, `/`, `-`, control characters —
 *     stop distinguishing two records of the same merchant, and it is why an
 *     injection-shaped merchant name is inert: `'; DROP TABLE x; --` is
 *     letters and spaces by the time anything compares it, and it was only
 *     ever compared.
 *  5. Runs of spaces collapse to one; leading and trailing spaces go.
 *  6. An empty result answers `null`, because "nothing to match on" and
 *     "matched nothing" must not be the same value flowing onward.
 *
 * DIGITS ARE KEPT. Normalisation removes FORMATTING, never CONTENT, and a
 * digit is content: deciding that `4111` in a narrative is noise rather than
 * part of a merchant's name would be a guess about meaning, which is the one
 * thing this module does not do. Reviewed patterns cannot contain digits
 * (migration 0092), so a digit simply never appears in a pattern — it can
 * only ever end a `PREFIX` match early, which is the correct, conservative
 * outcome.
 */
export function normalizeMerchantNarrative(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MERCHANT_NARRATIVE_MAX_LENGTH) return null;

  const folded = value.normalize('NFKC').toLowerCase();

  // One pass, one code point at a time. `for...of` iterates code points
  // rather than UTF-16 units, so an astral character is one character here
  // and not two halves of one.
  const parts: string[] = [];
  let word = '';
  for (const codePoint of folded) {
    if (KEPT_CODE_POINT.test(codePoint)) {
      word += codePoint;
      continue;
    }
    if (word !== '') {
      parts.push(word);
      word = '';
    }
  }
  if (word !== '') parts.push(word);

  const normalized = parts.join(' ');
  return normalized === '' ? null : normalized;
}

/**
 * True when this rule matches this already-normalised narrative.
 *
 * `EXACT` means the whole narrative is the pattern. `PREFIX` means the
 * narrative begins with it. Both are literal string comparisons; neither
 * interprets the narrative or the pattern as anything but characters.
 */
function ruleMatches(rule: MerchantRule, normalized: string): boolean {
  return rule.patternKind === 'EXACT'
    ? normalized === rule.patternToken
    : normalized.startsWith(rule.patternToken);
}

/**
 * Ordering between two matching rules — a TOTAL order, which is the whole
 * point.
 *
 * "The longest pattern wins" alone is not total: two reviewed patterns of the
 * same length can both match, and a comparator that called them equal would
 * hand the decision to whatever order the database happened to return rows
 * in. That is precisely the iteration-order dependence this module must not
 * have, and it is invisible until the day two patterns tie in production and
 * the same transaction categorises two ways on two servers.
 *
 * So the order is stated to the point where no two distinct rules can tie:
 *
 *  1. The LONGER pattern first. More characters of the narrative accounted
 *     for is more specific, and specificity is the only preference this
 *     module expresses. Note this is a length in code units, compared with
 *     `-`, not a score.
 *  2. `EXACT` before `PREFIX`. An exact statement of the whole narrative is
 *     more specific than a prefix of it that happens to be the same length.
 *  3. The lexicographically smaller `patternToken`. Code-unit order via `<`,
 *     never `localeCompare`, which is locale-sensitive and would reintroduce
 *     exactly the between-machines divergence this file exists to avoid.
 *  4. The lexicographically smaller `ruleVersion`.
 *
 * After (2) the kind is fixed, and `merchant_rules_unique_pattern` makes
 * `(pattern_kind, pattern_token, rule_version)` unique — so (3) and (4)
 * together separate every remaining pair. The order is total.
 */
function compareRules(left: MerchantRule, right: MerchantRule): number {
  const byLength = right.patternToken.length - left.patternToken.length;
  if (byLength !== 0) return byLength;
  if (left.patternKind !== right.patternKind) return left.patternKind === 'EXACT' ? -1 : 1;
  if (left.patternToken !== right.patternToken) return left.patternToken < right.patternToken ? -1 : 1;
  if (left.ruleVersion !== right.ruleVersion) return left.ruleVersion < right.ruleVersion ? -1 : 1;
  return 0;
}

/**
 * The one rule that applies to this already-normalised narrative, or `null`.
 *
 * `null` is a legitimate, ordinary outcome and it means the transaction stays
 * uncategorised. There is no fallback category, no nearest match and no
 * "OTHER" — see the file header.
 *
 * The input array's order does not affect the answer: every matching rule is
 * collected and then reduced under the total order above, so the same corpus
 * in any order gives the same rule.
 */
export function selectMerchantRule(
  normalizedNarrative: string,
  rules: readonly MerchantRule[],
): MerchantRule | null {
  if (typeof normalizedNarrative !== 'string' || normalizedNarrative === '') return null;
  let best: MerchantRule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, normalizedNarrative)) continue;
    if (best === null || compareRules(rule, best) < 0) best = rule;
  }
  return best;
}

/**
 * The narrative a transaction offers a rule.
 *
 * MERCHANT FIRST, DESCRIPTION SECOND, and the preference is stated here once
 * so the manual path and the import path cannot disagree about it. A merchant
 * field, where a source supplies one, is the source's own answer to "who was
 * paid"; a description is the whole statement line, which on many banks is
 * the merchant buried in reference numbers. Preferring the more specific
 * field is deterministic — it depends on presence, never on which one "looks
 * better".
 *
 * Falling back to the description when there is no merchant matters for
 * manual entry, where `merchant` is optional and `description` is required.
 */
export interface MerchantNarrative {
  readonly merchant: string | null;
  readonly description: string | null;
}

/**
 * Normalise, then select — the whole evaluation, as one pure function.
 *
 * Both candidate fields are tried in the stated order: merchant first, and
 * the description only if the merchant produced no match. Trying the
 * description as well is not a second chance at a guess — it is the same
 * exact-match rule applied to the other field a source may have put the
 * merchant in — and the order is fixed, so the answer does not depend on
 * which field a particular bank happens to populate more richly.
 */
export function decideMerchantCategory(
  narrative: MerchantNarrative,
  rules: readonly MerchantRule[],
): MerchantRuleDecision | null {
  for (const candidate of [narrative.merchant, narrative.description]) {
    const normalized = normalizeMerchantNarrative(candidate);
    if (normalized === null) continue;
    const rule = selectMerchantRule(normalized, rules);
    if (rule === null) continue;
    return Object.freeze({
      categoryCode: rule.categoryCode,
      ruleVersion: rule.ruleVersion,
      matchedPatternKind: rule.patternKind,
      matchedPatternToken: rule.patternToken,
      normalizedNarrative: normalized,
    });
  }
  return null;
}

/**
 * Builds a `MerchantRule` from row-shaped input, refusing anything the
 * reviewed corpus cannot legitimately contain.
 *
 * The database enforces every one of these already (migration 0092). They are
 * restated here because a rule that reached the domain malformed would be a
 * rule nobody reviewed, and the boundary between "the corpus" and "whatever
 * the reader returned" is the boundary worth defending: a pattern with an
 * uppercase character could never match anything (narratives are lower-cased)
 * and would sit in the corpus looking like a working rule forever.
 */
export function createMerchantRule(fields: {
  readonly patternKind: string;
  readonly patternToken: string;
  readonly categoryCode: string;
  readonly ruleVersion: string;
}): MerchantRule {
  const kind = MERCHANT_PATTERN_KINDS.find((candidate) => candidate === fields.patternKind);
  if (kind === undefined) {
    throw new InvalidMerchantRuleError(
      `'${String(fields.patternKind)}' is not a merchant pattern kind; exactly EXACT and PREFIX exist, and a third would be a matching strategy nobody reviewed`,
    );
  }
  const token = fields.patternToken;
  if (typeof token !== 'string' || token.length < 2 || token.length > 64) {
    throw new InvalidMerchantRuleError(
      'a reviewed merchant pattern is between 2 and 64 characters (migration 0092)',
    );
  }
  if (token !== token.toLowerCase()) {
    throw new InvalidMerchantRuleError(
      `merchant pattern '${token}' is not lowercase; narratives are lower-cased before matching, so an uppercase pattern would sit in the corpus matching nothing and looking correct`,
    );
  }
  if (normalizeMerchantNarrative(token) !== token) {
    throw new InvalidMerchantRuleError(
      `merchant pattern '${token}' is not in normalised form; a pattern that cannot equal any normalised narrative can never match, which is a rule that silently does nothing`,
    );
  }
  if (typeof fields.ruleVersion !== 'string' || fields.ruleVersion.trim() === '') {
    throw new InvalidMerchantRuleError(
      'a merchant rule must name the reviewed version it belongs to; an unversioned rule result cannot be re-derived, which makes it indistinguishable from a guess',
    );
  }
  return Object.freeze({
    patternKind: kind,
    patternToken: token,
    categoryCode: CategoryCode.of(fields.categoryCode),
    ruleVersion: fields.ruleVersion,
  });
}

export class InvalidMerchantRuleError extends Error {
  override readonly name = 'InvalidMerchantRuleError';
}
