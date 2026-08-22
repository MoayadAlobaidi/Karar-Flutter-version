/**
 * `FinancialAccountAccessPort` — the one question this module is allowed to
 * ask about a financial account, declared inward (architecture test 5).
 *
 * ## The defect this exists to close
 *
 * A transaction is anchored to an account by a raw UUID plus a locally
 * declared reference type (`domain/refs.ts`), and nothing about that UUID is
 * self-validating. Before this port existed, `CreateManualTransaction`
 * accepted whatever account id it was handed: an id belonging to another user
 * in the same tenant, an id from another tenant entirely, an id nobody ever
 * minted, or an account denominated in a different currency from the amount
 * being recorded. RLS does not catch any of it — the row carries the CALLER's
 * tenant and user, so the policy is satisfied; what is wrong is the account
 * the row points at. The result is a real financial record filed against an
 * account that does not exist, is not the subject's, or cannot hold that
 * currency, and no later read can tell that from a correct one.
 *
 * ## What it returns, and what it deliberately does not
 *
 * The minimum needed to decide whether a movement of money may be recorded:
 * that the account resolved at all, its currency, its lifecycle state, and
 * whether it claims a provider connection. **No account narrative** — no
 * display name, no institution, no mask, no balance. This module has no use
 * for any of it, and a port that returned it would make every transaction
 * write a second read path into another context's subject data.
 *
 * ## One answer for every invisible account
 *
 * `resolveOwnAccount` returns `null` for an account that is absent, another
 * user's, another tenant's, or simply never minted — one indistinguishable
 * outcome, and the use case turns it into the same `NOT_FOUND`. A separate
 * "forbidden" answer would be an existence oracle: probe ids, read which ones
 * deny differently, and another subject's account inventory is enumerable
 * without ever seeing one. `application/errors.ts` makes the same argument
 * for transactions; it holds identically here.
 *
 * ## Who implements it
 *
 * **Not this module.** The implementation is a composition adapter over
 * `modules/financial-accounts`' `public-api.ts`, wired by the composition
 * root. Nothing here imports that module — not its identifier types, not its
 * repositories, not its internals — so the two contexts stay independently
 * evolvable and this module cannot start depending on the accounts schema by
 * accident.
 */

import type { AccountRef } from '../../domain/refs.js';
import type { TransactionsPrincipal } from './principal-context.js';

/**
 * The account states this module can reason about.
 *
 * Declared HERE rather than imported: the vocabulary that matters to this
 * module is "may a movement of money be recorded against this account", and
 * that question is this module's, not the accounts module's. The adapter maps
 * one vocabulary onto the other.
 *
 * `UNRECOGNIZED` is the honest answer when the accounts module reports a
 * state this list does not name — a state added there and not yet mapped
 * here. It is never writable. The two alternatives are both worse: mapping an
 * unknown state onto `ACTIVE` silently widens access on the strength of a
 * default, and mapping it onto absence would report "no such account" about
 * an account the subject can see.
 */
export const ACCOUNT_LIFECYCLE_STATES = [
  'ACTIVE',
  'ARCHIVED',
  'CLOSED',
  'UNRECOGNIZED',
] as const;
export type AccountLifecycleState = (typeof ACCOUNT_LIFECYCLE_STATES)[number];

/** The lifecycle states a new financial record may be committed against. */
export const WRITABLE_ACCOUNT_LIFECYCLE_STATES: readonly AccountLifecycleState[] =
  Object.freeze(['ACTIVE']);

export function isWritableLifecycleState(state: AccountLifecycleState): boolean {
  return WRITABLE_ACCOUNT_LIFECYCLE_STATES.includes(state);
}

/**
 * Everything this module learns about an account it is allowed to see.
 *
 * Deliberately five scalars and no narrative. If a future rule needs another
 * fact, it is added here explicitly and the reason is written down — the
 * shape is the record of what this module is entitled to know.
 */
export interface AccountAccessSummary {
  /** Echoed back so a caller cannot mis-pair a summary with a request. */
  readonly accountRef: AccountRef;
  /**
   * ISO 4217 alphabetic code. The transaction's currency must equal it: a
   * QAR movement filed against a KWD account is not a rounding problem, it is
   * a wrong number with a plausible shape, and the account's own currency is
   * the only thing that can say so.
   */
  readonly currencyCode: string;
  readonly lifecycleState: AccountLifecycleState;
  /**
   * Whether the account claims to be fed by an external provider connection.
   *
   * No provider connector exists in this phase, so a `true` here is a claim
   * nothing could have created legitimately — and a hand-typed record filed
   * into a stream the subject believes came from their bank is precisely the
   * fabricated financial fact this module exists to prevent. When a connector
   * does exist, allowing manual entry into a provider-owned stream is a
   * reviewed decision of its own, not something this path should inherit by
   * default.
   */
  readonly providerConnected: boolean;
}

export interface FinancialAccountAccessPort {
  /**
   * The summary of an account **visible to `principal`**, or `null`.
   *
   * `null` covers absent, another user's, another tenant's, and never-minted
   * alike — see the header. An implementation that distinguished them, in its
   * return value or in a thrown error, would reintroduce the oracle.
   */
  resolveOwnAccount(
    principal: TransactionsPrincipal,
    accountRef: AccountRef,
  ): Promise<AccountAccessSummary | null>;
}
