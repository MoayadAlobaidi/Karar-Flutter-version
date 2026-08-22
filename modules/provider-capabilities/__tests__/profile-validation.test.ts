/**
 * The rules over an authored profile, and the two that carry the module's
 * claim: an available rail needs evidenced regulatory standing, and an
 * available rail needs a consent method this platform could ever use.
 *
 * Every case builds on a synthetic profile and changes one thing, so what is
 * under test is the rule rather than the fixture.
 */

import { describe, expect, it } from 'vitest';

import { Currency } from '@karar/shared-kernel';

import { UNVERIFIED } from '../domain/capability-assertion.js';
import { capabilityProfile } from '../domain/capability-profile.js';
import type { ProfileRule } from '../domain/errors.js';
import { InvalidCapabilityProfileError } from '../domain/errors.js';
import {
  assertValidCapabilityProfiles,
  validateCapabilityProfile,
  validateCapabilityProfiles,
} from '../domain/profile-validation.js';
import {
  SYNTHETIC_BANK_BETA,
  SYNTHETIC_MARKET,
  SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE,
  SYNTHETIC_REVIEW,
  SYNTHETIC_TELCO_WALLET_PROFILE,
  SYNTHETIC_UNREVIEWED_BANK_PROFILE,
  allRailsDescribedAsAvailable,
  syntheticallyVerified,
} from './fixtures.js';

function rulesOf(violations: readonly { readonly rule: ProfileRule }[]): readonly ProfileRule[] {
  return violations.map((violation) => violation.rule);
}

describe('the wallet invariant, echoed from ADR-0028', () => {
  it('refuses wallet kinds on a profile that describes no wallet', () => {
    const profile = capabilityProfile({
      institutionRef: SYNTHETIC_BANK_BETA,
      marketCountry: SYNTHETIC_MARKET,
      customerSegment: 'RETAIL',
      institutionKind: 'BANK',
      supportedAccountTypes: ['CURRENT'],
      supportedWalletKinds: ['MOBILE_MONEY'],
      currencies: [Currency.get('QAR')],
      review: SYNTHETIC_REVIEW,
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'WALLET_KINDS_WITHOUT_WALLET_ACCOUNT_TYPE',
    ]);
  });

  it('refuses a wallet account type with no wallet kind', () => {
    const profile = capabilityProfile({
      institutionRef: SYNTHETIC_BANK_BETA,
      marketCountry: SYNTHETIC_MARKET,
      customerSegment: 'RETAIL',
      institutionKind: 'FINTECH_WALLET',
      supportedAccountTypes: ['WALLET'],
      currencies: [Currency.get('QAR')],
      review: SYNTHETIC_REVIEW,
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'WALLET_ACCOUNT_TYPE_WITHOUT_WALLET_KINDS',
    ]);
  });
});

describe('an onboarding claim carries its evidence', () => {
  it('refuses GRANTED without a VERIFIED assertion, which means without a reference', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      sandbox: { stage: 'GRANTED', assertion: UNVERIFIED },
      productionOnboarding: { stage: 'APPLIED', assertion: UNVERIFIED },
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'ACCESS_STAGE_WITHOUT_EVIDENCE',
      'ACCESS_STAGE_WITHOUT_EVIDENCE',
    ]);
  });

  it('accepts GRANTED once the assertion is VERIFIED', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      sandbox: { stage: 'GRANTED', assertion: syntheticallyVerified() },
    });

    expect(validateCapabilityProfile(profile)).toEqual([]);
  });

  it('needs nothing for the two stages that describe only the issuer', () => {
    for (const stage of ['NOT_OFFERED', 'OFFERED'] as const) {
      const profile = capabilityProfile({
        ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
        sandbox: { stage, assertion: UNVERIFIED },
      });

      expect(validateCapabilityProfile(profile)).toEqual([]);
    }
  });
});

describe('the two rules that carry the claim', () => {
  it('refuses an available rail while regulatory standing is unevidenced', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE,
      regulatoryStanding: UNVERIFIED,
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toContain(
      'AVAILABLE_RAIL_WITHOUT_REGULATORY_EVIDENCE',
    );
  });

  it('refuses an available rail whose only route in is credential entry', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE,
      consentMethod: { method: 'EMBEDDED_CREDENTIAL_ENTRY', assertion: syntheticallyVerified() },
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'AVAILABLE_RAIL_WITH_UNUSABLE_CONSENT_METHOD',
    ]);
  });

  it('refuses an available rail whose only route in is screen scraping', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE,
      consentMethod: { method: 'SCREEN_SCRAPING', assertion: syntheticallyVerified() },
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'AVAILABLE_RAIL_WITH_UNUSABLE_CONSENT_METHOD',
    ]);
  });

  it('lets an unusable consent method be RECORDED when no rail is described as available', () => {
    // Describing the world accurately is the point. An issuer whose only route
    // in is a password box is a fact worth writing down — precisely so the
    // profile can also record that no rail is available.
    const profile = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      consentMethod: { method: 'SCREEN_SCRAPING', assertion: syntheticallyVerified() },
    });

    expect(validateCapabilityProfile(profile)).toEqual([]);
  });

  it('does NOT refuse a rail that is unimplemented — that is another module decision', () => {
    // Every rail evidenced as available, including the eleven no connection can
    // be opened on. This validator says nothing about it: describing a
    // published open-finance mandate accurately is legitimate, and what must
    // not happen is a caller treating it as permission — which the type
    // prevents, not this file.
    expect(validateCapabilityProfile(SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE)).toEqual([]);
    expect(
      Object.keys(SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE.dataRails).length,
    ).toBe(13);
  });
});

describe('shape rules', () => {
  it('refuses duplicates in every list that is conceptually a set', () => {
    const profile = capabilityProfile({
      institutionRef: SYNTHETIC_BANK_BETA,
      marketCountry: SYNTHETIC_MARKET,
      customerSegment: 'RETAIL',
      institutionKind: 'BANK',
      supportedAccountTypes: ['WALLET', 'WALLET'],
      supportedWalletKinds: ['E_MONEY', 'E_MONEY'],
      currencies: [Currency.get('QAR'), Currency.get('QAR')],
      review: SYNTHETIC_REVIEW,
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'DUPLICATE_ACCOUNT_TYPE',
      'DUPLICATE_WALLET_KIND',
      'DUPLICATE_CURRENCY',
    ]);
  });

  it('refuses a profile that describes no account type and no currency', () => {
    const profile = capabilityProfile({
      institutionRef: SYNTHETIC_BANK_BETA,
      marketCountry: SYNTHETIC_MARKET,
      customerSegment: 'CORPORATE',
      institutionKind: 'OTHER',
      review: SYNTHETIC_REVIEW,
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'NO_ACCOUNT_TYPE_DESCRIBED',
      'NO_CURRENCY_DESCRIBED',
    ]);
  });

  it('refuses a described figure that is not a whole positive count', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      transactionHistoryDepth: { kind: 'DESCRIBED_DAYS', days: 0 },
      refreshLimit: { kind: 'DESCRIBED', count: -1, per: 'DAY' },
      rateLimit: { kind: 'DESCRIBED', count: 1.5, per: 'MINUTE' },
    });

    expect(rulesOf(validateCapabilityProfile(profile))).toEqual([
      'HISTORY_DEPTH_NOT_A_WHOLE_COUNT',
      'QUOTA_NOT_A_WHOLE_COUNT',
      'QUOTA_NOT_A_WHOLE_COUNT',
    ]);
  });

  it('accepts whole positive counts', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      transactionHistoryDepth: { kind: 'DESCRIBED_DAYS', days: 90 },
      refreshLimit: { kind: 'DESCRIBED', count: 4, per: 'DAY' },
      rateLimit: { kind: 'DESCRIBED', count: 60, per: 'MINUTE' },
    });

    expect(validateCapabilityProfile(profile)).toEqual([]);
  });
});

describe('over a whole set of profiles', () => {
  it('refuses two profiles describing the same issuer, market and segment', () => {
    const violations = validateCapabilityProfiles([
      SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      SYNTHETIC_UNREVIEWED_BANK_PROFILE,
    ]);

    expect(rulesOf(violations)).toEqual(['DUPLICATE_PROFILE_SUBJECT']);
  });

  it('accepts two profiles for the same issuer in different segments', () => {
    const corporate = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      customerSegment: 'CORPORATE',
    });

    expect(
      validateCapabilityProfiles([SYNTHETIC_UNREVIEWED_BANK_PROFILE, corporate]),
    ).toEqual([]);
  });

  it('throws on authored configuration that breaks a rule, and lists every rule broken', () => {
    const broken = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      dataRails: allRailsDescribedAsAvailable(),
      consentMethod: { method: 'SCREEN_SCRAPING', assertion: UNVERIFIED },
    });

    let thrown: unknown;
    try {
      assertValidCapabilityProfiles([broken]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidCapabilityProfileError);
    expect(rulesOf((thrown as InvalidCapabilityProfileError).violations)).toEqual([
      'AVAILABLE_RAIL_WITHOUT_REGULATORY_EVIDENCE',
      'AVAILABLE_RAIL_WITH_UNUSABLE_CONSENT_METHOD',
    ]);
  });

  it('accepts the synthetic telco wallet profile and passes an empty set vacuously', () => {
    expect(validateCapabilityProfiles([SYNTHETIC_TELCO_WALLET_PROFILE])).toEqual([]);
    expect(validateCapabilityProfiles([])).toEqual([]);
  });
});

describe('no violation message quotes an evidence reference', () => {
  it('names the field and the rule, never the value', () => {
    const profile = capabilityProfile({
      ...SYNTHETIC_UNREVIEWED_BANK_PROFILE,
      sandbox: { stage: 'GRANTED', assertion: UNVERIFIED },
    });

    for (const violation of validateCapabilityProfile(profile)) {
      expect(violation.message).not.toContain('synthetic-review:');
      expect(violation.message).not.toContain(SYNTHETIC_BANK_BETA.institutionId);
      expect(violation.field).not.toBe('');
    }
  });
});
