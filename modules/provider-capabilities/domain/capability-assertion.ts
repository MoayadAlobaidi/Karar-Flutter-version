/**
 * What a review found about ONE capability, as a value.
 *
 * ## The rule this file exists to make unbreakable
 *
 * `VERIFIED` is unconstructible without an evidence reference. Not validated —
 * unconstructible. `CapabilityVerified` requires `evidence: EvidenceReference`
 * and `reviewedOn: CalendarDay`, so `{ state: 'VERIFIED' }` is not a value of
 * this type, `{ state: 'VERIFIED', evidence: 'we asked them' }` is not either
 * (a bare string is not the branded reference), and there is no function that
 * turns a bare state word into an assertion.
 *
 * This is the shape `modules/financial-accounts` uses for its retention
 * decision: `RetentionDecided` carries `basis` and `approvalReference` as
 * REQUIRED fields, so "we have a retention period" cannot be expressed without
 * saying who approved it. The failure both shapes prevent is the same one, and
 * it is not hypothetical — a state enum plus an optional evidence field
 * produces a `VERIFIED` row the day somebody is in a hurry, and nothing about
 * the row afterwards says the evidence was never supplied.
 *
 * Migration 0094 makes the identical refusal at the database for the one claim
 * a catalogue row can make (`institution_markets_available_requires_evidence`).
 * This module is the in-memory half of that discipline: a reviewed
 * configuration model is exactly where a careless claim would be written down
 * first, before any row exists to constrain.
 *
 * ## Why there is no `assertionFromState(state)`
 *
 * Such a function would need to invent the evidence for the VERIFIED arm or
 * accept it as optional, and either way the type stops being the guarantee.
 * The four constructors below are the whole surface, and only one of them
 * takes an evidence reference — because only one of them makes a claim.
 *
 * ## What each state means, and why UNVERIFIED is not a failure
 *
 *   VERIFIED                       a reviewer read evidence and recorded where
 *                                  it is. The only state that asserts anything.
 *   UNVERIFIED                     nobody has looked. The DEFAULT and the
 *                                  honest ground state — never read as "the
 *                                  issuer cannot", which is a different claim
 *                                  with different evidence behind it.
 *   UNAVAILABLE                    a reviewer established that it is not on
 *                                  offer. A finding, and it carries its reason.
 *   PENDING_PROVIDER_CONFIRMATION  asked, not yet answered. Distinct from
 *                                  UNVERIFIED on purpose: an operator needs to
 *                                  tell "nobody asked" from "we are waiting".
 *
 * **None of the four means available-to-Karar.** Availability of a data rail
 * is decided by `modules/financial-connections` and its migration-0096 CHECK,
 * never by a description; see `data-rails.ts`.
 *
 * Pure: no clock, no randomness, no I/O. `reviewedOn` arrives as an argument.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { EvidenceReference } from './refs.js';

/**
 * The vocabulary, for readers that need the words. **A word from this list is
 * not an assertion** and cannot be turned into one — see the header.
 */
export const CAPABILITY_STATES = [
  'VERIFIED',
  'UNVERIFIED',
  'UNAVAILABLE',
  'PENDING_PROVIDER_CONFIRMATION',
] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export function isCapabilityState(value: string): value is CapabilityState {
  return (CAPABILITY_STATES as readonly string[]).includes(value);
}

/**
 * A reviewer read evidence and recorded where it is.
 *
 * Both fields are required and neither is minted here. `evidence` is a locator
 * a human follows; `reviewedOn` is the day a human read it, as a calendar day
 * rather than an instant (ADR-0027) — a review happens on a date in a place,
 * not at a UTC millisecond.
 */
export interface CapabilityVerified {
  readonly state: 'VERIFIED';
  readonly evidence: EvidenceReference;
  readonly reviewedOn: CalendarDay;
}

/** Nobody has looked. Carries nothing, because there is nothing to carry. */
export interface CapabilityUnverified {
  readonly state: 'UNVERIFIED';
}

/** A reviewer established it is not on offer, and said why. */
export interface CapabilityUnavailable {
  readonly state: 'UNAVAILABLE';
  readonly reason: string;
}

/** Asked, not yet answered. The reason says what was asked and of whom. */
export interface CapabilityPendingProviderConfirmation {
  readonly state: 'PENDING_PROVIDER_CONFIRMATION';
  readonly reason: string;
}

export type CapabilityAssertion =
  | CapabilityVerified
  | CapabilityUnverified
  | CapabilityUnavailable
  | CapabilityPendingProviderConfirmation;

// ---------------------------------------------------------------------------
// Compile-time proofs of the header's central claim.
//
// These follow the idiom `packages/capability-registry/src/validation.ts` uses
// to keep a runtime list and a type union as one thing: a type that evaluates
// to `never` the moment the property stops holding, assigned to a value. The
// assignment is what fails the build — `pnpm typecheck` is the enforcement,
// not a test that could be deleted without anyone noticing.
// ---------------------------------------------------------------------------

/** `{ state: 'VERIFIED' }` must NOT be a `CapabilityAssertion`. */
type VerifiedWithoutEvidence = { readonly state: 'VERIFIED' };
type VerifiedRequiresEvidence = VerifiedWithoutEvidence extends CapabilityAssertion ? never : true;
const verifiedRequiresEvidence: VerifiedRequiresEvidence = true;
void verifiedRequiresEvidence;

/** A bare string must NOT satisfy the evidence field — the brand is the point. */
type VerifiedWithStringEvidence = {
  readonly state: 'VERIFIED';
  readonly evidence: string;
  readonly reviewedOn: CalendarDay;
};
type EvidenceIsNominal = VerifiedWithStringEvidence extends CapabilityAssertion ? never : true;
const evidenceIsNominal: EvidenceIsNominal = true;
void evidenceIsNominal;

/** No other arm may acquire an evidence field by drift. */
type UnverifiedCarriesNoEvidence = 'evidence' extends keyof CapabilityUnverified ? never : true;
const unverifiedCarriesNoEvidence: UnverifiedCarriesNoEvidence = true;
void unverifiedCarriesNoEvidence;

// ---------------------------------------------------------------------------
// Constructors — the whole surface. Exactly one takes evidence.
// ---------------------------------------------------------------------------

/** The ground state, shared and frozen: there is only one way to say nothing. */
export const UNVERIFIED: CapabilityUnverified = Object.freeze({ state: 'UNVERIFIED' as const });

export function verified(evidence: EvidenceReference, reviewedOn: CalendarDay): CapabilityVerified {
  return Object.freeze({ state: 'VERIFIED' as const, evidence, reviewedOn });
}

export function unavailable(reason: string): CapabilityUnavailable {
  return Object.freeze({ state: 'UNAVAILABLE' as const, reason });
}

export function pendingProviderConfirmation(
  reason: string,
): CapabilityPendingProviderConfirmation {
  return Object.freeze({ state: 'PENDING_PROVIDER_CONFIRMATION' as const, reason });
}

/**
 * True only for the one state that asserts something.
 *
 * A single predicate so no call site invents its own reading of the
 * vocabulary — the discipline `permitsDurableWrite` applies to the retention
 * decision. Note what it does NOT do: it does not consult the evidence
 * reference's content, because this module never reads what a reference points
 * at. It answers "did a reviewer record evidence", which is the only question
 * a type can answer.
 */
export function isVerified(assertion: CapabilityAssertion): assertion is CapabilityVerified {
  return assertion.state === 'VERIFIED';
}

/**
 * The evidence behind an assertion, or `null` when there is none.
 *
 * Exported so a reviewer-facing surface can show the locator beside the claim.
 * Three of the four states have no evidence and answer `null`; that is the
 * whole implementation, and it is a function rather than a field access so
 * that a fifth state added later has to be handled here.
 */
export function evidenceOf(assertion: CapabilityAssertion): EvidenceReference | null {
  return assertion.state === 'VERIFIED' ? assertion.evidence : null;
}
