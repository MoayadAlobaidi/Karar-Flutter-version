/**
 * Denial reasons — the resolver's internal vocabulary, modelled separately
 * from stored availability state (capability-registry.md §5). Every denial
 * carries one; which of them a CLIENT may ever see is decided here, in one
 * place, and nowhere else.
 *
 * Client exposure is deny-by-default: a reason is either explicitly
 * surfaceable (an actionable denial that invites an action) or the
 * capability is OMITTED from client output entirely — never returned as
 * `available: false` with an internal reason. PENDING_PROVIDER is the one
 * conditional: explainable only where the descriptor opts in.
 */

export const DENIAL_REASONS = [
  // Gate 1 — descriptor (code and deployment reality).
  'NOT_IMPLEMENTED',
  'NOT_DEPLOYED',
  // Gate 2 — environment.
  'WRONG_ENVIRONMENT',
  // Gate 3 — jurisdiction and policy pack.
  'JURISDICTION_ABSENT',
  'JURISDICTION_UNVERIFIED',
  'JURISDICTION_NOT_CLEARED',
  'POLICY_PACK_NOT_APPROVED',
  // Gate 4 — availability row (state-derived; missing row = DISABLED).
  'DISABLED',
  'INTERNAL_ONLY',
  'PARTNER_ONLY',
  'PENDING_PROVIDER',
  'PENDING_LEGAL_REVIEW',
  'PENDING_REGULATORY_REVIEW',
  // Gate 5 — entitlement.
  'ENTITLEMENT_MISSING',
  'ENTITLEMENT_EXPIRED',
  // Gate 6 — consent (PROCESSING_BASIS_UNRESOLVED: the pack names no
  // resolvable basis for the capability's processing — fail closed).
  'CONSENT_REQUIRED',
  'RECONSENT_REQUIRED',
  'PROCESSING_BASIS_UNRESOLVED',
  // Gate 7 — operating-entity licence.
  'LICENCE_MISSING',
  'LICENCE_EXPIRED',
  // Gate 8 — provider (PENDING_PROVIDER above covers not-configured).
  'PROVIDER_UNAVAILABLE',
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

export function isDenialReason(value: string): value is DenialReason {
  return (DENIAL_REASONS as readonly string[]).includes(value);
}

/**
 * Reasons that must NEVER reach a client in any form — their existence
 * advertises what must not be advertised (a legal-review pipeline, an
 * uncleared jurisdiction, unbuilt code). Capabilities denied for one of
 * these are absent from client output entirely.
 */
export const HIDDEN_DENIAL_REASONS = [
  'NOT_IMPLEMENTED',
  'NOT_DEPLOYED',
  'PENDING_LEGAL_REVIEW',
  'PENDING_REGULATORY_REVIEW',
  'JURISDICTION_NOT_CLEARED',
] as const satisfies readonly DenialReason[];

/**
 * Actionable denials a client may see: each invites a concrete action the
 * subject can take (consent, re-consent, obtain an entitlement).
 */
export const CLIENT_SURFACEABLE_REASONS = [
  'CONSENT_REQUIRED',
  'RECONSENT_REQUIRED',
  'ENTITLEMENT_MISSING',
  'ENTITLEMENT_EXPIRED',
] as const satisfies readonly DenialReason[];

/** What a client is allowed to be told about a denial. */
export type ClientDenialReason = (typeof CLIENT_SURFACEABLE_REASONS)[number] | 'PENDING_PROVIDER';

/**
 * The one total classification: the client-visible reason for a denial, or
 * null when the capability must be OMITTED from client output. Everything
 * not explicitly surfaceable is omitted — fail closed, including the five
 * mandated hidden reasons and every operational/legal/jurisdictional state
 * in between.
 */
export function clientReasonFor(
  reason: DenialReason,
  providerPendingExplainable: boolean,
): ClientDenialReason | null {
  if ((CLIENT_SURFACEABLE_REASONS as readonly DenialReason[]).includes(reason)) {
    return reason as ClientDenialReason;
  }
  if (reason === 'PENDING_PROVIDER' && providerPendingExplainable) {
    return 'PENDING_PROVIDER';
  }
  return null;
}
