/**
 * The rail vocabulary, the implemented subset, and the connection statuses.
 *
 * ## Naming a rail is not implementing one
 *
 * Thirteen rails are named here because naming them costs nothing and shapes
 * the model correctly, and because a vocabulary invented later would have to
 * be retrofitted onto subject-owned rows already written — which means
 * rewriting other people's financial records to fit a word chosen afterwards
 * (ADR-0028).
 *
 * **Only `MANUAL` and `USER_FILE_UPLOAD` may be created**, and the guarantee
 * does not live here. `financial_connections_rail_implemented_check` in
 * migration 0096 refuses every other rail at the DATABASE, so an unimplemented
 * rail cannot be written by a direct SQL insert, a fixture, a backfill, or a
 * future ingestion path written by someone who never read this file. The
 * types below make the same refusal at compile time, which is a convenience
 * for callers and nothing more: a type is not a control.
 *
 * ## No rail implies a provider is reachable
 *
 * `OPEN_FINANCE_API`, `DIRECT_BANK_OR_WALLET_API` and
 * `LICENSED_AGGREGATOR_API` are names for shapes of arrangement, not claims
 * that any such arrangement exists. No provider is integrated, none exposes
 * an interface to Karar, and no code path in this platform can produce data
 * on any of these rails. No surface may render one as available.
 *
 * ## `DEVICE_SIGNAL` is supplemental by construction
 *
 * A signal observed on a person's device is evidence about their device, not
 * a statement by an institution about their money. ADR-0028 says it is never
 * authoritative, and migration 0097 refuses `AUTHORITATIVE` on a
 * `DEVICE_SIGNAL` link by CHECK — unreachable today because the rail itself
 * is unwritable, and written anyway so widening the gate cannot make a device
 * signal authoritative by omission.
 */

/**
 * Every rail this model can name. Widened only by a reviewed design change —
 * never to make a row insertable, which is what the implemented set below is
 * for. Mirrors `financial_connections_rail_check` in migration 0096.
 */
export const CONNECTION_RAILS = [
  /** The person typed it. Implemented, and the first-class path. */
  'MANUAL',
  /** The person uploaded a file for reviewed import. Implemented (CSV). */
  'USER_FILE_UPLOAD',
  'OPEN_FINANCE_API',
  'DIRECT_BANK_OR_WALLET_API',
  'LICENSED_AGGREGATOR_API',
  'HOST_TO_HOST_SFTP',
  'ISO_20022_FILE',
  'SWIFT_MT_FILE',
  'OFX_QFX_FILE',
  'QIF_FILE',
  'PDF_STATEMENT',
  'SECURE_EMAIL_STATEMENT',
  /** Supplemental and never authoritative (ADR-0028). */
  'DEVICE_SIGNAL',
] as const;
export type ConnectionRail = (typeof CONNECTION_RAILS)[number];

/**
 * The rails a connection may actually be created on today. Mirrors
 * `financial_connections_rail_implemented_check` in migration 0096, and the
 * database is the enforcement — this constant is the compile-time echo of it.
 *
 * Implementing a rail widens THIS list and the migration's gate; it never
 * widens `CONNECTION_RAILS`, because the vocabulary was already complete.
 */
export const IMPLEMENTED_CONNECTION_RAILS = ['MANUAL', 'USER_FILE_UPLOAD'] as const;
export type ImplementedConnectionRail = (typeof IMPLEMENTED_CONNECTION_RAILS)[number];

export function isConnectionRail(value: string): value is ConnectionRail {
  return (CONNECTION_RAILS as readonly string[]).includes(value);
}

export function isImplementedConnectionRail(
  value: string,
): value is ImplementedConnectionRail {
  return (IMPLEMENTED_CONNECTION_RAILS as readonly string[]).includes(value);
}

/**
 * The connection's own state.
 *
 * **No value here means connected, synced, linked, paired or authorized, and
 * none may be added.** `ACTIVE` on a `MANUAL` connection means the person may
 * type entries; `ACTIVE` on a `USER_FILE_UPLOAD` connection means they may
 * upload a file. Neither is a live link to an institution — none exists
 * anywhere in this platform — and no surface may render either as one. The
 * legacy's connect-a-bank screen inserted a fabricated account with a Synced
 * badge and its own audit called that the single most misleading surface in
 * the product; the absence of a vocabulary word for it is what keeps that
 * from being expressible here.
 *
 * `NOT_IMPLEMENTED` is MODELLED AND UNREACHABLE, exactly as
 * `financial_accounts.origin_kind = 'EXTERNAL_PROVIDER'` is: a row may only
 * carry an implemented rail, and migration 0096 refuses `NOT_IMPLEMENTED` for
 * an implemented one, so no row in this table describes an unimplemented
 * rail because there is no such row at all. The value stays in the vocabulary
 * so the concept has a name the day a gate widens.
 */
export const CONNECTION_STATUSES = [
  'ACTIVE',
  'NOT_CONFIGURED',
  'UNAVAILABLE',
  'RETIRED',
  'NOT_IMPLEMENTED',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * The statuses a caller in this module may construct. `NOT_IMPLEMENTED` is
 * absent for the reason above: it describes a rail no row may carry.
 */
export const CONSTRUCTIBLE_CONNECTION_STATUSES = [
  'ACTIVE',
  'NOT_CONFIGURED',
  'UNAVAILABLE',
  'RETIRED',
] as const;
export type ConstructibleConnectionStatus =
  (typeof CONSTRUCTIBLE_CONNECTION_STATUSES)[number];

export function isConnectionStatus(value: string): value is ConnectionStatus {
  return (CONNECTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether a status claims a live link to an institution.
 *
 * **It answers `false` for every value, and that is the assertion.** The set
 * it consults is EMPTY, written as an explicitly empty list rather than as a
 * bare `return false`, because the empty list is the claim: there is no
 * status that means a live link, and adding one would mean adding a name to
 * this list where a reviewer would see it. The test over this function fails
 * the moment the vocabulary gains a word that means connected.
 */
export const STATUSES_IMPLYING_A_LIVE_INSTITUTION_LINK: readonly ConnectionStatus[] =
  Object.freeze([]);

export function impliesLiveInstitutionLink(status: ConnectionStatus): boolean {
  return STATUSES_IMPLYING_A_LIVE_INSTITUTION_LINK.includes(status);
}

/**
 * How much a source may be relied on for one account, relative to the others
 * feeding it. Recorded, never applied: this module resolves no conflict
 * between two sources and computes no merged view.
 */
export const SOURCE_AUTHORITIES = ['AUTHORITATIVE', 'SUPPLEMENTAL', 'UNVERIFIED'] as const;
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];

export function isSourceAuthority(value: string): value is SourceAuthority {
  return (SOURCE_AUTHORITIES as readonly string[]).includes(value);
}

/**
 * Whether a rail may ever be authoritative about an account. Only
 * `DEVICE_SIGNAL` may not (ADR-0028); migration 0097 carries the same rule as
 * a CHECK, which is what makes it true for every writer.
 */
export function mayBeAuthoritative(rail: ConnectionRail): boolean {
  return rail !== 'DEVICE_SIGNAL';
}

/**
 * What this platform has OBSERVED a source provide. Never a claim, and
 * deliberately no `VERIFIED` or `AVAILABLE` value: no issuer named anywhere
 * in this platform exposes an interface to Karar, and a capability field is
 * where that fiction would first be written down.
 */
export const SOURCE_CAPABILITY_OBSERVATIONS = [
  /** Such data has actually arrived through this link. */
  'OBSERVED',
  /** It has not. The honest default — never read as "the source cannot". */
  'NOT_OBSERVED',
  /** The source itself said it does not provide this. */
  'NOT_PROVIDED',
] as const;
export type SourceCapabilityObservation =
  (typeof SOURCE_CAPABILITY_OBSERVATIONS)[number];

export function isSourceCapabilityObservation(
  value: string,
): value is SourceCapabilityObservation {
  return (SOURCE_CAPABILITY_OBSERVATIONS as readonly string[]).includes(value);
}
