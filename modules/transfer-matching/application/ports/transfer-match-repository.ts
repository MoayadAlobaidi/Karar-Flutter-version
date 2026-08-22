/**
 * Persistence for `transfer_matches`, declared inward (architecture test 5)
 * and implemented in `infrastructure/persistence`.
 *
 * **Every method takes the acting principal, and none takes an owner
 * identifier.** RLS on the table requires both principal GUCs, so a call
 * without them reads and writes nothing; the principal here is what arms it.
 * There is deliberately no `findById(id)` without a principal and no
 * `listForUser(userId)` — the first would be a repository method reachable
 * without tenant context, and the second is the shape MODULE.md forbids.
 *
 * **There is no aggregate, no count, no `sum` and no `groupBy`.** A repository
 * is where "how much did I move between my own accounts this month" would
 * first appear, and that question is an insight this module does not compute.
 * The surface simply has no method that could answer it.
 *
 * ## The two refusals a create can meet, and why they must arrive separately
 *
 *   * **23505 / P2002** — a partial unique index. One of these transactions is
 *     already the same SIDE of another live match. Ordinary under a repeated
 *     import, and under concurrency it is how two simultaneous suggestion
 *     passes settle: exactly one wins.
 *   * **KAR42** — the cross-side guard. One of these transactions is already
 *     the OTHER side of a live match, which no index can express. Also not a
 *     failure — the transaction is spoken for — but the caller needs to know
 *     it was the crossing rather than the same side, because the existing
 *     match it collides with is a different row.
 *
 * Both are read STRUCTURALLY out of the driver-adapter cause Prisma attaches,
 * never by matching message text: a message is prose that a later edit
 * rewrites, and a mapping that depends on it fails silently the day somebody
 * improves the wording (`modules/transactions` and
 * `modules/financial-connections` record the same reasoning).
 *
 * **`eraseForTransaction` and `eraseForAccount` return COUNTS and nothing
 * else.** They exist so that deleting a transaction, or an account, can take
 * the matches that name it. An erasure has exactly one honest answer: how many
 * rows went.
 */

import type { TransferMatch } from '../../domain/transfer-match.js';
import type {
  MatchedAccountRef,
  TransactionRef,
  TransferMatchId,
} from '../../domain/refs.js';
import type { MatchingPrincipal } from '../principal.js';

/**
 * What a create attempt settled as.
 *
 * `transaction_already_matched` carries the id of the match it collided with,
 * because that match is the SUBJECT'S OWN row — telling them which one is the
 * entire point, and there is no oracle here, since a caller who could not
 * already see that match could not have reached this arm.
 */
export type TransferMatchCreateOutcome =
  | { readonly kind: 'created'; readonly match: TransferMatch }
  | {
      readonly kind: 'transaction_already_matched';
      readonly conflictingMatchId: string;
      /** Whether the collision was on the same side or across the two. */
      readonly collision: 'SAME_SIDE' | 'CROSSED_SIDES';
    };

/**
 * What an update attempt settled as.
 *
 * `stale` and `not_found` are distinguished because the remedies differ — one
 * is "re-read and try again", the other is "it is gone" — and neither reveals
 * anything about a row the caller could not already see: both are computed
 * inside the caller's own principal context.
 */
export type TransferMatchUpdateOutcome =
  | { readonly kind: 'updated'; readonly match: TransferMatch }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

/**
 * What one page of the principal's own matches asks for.
 *
 * **The bound travels INTO the query.** A match row is written for every pair
 * the suggestion rule finds and is kept even once rejected — that is what
 * stops the same pair being suggested again as though nobody had looked — so
 * this table grows with a person's transactions and nothing prunes it. A read
 * of all of it is a read whose size is decided by how long somebody has used
 * the product.
 *
 * The state filter goes down with the bound rather than being applied to the
 * answer, because an offset counted over every state names a position in a
 * set the caller is not walking.
 */
export interface TransferMatchPageQuery {
  /** Narrow to one state; `null` reads every state. */
  readonly state: TransferMatch['state'] | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

/**
 * One page, and whether another exists.
 *
 * `hasMore` is a BOOLEAN, deliberately: it answers "ask again?" and is not a
 * figure about the caller's matches. A remaining-row number here would be the
 * first quantity this module ever published about a person's transfers.
 */
export interface TransferMatchPage {
  readonly matches: readonly TransferMatch[];
  readonly hasMore: boolean;
}

export interface TransferMatchRepository {
  /**
   * One page of the principal's own matches, newest first, `id` breaking ties
   * so the order is TOTAL. Two matches written in the same instant are
   * otherwise interchangeable, and a page boundary falling between two
   * interchangeable rows drops one and repeats the other.
   */
  pageOwn(
    actor: MatchingPrincipal,
    query: TransferMatchPageQuery,
  ): Promise<TransferMatchPage>;

  /** The principal's own row, or `null` — another subject's id is `null` too. */
  findOwnById(
    actor: MatchingPrincipal,
    id: TransferMatchId,
  ): Promise<TransferMatch | null>;

  /**
   * Every match this principal holds that names one transaction on EITHER
   * side, including rejected ones.
   *
   * Both sides, deliberately: "is this transaction already spoken for?" is not
   * answerable by looking at one column, and the whole point of the
   * one-live-match rule is that a transaction cannot be the outflow of one
   * pairing and the inflow of another.
   */
  findOwnForTransaction(
    actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<readonly TransferMatch[]>;

  create(
    actor: MatchingPrincipal,
    match: TransferMatch,
  ): Promise<TransferMatchCreateOutcome>;

  /**
   * Optimistic update. Only the state, the decision instant and the version
   * may move: both sides, both accounts, both currencies and the subject are
   * frozen by trigger (SQLSTATE KAR40), and a repository that sent them would
   * be one edit away from relabelling which movement a person's confirmation
   * was about.
   */
  update(
    actor: MatchingPrincipal,
    expectedVersion: number,
    next: TransferMatch,
  ): Promise<TransferMatchUpdateOutcome>;

  /**
   * Removes every match that names one transaction on either side, for this
   * principal. Idempotent by contract: a second call finds nothing and
   * answers zero.
   */
  eraseForTransaction(
    actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<number>;

  /**
   * Removes every match with either side on one account, for this principal.
   * Idempotent by contract.
   *
   * This is the path an ACCOUNT deletion needs. It exists because the match
   * row carries both account ids — copied from a column `public.transactions`
   * freezes by trigger — so erasing an account does not have to enumerate
   * every transaction on it first.
   */
  eraseForAccount(
    actor: MatchingPrincipal,
    accountRef: MatchedAccountRef,
  ): Promise<number>;
}
