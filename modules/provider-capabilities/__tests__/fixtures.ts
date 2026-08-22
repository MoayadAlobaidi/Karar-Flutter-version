/**
 * Test fixtures.
 *
 * **Every issuer here is synthetic and visibly so.** No real bank, telco,
 * e-money issuer, aggregator, exchange house or wallet provider is named
 * anywhere in this module, in production source or in tests, and none may be.
 * The names below — TELCO ALPHA, BANK BETA — exist only in identifiers and
 * comments in this file; the profile type itself has no name field at all, so
 * they cannot travel into a value (see `domain/refs.ts`).
 *
 * The issuer references are obviously fake UUIDs in an ascending sequence. A
 * plausible-looking UUID in a fixture is the first step towards somebody
 * pasting a real catalogue id into one.
 *
 * **Nothing here is exported from `public-api.ts`**, so no application can
 * reach these profiles: `__tests__/` is outside the module's only legal import
 * surface (architecture test 3). The shipped registry stays empty.
 */

import { CalendarDay, Currency } from '@karar/shared-kernel';

import { UNVERIFIED, unavailable, verified } from '../domain/capability-assertion.js';
import type { ProviderCapabilityProfile } from '../domain/capability-profile.js';
import { capabilityProfile } from '../domain/capability-profile.js';
import { NO_SURFACE_REVIEWED } from '../domain/consumer-surfaces.js';
import type { DataRailProfile } from '../domain/data-rails.js';
import { NO_RAIL_AVAILABLE } from '../domain/data-rails.js';
import { EvidenceReference, InstitutionRef, CountryCode } from '../domain/refs.js';

/** A synthetic telco financial arm. Not a real issuer; there is no such company. */
export const SYNTHETIC_TELCO_ALPHA = InstitutionRef.of('00000000-0000-4000-8000-000000000001');

/** A synthetic bank. Not a real issuer. */
export const SYNTHETIC_BANK_BETA = InstitutionRef.of('00000000-0000-4000-8000-000000000002');

/** A synthetic market. QA is the launch market's country code and nothing more. */
export const SYNTHETIC_MARKET = CountryCode.of('QA');

/**
 * A synthetic evidence locator. It resolves to nothing: the scheme is
 * deliberately not one any real register uses, so a reader who follows it
 * finds out immediately that it is a fixture.
 */
export const SYNTHETIC_EVIDENCE = EvidenceReference.of('synthetic-review:fixture/0001');

export const SYNTHETIC_REVIEW_DAY = CalendarDay.parse('2026-08-19');

export const SYNTHETIC_REVIEW = Object.freeze({
  reference: SYNTHETIC_EVIDENCE,
  reviewedOn: SYNTHETIC_REVIEW_DAY,
});

/** A VERIFIED assertion over the synthetic evidence above. */
export function syntheticallyVerified() {
  return verified(SYNTHETIC_EVIDENCE, SYNTHETIC_REVIEW_DAY);
}

/**
 * The case ADR-0028 names: a **mobile-money wallet from a telco**, described
 * without naming one.
 *
 * A synthetic telco financial arm that issues a mobile-money wallet, has a
 * consumer app its customers use every day, and offers **no data interface to
 * Karar on any rail**. Every one of the thirteen rails is `UNAVAILABLE`, the
 * consent method is `UNKNOWN` because there is nothing to consent to, and both
 * onboarding stages are `NOT_OFFERED`.
 *
 * The regulatory standing IS verified, which is the realistic shape: a telco
 * financial arm in this market is a licensed payment institution whose licence
 * is a matter of public record, and that has nothing whatsoever to do with
 * whether it exposes an API. Recording the first while refusing the second is
 * exactly what this model has to be able to do.
 */
export const SYNTHETIC_TELCO_WALLET_PROFILE: ProviderCapabilityProfile = capabilityProfile({
  institutionRef: SYNTHETIC_TELCO_ALPHA,
  marketCountry: SYNTHETIC_MARKET,
  customerSegment: 'RETAIL',
  institutionKind: 'TELCO_FINANCIAL_SERVICES',
  regulatoryStanding: syntheticallyVerified(),
  consumerSurfaces: {
    ...NO_SURFACE_REVIEWED,
    // The app exists, and a reviewer read the store listing. It implies
    // nothing about a data rail, and the rails below say so.
    CONSUMER_MOBILE_APP: syntheticallyVerified(),
    USSD_OR_SMS_CHANNEL: syntheticallyVerified(),
    BRANCH_OR_AGENT_NETWORK: syntheticallyVerified(),
    CONSUMER_WEB_PORTAL: unavailable('no customer web portal is offered in this market'),
  },
  dataRails: NO_RAIL_AVAILABLE,
  consentMethod: {
    method: 'UNKNOWN',
    assertion: UNVERIFIED,
  },
  supportedAccountTypes: ['WALLET'],
  supportedWalletKinds: ['MOBILE_MONEY'],
  currencies: [Currency.get('QAR')],
  review: SYNTHETIC_REVIEW,
});

/**
 * A synthetic bank with nothing established about it at all. The honest shape
 * of a profile somebody opened and has not filled in: every assertion is
 * `UNVERIFIED`, which says nobody looked rather than that nothing exists.
 */
export const SYNTHETIC_UNREVIEWED_BANK_PROFILE: ProviderCapabilityProfile = capabilityProfile({
  institutionRef: SYNTHETIC_BANK_BETA,
  marketCountry: SYNTHETIC_MARKET,
  customerSegment: 'RETAIL',
  institutionKind: 'BANK',
  supportedAccountTypes: ['CURRENT', 'SAVINGS', 'CREDIT_CARD'],
  currencies: [Currency.get('QAR'), Currency.get('USD')],
  review: SYNTHETIC_REVIEW,
});

/** Every rail VERIFIED as available. The maximally optimistic description. */
export function allRailsDescribedAsAvailable(): DataRailProfile {
  const evidenced = syntheticallyVerified();
  return Object.freeze({
    MANUAL: evidenced,
    USER_FILE_UPLOAD: evidenced,
    OPEN_FINANCE_API: evidenced,
    DIRECT_BANK_OR_WALLET_API: evidenced,
    LICENSED_AGGREGATOR_API: evidenced,
    HOST_TO_HOST_SFTP: evidenced,
    ISO_20022_FILE: evidenced,
    SWIFT_MT_FILE: evidenced,
    OFX_QFX_FILE: evidenced,
    QIF_FILE: evidenced,
    PDF_STATEMENT: evidenced,
    SECURE_EMAIL_STATEMENT: evidenced,
    DEVICE_SIGNAL: evidenced,
  });
}

/**
 * The profile a hostile reviewer would write: a synthetic bank whose every
 * rail is evidenced as available, whose regulatory standing is evidenced, and
 * whose consent method is acceptable — so nothing in the validator refuses it.
 * It exists to prove that even a profile with nothing wrong with it cannot
 * make a rail executable.
 */
export const SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE: ProviderCapabilityProfile =
  capabilityProfile({
    institutionRef: SYNTHETIC_BANK_BETA,
    marketCountry: SYNTHETIC_MARKET,
    customerSegment: 'RETAIL',
    institutionKind: 'BANK',
    regulatoryStanding: syntheticallyVerified(),
    dataRails: allRailsDescribedAsAvailable(),
    consentMethod: { method: 'REDIRECT_TO_ISSUER', assertion: syntheticallyVerified() },
    supportedAccountTypes: ['CURRENT', 'SAVINGS'],
    currencies: [Currency.get('QAR')],
    review: SYNTHETIC_REVIEW,
  });
