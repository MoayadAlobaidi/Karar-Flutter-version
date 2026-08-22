/**
 * `ReviewedProfileCataloguePort` — where reviewed profiles come from, declared
 * INWARD (architecture test 5).
 *
 * ## It is SYNCHRONOUS, and that is the design
 *
 * Every other port in this repository returns a `Promise`, because every other
 * port reaches a database, a key manager or a policy pack. This one does not,
 * and giving it an async signature would be an invitation: an implementer
 * looking at `Promise<ProviderCapabilityProfile | null>` reasonably concludes
 * that fetching is expected, and fetching an issuer's capabilities is the one
 * thing this module exists to never do. A synchronous signature makes the
 * intended implementations — a frozen in-repository registry, a test fake —
 * the only comfortable ones, and makes an HTTP client visibly the wrong shape
 * for the hole.
 *
 * The trade is real and small: an implementation that genuinely needed to read
 * a store would have to change this signature, which is a reviewed change to a
 * port, which is exactly the conversation that should happen before reviewed
 * configuration starts living somewhere it can be edited without a diff.
 *
 * ## No principal, and no tenant
 *
 * A capability profile is `NON_PERSONAL` reference data about an
 * ORGANISATION — the classification `public.institutions` and
 * `public.institution_markets` carry (migrations 0087, 0094). It has no
 * subject, no tenant column and no user column, so there is no principal
 * predicate to build an authorization decision from and nothing here takes an
 * actor. The same reasoning those tables record for being allow-listed rather
 * than RLS'd applies: a principal parameter that decided nothing would suggest
 * a boundary that does not exist.
 */

import type { ProviderCapabilityProfile } from '../../domain/capability-profile.js';
import type { CountryCode, InstitutionRef } from '../../domain/refs.js';
import type { CustomerSegment } from '../../domain/vocabularies.js';

/** Which profile is being asked for: issuer, market, segment — the identity. */
export interface ReviewedProfileQuery {
  readonly institutionRef: InstitutionRef;
  readonly marketCountry: CountryCode;
  readonly customerSegment: CustomerSegment;
}

export interface ReviewedProfileCataloguePort {
  /**
   * The reviewed profile for one issuer in one market for one segment, or
   * `null` when none has been reviewed.
   *
   * `null` is the answer for every query today and is a legitimate,
   * informative outcome rather than an error: it means nobody has reviewed
   * this interface, which is different from "there is no interface" and must
   * not be rendered as either an availability or a failure.
   */
  findReviewedProfile(query: ReviewedProfileQuery): ProviderCapabilityProfile | null;
}
