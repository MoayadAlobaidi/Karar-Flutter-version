/**
 * What a review found about each RAIL an issuer's interface might one day use
 * — and the reason none of it can make a connection happen.
 *
 * ## A profile describes; it never decides
 *
 * `modules/financial-connections` owns what may exist. Its migration-0096
 * CHECK (`financial_connections_rail_implemented_check`) refuses every rail
 * but `MANUAL` and `USER_FILE_UPLOAD` at the DATABASE, so an unimplemented
 * rail cannot be written by a fixture, a backfill, a direct SQL insert, or an
 * ingestion path written by someone who never read that module. Its
 * `NewFinancialConnection.rail` field is typed `ImplementedConnectionRail`, so
 * a caller cannot even name an unimplemented rail without a cast.
 *
 * `DataRail` below is the WIDE vocabulary, deliberately: a description has to
 * be able to describe a rail that does not work. The consequences are the
 * three guarantees rule 3 asks for:
 *
 *  1. **Type.** A `DataRail` is not an `ImplementedConnectionRail`, which is
 *     what `NewFinancialConnection.rail` demands. Nothing this module returns
 *     can be passed to `createFinancialConnection` without a deliberate cast
 *     that a reviewer would see. The proof is a compile-time one and it lives
 *     in `__tests__/mirrored-vocabularies.test.ts`, because making it here
 *     would require importing that module into a domain layer.
 *  2. **Behaviour.** Even through a cast, the other module's own gate refuses
 *     it — `checkRailImplemented` answers `rail_not_implemented`, and the
 *     CHECK refuses the row besides. A test drives the real function with
 *     every rail a maximally optimistic profile describes as available.
 *  3. **Reach.** This module holds no repository, no client, no port that
 *     writes, and **no import of another module at all** — not even a type
 *     one. There is no code path from here to a connection row, proved by a
 *     source scan.
 *
 * `RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE` states the same thing as data, and it
 * is empty for MANUAL too — a profile does not make manual entry executable
 * either. Manual entry is executable because that module implemented it.
 *
 * ## Naming a rail is not implementing one, and describing one is less again
 *
 * Thirteen rails are named below. None is integrated, none exposes an
 * interface to Karar, and marking one `VERIFIED` here means only that a
 * reviewer read a document — a published API specification, a partnership
 * agreement, a regulator's open-finance mandate. It never means a connection
 * can be opened, and no surface may render it as available.
 */

import type { CapabilityAssertion } from './capability-assertion.js';
import { UNVERIFIED, isVerified, unavailable } from './capability-assertion.js';

/**
 * Every rail a profile can describe. **Mirrors `CONNECTION_RAILS` in
 * `modules/financial-connections/domain/rails.ts`, member for member.**
 *
 * WHY IT IS MIRRORED AND NOT IMPORTED — read this before "fixing" it. A domain
 * layer may import only relative files and the pure packages (architecture
 * test 1). That is not a lint nicety: a domain that reaches into another
 * module's package stops being independently testable and replaceable, which
 * is the coupling the layered rules exist to prevent. So the duplication is
 * the sanctioned cost, and it is paid where it can be seen —
 * `__tests__/mirrored-vocabularies.test.ts` imports that module and asserts
 * this list is EXACTLY its list, member for member and in order, so a rail
 * added, removed or renamed over there fails the build here.
 *
 * **This list is deliberately NOT the implemented subset**, and there is no
 * local mirror of `IMPLEMENTED_CONNECTION_RAILS` anywhere in this module. A
 * copy of "what may be created" is a copy of a permission, and a stale copy of
 * a permission is the most dangerous value this module could hold. What may be
 * created is asked of `modules/financial-connections` at the point of asking,
 * never remembered here.
 */
export const DATA_RAILS = [
  'MANUAL',
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
  'DEVICE_SIGNAL',
] as const;
export type DataRail = (typeof DATA_RAILS)[number];

export function isDataRail(value: string): value is DataRail {
  return (DATA_RAILS as readonly string[]).includes(value);
}

/**
 * Every rail, always. A total record, which has one consequence worth stating:
 * a profile cannot omit a rail, so "we did not think about SFTP" is not
 * expressible — it is `UNVERIFIED`, which is a different and honest claim.
 */
export type DataRailProfile = Readonly<Record<DataRail, CapabilityAssertion>>;

/** One rail and what a review found about it. The pair a reviewer reads. */
export interface RailDescription {
  readonly rail: DataRail;
  readonly assertion: CapabilityAssertion;
}

/**
 * A profile in which no rail is on offer, with the reason every real profile
 * carries today. Exported because it is the truthful default for every issuer
 * this platform knows of, and a default that has to be typed out by hand is a
 * default people get wrong.
 */
export const NO_RAIL_AVAILABLE: DataRailProfile = Object.freeze(railsAllUnavailable());

function railsAllUnavailable(): Record<DataRail, CapabilityAssertion> {
  const reason =
    'no data interface is offered to this platform on this rail. No provider is integrated, no ' +
    'credential of any kind is stored anywhere in this platform, and there is no scraping and no ' +
    'browser automation (ADR-0028)';
  return {
    MANUAL: unavailable(reason),
    USER_FILE_UPLOAD: unavailable(reason),
    OPEN_FINANCE_API: unavailable(reason),
    DIRECT_BANK_OR_WALLET_API: unavailable(reason),
    LICENSED_AGGREGATOR_API: unavailable(reason),
    HOST_TO_HOST_SFTP: unavailable(reason),
    ISO_20022_FILE: unavailable(reason),
    SWIFT_MT_FILE: unavailable(reason),
    OFX_QFX_FILE: unavailable(reason),
    QIF_FILE: unavailable(reason),
    PDF_STATEMENT: unavailable(reason),
    SECURE_EMAIL_STATEMENT: unavailable(reason),
    DEVICE_SIGNAL: unavailable(reason),
  };
}

/** Nobody has looked at any rail. The state a profile starts in. */
export const NO_RAIL_REVIEWED: DataRailProfile = Object.freeze({
  MANUAL: UNVERIFIED,
  USER_FILE_UPLOAD: UNVERIFIED,
  OPEN_FINANCE_API: UNVERIFIED,
  DIRECT_BANK_OR_WALLET_API: UNVERIFIED,
  LICENSED_AGGREGATOR_API: UNVERIFIED,
  HOST_TO_HOST_SFTP: UNVERIFIED,
  ISO_20022_FILE: UNVERIFIED,
  SWIFT_MT_FILE: UNVERIFIED,
  OFX_QFX_FILE: UNVERIFIED,
  QIF_FILE: UNVERIFIED,
  PDF_STATEMENT: UNVERIFIED,
  SECURE_EMAIL_STATEMENT: UNVERIFIED,
  DEVICE_SIGNAL: UNVERIFIED,
});

/**
 * Every rail with what a review found, in vocabulary order.
 *
 * The cast on `Object.keys` is safe by construction and not by convention: the
 * record is TOTAL over `DataRail` by type, so its runtime keys are exactly
 * that union. TypeScript widens `Object.keys` to `string[]` for reasons that
 * have nothing to do with this record.
 */
export function describedRails(rails: DataRailProfile): readonly RailDescription[] {
  return Object.freeze(
    (Object.keys(rails) as DataRail[]).map((rail) =>
      Object.freeze({ rail, assertion: rails[rail] }),
    ),
  );
}

/**
 * The rails a review has EVIDENCED as on offer.
 *
 * Only `VERIFIED` counts, and the omission is the point: `UNVERIFIED` means
 * nobody looked and `PENDING_PROVIDER_CONFIRMATION` means nobody answered, and
 * reading either as "probably yes" is how an optimistic guess becomes a
 * commitment. Fail closed, exactly as `permitsDurableWrite` does for the
 * retention decision.
 *
 * The return type is the WIDE `DataRail`, which is a vocabulary of NAMES.
 * There is no type in this module for "a rail a connection may be opened on",
 * because there is no such thing here — a caller holding this list holds
 * names, not permission.
 */
export function railsDescribedAsAvailable(rails: DataRailProfile): readonly DataRail[] {
  return Object.freeze(
    (Object.keys(rails) as DataRail[]).filter((rail) => isVerified(rails[rail])),
  );
}

/**
 * The rails a capability profile can make executable.
 *
 * **EMPTY, and the empty list is the assertion.** It is empty for `MANUAL` and
 * `USER_FILE_UPLOAD` as well as for the eleven that are not implemented,
 * because a description never makes anything executable: manual entry works
 * because `modules/financial-connections` implemented it and its migration
 * permits the row, and that would remain true if this module did not exist.
 *
 * Written as data under this paragraph for the reason
 * `STATUSES_IMPLYING_A_LIVE_INSTITUTION_LINK` is: the day somebody wants a
 * profile to grant something, they have to add a word here, where the argument
 * against it is, and the test fails until they delete the test.
 */
export const RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE: readonly DataRail[] = Object.freeze([]);

/** Answers `false` for every rail. See the constant above. */
export function profileCanMakeExecutable(rail: DataRail): boolean {
  return RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE.includes(rail);
}
