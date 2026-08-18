/**
 * Domain rule violations, as values.
 *
 * These are EXPECTED outcomes, not defects: a person typing an unsupported
 * currency, a caller pasting a whole card number into a field that only
 * accepts a mask, a rename that races another device. The kernel's rule
 * applies (backend.md §9; `Result` doc comment) — expected outcomes are
 * `Result`, and only genuine precondition violations throw. Every kind is
 * machine-readable so the presentation layer can map it to RFC 7807 without
 * re-deriving meaning from a message string.
 *
 * Messages say what happened and why the rule exists, because these strings
 * are the last thing a confused engineer reads at three in the morning.
 */

import type { FinancialAccountId } from './refs.js';

/** The requested currency is not in the platform's supported registry. */
export interface UnsupportedCurrency {
  readonly kind: 'unsupported_currency';
  readonly requestedCode: string;
  readonly message: string;
}

/**
 * The supplied mask is not a mask. Raised for anything long enough or
 * digit-dense enough to be part of a real account number — the rule exists
 * because this module must never be able to hold one.
 */
export interface MaskNotAMask {
  readonly kind: 'mask_not_a_mask';
  readonly message: string;
}

/** Display text was empty, whitespace-only, or longer than the schema admits. */
export interface InvalidDisplayText {
  readonly kind: 'invalid_display_text';
  readonly field: 'displayName' | 'userSuppliedInstitutionLabel' | 'sourceReference';
  readonly message: string;
}

/**
 * An institution was named twice, two different ways. Either the account
 * points at the reviewed catalogue or it carries the label the subject typed
 * — never both, because the two mean different things to a reader.
 */
export interface InstitutionNamedTwice {
  readonly kind: 'institution_named_twice';
  readonly message: string;
}

/**
 * A MANUAL or CSV account claimed a provider connection, or an
 * EXTERNAL_PROVIDER account arrived without one. In Phase 5 the second arm is
 * unreachable from any code path — nothing constructs EXTERNAL_PROVIDER — and
 * the first is the invariant that keeps the legacy's fabricated Synced badge
 * out of this schema.
 */
export interface ProviderConnectionMismatch {
  readonly kind: 'provider_connection_mismatch';
  readonly message: string;
}

/**
 * The account's currency was asked to change while financial records exist.
 * The account id is carried so the caller can name the account it refused.
 */
export interface CurrencyImmutableWithRecords {
  readonly kind: 'currency_immutable_with_records';
  readonly accountId: FinancialAccountId;
  readonly message: string;
}

/** A value outside a closed vocabulary this module owns. */
export interface UnknownVocabularyValue {
  readonly kind: 'unknown_vocabulary_value';
  readonly vocabulary: 'accountType' | 'accountStatus' | 'sourceKind' | 'institutionStatus';
  readonly value: string;
  readonly message: string;
}

/** Everything the domain rules can refuse. */
export type FinancialAccountRuleViolation =
  | UnsupportedCurrency
  | MaskNotAMask
  | InvalidDisplayText
  | InstitutionNamedTwice
  | ProviderConnectionMismatch
  | CurrencyImmutableWithRecords
  | UnknownVocabularyValue;

/**
 * A store returned a row this module's vocabulary cannot name. That is a
 * defect in the schema, the migration, or the mapper — never a user outcome —
 * so it throws rather than becoming a `Result` arm someone has to handle.
 */
export class FinancialAccountsStoreError extends Error {
  override readonly name = 'FinancialAccountsStoreError';
}
