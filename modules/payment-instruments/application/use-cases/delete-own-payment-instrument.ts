/**
 * DeleteOwnPaymentInstrument — the person removes an instrument they
 * recorded.
 *
 * Deleting an instrument removes a row that says how money leaves an account.
 * It removes **nothing else**: not the account, not a transaction, not a
 * balance — an instrument never held any of those, which is why this deletion
 * is the simplest in the financial modules and needs no cross-module erasure
 * port at all.
 *
 * `CANCELLED` and deletion are different acts and both exist. Cancelling
 * records that a card is gone from the world while keeping the row a person
 * can still see; deleting removes the record from Karar. The first is a fact
 * about the card, the second is a choice about the product, and collapsing
 * them would force a person to erase their own history in order to say a card
 * expired.
 */

import { Result } from '@karar/shared-kernel';

import { PaymentInstrumentId } from '../../domain/refs.js';
import {
  INSTRUMENT_NOT_FOUND,
  storeFailure,
  type DeleteOwnPaymentInstrumentError,
} from '../errors.js';
import type { PaymentInstrumentRepository } from '../ports/payment-instrument-repository.js';
import { requirePrincipal, type InstrumentsPrincipal } from '../principal.js';

export interface DeleteOwnPaymentInstrumentInput {
  readonly instrumentId: string;
}

export interface PaymentInstrumentDeleted {
  readonly instrumentId: string;
}

export class DeleteOwnPaymentInstrument {
  constructor(private readonly instruments: PaymentInstrumentRepository) {}

  async execute(
    input: DeleteOwnPaymentInstrumentInput,
    actor: InstrumentsPrincipal,
  ): Promise<Result<PaymentInstrumentDeleted, DeleteOwnPaymentInstrumentError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    const id = PaymentInstrumentId.of(input.instrumentId);
    let removed: boolean;
    try {
      removed = await this.instruments.delete(principal.value, id);
    } catch (error) {
      return Result.err(storeFailure('payment instrument deletion', error));
    }
    // `false` covers absent, another user's and another tenant's alike — the
    // delete ran inside the caller's own principal context, so RLS produced
    // the outcome rather than a check here choosing it.
    if (!removed) return Result.err(INSTRUMENT_NOT_FOUND);
    return Result.ok({ instrumentId: id });
  }
}
