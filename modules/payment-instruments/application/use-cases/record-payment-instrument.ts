/**
 * RecordPaymentInstrument — a person says "this card spends from that
 * account", and this use case writes it down.
 *
 * ## The order of the gates, and why it is that order
 *
 * 1. **Principal.** No principal, no write; and the principal is bound as
 *    associated data on both ciphertexts, so an absent one cannot be filled
 *    in later.
 * 2. **Retention.** Before the mask is examined, normalised or encrypted. A
 *    refusal here must leave no ciphertext, no key usage and no row behind,
 *    which is only true if it runs before any of them.
 * 3. **The mask shape rule**, in the domain, before a key is used. A value
 *    that is actually a card number must never reach one.
 * 4. **Account visibility.** The instrument names an account by raw UUID and
 *    nothing about that UUID is self-validating; without this step a caller
 *    could attach a card to another subject's wallet, and RLS would not
 *    notice because the ROW is the caller's.
 *
 * ## What this use case does NOT do
 *
 * It does not look at, ask for, compute or return a balance. It cannot: the
 * account port answers existence and lifecycle state and nothing else, and
 * the instrument type has no numeric field. **Recording a second card on one
 * wallet adds a row and changes no total anywhere**, which is the entire
 * point of the module and is proved by
 * `__tests__/many-instruments-one-account.integration.test.ts`.
 *
 * It also does not check for a "duplicate" instrument, and the absence is
 * deliberate. Two virtual cards on one wallet may legitimately share a type
 * and even a four-digit tail, and there is no value here that could tell a
 * genuine second card from a re-entry — the mask is a four-digit fragment,
 * not an identity. Guessing would merge two real cards into one row; asking
 * the database for uniqueness would refuse a real second card. So neither
 * happens, and the person's own list is what tells them whether they already
 * recorded it.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  createPaymentInstrument,
  type ConstructibleInstrumentStatus,
  type InstrumentType,
  type PaymentInstrument,
} from '../../domain/payment-instrument.js';
import { BalanceBearingAccountRef, type PaymentInstrumentId } from '../../domain/refs.js';
import {
  ACCOUNT_NOT_FOUND,
  accountAccessUnavailable,
  retentionUnresolved,
  storeFailure,
  type RecordPaymentInstrumentError,
} from '../errors.js';
import {
  isAttachableLifecycleState,
  type BalanceBearingAccountAccessPort,
} from '../ports/balance-bearing-account-access.js';
import type { IdSource } from '../ports/id-source.js';
import type { PaymentInstrumentRepository } from '../ports/payment-instrument-repository.js';
import {
  permitsDurableWrite,
  type PaymentInstrumentRetentionDecisionPort,
} from '../ports/payment-instrument-retention-decision.js';
import { requirePrincipal, type InstrumentsPrincipal } from '../principal.js';

export interface RecordPaymentInstrumentInput {
  /** The ONE balance-bearing account this instrument spends from. */
  readonly accountId: string;
  readonly instrumentType: InstrumentType;
  readonly status?: ConstructibleInstrumentStatus;
  /** The few characters the person recognises it by. Never a PAN. */
  readonly mask: string;
  /** The name the SUBJECT gave it. Required — see the domain factory. */
  readonly displayLabel: string;
}

export class RecordPaymentInstrument {
  constructor(
    private readonly instruments: PaymentInstrumentRepository,
    private readonly accounts: BalanceBearingAccountAccessPort,
    private readonly retention: PaymentInstrumentRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RecordPaymentInstrumentInput,
    actor: InstrumentsPrincipal,
  ): Promise<Result<PaymentInstrument, RecordPaymentInstrumentError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let decision;
    try {
      decision = await this.retention.decideFor(principal.value, 'payment_instruments');
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('payment_instruments', decision));
    }

    // The domain factory applies the mask shape rule FIRST, before anything is
    // normalised or encrypted, so a card number is refused before a key is
    // used. The id is minted here because the factory is pure.
    const now = this.clock.now();
    const built = createPaymentInstrument({
      id: this.ids.nextId() as PaymentInstrumentId,
      tenantId: principal.value.tenantId,
      userId: principal.value.userId,
      accountId: input.accountId,
      instrumentType: input.instrumentType,
      ...(input.status !== undefined ? { status: input.status } : {}),
      mask: input.mask,
      displayLabel: input.displayLabel,
      recordedAt: now,
    });
    if (!built.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: built.error,
        message: built.error.message,
      });
    }

    const accountRef = BalanceBearingAccountRef.of(input.accountId);
    let summary;
    try {
      summary = await this.accounts.resolveOwnAccount(principal.value, accountRef);
    } catch (error) {
      return Result.err(accountAccessUnavailable(error));
    }
    if (summary === null) return Result.err(ACCOUNT_NOT_FOUND);
    if (!isAttachableLifecycleState(summary.lifecycleState)) {
      return Result.err({
        kind: 'account_not_attachable',
        lifecycleState: summary.lifecycleState,
        message:
          `this account is ${summary.lifecycleState}, so no new instrument may be recorded ` +
          'against it. A live card on an account the person has put away asserts that money can ' +
          'still leave it, and they would meet that contradiction on a screen rather than ' +
          'through anything they did. Instruments already recorded against it are untouched: ' +
          'they are a record of what existed',
      });
    }

    let outcome;
    try {
      outcome = await this.instruments.create(principal.value, built.value);
    } catch (error) {
      return Result.err(storeFailure('payment instrument creation', error));
    }
    return Result.ok(outcome.instrument);
  }
}
