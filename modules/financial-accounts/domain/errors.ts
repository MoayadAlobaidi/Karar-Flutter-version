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

/**
 * Display text was empty, whitespace-only, or longer than this module admits.
 *
 * The message never quotes the offending value: both fields are
 * `HIGHLY_SENSITIVE_FINANCIAL`, and an error string that echoes the input is
 * the shortest path from an encrypted column to a plaintext log line.
 */
export interface InvalidDisplayText {
  readonly kind: 'invalid_display_text';
  readonly field: 'displayName' | 'userSuppliedInstitutionLabel';
  readonly message: string;
}

/**
 * A balance snapshot named its source with something that is not an opaque
 * reference. Migration 0089 makes the column a `uuid`, so free text has
 * nowhere to land; this rule is what turns the database's refusal into an
 * answer a caller can act on rather than a 22P02 from the driver.
 */
export interface InvalidSourceReference {
  readonly kind: 'invalid_source_reference';
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

/**
 * A reported balance named a currency its account does not hold. The
 * composite foreign key in migration 0089 makes the pair unrepresentable
 * anyway; refusing here is what turns a 23503 from the driver into an answer
 * that names the real problem.
 */
export interface SnapshotCurrencyMismatch {
  readonly kind: 'snapshot_currency_mismatch';
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
  | InvalidSourceReference
  | InstitutionNamedTwice
  | ProviderConnectionMismatch
  | CurrencyImmutableWithRecords
  | SnapshotCurrencyMismatch
  | UnknownVocabularyValue;

/**
 * A store returned a row this module's vocabulary cannot name. That is a
 * defect in the schema, the migration, or the mapper — never a user outcome —
 * so it throws rather than becoming a `Result` arm someone has to handle.
 */
export class FinancialAccountsStoreError extends Error {
  override readonly name = 'FinancialAccountsStoreError';
}
