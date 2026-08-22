/**
 * `BalanceBearingAccountAccessPort` — the one question this module is allowed
 * to ask about a financial account, declared inward (architecture test 5).
 *
 * ## The defect this exists to close
 *
 * An instrument is anchored to an account by a raw UUID plus a locally
 * declared reference type (`domain/refs.ts`), and nothing about that UUID is
 * self-validating. Without this port, `RecordPaymentInstrument` would accept
 * whatever account id it was handed: an id belonging to another user in the
 * same tenant, an id from another tenant entirely, or an id nobody ever
 * minted. RLS does not catch any of it — the instrument row carries the
 * CALLER's tenant and user, so the policy is satisfied; what is wrong is the
 * account the row points at.
 *
 * ## Why "balance-bearing" is the whole name, and how it is checked
 *
 * ADR-0028's hierarchy is explicit: a financial account or wallet is "where a
 * balance sits", and a payment instrument is "what spends from it". Every row
 * in `public.financial_accounts` is by definition a place a balance sits —
 * that is what the table is — so **resolving an account through this port IS
 * the balance-bearing check**. There is no second class of account to
 * exclude, and inventing a flag to distinguish one would model a distinction
 * the accounts module does not make.
 *
 * What the check genuinely rules out is the case that matters: an instrument
 * pointing at ANOTHER INSTRUMENT. A virtual card funded by a physical card
 * is, in this model, a card drawing on the account the physical card also
 * draws on — and where an issuer genuinely funds a product separately, that
 * product is its own financial account. The reference type is a closed set
 * with one member, so an instrument id cannot be passed here in an
 * instrument's clothing.
 *
 * ## What it returns, and what it deliberately does not
 *
 * The minimum needed to decide whether an instrument may be attached: that
 * the account resolved at all, and its lifecycle state. **No account
 * narrative** — no display name, no institution, no mask, no currency, and
 * above all NO BALANCE. This module has no use for any of it, and a port that
 * returned a balance would put a figure one function call away from a type
 * whose entire design is that it has no figure. `modules/financial-connections`
 * declares a near-identical port and gives the same reasoning; the difference
 * in name is the difference in the invariant each one is protecting.
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

import type { BalanceBearingAccountRef } from '../../domain/refs.js';
import type { InstrumentsPrincipal } from '../principal.js';

/**
 * The account states this module can reason about.
 *
 * Declared HERE rather than imported: the question that matters to this
 * module is "may an instrument be attached to this account", and that
 * question is this module's, not the accounts module's. The adapter maps one
 * vocabulary onto the other.
 *
 * `UNRECOGNIZED` is the honest answer when the accounts module reports a
 * state this list does not name — a state added there and not yet mapped
 * here. It never accepts a new instrument. The two alternatives are both
 * worse: mapping an unknown state onto `ACTIVE` silently widens what may be
 * attached on the strength of a default, and mapping it onto absence would
 * report "no such account" about an account the subject can see.
 */
export const ACCOUNT_LIFECYCLE_STATES = [
  'ACTIVE',
  'ARCHIVED',
  'CLOSED',
  'UNRECOGNIZED',
] as const;
export type AccountLifecycleState = (typeof ACCOUNT_LIFECYCLE_STATES)[number];

/**
 * The lifecycle states a NEW instrument may be attached to.
 *
 * `ARCHIVED` and `CLOSED` are excluded deliberately. Recording a live card
 * against an account the person has put away asserts that money can still
 * leave it, and the person would discover the contradiction from a screen
 * rather than from anything they did. Instruments already recorded against an
 * account that is later archived are untouched: they are a record of what
 * existed, and deleting history to satisfy a rule about new writes would be
 * the more damaging of the two options.
 */
export const ATTACHABLE_ACCOUNT_LIFECYCLE_STATES: readonly AccountLifecycleState[] =
  Object.freeze(['ACTIVE']);

export function isAttachableLifecycleState(state: AccountLifecycleState): boolean {
  return ATTACHABLE_ACCOUNT_LIFECYCLE_STATES.includes(state);
}

/**
 * Everything this module learns about an account it is allowed to see.
 *
 * Deliberately two fields and no narrative, and deliberately NO BALANCE. If a
 * future rule needs another fact, it is added here explicitly and the reason
 * is written down — the shape is the record of what this module is entitled
 * to know, and the one field it must never be entitled to is the one this
 * module's whole design exists to keep off an instrument.
 */
export interface BalanceBearingAccountSummary {
  /** Echoed back so a caller cannot mis-pair a summary with a request. */
  readonly accountRef: BalanceBearingAccountRef;
  readonly lifecycleState: AccountLifecycleState;
}

export interface BalanceBearingAccountAccessPort {
  /**
   * The summary of an account **visible to `principal`**, or `null`.
   *
   * `null` covers absent, another user's, another tenant's, and never-minted
   * alike — see the header. An implementation that distinguished them, in its
   * return value or in a thrown error, would reintroduce the oracle.
   */
  resolveOwnAccount(
    principal: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<BalanceBearingAccountSummary | null>;
}
