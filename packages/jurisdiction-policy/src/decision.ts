// A policy decision as a first-class typed state (jurisdiction-policy.md §8).
//
// A pack never encodes "we have not decided" as a default value, an empty
// array that reads as permission, or an absent key that reads as denial.
// Every decision slot holds exactly one of:
//
//   DECIDED               — a reviewed value, with the basis that carries the
//                           actual claim (a decision without a basis is an
//                           assertion, and the validator refuses it);
//   PENDING_LEGAL_REVIEW  — the question is with legal review; consumers
//                           treat it as a denial with a stated reason;
//   UNRESOLVED            — the question has not been taken up; same denial
//                           posture, different provenance.
//
// A pending decision is a VALID pack state. A REQUIRED decision that is
// absent entirely (no entry at all) is a pack-validation failure — the
// difference between "we know we have not decided" and "nobody asked".

export interface DecidedPolicy<T> {
  readonly state: 'DECIDED';
  readonly value: T;
  /** The review, opinion, or instrument that carries the actual claim. */
  readonly basis: string;
}

export interface PendingLegalReviewPolicy {
  readonly state: 'PENDING_LEGAL_REVIEW';
  readonly reason: string;
}

export interface UnresolvedPolicy {
  readonly state: 'UNRESOLVED';
  readonly reason: string;
}

export type PolicyDecision<T> = DecidedPolicy<T> | PendingLegalReviewPolicy | UnresolvedPolicy;

export function decided<T>(value: T, basis: string): DecidedPolicy<T> {
  return Object.freeze({ state: 'DECIDED', value, basis });
}

export function pendingLegalReview(reason: string): PendingLegalReviewPolicy {
  return Object.freeze({ state: 'PENDING_LEGAL_REVIEW', reason });
}

export function unresolved(reason: string): UnresolvedPolicy {
  return Object.freeze({ state: 'UNRESOLVED', reason });
}

export function isDecided<T>(decision: PolicyDecision<T>): decision is DecidedPolicy<T> {
  return decision.state === 'DECIDED';
}
