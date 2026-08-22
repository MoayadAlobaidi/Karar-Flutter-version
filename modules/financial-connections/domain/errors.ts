/**
 * Domain rule violations, as values.
 *
 * These are EXPECTED outcomes, not defects: a caller naming a rail nobody has
 * built, a source handing over something that is actually an IBAN, a person
 * confirming a link on a stale version. The kernel's rule applies
 * (backend.md §9; `Result` doc comment) — expected outcomes are `Result`, and
 * only genuine precondition violations throw. Every kind is machine-readable
 * so a presentation layer can map it to RFC 7807 without re-deriving meaning
 * from a message string.
 *
 * **No message here quotes the offending value.** The values this module
 * refuses are exactly the ones it must not hold: an external reference that
 * looked like a card number is still a card number after it is rejected, and
 * an error string that echoes the input is the shortest path from a refusal
 * to a plaintext log line.
 */

import type { ConnectionRail, ConnectionStatus } from './rails.js';
import type { ExternalReferenceRefusal } from './external-account-reference.js';

/**
 * A rail that exists in the vocabulary but may not be created.
 *
 * Carries the rail because naming it is safe and useful — it is a word from a
 * closed list, not subject data — and because the honest answer to "why not?"
 * is "that rail is not implemented", which a caller can render.
 */
export interface RailNotImplemented {
  readonly kind: 'rail_not_implemented';
  readonly rail: ConnectionRail;
  readonly message: string;
}

/** A status a caller may not construct, or one that contradicts the rail. */
export interface ConnectionStatusNotAvailable {
  readonly kind: 'connection_status_not_available';
  readonly status: ConnectionStatus;
  readonly rail: ConnectionRail;
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
 * The supplied external account reference is not one this module may hold.
 *
 * `refusal` says which rule fired — a caller that supplied an IBAN needs a
 * different remedy from one that supplied a sentence — and it is a word from
 * a closed list rather than any part of the value.
 */
export interface ExternalReferenceNotStorable {
  readonly kind: 'external_reference_not_storable';
  readonly refusal: ExternalReferenceRefusal;
  readonly message: string;
}

/**
 * A probable match was asked to become a link without the subject having
 * confirmed it. The database refuses this too
 * (`account_source_links_probable_requires_confirmation`); this rule is what
 * turns that refusal into an answer that names the real problem rather than a
 * 23514 from the driver.
 */
export interface ProbableMatchNeedsConfirmation {
  readonly kind: 'probable_match_needs_confirmation';
  readonly message: string;
}

/**
 * A link that is settled was asked to point at a different account. The
 * account a confirmed link resolves to is not editable: moving it would move
 * every fact that arrived through that source, silently.
 */
export interface SettledLinkNotRepointable {
  readonly kind: 'settled_link_not_repointable';
  readonly message: string;
}

/**
 * A rail that may never be authoritative was given `AUTHORITATIVE` authority.
 * Only `DEVICE_SIGNAL` today (ADR-0028).
 */
export interface AuthorityNotAvailableForRail {
  readonly kind: 'authority_not_available_for_rail';
  readonly rail: ConnectionRail;
  readonly message: string;
}

/** A coverage range that is half-stated, or that ends before it begins. */
export interface InvalidHistoryCoverage {
  readonly kind: 'invalid_history_coverage';
  readonly message: string;
}

/** An observation window whose last observation precedes its first. */
export interface InvalidObservationWindow {
  readonly kind: 'invalid_observation_window';
  readonly message: string;
}

/** A value outside a closed vocabulary this module owns. */
export interface UnknownVocabularyValue {
  readonly kind: 'unknown_vocabulary_value';
  readonly vocabulary:
    | 'connectionRail'
    | 'connectionStatus'
    | 'sourceAuthority'
    | 'sourceStatus'
    | 'matchBasis'
    | 'sourceCapabilityObservation'
    | 'externalReferenceScheme'
    | 'canonicalAccountReferenceType'
    | 'institutionReferenceType';
  readonly value: string;
  readonly message: string;
}

/** Everything the domain rules can refuse. */
export type FinancialConnectionRuleViolation =
  | RailNotImplemented
  | ConnectionStatusNotAvailable
  | InvalidDisplayText
  | ExternalReferenceNotStorable
  | ProbableMatchNeedsConfirmation
  | SettledLinkNotRepointable
  | AuthorityNotAvailableForRail
  | InvalidHistoryCoverage
  | InvalidObservationWindow
  | UnknownVocabularyValue;

/**
 * A store returned a row this module's vocabulary cannot name. That is a
 * defect in the schema, the migration, or the mapper — never a user outcome —
 * so it throws rather than becoming a `Result` arm someone has to handle.
 */
export class FinancialConnectionsStoreError extends Error {
  override readonly name = 'FinancialConnectionsStoreError';
}
