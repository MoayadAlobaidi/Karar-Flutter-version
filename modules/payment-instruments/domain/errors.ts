/**
 * Domain rule violations, as values.
 *
 * These are EXPECTED outcomes, not defects: a caller supplying a card number
 * where a mask belongs, a blank label, a status transition nobody can make.
 * The kernel's rule applies (backend.md §9; `Result` doc comment) — expected
 * outcomes are `Result`, and only genuine precondition violations throw.
 * Every kind is machine-readable so a presentation layer can map it to RFC
 * 7807 without re-deriving meaning from a message string.
 *
 * **No message here quotes the offending value.** The values this module
 * refuses are exactly the ones it must not hold: a mask that turned out to be
 * a card number is still a card number after it is rejected, and an error
 * string that echoes the input is the shortest path from a refusal to a
 * plaintext log line.
 */

import type { InstrumentMaskRefusal } from './instrument-mask.js';
import type { InstrumentStatus, InstrumentType } from './payment-instrument.js';

/**
 * The supplied mask is not one this module may hold.
 *
 * `refusal` says which rule fired — a caller that supplied a card number
 * needs a different remedy from one that supplied a sentence — and it is a
 * word from a closed list rather than any part of the value.
 */
export interface InstrumentMaskNotStorable {
  readonly kind: 'instrument_mask_not_storable';
  readonly refusal: InstrumentMaskRefusal;
  readonly message: string;
}

/**
 * Display text was empty, whitespace-only, or longer than this module admits.
 * The field is `HIGHLY_SENSITIVE_FINANCIAL`, so the message never quotes it.
 */
export interface InvalidDisplayText {
  readonly kind: 'invalid_display_text';
  readonly field: 'displayLabel';
  readonly message: string;
}

/**
 * A status transition nobody can make. Carries both ends because they are
 * words from a closed list rather than subject data, and because the honest
 * answer to "why not?" needs both.
 */
export interface StatusTransitionNotAvailable {
  readonly kind: 'status_transition_not_available';
  readonly from: InstrumentStatus;
  readonly to: InstrumentStatus;
  readonly message: string;
}

/**
 * An instrument was asked to point at a different account.
 *
 * Its own kind rather than a generic immutability complaint, because this is
 * the rule the whole module is shaped around: an instrument spends from
 * exactly ONE account, and re-pointing it would silently change what it draws
 * on while every historical reading of "this card spends from that wallet"
 * became retroactively false. The database refuses it too
 * (`payment_instruments_guard`, SQLSTATE KAR30).
 */
export interface InstrumentAccountNotRepointable {
  readonly kind: 'instrument_account_not_repointable';
  readonly message: string;
}

/**
 * An instrument was asked to become a different kind of thing. A physical
 * card relabelled as a QR identity is not an edit; it is a different object
 * wearing the first one's row, and its history would follow it.
 */
export interface InstrumentTypeNotChangeable {
  readonly kind: 'instrument_type_not_changeable';
  readonly instrumentType: InstrumentType;
  readonly message: string;
}

/** A value outside a closed vocabulary this module owns. */
export interface UnknownVocabularyValue {
  readonly kind: 'unknown_vocabulary_value';
  readonly vocabulary:
    | 'instrumentType'
    | 'instrumentStatus'
    | 'balanceBearingAccountReferenceType';
  readonly value: string;
  readonly message: string;
}

/** Everything the domain rules can refuse. */
export type PaymentInstrumentRuleViolation =
  | InstrumentMaskNotStorable
  | InvalidDisplayText
  | StatusTransitionNotAvailable
  | InstrumentAccountNotRepointable
  | InstrumentTypeNotChangeable
  | UnknownVocabularyValue;

/**
 * A store returned a row this module's vocabulary cannot name. That is a
 * defect in the schema, the migration, or the mapper — never a user outcome —
 * so it throws rather than becoming a `Result` arm someone has to handle.
 */
export class PaymentInstrumentsStoreError extends Error {
  override readonly name = 'PaymentInstrumentsStoreError';
}
