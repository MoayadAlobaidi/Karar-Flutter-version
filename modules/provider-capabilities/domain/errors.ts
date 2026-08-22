/**
 * Profile rule violations, as values.
 *
 * These are EXPECTED outcomes of validating authored configuration, not
 * defects: a reviewer who wrote `GRANTED` without recording the letter that
 * granted it, or who listed wallet kinds on a profile that describes no
 * wallets. Every kind is machine-readable so a review tool can render the
 * remedy rather than re-derive meaning from a message string
 * (`packages/capability-registry`'s `RegistryViolation` does the same for the
 * capability registry, and this is deliberately the same shape).
 *
 * **No message here quotes an evidence reference.** A reference can name an
 * unpublished agreement, a counterparty, or a document register entry that
 * says who is talking to whom. The violations name the FIELD and the RULE,
 * both of which are words from closed lists, and never the value.
 *
 * **No message here interpolates driver text, an exception message, or
 * `String(error)`.** Nothing in this module talks to anything, so there is no
 * driver to quote — but the rule is stated where the next person adds an
 * error, because that is when it stops being obvious.
 */

/** The rules `validateCapabilityProfile` checks. Closed and machine-readable. */
export const PROFILE_RULES = [
  'WALLET_KINDS_WITHOUT_WALLET_ACCOUNT_TYPE',
  'WALLET_ACCOUNT_TYPE_WITHOUT_WALLET_KINDS',
  'DUPLICATE_ACCOUNT_TYPE',
  'DUPLICATE_WALLET_KIND',
  'DUPLICATE_CURRENCY',
  'NO_ACCOUNT_TYPE_DESCRIBED',
  'NO_CURRENCY_DESCRIBED',
  'ACCESS_STAGE_WITHOUT_EVIDENCE',
  'AVAILABLE_RAIL_WITHOUT_REGULATORY_EVIDENCE',
  'AVAILABLE_RAIL_WITH_UNUSABLE_CONSENT_METHOD',
  'HISTORY_DEPTH_NOT_A_WHOLE_COUNT',
  'QUOTA_NOT_A_WHOLE_COUNT',
  'DUPLICATE_PROFILE_SUBJECT',
] as const;
export type ProfileRule = (typeof PROFILE_RULES)[number];

export function isProfileRule(value: string): value is ProfileRule {
  return (PROFILE_RULES as readonly string[]).includes(value);
}

/**
 * One violated rule, specific enough to act on.
 *
 * `field` is this module's own vocabulary — the name of a field on
 * `ProviderCapabilityProfile` — so a review tool can point at the right input
 * without parsing the message.
 */
export interface ProfileViolation {
  readonly rule: ProfileRule;
  readonly field: string;
  readonly message: string;
}

/** Thrown when authored configuration is invalid. Configuration is code. */
export class InvalidCapabilityProfileError extends Error {
  override readonly name = 'InvalidCapabilityProfileError';

  constructor(readonly violations: readonly ProfileViolation[]) {
    super(
      `capability profile configuration is invalid:\n${violations
        .map((violation) => `  - [${violation.rule}] ${violation.message}`)
        .join('\n')}`,
    );
  }
}
