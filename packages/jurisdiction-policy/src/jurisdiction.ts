// The Jurisdiction model — which legal regime governs (jurisdiction-policy.md
// §1). Separate from Country on purpose: usually 1:1, not always (UAE free
// zones run distinct regimes), so nothing here assumes one jurisdiction per
// country, and the model carries the review lifecycle explicitly instead of
// implying that a declared jurisdiction is a legally reviewed one.
//
// No seeded jurisdiction is APPROVED. Approval is a legal decision this
// repository cannot take; every entry below is DRAFT, with its review status
// stating exactly where legal review stands. Nothing downstream may treat a
// DRAFT jurisdiction as cleared for anything — packs and their activation
// gates own that question.

import { countryCode, type CountryCode } from './country';
import { jurisdictionId, type JurisdictionId } from './jurisdiction-id';

// Extending either vocabulary is a reviewed code change (a new entry in the
// const list), never configuration — the resolver reads the list, so no
// consumer needs to change when a member is added.
export const JURISDICTION_TYPES = ['NATIONAL', 'FINANCIAL_FREE_ZONE', 'SPECIAL_REGIME'] as const;
export type JurisdictionType = (typeof JURISDICTION_TYPES)[number];

export const JURISDICTION_LIFECYCLES = [
  'DRAFT',
  'PENDING_LEGAL_REVIEW',
  'APPROVED',
  'RETIRED',
] as const;
export type JurisdictionLifecycle = (typeof JURISDICTION_LIFECYCLES)[number];

export const REVIEW_STATUSES = [
  'NOT_SUBMITTED',
  'PENDING_LEGAL_REVIEW',
  'REVIEW_COMPLETE',
] as const;
/** Where legal review stands — a separate axis from the lifecycle stage. */
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface Jurisdiction {
  readonly id: JurisdictionId;
  /** The code IS the id value; kept as a named field for symmetry with rows. */
  readonly code: string;
  readonly countryCode: CountryCode;
  readonly type: JurisdictionType;
  readonly status: JurisdictionLifecycle;
  readonly reviewStatus: ReviewStatus;
  /** Null until a reviewed decision sets the regime window; never invented. */
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  /** Who declared this entry and on what footing — not a legal claim. */
  readonly provenance: string;
}

function draftJurisdiction(
  code: string,
  country: string,
  type: JurisdictionType,
  reviewStatus: ReviewStatus,
  provenance: string,
): Jurisdiction {
  return Object.freeze({
    id: jurisdictionId(code),
    code,
    countryCode: countryCode(country),
    type,
    status: 'DRAFT',
    reviewStatus,
    effectiveFrom: null,
    effectiveTo: null,
    provenance,
  });
}

// QA is the launch focus and is submitted for review with the qa/v1 draft
// pack; the AE pair exists to keep the country!=jurisdiction distinction
// honest in the model (one country, two regimes) and is not under review.
export const JURISDICTIONS: readonly Jurisdiction[] = Object.freeze([
  draftJurisdiction(
    'QA',
    'QA',
    'NATIONAL',
    'PENDING_LEGAL_REVIEW',
    'Declared by engineering in Phase 3.5 alongside the qa/v1 draft pack; submitted for legal review, no approval recorded.',
  ),
  draftJurisdiction(
    'AE',
    'AE',
    'NATIONAL',
    'NOT_SUBMITTED',
    'Declared by engineering in Phase 3.5 as reference structure only; not submitted for review.',
  ),
  draftJurisdiction(
    'AE-DIFC',
    'AE',
    'FINANCIAL_FREE_ZONE',
    'NOT_SUBMITTED',
    'Declared by engineering in Phase 3.5 to model a free-zone regime distinct from its country; not submitted for review.',
  ),
]);

export function findJurisdiction(code: string): Jurisdiction | undefined {
  return JURISDICTIONS.find((entry) => entry.code === code);
}

/** Identity comparison for jurisdiction keys, so consumers outside this
 * package never write the comparison themselves (architecture test 12 bans
 * jurisdiction-keyed conditionals in module business layers; matching a
 * jurisdiction to its own data is this package's job). */
export function sameJurisdiction(a: JurisdictionId | string, b: JurisdictionId | string): boolean {
  return String(a) === String(b);
}
