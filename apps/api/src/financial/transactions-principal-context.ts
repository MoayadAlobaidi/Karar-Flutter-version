/**
 * The transactions module's `PrincipalContextPort`, over an
 * `AsyncLocalStorage`.
 *
 * WHY THIS SHAPE AND NOT A CONSTRUCTOR ARGUMENT. Every other financial module
 * takes its principal as the second argument of `execute`. The transactions
 * module takes it AMBIENTLY — `current(): TransactionsPrincipal | null` — so
 * that no input type can ever carry a `userId`, which is the property its
 * tests assert. That design is right, and it moves one obligation to the
 * composition root: something has to establish the ambient value for exactly
 * the duration of one request.
 *
 * WHY NOT A MUTABLE FIELD. A field set before `await` and read after it is
 * correct only until two requests overlap, which under any real load is
 * immediately. The failure mode is the worst one this platform has: one
 * subject's write executed under another subject's principal, and RLS would
 * not catch it, because the context the repository binds would be the wrong
 * subject's rather than absent. `AsyncLocalStorage` is the mechanism that
 * makes the value follow the async continuation instead of the wall clock.
 *
 * WHY THE CONTROLLER WRAPS THE CALL RATHER THAN A GLOBAL HOOK ESTABLISHING
 * IT. A hook would have to run before the guard that resolves the principal,
 * so it could only install a mutable container — the same defect one level
 * further away. Wrapping at the call site keeps the store's lifetime exactly
 * as long as the use-case call, and `current()` outside one answers null,
 * which the module turns into PRINCIPAL_CONTEXT_MISSING rather than into a
 * silent read of somebody's rows.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { PrincipalContextPort, TransactionsPrincipal } from '@karar/transactions';

export const TRANSACTIONS_PRINCIPAL_CONTEXT = 'karar.api.financial.transactions-principal-context';

export interface TransactionsPrincipalScope extends PrincipalContextPort {
  /** Runs `work` with `principal` ambient, and only for its duration. */
  withPrincipal<T>(principal: TransactionsPrincipal, work: () => Promise<T>): Promise<T>;
}

export class RequestScopedTransactionsPrincipalContext implements TransactionsPrincipalScope {
  readonly #storage = new AsyncLocalStorage<TransactionsPrincipal>();

  current(): TransactionsPrincipal | null {
    return this.#storage.getStore() ?? null;
  }

  withPrincipal<T>(principal: TransactionsPrincipal, work: () => Promise<T>): Promise<T> {
    return this.#storage.run(principal, work);
  }
}
