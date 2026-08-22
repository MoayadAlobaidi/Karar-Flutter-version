// The duplicate conversation, as it leaves the service.
//
// A person who genuinely buys the same coffee twice must be able to record
// both. The platform refuses the second write on purpose, and the ONLY way
// the caller can proceed is the ordinal the platform names — so that integer
// has to survive the trip out as data, not as an English sentence a client
// would have to parse. These tests hold that, and hold the other half of the
// bargain: the fingerprint that produced the refusal never leaves with it.
import { describe, expect, it } from 'vitest';

import { problemForTransactionsError } from './problems-transactions.js';

describe('a duplicate refusal tells the caller how to proceed', () => {
  it('names no ordinal on the FIRST refusal, because none has been claimed yet', () => {
    const { status, body } = problemForTransactionsError({
      kind: 'DUPLICATE_TRANSACTION',
      fingerprintVersion: 'v1',
      message: 'identical movement already recorded',
    });

    expect(status).toBe(409);
    expect(body.code).toBe('DUPLICATE_TRANSACTION');
    // An unqualified write is a claim of NEWNESS. The platform has refused it
    // and is asking the person a question; it is not yet telling them a number.
    expect(body.nextOrdinal).toBeUndefined();
  });

  it('carries the free ordinal as a NUMBER when the claimed one was taken', () => {
    const { status, body } = problemForTransactionsError({
      kind: 'OCCURRENCE_ORDINAL_NOT_NEXT',
      requestedOrdinal: 2,
      nextOrdinal: 5,
      message: 'occurrence 2 is taken',
    });

    expect(status).toBe(409);
    expect(body.code).toBe('OCCURRENCE_ORDINAL_NOT_NEXT');
    expect(body.nextOrdinal).toBe(5);
    // Not a string, and not left to a regex over `detail`: the prose is
    // translatable and the field is not.
    expect(typeof body.nextOrdinal).toBe('number');
  });

  it('the ordinal is the SERVER’s, not the requested one plus one', () => {
    // The race this field exists for. Between the refusal and the retry
    // another device recorded the movement, so the answer is 5 even though
    // the caller asked for 2 — a client deriving `requested + 1` would send 3
    // and be refused again, forever.
    const { body } = problemForTransactionsError({
      kind: 'OCCURRENCE_ORDINAL_NOT_NEXT',
      requestedOrdinal: 2,
      nextOrdinal: 5,
      message: 'occurrence 2 is taken',
    });

    expect(body.nextOrdinal).not.toBe(3);
    expect(body.nextOrdinal).toBe(5);
  });
});

describe('what the refusal must NOT carry', () => {
  it('drops the fingerprint and its version', () => {
    // The fingerprint is a per-subject keyed MAC over the movement. Echoing
    // it — or the version that identifies the keying — would turn a 409 into
    // an oracle for whether a given movement exists in someone’s account.
    const { body } = problemForTransactionsError({
      kind: 'DUPLICATE_TRANSACTION',
      fingerprintVersion: 'fpv-2026-03',
      message: 'identical movement already recorded',
    });

    expect(JSON.stringify(body)).not.toContain('fpv-2026-03');
  });

  it('drops the module’s own message rather than forwarding it', () => {
    const { body } = problemForTransactionsError({
      kind: 'OCCURRENCE_ORDINAL_NOT_NEXT',
      requestedOrdinal: 2,
      nextOrdinal: 5,
      message: 'ORM unique violation on (subject_id, fingerprint, occurrence_ordinal)',
    });

    expect(JSON.stringify(body)).not.toContain('unique violation');
    expect(JSON.stringify(body)).not.toContain('fingerprint');
  });
});
