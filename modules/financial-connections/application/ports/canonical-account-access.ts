/**
 * `CanonicalAccountAccessPort` — the one question this module is allowed to
 * ask about a financial account, declared inward (architecture test 5).
 *
 * ## The defect this exists to close
 *
 * A source link is anchored to an account by a raw UUID plus a locally
 * declared reference type (`domain/refs.ts`), and nothing about that UUID is
 * self-validating. Without this port, `ProposeAccountSourceLink` would accept
 * whatever account id it was handed: an id belonging to another user in the
 * same tenant, an id from another tenant entirely, or an id nobody ever
 * minted. RLS does not catch any of it — the link row carries the CALLER's
 * tenant and user, so the policy is satisfied; what is wrong is the account
 * the row points at. The result would be a data route attached to an account
 * that does not exist or is not the subject's, and every fact that later
 * arrived through it would be filed there.
 *
 * ## What it returns, and what it deliberately does not
 *
 * The minimum needed to decide whether a source may be attached: that the
 * account resolved at all, and its lifecycle state. **No account narrative** —
 * no display name, no institution, no mask, no currency, no balance. This
 * module has no use for any of it, and a port that returned it would make
 * every link proposal a second read path into another context's subject data.
 *
 * Currency is absent on purpose even though it is the obvious next field. A
 * source link records WHERE data comes from, not what the data says; a
 * currency check belongs to whatever commits a movement, and asking for it
 * here would be this module acquiring an opinion about amounts it never sees.
 *
 * ## One answer for every invisible account
 *
 * `resolveOwnAccount` returns `null` for an account that is absent, another
 * user's, another tenant's, or simply never minted — one indistinguishable
 * outcome, and the use case turns it into the same `account_not_found`. A
 * separate "forbidden" answer would be an existence oracle: probe ids, read
 * which ones deny differently, and another subject's account inventory is
 * enumerable without ever seeing one.
 *
 * ## Who implements it
 *
 * **Not the domain, and not another module's internals.** The implementation
 * is an adapter over `@karar/financial-accounts`' `public-api.ts`, living in
 * this module's `infrastructure/adapters/`. The dependency direction is what
 * matters: the interface is owned HERE, `financial-accounts` knows nothing
 * about this module, and this module's domain and application layers never
 * see the accounts module's types.
 */

import type { CanonicalAccountRef } from '../../domain/refs.js';
import type { ConnectionsPrincipal } from '../principal.js';

/**
 * The account states this module can reason about.
 *
 * Declared HERE rather than imported: the question that matters to this
 * module is "may a data source be attached to this account", and that
 * question is this module's, not the accounts module's. The adapter maps one
 * vocabulary onto the other.
 *
 * `UNRECOGNIZED` is the honest answer when the accounts module reports a
 * state this list does not name — a state added there and not yet mapped
 * here. It is never linkable. The two alternatives are both worse: mapping an
 * unknown state onto `ACTIVE` silently widens what may be linked on the
 * strength of a default, and mapping it onto absence would report "no such
 * account" about an account the subject can see.
 */
export const ACCOUNT_LIFECYCLE_STATES = [
  'ACTIVE',
  'ARCHIVED',
  'CLOSED',
  'UNRECOGNIZED',
] as const;
export type AccountLifecycleState = (typeof ACCOUNT_LIFECYCLE_STATES)[number];

/**
 * The lifecycle states a new source link may be attached to.
 *
 * `ARCHIVED` and `CLOSED` are excluded deliberately. Attaching a live data
 * route to an account the person has put away would quietly resurrect it on
 * the next import, and the person would discover that from a figure moving
 * rather than from anything they did.
 */
export const LINKABLE_ACCOUNT_LIFECYCLE_STATES: readonly AccountLifecycleState[] = Object.freeze(
  ['ACTIVE'],
);

export function isLinkableLifecycleState(state: AccountLifecycleState): boolean {
  return LINKABLE_ACCOUNT_LIFECYCLE_STATES.includes(state);
}

/**
 * Everything this module learns about an account it is allowed to see.
 *
 * Deliberately two fields and no narrative. If a future rule needs another
 * fact, it is added here explicitly and the reason is written down — the
 * shape is the record of what this module is entitled to know.
 */
export interface CanonicalAccountSummary {
  /** Echoed back so a caller cannot mis-pair a summary with a request. */
  readonly accountRef: CanonicalAccountRef;
  readonly lifecycleState: AccountLifecycleState;
}

export interface CanonicalAccountAccessPort {
  /**
   * The summary of an account **visible to `principal`**, or `null`.
   *
   * `null` covers absent, another user's, another tenant's, and never-minted
   * alike — see the header. An implementation that distinguished them, in its
   * return value or in a thrown error, would reintroduce the oracle.
   */
  resolveOwnAccount(
    principal: ConnectionsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<CanonicalAccountSummary | null>;
}
