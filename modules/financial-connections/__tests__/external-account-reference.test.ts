/**
 * The external account reference shape rule — the domain half of "no full
 * account number, IBAN, PAN or wallet phone number is stored".
 *
 * This rule carries a load a byte bound cannot. `modules/financial-accounts`
 * keeps a full account number unrepresentable by bounding its mask column at
 * eight ciphertext bytes; that argument is unavailable here, because an
 * opaque source-side reference is legitimately about as long as an IBAN. So
 * the shapes are refused directly, and every refusal below is a value that
 * would otherwise have been encrypted and stored.
 *
 * The synthetic values are structurally realistic and semantically nothing:
 * `QA00` is not an allocated IBAN prefix in any live scheme these tests
 * touch, the card-shaped numbers are the standard test sequences, and no real
 * institution is named.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_EXTERNAL_REFERENCE_LENGTH,
  checkExternalReferenceShape,
  isStorableExternalReference,
  normalizeExternalReference,
} from '../domain/external-account-reference.js';
import { externalReferenceRefusalMessage } from '../domain/account-source-link.js';

describe('what may be stored', () => {
  it('accepts an opaque identifier token', () => {
    for (const value of [
      'SYNTHETIC-SRC-ACCT-ALPHA',
      'synthetic.src.acct.beta',
      'SRC:0001:ALPHA',
      'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    ]) {
      expect(isStorableExternalReference(value), value).toBe(true);
    }
  });

  it('accepts a token at exactly the bound and refuses one character more', () => {
    const atBound = 'A'.repeat(MAX_EXTERNAL_REFERENCE_LENGTH);
    expect(isStorableExternalReference(atBound)).toBe(true);
    expect(checkExternalReferenceShape(`${atBound}A`)).toBe('too_long');
  });
});

describe('what may not — the identifier shapes', () => {
  it('refuses an IBAN shape', () => {
    // Two letters, two check digits, then alphanumerics: ISO 13616.
    expect(checkExternalReferenceShape('QA00SYNT000000000000ALPHA00')).toBe(
      'looks_like_an_iban',
    );
    expect(checkExternalReferenceShape('ZZ99ABCDEFGHIJK')).toBe('looks_like_an_iban');
  });

  it('refuses a PAN-length digit run, wherever it sits', () => {
    for (const value of [
      '4111111111111111',
      'SRC-4111111111111111',
      '378282246310005',
      'ACCT378282246310005X',
    ]) {
      expect(
        checkExternalReferenceShape(value),
        value,
      ).toBe('looks_like_an_account_or_card_or_phone_number');
    }
  });

  it('refuses a wallet phone number, with or without the plus', () => {
    // Eight digits is the shortest thing that must go — an E.164 subscriber
    // number in this region — and the rule is written to that bound.
    expect(checkExternalReferenceShape('97455512345')).toBe(
      'looks_like_an_account_or_card_or_phone_number',
    );
    expect(checkExternalReferenceShape('MSISDN-97455512345')).toBe(
      'looks_like_an_account_or_card_or_phone_number',
    );
    expect(checkExternalReferenceShape('12345678')).toBe(
      'looks_like_an_account_or_card_or_phone_number',
    );
  });

  it('refuses a bare domestic account number', () => {
    expect(checkExternalReferenceShape('001234567890')).toBe(
      'looks_like_an_account_or_card_or_phone_number',
    );
  });

  it('accepts short digit groups, which is what makes the rule usable', () => {
    // A rule that refused every digit would push callers into working around
    // it, which is worse than a rule with a stated bound.
    expect(isStorableExternalReference('SRC-0001-ALPHA')).toBe(true);
    expect(isStorableExternalReference('ACCT-1234567')).toBe(true);
  });
});

describe('what may not — narrative', () => {
  it('refuses prose, spaces and punctuation', () => {
    for (const value of [
      'the joint account at the bank',
      'ALPHA ACCOUNT',
      'SRC/ALPHA',
      'SRC,ALPHA',
      'حساب اصطناعي',
    ]) {
      expect(checkExternalReferenceShape(value), value).toBe('not_an_identifier_token');
    }
  });

  it('refuses a blank value rather than storing an empty reference', () => {
    expect(checkExternalReferenceShape('')).toBe('blank');
    expect(checkExternalReferenceShape('   ')).toBe('blank');
  });
});

describe('the refusal messages', () => {
  it('never quote the value they refused', () => {
    const pan = '4111111111111111';
    const refusal = checkExternalReferenceShape(pan);
    expect(refusal).not.toBeNull();
    if (refusal === null) return;
    const message = externalReferenceRefusalMessage(refusal);
    expect(message).not.toContain(pan);
    expect(message).not.toContain('411111');
  });

  it('say which rule fired, so a caller knows what to do differently', () => {
    expect(externalReferenceRefusalMessage('looks_like_an_iban')).toMatch(/IBAN/);
    expect(
      externalReferenceRefusalMessage('looks_like_an_account_or_card_or_phone_number'),
    ).toMatch(/eight or more consecutive digits/);
    expect(externalReferenceRefusalMessage('not_an_identifier_token')).toMatch(/identifier token/);
  });
});

describe('normalisation, and the folding it deliberately does not do', () => {
  it('trims and uppercases', () => {
    expect(normalizeExternalReference('  synthetic-src-acct-alpha  ')).toBe(
      'SYNTHETIC-SRC-ACCT-ALPHA',
    );
  });

  it('does NOT strip separators', () => {
    // Folding `SRC-0001` and `SRC0001` together would make two merely SIMILAR
    // references compare as exactly equal — and an exact match is the one
    // thing this module links without asking the person.
    expect(normalizeExternalReference('SRC-0001')).not.toBe(
      normalizeExternalReference('SRC0001'),
    );
    expect(normalizeExternalReference('SRC-0001')).toContain('-');
  });

  it('is locale-independent under the identifier charset', () => {
    // ASCII only, so no Turkish dotless i and no German sharp s can make the
    // result depend on where the process is running.
    expect(normalizeExternalReference('istanbul-src')).toBe('ISTANBUL-SRC');
  });
});
