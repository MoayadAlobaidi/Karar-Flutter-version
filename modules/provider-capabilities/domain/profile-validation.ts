/**
 * The rules a reviewed profile has to satisfy, as data in and violations out.
 *
 * Pure by construction: no I/O, no clock, no randomness — the discipline
 * `packages/capability-registry/src/validation.ts` holds, and for the same
 * reason. A validator that could read anything would eventually be asked to
 * check a claim by making a request, and this module makes no requests.
 *
 * ## The two rules that are not bookkeeping
 *
 * Most of what follows is shape: no duplicates, whole counts, a wallet kind
 * exactly when there is a wallet. Two rules carry the module's actual claim.
 *
 * **A rail may not be described as available while nobody has evidenced the
 * issuer's regulatory standing.** Marking a rail `VERIFIED` says a reviewer
 * read a document describing an interface; saying so about an issuer whose
 * standing in that market nobody has checked puts the interesting claim
 * (there is a way in) in front of the load-bearing one (this is a regulated
 * entity we may receive data from). ADR-0024's rule that a row never implies a
 * legal fact is the same rule read from the other end.
 *
 * **A rail may not be described as available when the only route in is a
 * consent method this platform will never use.** An issuer whose sole method
 * is embedded credential entry or screen scraping offers this platform
 * nothing: no credential of any kind is stored anywhere here, there is no
 * scraping and no browser automation (ADR-0028). Recording the method is right
 * — that is a fact about the issuer — and recording an available rail beside
 * it would be a fact about Karar that is false.
 *
 * ## What this validator deliberately does NOT do
 *
 * It does not check that an available rail is implemented, and it must not.
 * Whether a rail can carry a connection is `modules/financial-connections`'
 * question, decided by its migration-0096 CHECK; a profile describing
 * `OPEN_FINANCE_API` as available under a published mandate is a legitimate,
 * accurate description of the world, and refusing to record it here would make
 * the model lie in order to look safe. What must not happen is a caller
 * treating the description as permission, and that is prevented by the type
 * (`data-rails.ts`), not by this file.
 */

import { isVerified } from './capability-assertion.js';
import type { ProviderCapabilityProfile } from './capability-profile.js';
import { capabilityProfileKey } from './capability-profile.js';
import { railsDescribedAsAvailable } from './data-rails.js';
import { isPositiveWholeCount } from './described-limits.js';
import type { ProfileViolation } from './errors.js';
import { InvalidCapabilityProfileError } from './errors.js';
import { accessStageRequiresEvidence, isAcceptableConsentMethod } from './vocabularies.js';

/** Values repeated in a list that is conceptually a set. */
function duplicatesIn(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Every rule this module holds about one profile.
 *
 * Returns all violations rather than the first: a reviewer fixing authored
 * configuration wants the whole list, and a validator that stops at one turns
 * a single review into four.
 */
export function validateCapabilityProfile(
  profile: ProviderCapabilityProfile,
): readonly ProfileViolation[] {
  const violations: ProfileViolation[] = [];

  // --- the wallet invariant, echoed from ADR-0028 ---------------------------
  // The accounts module states it exactly: walletKind is present if and only
  // if accountType is WALLET. A description of an interface obeys the same
  // biconditional, because a profile listing wallet kinds for an interface
  // that covers no wallets describes an account nobody can create.
  const describesWallets = profile.supportedAccountTypes.includes('WALLET');
  if (!describesWallets && profile.supportedWalletKinds.length > 0) {
    violations.push({
      rule: 'WALLET_KINDS_WITHOUT_WALLET_ACCOUNT_TYPE',
      field: 'supportedWalletKinds',
      message:
        'wallet kinds are described but WALLET is not among the account types. A wallet kind ' +
        'qualifies a wallet; without one it qualifies nothing, and ADR-0028 states the rule as a ' +
        'biconditional rather than an implication',
    });
  }
  if (describesWallets && profile.supportedWalletKinds.length === 0) {
    violations.push({
      rule: 'WALLET_ACCOUNT_TYPE_WITHOUT_WALLET_KINDS',
      field: 'supportedWalletKinds',
      message:
        'WALLET is among the account types but no wallet kind is described. A payroll wallet and ' +
        'a prepaid wallet behave differently and a reader must not have to infer which from a ' +
        'display name — OTHER is the honest answer when the kind is genuinely unestablished',
    });
  }

  // --- sets are sets -------------------------------------------------------
  if (duplicatesIn(profile.supportedAccountTypes)) {
    violations.push({
      rule: 'DUPLICATE_ACCOUNT_TYPE',
      field: 'supportedAccountTypes',
      message: 'an account type is listed more than once — the description is a set',
    });
  }
  if (duplicatesIn(profile.supportedWalletKinds)) {
    violations.push({
      rule: 'DUPLICATE_WALLET_KIND',
      field: 'supportedWalletKinds',
      message: 'a wallet kind is listed more than once — the description is a set',
    });
  }
  if (duplicatesIn(profile.currencies.map((currency) => currency.code))) {
    violations.push({
      rule: 'DUPLICATE_CURRENCY',
      field: 'currencies',
      message: 'a currency is listed more than once — the description is a set',
    });
  }

  // --- a profile that describes nothing is not a profile --------------------
  if (profile.supportedAccountTypes.length === 0) {
    violations.push({
      rule: 'NO_ACCOUNT_TYPE_DESCRIBED',
      field: 'supportedAccountTypes',
      message:
        'no account type is described. An issuer with no data interface at all still holds ' +
        'products a person has, and naming them is most of what such a profile is for',
    });
  }
  if (profile.currencies.length === 0) {
    violations.push({
      rule: 'NO_CURRENCY_DESCRIBED',
      field: 'currencies',
      message:
        'no currency is described. A balance in a currency nobody named is a figure nothing can ' +
        'interpret, and the same is true of a description of one',
    });
  }

  // --- an onboarding claim carries its evidence -----------------------------
  // Migration 0094 refuses provider_access_status = 'AVAILABLE' unless the
  // evidence column names something. This is that CHECK, in memory, for the
  // two stages that assert something happened between this platform and an
  // issuer. VERIFIED is unconstructible without an evidence reference, so
  // requiring VERIFIED here is requiring the reference.
  for (const [field, access] of [
    ['sandbox', profile.sandbox],
    ['productionOnboarding', profile.productionOnboarding],
  ] as const) {
    if (accessStageRequiresEvidence(access.stage) && !isVerified(access.assertion)) {
      violations.push({
        rule: 'ACCESS_STAGE_WITHOUT_EVIDENCE',
        field,
        message:
          `stage '${access.stage}' asserts that something passed between this platform and an ` +
          'issuer, so its assertion must be VERIFIED — which cannot be constructed without an ' +
          'evidence reference. An onboarding nobody can cite did not happen',
      });
    }
  }

  // --- the two rules that carry the claim ----------------------------------
  const availableRails = railsDescribedAsAvailable(profile.dataRails);
  if (availableRails.length > 0 && !isVerified(profile.regulatoryStanding)) {
    violations.push({
      rule: 'AVAILABLE_RAIL_WITHOUT_REGULATORY_EVIDENCE',
      field: 'dataRails',
      message:
        'a data rail is described as available while the issuer regulatory standing in this ' +
        'market is not evidenced. The interesting claim must not outrun the load-bearing one: ' +
        'whether there is a way in matters only once it is established whose data it is and ' +
        'under what licence it is held',
    });
  }
  if (availableRails.length > 0 && !isAcceptableConsentMethod(profile.consentMethod.method)) {
    violations.push({
      rule: 'AVAILABLE_RAIL_WITH_UNUSABLE_CONSENT_METHOD',
      field: 'dataRails',
      message:
        'a data rail is described as available while the only described consent method is one ' +
        'this platform will never use. No credential of any kind is stored anywhere here, there ' +
        'is no scraping and no browser automation (ADR-0028), so a rail reachable only that way ' +
        'is not available to Karar — recording the method is right, recording the rail beside it ' +
        'is not',
    });
  }

  // --- figures are whole counts --------------------------------------------
  if (
    profile.transactionHistoryDepth.kind === 'DESCRIBED_DAYS' &&
    !isPositiveWholeCount(profile.transactionHistoryDepth.days)
  ) {
    violations.push({
      rule: 'HISTORY_DEPTH_NOT_A_WHOLE_COUNT',
      field: 'transactionHistoryDepth',
      message: 'a described history depth is a whole number of days greater than zero',
    });
  }
  for (const [field, quota] of [
    ['refreshLimit', profile.refreshLimit],
    ['rateLimit', profile.rateLimit],
  ] as const) {
    if (quota.kind === 'DESCRIBED' && !isPositiveWholeCount(quota.count)) {
      violations.push({
        rule: 'QUOTA_NOT_A_WHOLE_COUNT',
        field,
        message: 'a described quota is a whole count greater than zero, per a named window',
      });
    }
  }

  return Object.freeze(violations);
}

/**
 * Every rule above, over a whole set of profiles, plus the one rule that only
 * a set can violate: two profiles describing the same issuer, market and
 * segment. Both would be believed, they would disagree, and which one a reader
 * got would depend on iteration order.
 */
export function validateCapabilityProfiles(
  profiles: readonly ProviderCapabilityProfile[],
): readonly ProfileViolation[] {
  const violations: ProfileViolation[] = [];
  const seen = new Set<string>();

  for (const profile of profiles) {
    const key = capabilityProfileKey(profile);
    if (seen.has(key)) {
      violations.push({
        rule: 'DUPLICATE_PROFILE_SUBJECT',
        field: 'institutionRef',
        message:
          'two profiles describe the same issuer, market and segment. One issuer in one market ' +
          'for one segment has one reviewed description; two would disagree, and which one a ' +
          'reader saw would depend on iteration order',
      });
    }
    seen.add(key);
    violations.push(...validateCapabilityProfile(profile));
  }

  return Object.freeze(violations);
}

/**
 * Throwing form, for construction-time use over authored configuration.
 *
 * An invalid reviewed profile is a defect in the repository rather than an
 * expected outcome at a boundary, so it throws — the same call the capability
 * registry's `assertValidRegistry` makes, for the same reason.
 */
export function assertValidCapabilityProfiles(
  profiles: readonly ProviderCapabilityProfile[],
): void {
  const violations = validateCapabilityProfiles(profiles);
  if (violations.length > 0) {
    throw new InvalidCapabilityProfileError(violations);
  }
}
