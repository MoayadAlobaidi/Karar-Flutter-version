/**
 * ListOwnPaymentInstruments — the person's own instruments, optionally
 * narrowed to one account.
 *
 * **This use case returns a LIST and nothing else.** No count, no grouping,
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

import type { PaymentInstrument } from '../../domain/payment-instrument.js';
import { BalanceBearingAccountRef } from '../../domain/refs.js';
import { storeFailure, type ListOwnPaymentInstrumentsError } from '../errors.js';
import type { PaymentInstrumentRepository } from '../ports/payment-instrument-repository.js';
import { requirePrincipal, type InstrumentsPrincipal } from '../principal.js';

export interface ListOwnPaymentInstrumentsInput {
  /**
   * Narrow to the instruments that spend from one account. Absent means all
   * of the principal's own instruments.
   */
  readonly accountId?: string | null;
}

export class ListOwnPaymentInstruments {
  constructor(private readonly instruments: PaymentInstrumentRepository) {}

  async execute(
    input: ListOwnPaymentInstrumentsInput,
    actor: InstrumentsPrincipal,
  ): Promise<Result<readonly PaymentInstrument[], ListOwnPaymentInstrumentsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const accountId = input.accountId ?? null;
      const found =
        accountId === null
          ? await this.instruments.listOwn(principal.value)
          : await this.instruments.listOwnForAccount(
              principal.value,
              BalanceBearingAccountRef.of(accountId),
            );
      return Result.ok(found);
    } catch (error) {
      return Result.err(storeFailure('payment instrument listing', error));
    }
  }
}
