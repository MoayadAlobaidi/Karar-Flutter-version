/**
 * Response serialization for payment instruments — a CLOSED field set, picked
 * by name.
 *
 * `version` IS THE ONLY NUMBER IN THIS OBJECT, and that is the whole point.
 * The question "how much is on this card" has no answer in this platform: two
 * virtual cards on one wallet share ONE balance, so a per-card figure would
 * either repeat it twice or invent a split nobody stated. The module has no
 * balance column, no aggregate and no arithmetic; this file must not become
 * the place where one appears.
 *
 * NO PAN, CVV, EXPIRY, NETWORK TOKEN OR WALLET CREDENTIAL exists in the read
 * model, so there is nothing here to omit. The only card-shaped value is a
 * short mask, which the domain refuses to store at all if it reads as a full
 * card, account or phone number.
 *
 * NO STATUS MEANS PROVISIONED. `impliesLiveIssuerLink` is emitted as `false`
 * because the module's predicate answers false for every value the status
 * vocabulary permits — including TOKENIZED_CARD, which is a TYPE rather than
 * a live provisioning state.
 */

import { isSpendableStatus } from '@karar/payment-instruments';
import type { PaymentInstrument } from '@karar/payment-instruments';

import { instantWire, revealWire } from './wire.js';

export const NO_ISSUER_LINK = Object.freeze({
  impliesLiveIssuerLink: false as const,
  providerAccessStatus: 'NOT_IMPLEMENTED' as const,
});

export interface PaymentInstrumentWire {
  readonly instrumentId: string;
  readonly accountId: string;
  readonly instrumentType: string;
  readonly status: string;
  readonly spendable: boolean;
  readonly mask: string;
  readonly displayLabel: string;
  readonly issuerLink: typeof NO_ISSUER_LINK;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export function paymentInstrumentWire(instrument: PaymentInstrument): PaymentInstrumentWire {
  return {
    instrumentId: instrument.id,
    // Singular and required. There is no field through which an instrument
    // could be re-pointed at another account — the domain makes that
    // unexpressible and the database refuses it (SQLSTATE KAR30).
    accountId: instrument.accountRef.accountId,
    instrumentType: instrument.instrumentType,
    status: instrument.status,
    // Stated with the module's own predicate rather than derived by a client
    // from a status vocabulary it might read wrongly.
    spendable: isSpendableStatus(instrument.status),
    mask: revealWire(instrument.mask),
    displayLabel: revealWire(instrument.displayLabel),
    issuerLink: NO_ISSUER_LINK,
    createdAt: instantWire(instrument.createdAt),
    updatedAt: instantWire(instrument.updatedAt),
    version: instrument.version,
  };
}
