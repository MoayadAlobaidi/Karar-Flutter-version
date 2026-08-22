/**
 * The rule this module exists for: **`VERIFIED` is unconstructible without an
 * evidence reference.**
 *
 * The type system is the enforcement and this file is the witness. Three of
 * the assertions below are `@ts-expect-error` directives, which are checked by
 * `pnpm typecheck` rather than by vitest: if a future edit makes the illegal
 * construction legal, the directive becomes UNUSED and `tsc` fails the build
 * with "Unused '@ts-expect-error' directive". A test that merely asserted a
 * thrown error at runtime would keep passing while the type quietly widened.
 *
 * The runtime expectations beneath each directive are there so the file is
 * also an executable description of what the values are.
 */

import { describe, expect, it } from 'vitest';

import { CalendarDay } from '@karar/shared-kernel';

import type { CapabilityAssertion } from '../domain/capability-assertion.js';
import {
  CAPABILITY_STATES,
  UNVERIFIED,
  evidenceOf,
  isCapabilityState,
  isVerified,
  pendingProviderConfirmation,
  unavailable,
  verified,
} from '../domain/capability-assertion.js';
import { EvidenceReference, InvalidReferenceError, NO_EVIDENCE, isEvidenceReference } from '../domain/refs.js';

const REVIEWED_ON = CalendarDay.parse('2026-08-19');
const EVIDENCE = EvidenceReference.of('synthetic-review:fixture/0001');

describe('VERIFIED cannot be constructed without evidence', () => {
  it('refuses a VERIFIED assertion with no evidence at all, at compile time', () => {
    // @ts-expect-error a VERIFIED assertion without an evidence reference is not a value of this type
    const withoutEvidence: CapabilityAssertion = { state: 'VERIFIED' };

    // The runtime object still exists — TypeScript is erased — which is
    // exactly why the compile-time refusal is the guarantee and this
    // expectation is only a description.
    expect(withoutEvidence.state).toBe('VERIFIED');
  });

  it('refuses a bare string in the evidence position, at compile time', () => {
    // Written on ONE line on purpose: a `@ts-expect-error` suppresses errors on
    // the line that follows it, and a property error inside a multi-line
    // literal is reported against the property's own line.
    // @ts-expect-error a bare string is not an EvidenceReference — the brand is the whole point
    const stringEvidence: CapabilityAssertion = { state: 'VERIFIED', evidence: 'they said yes', reviewedOn: REVIEWED_ON };

    expect(stringEvidence.state).toBe('VERIFIED');
  });

  it('refuses the UNVERIFIED sentinel in the evidence position, at compile time', () => {
    // @ts-expect-error 'UNVERIFIED' means nobody looked; it is not evidence that somebody did
    const sentinelEvidence: CapabilityAssertion = { state: 'VERIFIED', evidence: NO_EVIDENCE, reviewedOn: REVIEWED_ON };

    expect(sentinelEvidence.state).toBe('VERIFIED');
  });

  it('has no constructor that turns a bare state word into an assertion', () => {
    // The whole exported constructor surface, enumerated. Exactly one takes an
    // evidence reference, and it is the only one that produces VERIFIED.
    const constructors = { verified, unavailable, pendingProviderConfirmation };

    expect(Object.keys(constructors).sort()).toEqual([
      'pendingProviderConfirmation',
      'unavailable',
      'verified',
    ]);
    expect(verified.length).toBe(2);
    expect(unavailable.length).toBe(1);
    expect(pendingProviderConfirmation.length).toBe(1);

    // ...and every state word is namable without any of them producing a claim.
    expect([...CAPABILITY_STATES]).toEqual([
      'VERIFIED',
      'UNVERIFIED',
      'UNAVAILABLE',
      'PENDING_PROVIDER_CONFIRMATION',
    ]);
    for (const state of CAPABILITY_STATES) {
      expect(isCapabilityState(state)).toBe(true);
    }
  });

  it('builds a VERIFIED assertion when — and only when — evidence is supplied', () => {
    const assertion = verified(EVIDENCE, REVIEWED_ON);

    expect(assertion.state).toBe('VERIFIED');
    expect(assertion.evidence).toBe(EVIDENCE);
    expect(assertion.reviewedOn.toString()).toBe('2026-08-19');
    expect(isVerified(assertion)).toBe(true);
    expect(evidenceOf(assertion)).toBe(EVIDENCE);
  });

  it('answers no evidence for the three states that assert nothing', () => {
    const others: readonly CapabilityAssertion[] = [
      UNVERIFIED,
      unavailable('the issuer publishes no interface'),
      pendingProviderConfirmation('asked on the record, no answer yet'),
    ];

    for (const assertion of others) {
      expect(isVerified(assertion)).toBe(false);
      expect(evidenceOf(assertion)).toBeNull();
    }
  });

  it('keeps UNVERIFIED a value that carries nothing', () => {
    expect(Object.keys(UNVERIFIED)).toEqual(['state']);
    expect(Object.isFrozen(UNVERIFIED)).toBe(true);
  });
});

describe('the evidence reference itself', () => {
  it('accepts only scheme:locator, the shape migration 0094 already enforces', () => {
    expect(isEvidenceReference('synthetic-review:fixture/0001')).toBe(true);
    expect(isEvidenceReference('doc-register:2026/qa/000123')).toBe(true);
    expect(isEvidenceReference('reg:a')).toBe(true); // three is the shortest scheme
    expect(isEvidenceReference('re:a')).toBe(false); // two is one too few
    expect(isEvidenceReference('Doc-Register:x')).toBe(false); // scheme not lower case
    expect(isEvidenceReference('doc-register:')).toBe(false); // no locator
    expect(isEvidenceReference('a signed agreement, in the drawer')).toBe(false);
  });

  it('refuses the UNVERIFIED sentinel, so absence cannot masquerade as evidence', () => {
    expect(isEvidenceReference(NO_EVIDENCE)).toBe(false);
    expect(EvidenceReference.tryOf(NO_EVIDENCE)).toBeUndefined();
    expect(() => EvidenceReference.of(NO_EVIDENCE)).toThrow(InvalidReferenceError);
  });

  it('never quotes the rejected value in the refusal', () => {
    const secret = 'partnership-agreement-with-a-counterparty-nobody-announced';

    let refusal = '';
    try {
      EvidenceReference.of(secret);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidReferenceError);
      refusal = (error as Error).message;
    }

    expect(refusal).not.toBe('');
    expect(refusal).not.toContain(secret);
  });

  it('is nominal: a matching string is not an EvidenceReference until it is made one', () => {
    const raw = 'doc-register:2026/qa/000123';

    // @ts-expect-error a string that happens to match the shape is still a string
    const notAReference: ReturnType<typeof EvidenceReference.of> = raw;

    expect(EvidenceReference.of(notAReference)).toBe(raw);
  });
});
