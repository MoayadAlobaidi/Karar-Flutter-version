/**
 * Expected failure shapes of this module's use cases (backend.md §9). Every
 * kind is machine-readable for RFC 7807 mapping.
 *
 * **No message interpolates driver text, an exception message, or
 * `String(error)`.** Nothing in this module talks to anything, so there is no
 * driver to quote today; the rule is stated and implemented anyway, because a
 * catalogue implementation substituted later is exactly where the first
 * unexpected throw will arrive. The original throw rides along NON-ENUMERABLE
 * for the one boundary allowed to log it, as
 * `modules/financial-accounts/application/errors.ts` does — a field that must
 * not be serialized is safer as a field that cannot be.
 *
 * **No message quotes an evidence reference or an issuer identifier.** A
 * reference can name an unpublished agreement; an identifier is a UUID a
 * caller already holds. Neither belongs in a sentence a client reads.
 */

/**
 * No profile has been reviewed for this issuer, market and segment.
 *
 * This is the answer for every query today, and it is deliberately NOT an
 * error about the issuer. It says nobody has written a description down. It
 * does not say the issuer has no interface, does not say the issuer has one,
 * and must not be rendered as either.
 */
export interface ProfileNotReviewed {
  readonly kind: 'profile_not_reviewed';
  readonly message: string;
}

/**
 * The catalogue could not answer. Fail closed: an unanswered question about
 * what an interface offers is not evidence that it offers anything.
 */
export interface CatalogueUnavailable {
  readonly kind: 'catalogue_unavailable';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

export type DescribeProviderCapabilitiesError = ProfileNotReviewed | CatalogueUnavailable;

/** The one message every not-reviewed arm uses. */
export const PROFILE_NOT_REVIEWED: ProfileNotReviewed = Object.freeze({
  kind: 'profile_not_reviewed' as const,
  message:
    'no reviewed capability profile exists for this issuer in this market for this segment. ' +
    'That is a statement about this platform and not about the issuer: nobody has written a ' +
    'description down. It is not a claim that a data interface exists, and it is not a claim ' +
    'that none does',
});

/**
 * Wrap an unexpected catalogue throw without carrying its internals outward.
 *
 * The reason is deliberately not described: an implementation substituted
 * later could throw text carrying a path, a connection string, or a fragment
 * of the configuration that failed to parse. It is logged once at the
 * boundary, against this request.
 */
export function catalogueUnavailable(error: unknown): CatalogueUnavailable {
  const failure = {
    kind: 'catalogue_unavailable' as const,
    message:
      'the reviewed capability catalogue did not answer, so no description was produced. The ' +
      'rule fails closed: an unanswered question about what an interface offers is not evidence ' +
      'that it offers anything. Why the question went unanswered is logged once at the boundary',
  };
  // Non-enumerable: invisible to JSON.stringify, spread, and any serializer,
  // reachable only by code that names it.
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as CatalogueUnavailable;
}
