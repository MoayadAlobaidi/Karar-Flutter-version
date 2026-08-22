/**
 * Persistence for `payment_instruments`, declared inward (architecture test
 * 5) and implemented in `infrastructure/persistence`.
 *
 * **Every method takes the acting principal, and none takes an owner
 * identifier.** RLS on the table requires both principal GUCs, so a call
 * without them reads and writes nothing; the principal here is what arms it.
 * There is deliberately no `findById(id)` without a principal and no
 * `listForUser(userId)` — the first would be a repository method reachable
 * without tenant context, and the second is the shape MODULE.md forbids.
 *
 * **There is no aggregate, no count-by-account, and no `sum` of anything.** A
 * repository is where a convenience total would first appear, so the surface
 * simply has no method that could return one.
 *
 * **`eraseForAccount` returns a COUNT and nothing else.** It exists so that
 * deleting an account can take the instruments that spend from it, and an
 * erasure has exactly one honest answer: how many rows went. Nothing is
 * decrypted on the way out — an erasure has no reason to read a card mask,
 * and the cheapest way not to leak a value is not to read it.
 */

import type { PaymentInstrument } from '../../domain/payment-instrument.js';
import type { BalanceBearingAccountRef, PaymentInstrumentId } from '../../domain/refs.js';
import type { InstrumentsPrincipal } from '../principal.js';

/** What a create attempt settled as. */
export type InstrumentCreateOutcome = {
  readonly kind: 'created';
  readonly instrument: PaymentInstrument;
};

/**
 * What an update attempt settled as.
 *
 * `stale` and `not_found` are distinguished because the remedies differ — one
 * is "re-read and try again", the other is "it is gone" — and neither reveals
 * anything about a row the caller could not already see: both are computed
 * inside the caller's own principal context, so another subject's row is
 * `not_found` exactly as a never-minted id is.
 */
export type InstrumentUpdateOutcome =
  | { readonly kind: 'updated'; readonly instrument: PaymentInstrument }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

/**
 * What one page of the principal's own instruments asks for.
 *
 * **The bound and the narrowing travel together into the store.** Nothing in
 * the schema limits how many instruments an account may have — that absence
 * is deliberate, because "two virtual cards on one wallet" is the ordinary
 * case and no constraint may forbid a second card — so a read of all of them
 * has no ceiling, and each row costs a key-management call to decrypt its
 * mask and label. Narrowing after the read would bound the response and leave
 * both costs unbounded, and it would make the offset a cursor carries count
 * rows in a set the caller is not walking.
 *
 * `spendable` is the MODULE'S OWN predicate asked of the store: an
 * implementation answers it from `SPENDABLE_INSTRUMENT_STATUSES` rather than
 * from a status list restated in a query, so a vocabulary change moves both
 * at once.
 *
 * `null` on any filter means "do not narrow on this".
 */
export interface PaymentInstrumentPageQuery {
  /** Narrow to what spends from one account; `null` reads every instrument. */
  readonly accountRef: BalanceBearingAccountRef | null;
  /** Narrow to one instrument type; `null` reads every type. */
  readonly instrumentType: string | null;
  /** Narrow to one status; `null` reads every status. */
  readonly status: string | null;
  /** Narrow to what may (or may not) still be used to spend; `null` reads both. */
  readonly spendable: boolean | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

/**
 * One page, and whether another exists.
 *
 * `hasMore` is a BOOLEAN and never a remaining-row figure, which keeps this
 * type on the right side of the module's rule: it answers "ask again?" and
 * cannot be mistaken for a per-account quantity.
 */
export interface PaymentInstrumentPage {
  readonly instruments: readonly PaymentInstrument[];
  readonly hasMore: boolean;
}

export interface PaymentInstrumentRepository {
  /**
   * One page of the principal's own instruments, oldest first, `id` breaking
   * ties so the order is TOTAL.
   *
   * With `accountRef` set this is the method that makes "two virtual cards on
   * one wallet" readable as what it is: two rows against one account. It
   * returns ROWS, never a figure about them.
   */
  pageOwn(
    actor: InstrumentsPrincipal,
    query: PaymentInstrumentPageQuery,
  ): Promise<PaymentInstrumentPage>;

  /** The principal's own row, or `null` — another subject's id is `null` too. */
  findOwnById(
    actor: InstrumentsPrincipal,
    id: PaymentInstrumentId,
  ): Promise<PaymentInstrument | null>;

  create(
    actor: InstrumentsPrincipal,
    instrument: PaymentInstrument,
  ): Promise<InstrumentCreateOutcome>;

  /**
   * Optimistic update. The account, the instrument type and the subject are
   * absent from what an implementation may write, because they are frozen by
   * trigger and a repository that sent them would be one edit away from
   * trying to move an instrument to another account.
   */
  update(
    actor: InstrumentsPrincipal,
    expectedVersion: number,
    next: PaymentInstrument,
  ): Promise<InstrumentUpdateOutcome>;

  /** Removes the principal's own instrument. `false` when nothing matched. */
  delete(actor: InstrumentsPrincipal, id: PaymentInstrumentId): Promise<boolean>;

  /**
   * Removes every instrument that spends from one account, for this
   * principal. Idempotent by contract: a second call finds nothing and
   * answers zero.
   */
  eraseForAccount(
    actor: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<number>;
}
