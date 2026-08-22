/**
 * ListOwnPaymentInstruments — the person's own instruments, optionally
 * narrowed to one account.
 *
 * **The answer is ONE PAGE, cut by the store.** Nothing bounds how many
 * instruments an account may have — no constraint may forbid a second card —
 * so a read of all of them has no ceiling, and every row costs a
 * key-management call to decrypt its mask and its label. The narrowing goes
 * down with the bound, because an offset counted in the unfiltered set names
 * a position in a set the caller is not walking.
 *
 * **This use case returns ROWS and nothing else.** No count, no grouping,
 * no per-account roll-up, and above all no total. The temptation here is
 * real: a caller rendering "your cards" often wants "and how much is on
 * them", and the honest answer is that the question belongs to the account,
 * not to the cards. Two virtual cards on one wallet share ONE balance, and a
 * per-card figure would either repeat that balance twice or invent a split
 * nobody stated.
 *
 * The account filter exists so a caller can ask the one question this module
 * genuinely answers: *what spends from this account?* The answer is a list of
 * rows against one `account_id`, which is exactly what ADR-0028 says two
 * virtual cards on one wallet are.
 *
 * There is deliberately no `userId` on the input. The owner is the acting
 * principal, and MODULE.md records the product rule this implements: no staff
 * endpoint returns one customer's instruments, and no `?userId=` parameter is
 * accepted anywhere.
 */

import { Result } from '@karar/shared-kernel';

import { BalanceBearingAccountRef } from '../../domain/refs.js';
import { storeFailure, type ListOwnPaymentInstrumentsError } from '../errors.js';
import type {
  PaymentInstrumentPage,
  PaymentInstrumentRepository,
} from '../ports/payment-instrument-repository.js';
import { requirePrincipal, type InstrumentsPrincipal } from '../principal.js';

export interface ListOwnPaymentInstrumentsInput {
  /**
   * Narrow to the instruments that spend from one account. Absent means all
   * of the principal's own instruments.
   */
  readonly accountId?: string | null;
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

export class ListOwnPaymentInstruments {
  constructor(private readonly instruments: PaymentInstrumentRepository) {}

  async execute(
    input: ListOwnPaymentInstrumentsInput,
    actor: InstrumentsPrincipal,
  ): Promise<Result<PaymentInstrumentPage, ListOwnPaymentInstrumentsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const accountId = input.accountId ?? null;
      return Result.ok(
        await this.instruments.pageOwn(principal.value, {
          accountRef:
            accountId === null ? null : BalanceBearingAccountRef.of(accountId),
          instrumentType: input.instrumentType,
          status: input.status,
          spendable: input.spendable,
          offset: input.offset,
          limit: input.limit,
        }),
      );
    } catch (error) {
      return Result.err(storeFailure('payment instrument listing', error));
    }
  }
}
