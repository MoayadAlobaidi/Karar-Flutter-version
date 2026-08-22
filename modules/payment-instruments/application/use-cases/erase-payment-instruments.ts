/**
 * ErasePaymentInstruments — every instrument that spends from one account,
 * removed.
 *
 * ## Why this use case exists, and who is meant to call it
 *
 * ADR-0028: "erasure widens: deleting an account must take its source links,
 * instruments, transfer matches, staged source rows and artifacts with it,
 * not only its transactions". `payment_instruments.account_id` is a raw uuid
 * with no foreign key back, because **no foreign key crosses a module
 * boundary** (data-model.md §2) — so nothing in the database makes an account
 * delete reach these rows, and something in the application layer must.
 *
 * That something is `modules/financial-accounts`' own `DeleteOwnAccount`,
 * through a port **that module declares** and this one satisfies (ports are
 * declared inward — architecture test 5). At the time this module was
 * written, `@karar/financial-accounts` declares
 * `AccountSourceLinkEraserPort` and `FinancialRecordEraserPort` and **no
 * payment-instrument port**, so the wiring does not yet exist. This use case
 * and the adapter beside it are the SATISFYING side, complete and tested; the
 * declaration is recorded in this module's MODULE.md as the exact interface
 * the accounts module must add, in the exact place the financial-connections
 * module recorded the same gap before it was closed. **Until that port
 * exists, an account deleted through `DeleteOwnAccount` leaves its
 * instruments behind** — stated here rather than discovered later.
 *
 * ## Idempotent by contract
 *
 * A second call finds nothing and answers zero. An erasure that failed
 * halfway must be safe to retry, and a caller has to be able to retry without
 * first working out what the previous attempt managed.
 *
 * ## Nothing is decrypted on the way out
 *
 * The repository deletes by account and returns a count. An erasure has no
 * reason to read a card mask, and the cheapest way not to leak a value is not
 * to read it.
 */

import { Result } from '@karar/shared-kernel';

import { BalanceBearingAccountRef } from '../../domain/refs.js';
import { storeFailure, type ErasePaymentInstrumentsError } from '../errors.js';
import type { PaymentInstrumentRepository } from '../ports/payment-instrument-repository.js';
import { requirePrincipal, type InstrumentsPrincipal } from '../principal.js';

export interface ErasePaymentInstrumentsInput {
  readonly accountId: string;
}

export interface PaymentInstrumentsErased {
  /** The exact number of rows removed. Reported, never estimated. */
  readonly paymentInstrumentsDeleted: number;
}

export class ErasePaymentInstruments {
  constructor(private readonly instruments: PaymentInstrumentRepository) {}

  async execute(
    input: ErasePaymentInstrumentsInput,
    actor: InstrumentsPrincipal,
  ): Promise<Result<PaymentInstrumentsErased, ErasePaymentInstrumentsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const deleted = await this.instruments.eraseForAccount(
        principal.value,
        BalanceBearingAccountRef.of(input.accountId),
      );
      return Result.ok({ paymentInstrumentsDeleted: deleted });
    } catch (error) {
      return Result.err(storeFailure('payment instrument erasure', error));
    }
  }
}
