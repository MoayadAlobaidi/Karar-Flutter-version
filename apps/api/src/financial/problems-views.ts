/**
 * Connections and payment-instrument read errors -> RFC 7807 documents.
 *
 * Both read surfaces are narrow enough that their error unions are two arms
 * each, and both unions are written out rather than collapsed into one
 * `{ kind: string }`: the modules declare separate, non-interchangeable
 * types, and an exhaustive `switch` over each is what will fail to compile if
 * either gains an arm.
 *
 * There is no 404 on either surface, and that is deliberate rather than
 * missing. Both are LISTS scoped to one of the caller's own accounts: an
 * account that is not the caller's produces an empty page, which is the same
 * answer an account with no links or no instruments produces. Distinguishing
 * the two would make either route an existence oracle over other people's
 * accounts.
 */

import type {
  MissingPrincipalContext as ConnectionsPrincipalMissing,
  StoreFailure as ConnectionsStoreFailure,
} from '@karar/financial-connections';
import type {
  MissingPrincipalContext as InstrumentsPrincipalMissing,
  StoreFailure as InstrumentsStoreFailure,
} from '@karar/payment-instruments';

import {
  authenticationRequiredProblem,
  storeUnavailableProblem,
  type ProblemResponse,
} from './problems.js';

export type ConnectionsSurfaceError = ConnectionsPrincipalMissing | ConnectionsStoreFailure;
export type InstrumentsSurfaceError = InstrumentsPrincipalMissing | InstrumentsStoreFailure;

export function problemForConnectionsError(error: ConnectionsSurfaceError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'store_failure':
      return storeUnavailableProblem();
  }
}

export function problemForInstrumentsError(error: InstrumentsSurfaceError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'store_failure':
      return storeUnavailableProblem();
  }
}
