/**
 * UpdateOwnPaymentInstrument — rename it, correct the mask, or move its
 * status.
 *
 * **The input has no `accountId` and no `instrumentType`.** That is the rule
 * expressed as a type rather than as a check: an instrument spends from
 * exactly one account and is exactly one kind of thing, both fixed when it is
 * recorded. A caller reaching for either through a cast meets
 * `applyInstrumentEdit`'s refusal, and a writer that bypassed the use case
 * entirely meets `payment_instruments_guard` (SQLSTATE KAR30). Three layers,
 * because the failure is silent: a re-pointed instrument keeps its id, its
 * name and its history while changing what it draws on.
 *
 * The optimistic version is required and is not defaulted. A missing expected
 * version would make every edit a last-writer-wins overwrite, and the losing
 * edit is usually the one a person made on their other device.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  applyInstrumentEdit,
  type InstrumentStatus,
  type PaymentInstrument,
} from '../../domain/payment-instrument.js';
import { PaymentInstrumentId } from '../../domain/refs.js';
import {
  INSTRUMENT_NOT_FOUND,
  storeFailure,
  type UpdateOwnPaymentInstrumentError,
} from '../errors.js';
import type { PaymentInstrumentRepository } from '../ports/payment-instrument-repository.js';
import { requirePrincipal, type InstrumentsPrincipal } from '../principal.js';

export interface UpdateOwnPaymentInstrumentInput {
  readonly instrumentId: string;
  readonly expectedVersion: number;
  readonly displayLabel?: string;
  readonly mask?: string;
  readonly status?: InstrumentStatus;
}

export class UpdateOwnPaymentInstrument {
  constructor(
    private readonly instruments: PaymentInstrumentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateOwnPaymentInstrumentInput,
    actor: InstrumentsPrincipal,
  ): Promise<Result<PaymentInstrument, UpdateOwnPaymentInstrumentError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    const id = PaymentInstrumentId.of(input.instrumentId);
    let current;
    try {
      current = await this.instruments.findOwnById(principal.value, id);
    } catch (error) {
      return Result.err(storeFailure('payment instrument read', error));
    }
    if (current === null) return Result.err(INSTRUMENT_NOT_FOUND);
    if (current.version !== input.expectedVersion) {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: current.version,
        message:
          'this instrument changed since it was read. Re-read it and decide: nothing here ' +
          "silently overwrites a concurrent edit, because the losing edit is usually the one a " +
          'person made on their other device',
      });
    }

    const edited = applyInstrumentEdit(
      current,
      {
        ...(input.displayLabel !== undefined ? { displayLabel: input.displayLabel } : {}),
        ...(input.mask !== undefined ? { mask: input.mask } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      this.clock.now(),
    );
    if (!edited.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: edited.error,
        message: edited.error.message,
      });
    }
    // Identity means nothing changed. A no-op write would burn a version and
    // lose whichever concurrent edit arrived between the read and the write.
    if (edited.value === current) return Result.ok(current);

    let outcome;
    try {
      outcome = await this.instruments.update(principal.value, input.expectedVersion, edited.value);
    } catch (error) {
      return Result.err(storeFailure('payment instrument update', error));
    }
    if (outcome.kind === 'not_found') return Result.err(INSTRUMENT_NOT_FOUND);
    if (outcome.kind === 'stale') {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this instrument changed between the read and the write. Re-read it and decide; the ' +
          'write was refused rather than applied over somebody else',
      });
    }
    return Result.ok(outcome.instrument);
  }
}
