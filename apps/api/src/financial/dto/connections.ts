/**
 * Response serialization for connections and account source links — CLOSED
 * field sets, picked by name.
 *
 * THE SOURCE-LINK PROJECTION IS THE LEAK CONTROL, AND IT IS NOT MADE HERE.
 * `ListOwnAccountSourceLinks` already answers with `AccountSourceLinkView`,
 * a shape the module builds precisely because the stored entity carries two
 * things a read path must never return: the subject's external account
 * reference, and a per-subject keyed FINGERPRINT of it. Publishing the
 * fingerprint would turn this route into an oracle that confirms whether a
 * given external account belongs to a given person. This file therefore has
 * no access to either value, and adding a field for one would require
 * reaching past the module's own view — which is the point of the view.
 *
 * NOTHING HERE SAYS CONNECTED. `impliesLiveInstitutionLink` is emitted as
 * `false` because the module's predicate answers false for EVERY value its
 * status vocabulary permits, and `providerAccessStatus` is NOT_IMPLEMENTED
 * because no issuer exposes an interface to this platform. Stating both on
 * the wire is what makes the claim checkable instead of documented.
 *
 * FRESHNESS IS OBSERVATION, NOT HEALTH. `lastSuccessfulImportAt` is null
 * rather than approximated when no import has succeeded, and a capability
 * nobody looked for (`NOT_PROVIDED`) is kept apart from one that was looked
 * for and absent (`NOT_OBSERVED`).
 */

import { IMPLEMENTED_CONNECTION_RAILS } from '@karar/financial-connections';
import type { AccountSourceLinkView, FinancialConnection } from '@karar/financial-connections';

import { dayWire, instantWire, nullableInstantWire, revealWire } from './wire.js';

/** Whether a rail can actually run, taken from the module's implemented set. */
export function connectionRailAvailability(rail: string): 'EXECUTABLE' | 'NOT_IMPLEMENTED' {
  return (IMPLEMENTED_CONNECTION_RAILS as readonly string[]).includes(rail)
    ? 'EXECUTABLE'
    : 'NOT_IMPLEMENTED';
}

/**
 * The only institution-link claim this platform can make. Both members are
 * constants because both are true of every row: `impliesLiveInstitutionLink`
 * answers false for every connection status, and no provider access exists.
 */
export const NO_INSTITUTION_LINK = Object.freeze({
  impliesLiveInstitutionLink: false as const,
  providerAccessStatus: 'NOT_IMPLEMENTED' as const,
});

export interface ConnectionSummaryWire {
  readonly connectionId: string;
  readonly rail: string;
  readonly availability: 'EXECUTABLE' | 'NOT_IMPLEMENTED';
  readonly status: string;
  readonly displayLabel: string;
  readonly institutionId: string | null;
  readonly link: typeof NO_INSTITUTION_LINK;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export function connectionSummaryWire(connection: FinancialConnection): ConnectionSummaryWire {
  return {
    connectionId: connection.id,
    rail: connection.rail,
    availability: connectionRailAvailability(connection.rail),
    // ACTIVE means this connection ACCEPTS data the subject supplies. It does
    // not mean anything is connected, and the `link` block beside it says so.
    status: connection.status,
    displayLabel: revealWire(connection.displayLabel),
    institutionId:
      connection.institutionRef === null ? null : connection.institutionRef.institutionId,
    link: NO_INSTITUTION_LINK,
    createdAt: instantWire(connection.createdAt),
    updatedAt: instantWire(connection.updatedAt),
    version: connection.version,
  };
}

export interface AccountSourceLinkWire {
  readonly sourceLinkId: string;
  readonly accountId: string;
  readonly connectionId: string;
  readonly rail: string;
  readonly availability: 'EXECUTABLE' | 'NOT_IMPLEMENTED';
  readonly sourceAuthority: string;
  readonly matchBasis: string;
  readonly status: string;
  readonly link: typeof NO_INSTITUTION_LINK;
  readonly subjectConfirmedAt: string | null;
  readonly sourcePriority: number;
  readonly observation: {
    readonly firstObservedAt: string;
    readonly lastObservedAt: string;
    readonly lastSuccessfulImportAt: string | null;
  };
  readonly historyCoverage: { readonly start: string; readonly end: string } | null;
  readonly capabilities: { readonly balance: string; readonly pendingTransactions: string };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export function accountSourceLinkWire(link: AccountSourceLinkView): AccountSourceLinkWire {
  return {
    sourceLinkId: link.id,
    accountId: link.accountRef.accountId,
    connectionId: link.connectionId,
    rail: link.connectionRail,
    availability: connectionRailAvailability(link.connectionRail),
    sourceAuthority: link.sourceAuthority,
    // EXACT_EXTERNAL_REFERENCE or PROBABLE, and nothing between: there is no
    // confidence figure in this platform and none is invented for display.
    matchBasis: link.matchBasis,
    status: link.status,
    link: NO_INSTITUTION_LINK,
    subjectConfirmedAt: nullableInstantWire(link.subjectConfirmedAt),
    sourcePriority: link.sourcePriority,
    observation: {
      firstObservedAt: instantWire(link.observation.firstObservedAt),
      lastObservedAt: instantWire(link.observation.lastObservedAt),
      lastSuccessfulImportAt: nullableInstantWire(link.observation.lastSuccessfulImportAt),
    },
    historyCoverage:
      link.historyCoverage === null
        ? null
        : {
            // Calendar DAYS: a coverage window is what the source supplied
            // for those days, not a pair of instants (ADR-0027).
            start: dayWire(link.historyCoverage.start),
            end: dayWire(link.historyCoverage.end),
          },
    capabilities: {
      balance: link.capabilities.balance,
      pendingTransactions: link.capabilities.pendingTransactions,
    },
    createdAt: instantWire(link.createdAt),
    updatedAt: instantWire(link.updatedAt),
    version: link.version,
  };
}
