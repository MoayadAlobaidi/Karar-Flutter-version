/**
 * The shape ADR-0028 requires the model to express: **a mobile-money wallet
 * from a telco, described without naming one.**
 *
 * A telco financial arm, wallet-bearing, with a consumer app its customers use
 * daily and no data interface to Karar on any rail. The fixture is synthetic —
 * "TELCO ALPHA", a company that does not exist — and the profile type has no
 * name field at all, so the description could not name a real issuer even if a
 * fixture author wanted it to.
 *
 * What this proves is that the SHAPE is sufficient. Nothing in the type
 * system, the vocabularies or the validator had to be special-cased for this
 * case: it is a `TELCO_FINANCIAL_SERVICES` issuer with `WALLET` among its
 * account types, `MOBILE_MONEY` among its wallet kinds, thirteen unavailable
 * rails and a verified consumer app. Every one of those words already existed
 * for a general reason.
 */

import { describe, expect, it } from 'vitest';

import { isVerified } from '../domain/capability-assertion.js';
import { railsDescribedAsAvailable } from '../domain/data-rails.js';
import { validateCapabilityProfile } from '../domain/profile-validation.js';
import { SYNTHETIC_TELCO_WALLET_PROFILE } from './fixtures.js';

const profile = SYNTHETIC_TELCO_WALLET_PROFILE;

describe('a synthetic telco mobile-money issuer', () => {
  it('is expressible without a single provider-specific field', () => {
    expect(profile.institutionKind).toBe('TELCO_FINANCIAL_SERVICES');
    expect([...profile.supportedAccountTypes]).toEqual(['WALLET']);
    expect([...profile.supportedWalletKinds]).toEqual(['MOBILE_MONEY']);
    expect(profile.customerSegment).toBe('RETAIL');
    expect(profile.currencies.map((currency) => currency.code)).toEqual(['QAR']);
  });

  it('carries no name, brand, label, endpoint or URL — there is no field for one', () => {
    const fields = Object.keys(profile).sort();

    expect(fields).toEqual([
      'balances',
      'consentMethod',
      'consumerSurfaces',
      'currencies',
      'customerSegment',
      'dataRails',
      'dataResidency',
      'incrementalSync',
      'institutionKind',
      'institutionRef',
      'marketCountry',
      'pendingTransactions',
      'productionOnboarding',
      'rateLimit',
      'refreshLimit',
      'regulatoryStanding',
      'review',
      'sandbox',
      'statementFormats',
      'supportedAccountTypes',
      'supportedWalletKinds',
      'transactionHistoryDepth',
      'webhooks',
    ]);

    // The issuer is a reference and nothing else: a reference type and a UUID.
    expect(Object.keys(profile.institutionRef).sort()).toEqual([
      'institutionId',
      'referenceType',
    ]);
    expect(profile.institutionRef.referenceType).toBe('INSTITUTION_CATALOGUE_ENTRY');
  });

  it('records a licensed issuer that nonetheless offers Karar nothing', () => {
    // Regulatory standing evidenced — a payment institution licence is public
    // record — and that says nothing whatsoever about a data interface.
    expect(isVerified(profile.regulatoryStanding)).toBe(true);
    expect(railsDescribedAsAvailable(profile.dataRails)).toEqual([]);

    // Nothing to consent to, because there is nothing to consent about.
    expect(profile.consentMethod.method).toBe('UNKNOWN');
    expect(profile.consentMethod.assertion.state).toBe('UNVERIFIED');

    // No sandbox, no production programme, and neither claims anything.
    expect(profile.sandbox.stage).toBe('NOT_OFFERED');
    expect(profile.productionOnboarding.stage).toBe('NOT_OFFERED');
  });

  it('leaves every capability figure honestly unstated rather than zeroed', () => {
    expect(profile.transactionHistoryDepth.kind).toBe('UNSTATED');
    expect(profile.refreshLimit.kind).toBe('UNSTATED');
    expect(profile.rateLimit.kind).toBe('UNSTATED');
    expect(profile.dataResidency.kind).toBe('UNSTATED');
    expect(profile.balances.BOOKED.state).toBe('UNVERIFIED');
    expect(profile.balances.AVAILABLE.state).toBe('UNVERIFIED');
    expect(profile.pendingTransactions.state).toBe('UNVERIFIED');
    expect(profile.incrementalSync.state).toBe('UNVERIFIED');
    expect(profile.webhooks.state).toBe('UNVERIFIED');
    for (const format of Object.values(profile.statementFormats)) {
      expect(format.state).toBe('UNVERIFIED');
    }
  });

  it('satisfies every rule the module holds', () => {
    expect(validateCapabilityProfile(profile)).toEqual([]);
  });
});
