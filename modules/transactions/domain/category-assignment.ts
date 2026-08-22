/**
 * `TransactionCategoryAssignment` — which category applies to a transaction,
 * by which source, with a supersession chain.
 *
 * **Manual override beats rule, always and permanently.** Once a person has
 * said what a transaction is, no rule may quietly re-categorise it — not a
 * newer rule version, not a re-run of the same rule, not a catalogue change.
 * The failure this prevents is the one every rules engine eventually
 * produces: a user corrects a category, a nightly re-classification runs, and
 * the correction disappears with no trace and no notification. The user then
 * has no reason to trust any category on any screen.
 *
 * The mechanism is a supersession chain rather than an in-place update.
 * Assigning appends a row and marks the previous ACTIVE row SUPERSEDED,
 * pointing at the new one. So "why is this transaction marked TRANSPORT?" is
 * answerable, and "did a rule overwrite my choice?" is answerable too — by
 * reading the chain, not by trusting that it never happened.
 *
 * **Deterministic only: no AI, no LLM, no scoring.** `RULE` means a reviewed,
 * versioned, exact-match rule fired. There is no confidence, no ranking, no
 * "best guess"; a rule either matched or it did not. The types here carry no
 * numeric score field, and adding one would be a reviewed change with an ADR,
 * not an implementation detail.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import type { CategoryCode } from './category-catalogue.js';
import type { ActorRef, TransactionId } from './refs.js';

/**
 * Who assigned. Exactly two values exist and there is deliberately no third:
 * a category is a person's choice or a reviewed rule's output. An `AI` or
 * `SUGGESTED` member would be the entire Phase 6 argument smuggled in as an
 * enum case.
 */
export const ASSIGNMENT_SOURCES = ['USER', 'RULE'] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

export const ASSIGNMENT_STATUSES = ['ACTIVE', 'SUPERSEDED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export class InvalidAssignmentError extends Error {
  override readonly name = 'InvalidAssignmentError';
}

export interface TransactionCategoryAssignment {
  readonly id: string;
  readonly transactionId: TransactionId;
  readonly tenantId: string;
  readonly userId: string;
  readonly categoryCode: CategoryCode;
  readonly assignmentSource: AssignmentSource;
  /**
   * The reviewed rule version that fired, for a `RULE` assignment; `null` for
   * a `USER` one. Non-nullable-when-RULE is what makes a rule assignment
   * reproducible: the same rule version against the same input gives the same
   * answer, and a rule assignment that cannot name its version cannot be
   * re-derived or audited.
   */
  readonly ruleVersion: string | null;
  readonly assignedBy: ActorRef;
  readonly assignedAt: Date;
  readonly status: AssignmentStatus;
  /** The assignment that replaced this one; `null` while ACTIVE. */
  readonly supersededById: string | null;
  readonly supersededAt: Date | null;
}

export function createAssignment(fields: TransactionCategoryAssignment): TransactionCategoryAssignment {
  if (fields.assignmentSource === 'RULE') {
    if (fields.ruleVersion === null || fields.ruleVersion.trim() === '') {
      throw new InvalidAssignmentError(
        'a RULE assignment must name the reviewed rule version that produced it; ' +
          'an unversioned rule result cannot be re-derived, which makes it indistinguishable from a guess',
      );
    }
  } else if (fields.ruleVersion !== null) {
    throw new InvalidAssignmentError(
      'a USER assignment must not carry a rule version — a person did not run a rule, and recording one would make the chain lie about who decided',
    );
  }
  const superseded = fields.status === 'SUPERSEDED';
  if (superseded !== (fields.supersededAt !== null)) {
    throw new InvalidAssignmentError(
      'status SUPERSEDED and supersededAt must agree: a superseded assignment records when, and an active one records neither',
    );
  }
  if (!superseded && fields.supersededById !== null) {
    throw new InvalidAssignmentError('an ACTIVE assignment cannot name a successor');
  }
  return Object.freeze({ ...fields });
}

/**
 * The precedence rule, stated once so no caller re-invents it.
 *
 * A candidate assignment may replace the current ACTIVE one when:
 *   - a USER assignment replaces anything (a person is always allowed to
 *     decide, including changing their own earlier decision);
 *   - a RULE assignment replaces only another RULE assignment, or nothing.
 *
 * A RULE assignment against a USER-assigned transaction is REFUSED, not
 * silently skipped and not queued as a suggestion. Refusal is what makes the
 * guarantee legible: the rules path receives a typed denial it must handle.
 */
export function canSupersede(
  current: TransactionCategoryAssignment | null,
  candidateSource: AssignmentSource,
): boolean {
  if (current === null) return true;
  if (current.status !== 'ACTIVE') return true;
  if (candidateSource === 'USER') return true;
  return current.assignmentSource !== 'USER';
}

/** The single ACTIVE assignment in a chain, or `null` when none is active. */
export function activeAssignment(
  chain: readonly TransactionCategoryAssignment[],
): TransactionCategoryAssignment | null {
  const active = chain.filter((assignment) => assignment.status === 'ACTIVE');
  if (active.length === 0) return null;
  if (active.length > 1) {
    throw new InvalidAssignmentError(
      `a transaction has ${active.length} ACTIVE category assignments; exactly one may be active, and more than one means the supersession write was not atomic`,
    );
  }
  return active[0] as TransactionCategoryAssignment;
}

/**
 * The chain from oldest to newest by assignment instant, ties broken by id so
 * the order is total and deterministic (two assignments can share a clock
 * tick, and a non-deterministic history renders differently on every read).
 */
export function orderedChain(
  chain: readonly TransactionCategoryAssignment[],
): readonly TransactionCategoryAssignment[] {
  return Object.freeze(
    [...chain].sort((left, right) => {
      const byInstant = left.assignedAt.getTime() - right.assignedAt.getTime();
      if (byInstant !== 0) return byInstant;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    }),
  );
}

/**
 * True when a person has ever assigned a category to this transaction — the
 * fact the rules path must consult before proposing anything, and the fact an
 * export needs in order to say whether a category is the user's own.
 */
export function hasUserDecision(chain: readonly TransactionCategoryAssignment[]): boolean {
  return chain.some((assignment) => assignment.assignmentSource === 'USER');
}
