/**
 * The provider capability profile: what one issuer's data interface COULD
 * offer, in one market, for one customer segment, **as reviewed configuration
 * and never as a live fact**.
 *
 * ## What a profile is, said as precisely as possible
 *
 * It is the written result of a review. Somebody read a published
 * specification, a regulator's mandate, a partnership term sheet, or an
 * issuer's support page, and recorded what it said and where they read it.
 * That is all. A profile is not a health check, not a probe result, not a
 * cache of anything, and not a permission. Nothing in this module ever
 * contacted an issuer, and nothing in it can: there is no client, no port that
 * writes, no repository, and no import of another module at all — not even a
 * type one (`domain/vocabularies.ts` records why the vocabularies are mirrored
 * instead).
 *
 * The distinction between this and `modules/financial-connections`'
 * `SourceCapabilities` is worth stating because the two look similar and are
 * opposites. That type records what this platform has OBSERVED arriving
 * through one subject's link — evidence from experience, per person, and its
 * vocabulary deliberately has no `VERIFIED` value. This type records what a
 * document SAYS an interface could do — evidence from reading, per issuer, and
 * `VERIFIED` exists here precisely because a document is a thing you can cite.
 * Neither is derivable from the other and no code converts between them.
 *
 * ## Identity: issuer, market, segment. Nothing else, and no name
 *
 * A profile is identified by the issuer it points at, the market it describes
 * and the segment it serves. It holds no issuer name, brand or label — see
 * `domain/refs.ts` for why that absence is load-bearing rather than an
 * oversight, and note the consequence: a profile CANNOT contain
 * provider-specific vocabulary, so the rule that no such vocabulary appears in
 * domain or application code is a property of the type rather than a
 * discipline.
 *
 * One issuer operating in four markets is four profiles, exactly as it is four
 * `institution_markets` rows and one `institutions` row (migration 0094). It
 * is never four issuers.
 *
 * ## Country, not Jurisdiction
 *
 * `marketCountry` is geography. Which legal regime governs a subject is a
 * PolicyPack question with nothing to do with which issuers exist somewhere
 * (jurisdiction-policy.md §1), and no code in this module branches on either.
 *
 * ## No table, and the reason
 *
 * This module owns no database table and adds no migration. A reviewed profile
 * is code — authored, diffed, reviewed and deployed as a unit — for the same
 * reason the capability registry is code: adding one is a reviewed change,
 * never configuration, and a row would let one be created by an UPDATE nobody
 * read. The platform also has zero real profiles today, and the standing rule
 * is not to create an unused table for a future possibility. The reference
 * data a profile points at already lives in `public.institutions` and
 * `public.institution_markets`, which are the tables that exist because they
 * hold facts about the world rather than facts about our review of it.
 */

import type { CalendarDay, Currency } from '@karar/shared-kernel';

import type { CapabilityAssertion } from './capability-assertion.js';
import { UNVERIFIED } from './capability-assertion.js';
import type { ConsumerSurfaceProfile } from './consumer-surfaces.js';
import { NO_SURFACE_REVIEWED } from './consumer-surfaces.js';
import type { DataRailProfile } from './data-rails.js';
import { NO_RAIL_REVIEWED } from './data-rails.js';
import type {
  DataResidencyRequirement,
  DescribedHistoryDepth,
  DescribedQuota,
} from './described-limits.js';
import { HISTORY_DEPTH_UNSTATED, QUOTA_UNSTATED, RESIDENCY_UNSTATED } from './described-limits.js';
import type { CountryCode, EvidenceReference, InstitutionRef } from './refs.js';
import type {
  AccessStage,
  AccountType,
  ConsentMethod,
  CustomerSegment,
  InstitutionKind,
  StatementFormat,
  WalletKind,
} from './vocabularies.js';

/**
 * The two balance figures a profile describes. A SUBSET of `BALANCE_KINDS` in
 * `modules/financial-accounts/domain/balance-snapshot.ts`, mirrored here for
 * the reason `domain/vocabularies.ts` records at length: a domain layer may
 * not import another module, and the mirror is checked against the owner in
 * `__tests__/mirrored-vocabularies.test.ts` rather than trusted.
 *
 * BOOKED and AVAILABLE are the two that disagree, by amounts that matter, for
 * days at a time — a pending card authorisation is exactly that gap. The other
 * four kinds that module names are not profiled here: `CREDIT_LIMIT` is not a
 * balance a person holds, `OUTSTANDING` and `CURRENT` are statement vocabulary
 * rather than interface capabilities, and `OTHER_SOURCE_REPORTED` is an honest
 * home for a figure rather than something an interface advertises.
 */
export const PROFILED_BALANCE_KINDS = ['BOOKED', 'AVAILABLE'] as const;
export type ProfiledBalanceKind = (typeof PROFILED_BALANCE_KINDS)[number];

/** A consent method, and what a review found about it. */
export interface ConsentMethodDescription {
  readonly method: ConsentMethod;
  readonly assertion: CapabilityAssertion;
}

/**
 * How far an onboarding has got, and the evidence for saying so. The validator
 * refuses `APPLIED` or `GRANTED` unless the assertion is `VERIFIED`, which is
 * unconstructible without an evidence reference.
 */
export interface AccessDescription {
  readonly stage: AccessStage;
  readonly assertion: CapabilityAssertion;
}

/**
 * The review that produced the profile as a whole, required on every profile.
 *
 * Migration 0094 makes `display_review_ref` NOT NULL for the same reason: an
 * unreviewed entry has nowhere to hide. A profile whose individual assertions
 * are all `UNVERIFIED` is perfectly legitimate — it says a reviewer looked and
 * found nothing established — but that a reviewer looked at all is itself a
 * claim, and it carries a reference.
 */
export interface ProfileReview {
  readonly reference: EvidenceReference;
  readonly reviewedOn: CalendarDay;
}

/**
 * The profile. Every field is a description; none is a permission.
 *
 * Total records (`dataRails`, `consumerSurfaces`, `balances`,
 * `statementFormats`) rather than lists, so silence about a rail or a format
 * is not expressible — an unexamined one is `UNVERIFIED`, which is a different
 * and honest claim.
 */
export interface ProviderCapabilityProfile {
  /** The reviewed catalogue row this profile describes. Never a name. */
  readonly institutionRef: InstitutionRef;
  /** Where. Geography, never a legal regime. */
  readonly marketCountry: CountryCode;
  /** Who the interface serves. */
  readonly customerSegment: CustomerSegment;
  /** What kind of issuer it is, in the catalogue's vocabulary (mirrored). */
  readonly institutionKind: InstitutionKind;
  /** Whether the issuer's regulatory standing in this market was evidenced. */
  readonly regulatoryStanding: CapabilityAssertion;
  /** Channels the issuer offers ITS OWN customers. Never a data rail. */
  readonly consumerSurfaces: ConsumerSurfaceProfile;
  /** What a review found about each rail. Never a permission to use one. */
  readonly dataRails: DataRailProfile;
  /** How a person would authorise, if a rail existed. */
  readonly consentMethod: ConsentMethodDescription;
  /** Account types the interface is described as covering. */
  readonly supportedAccountTypes: readonly AccountType[];
  /** Wallet kinds, present exactly when WALLET is among the account types. */
  readonly supportedWalletKinds: readonly WalletKind[];
  /** Currencies the interface is described as reporting in. */
  readonly currencies: readonly Currency[];
  /** BOOKED and AVAILABLE, described separately because they disagree. */
  readonly balances: Readonly<Record<ProfiledBalanceKind, CapabilityAssertion>>;
  readonly pendingTransactions: CapabilityAssertion;
  readonly transactionHistoryDepth: DescribedHistoryDepth;
  readonly incrementalSync: CapabilityAssertion;
  readonly webhooks: CapabilityAssertion;
  readonly statementFormats: Readonly<Record<StatementFormat, CapabilityAssertion>>;
  readonly refreshLimit: DescribedQuota;
  readonly rateLimit: DescribedQuota;
  readonly sandbox: AccessDescription;
  readonly productionOnboarding: AccessDescription;
  readonly dataResidency: DataResidencyRequirement;
  /** The review that produced this profile. Required, and never minted here. */
  readonly review: ProfileReview;
}

/** Nobody has looked at any statement format. */
export const NO_STATEMENT_FORMAT_REVIEWED: Readonly<Record<StatementFormat, CapabilityAssertion>> =
  Object.freeze({
    CSV: UNVERIFIED,
    XLSX: UNVERIFIED,
    PDF: UNVERIFIED,
    OFX: UNVERIFIED,
    QFX: UNVERIFIED,
    QIF: UNVERIFIED,
    ISO_20022_CAMT: UNVERIFIED,
    SWIFT_MT940: UNVERIFIED,
    OTHER: UNVERIFIED,
  });

/** Nobody has looked at either balance figure. */
export const NO_BALANCE_REVIEWED: Readonly<Record<ProfiledBalanceKind, CapabilityAssertion>> =
  Object.freeze({
    BOOKED: UNVERIFIED,
    AVAILABLE: UNVERIFIED,
  });

/** Nobody has established how a person would authorise. */
export const CONSENT_METHOD_UNKNOWN: ConsentMethodDescription = Object.freeze({
  method: 'UNKNOWN' as const,
  assertion: UNVERIFIED,
});

/** The truthful onboarding state everywhere today: nothing is on offer. */
export const ACCESS_NOT_OFFERED: AccessDescription = Object.freeze({
  stage: 'NOT_OFFERED' as const,
  assertion: UNVERIFIED,
});

/** The four facts that identify and situate a profile, plus its review. */
type ProfileIdentity =
  | 'institutionRef'
  | 'marketCountry'
  | 'customerSegment'
  | 'institutionKind'
  | 'review';

/**
 * What a caller must supply to build a profile: the identity above, and the
 * review that produced it. Everything else has an honest ground state and may
 * be left out.
 *
 * The optionality runs this way round on purpose. A profile author who has to
 * type out twenty-two `UNVERIFIED` values will eventually copy somebody else's
 * profile and edit it, which is how one issuer's reviewed findings end up
 * attributed to another. Defaulting to "nobody has looked" costs nothing and
 * claims nothing.
 */
export type CapabilityProfileDraft = Pick<ProviderCapabilityProfile, ProfileIdentity> &
  Partial<Omit<ProviderCapabilityProfile, ProfileIdentity>>;

/**
 * Fill a draft out to a whole profile. Pure, total, and deliberately NOT a
 * validator: `validateCapabilityProfile` is where rules live, so a caller can
 * inspect a profile's violations rather than have construction throw them
 * away.
 *
 * There is no `id` and no timestamp because there is no row. A profile's
 * provenance is its `review` reference and the commit that introduced it.
 */
export function capabilityProfile(draft: CapabilityProfileDraft): ProviderCapabilityProfile {
  return Object.freeze({
    institutionRef: draft.institutionRef,
    marketCountry: draft.marketCountry,
    customerSegment: draft.customerSegment,
    institutionKind: draft.institutionKind,
    regulatoryStanding: draft.regulatoryStanding ?? UNVERIFIED,
    consumerSurfaces: draft.consumerSurfaces ?? NO_SURFACE_REVIEWED,
    dataRails: draft.dataRails ?? NO_RAIL_REVIEWED,
    consentMethod: draft.consentMethod ?? CONSENT_METHOD_UNKNOWN,
    supportedAccountTypes: Object.freeze([...(draft.supportedAccountTypes ?? [])]),
    supportedWalletKinds: Object.freeze([...(draft.supportedWalletKinds ?? [])]),
    currencies: Object.freeze([...(draft.currencies ?? [])]),
    balances: draft.balances ?? NO_BALANCE_REVIEWED,
    pendingTransactions: draft.pendingTransactions ?? UNVERIFIED,
    transactionHistoryDepth: draft.transactionHistoryDepth ?? HISTORY_DEPTH_UNSTATED,
    incrementalSync: draft.incrementalSync ?? UNVERIFIED,
    webhooks: draft.webhooks ?? UNVERIFIED,
    statementFormats: draft.statementFormats ?? NO_STATEMENT_FORMAT_REVIEWED,
    refreshLimit: draft.refreshLimit ?? QUOTA_UNSTATED,
    rateLimit: draft.rateLimit ?? QUOTA_UNSTATED,
    sandbox: draft.sandbox ?? ACCESS_NOT_OFFERED,
    productionOnboarding: draft.productionOnboarding ?? ACCESS_NOT_OFFERED,
    dataResidency: draft.dataResidency ?? RESIDENCY_UNSTATED,
    review: draft.review,
  });
}

/** What a profile is ABOUT: the three facts that pick out exactly one. */
export interface ProfileSubject {
  readonly institutionRef: InstitutionRef;
  readonly marketCountry: CountryCode;
  readonly customerSegment: CustomerSegment;
}

/**
 * The subject of a profile as one string: issuer, market, segment.
 *
 * One function rather than two so a lookup and a duplicate check can never
 * disagree about what identity means — a catalogue that keys profiles one way
 * and de-duplicates them another has two identities and will eventually return
 * the wrong description for the right question.
 *
 * It is a key and never a display value: it contains a UUID and two codes, and
 * no name, because there is no name to contain.
 */
export function profileSubjectKey(subject: ProfileSubject): string {
  return `${subject.institutionRef.institutionId}|${subject.marketCountry}|${subject.customerSegment}`;
}

/** The subject key of a whole profile. */
export function capabilityProfileKey(profile: ProviderCapabilityProfile): string {
  return profileSubjectKey(profile);
}
