/**
 * ONLY THE PERSON'S CONFIRMATION MAKES A MATCH AUTHORITATIVE — the domain half.
 *
 * The database half is in `schema.integration.test.ts`, where
 * `transfer_matches_confirmed_requires_subject_decision` is proved against
 * live PostgreSQL as `karar_app`. What is proved HERE is that the domain
 * cannot produce the state either — the two together are the guarantee,
 * because a rule held only in the database gives a caller a 23514 instead of
 * an answer, and a rule held only in the domain is one ingestion path away
 * from being bypassed.
 *
 * The claim is stronger than "confirmation sets a flag". It is:
 *
 *   1. a SUGGESTED match is not authoritative, and nothing derived from it is;
 *   2. CONFIRMED cannot exist without a recorded decision instant;
 *   3. the instant is never defaulted, derived, or invented;
 *   4. a rejection is KEPT, and never reopened;
 *   5. re-confirming does not rewrite the instant the person actually decided.
 */

import { describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  AUTHORITATIVE_MATCH_STATES,
  LIVE_MATCH_STATES,
  MATCH_STATES,
  canTransition,
  confirmMatch,
  isAuthoritative,
  isLiveMatchState,
  rejectMatch,
  suggestTransferMatch,
  type MatchCandidateSide,
  type MatchState,
  type TransferMatch,
} from '../domain/transfer-match.js';
import { CalendarDay } from '@karar/shared-kernel';
import { MatchedAccountRef, TransactionRef, type TransferMatchId } from '../domain/refs.js';

const TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const MATCH_ID = 'cccccccc-0000-7000-8000-00000000000c' as TransferMatchId;
const SUGGESTED_AT = new Date('2026-08-19T09:00:00.000Z');
const DECIDED_AT = new Date('2026-08-19T10:30:00.000Z');
const LATER = new Date('2026-08-20T11:00:00.000Z');

const OUTFLOW: MatchCandidateSide = {
  transactionRef: TransactionRef.of('d0000000-0000-7000-8000-00000000000d'),
  accountRef: MatchedAccountRef.of('a0000000-0000-7000-8000-00000000000a'),
  amountMinorUnits: -10_000n,
  currencyCode: 'QAR',
  bookingDate: CalendarDay.of(2026, 8, 17),
};
const INFLOW: MatchCandidateSide = {
  transactionRef: TransactionRef.of('e0000000-0000-7000-8000-00000000000e'),
  accountRef: MatchedAccountRef.of('b0000000-0000-7000-8000-00000000000b'),
  amountMinorUnits: 10_000n,
  currencyCode: 'QAR',
  bookingDate: CalendarDay.of(2026, 8, 18),
};

function suggested(): TransferMatch {
  const built = suggestTransferMatch({
    id: MATCH_ID,
    tenantId: TENANT,
    userId: USER,
    outflow: OUTFLOW,
    inflow: INFLOW,
    suggestedAt: SUGGESTED_AT,
  });
  if (!built.ok) throw new Error('fixture could not build a suggestion');
  return built.value;
}

describe('a suggestion changes nothing', () => {
  it('is not authoritative, and CONFIRMED is the only state that is', () => {
    // Checked over the WHOLE vocabulary rather than sampled, so a fourth state
    // added later cannot quietly be authoritative by omission.
    const authoritative = MATCH_STATES.filter(isAuthoritative);
    expect(authoritative).toEqual(['CONFIRMED']);
    expect([...AUTHORITATIVE_MATCH_STATES]).toEqual(['CONFIRMED']);
    expect(isAuthoritative('SUGGESTED')).toBe(false);
    expect(isAuthoritative('REJECTED')).toBe(false);
  });

  it('occupies its transactions while it is live, and stops when rejected', () => {
    expect(MATCH_STATES.filter(isLiveMatchState)).toEqual(['SUGGESTED', 'CONFIRMED']);
    expect([...LIVE_MATCH_STATES]).toEqual(['SUGGESTED', 'CONFIRMED']);
    expect(isLiveMatchState('REJECTED')).toBe(false);
  });

  it('carries no decision instant', () => {
    expect(suggested().subjectDecidedAt).toBeNull();
  });
});

describe('confirmation requires a recorded subject decision', () => {
  it('records the instant, and it is the one supplied', () => {
    const confirmed = confirmMatch(suggested(), DECIDED_AT);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.state).toBe('CONFIRMED');
    expect(confirmed.value.subjectDecidedAt).toEqual(DECIDED_AT);
    // Never defaulted from the suggestion instant, which would make the
    // product's question look like the person's answer.
    expect(confirmed.value.subjectDecidedAt).not.toEqual(SUGGESTED_AT);
    expect(confirmed.value.version).toBe(2);
  });

  it('refuses a confirmation with no usable instant', () => {
    for (const bad of [new Date('not a date'), null, undefined, 'yesterday']) {
      const confirmed = confirmMatch(suggested(), bad as unknown as Date);
      expect(confirmed.ok).toBe(false);
      if (!confirmed.ok) {
        expect(confirmed.error.kind).toBe('confirmation_needs_subject_decision');
      }
    }
  });

  it('is idempotent and does NOT rewrite the instant the person decided', () => {
    // The important half. A second confirmation must not move the record of
    // when they answered, because that record is the whole authority of the
    // match.
    const first = confirmMatch(suggested(), DECIDED_AT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = confirmMatch(first.value, LATER);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value).toBe(first.value);
      expect(again.value.subjectDecidedAt).toEqual(DECIDED_AT);
      expect(again.value.version).toBe(2);
    }
  });

  it('a stored CONFIRMED match always has an instant — checked as an invariant', () => {
    // The property the CHECK constraint enforces, restated as a domain
    // invariant over every state a match can be produced in.
    const produced: TransferMatch[] = [suggested()];
    const confirmed = confirmMatch(suggested(), DECIDED_AT);
    if (confirmed.ok) produced.push(confirmed.value);
    const rejected = rejectMatch(suggested(), DECIDED_AT);
    if (rejected.ok) produced.push(rejected.value);
    for (const match of produced) {
      expect({
        state: match.state,
        hasInstant: match.subjectDecidedAt !== null,
      }).toEqual({ state: match.state, hasInstant: match.state !== 'SUGGESTED' });
    }
  });
});

describe('a rejection is kept and never reopened', () => {
  it('records the decision and moves to REJECTED', () => {
    const rejected = rejectMatch(suggested(), DECIDED_AT);
    expect(rejected.ok).toBe(true);
    if (rejected.ok) {
      expect(rejected.value.state).toBe('REJECTED');
      expect(rejected.value.subjectDecidedAt).toEqual(DECIDED_AT);
    }
  });

  it('withdrawing a confirmation is the same act and is allowed', () => {
    const confirmed = confirmMatch(suggested(), DECIDED_AT);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const withdrawn = rejectMatch(confirmed.value, LATER);
    expect(withdrawn.ok).toBe(true);
    if (withdrawn.ok) {
      expect(withdrawn.value.state).toBe('REJECTED');
      expect(withdrawn.value.subjectDecidedAt).toEqual(LATER);
      expect(withdrawn.value.version).toBe(3);
    }
  });

  it('a REJECTED match cannot be confirmed, and nothing returns to SUGGESTED', () => {
    const rejected = rejectMatch(suggested(), DECIDED_AT);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const reopened = confirmMatch(rejected.value, LATER);
    expect(reopened.ok).toBe(false);
    if (!reopened.ok && reopened.error.kind === 'state_transition_not_available') {
      expect(reopened.error.from).toBe('REJECTED');
      expect(reopened.error.to).toBe('CONFIRMED');
    } else {
      throw new Error('expected a state_transition_not_available refusal');
    }
    // The transition table, exhaustively: nothing returns to SUGGESTED from
    // anywhere, and REJECTED is terminal.
    for (const from of MATCH_STATES) {
      for (const to of MATCH_STATES) {
        const expected =
          from === to ||
          (from === 'SUGGESTED' && (to === 'CONFIRMED' || to === 'REJECTED')) ||
          (from === 'CONFIRMED' && to === 'REJECTED');
        expect({ from, to, allowed: canTransition(from, to) }).toEqual({
          from,
          to,
          allowed: expected,
        });
      }
    }
  });

  it('re-rejecting is idempotent and does not rewrite the instant', () => {
    const rejected = rejectMatch(suggested(), DECIDED_AT);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const again = rejectMatch(rejected.value, LATER);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value).toBe(rejected.value);
      expect(again.value.subjectDecidedAt).toEqual(DECIDED_AT);
    }
  });

  it('no state name in the vocabulary suggests automation', () => {
    // A vocabulary with AUTO_MATCHED or DETECTED in it would be one edit away
    // from a screen presenting a guess as a decision.
    for (const state of MATCH_STATES as readonly MatchState[]) {
      for (const forbidden of ['AUTO', 'DETECTED', 'INFERRED', 'PREDICTED', 'LIKELY']) {
        expect({ state, forbidden, present: state.includes(forbidden) }).toEqual({
          state,
          forbidden,
          present: false,
        });
      }
    }
  });
});
