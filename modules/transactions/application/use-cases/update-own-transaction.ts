/**
 * UpdateOwnTransaction — a correction, recorded as a revision.
 *
 * **A correction never overwrites the imported value.** The current row moves
 * to the new values, and an append-only revision records what changed,
 * attributed to `USER_INPUT`. Revision 1 — the values as the source supplied
 * them — stays exactly where it was, attributed to the source, forever. So
 * "what did the statement actually say" survives every edit, and a
 * reconciliation can still tell the institution's figure from the user's.
 *
 * The corrected values get their OWN provenance record, naming manual input
 * and the acting principal. That is why provenance is per-revision rather
 * than per-transaction: the origin of the value you are looking at is not the
 * origin of the row, once anyone has edited anything.
 *
 * Optimistic concurrency by version. Two people (or two tabs) editing the
 * same transaction is ordinary, and last-write-wins on a financial record
 * silently discards one of the two corrections. The second writer is told
 * instead.
 *
 * No `userId`, no `tenantId`: the principal comes from context.
 */

import { Clock, Money, Result } from '@karar/shared-kernel';
import type { CalendarDay } from '@karar/shared-kernel';

import { HsfField } from '../../domain/hsf-field.js';
import { createProvenance } from '../../domain/provenance.js';
import { correctionRevision } from '../../domain/revision.js';
import { ActorRef, TransactionId } from '../../domain/refs.js';
import { signedAmountFor, sourceDirectionOf, type MoneyDirection } from '../../domain/sign-convention.js';
import {
  applyCorrection,
  type Transaction,
  type TransactionCorrection,
  type TransactionStatus,
} from '../../domain/transaction.js';
import { InvalidRevisionError } from '../../domain/revision.js';
import {
  InvalidTransactionInputError,
  principalContextMissing,
  toStoreFailure,
  type NoChange,
  type NotFound,
  type PrincipalContextMissing,
  type StoreFailure,
  type VersionConflict,
} from '../errors.js';
import type { IdSource } from '../ports/id-source.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import {
  TransactionVersionConflictError,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import {
  MANUAL_ENTRY_MAPPING_VERSION,
  MANUAL_ENTRY_NORMALIZATION_VERSION,
  MANUAL_ENTRY_PARSER_VERSION,
} from './create-manual-transaction.js';

/**
 * A correction states a magnitude and a direction, exactly as creation does —
 * the canonical sign convention is applied in one place and a caller never
 * hands over a pre-signed amount. Omitted fields are left untouched;
 * `valueDate` and `note` accept an explicit `null` to clear them, which is
 * why they are typed with `null` rather than only optional.
 *
 * There is deliberately no `eventOccurredAt` and no `sourceTimezone` here.
 * Those are what the SOURCE said about when the movement happened; a person
 * correcting their own record may move the amount or the booked day, but
 * restating the source's instant would erase the fact those columns exist to
 * keep, and adding one where the source stated none would fabricate it.
 */
export interface UpdateOwnTransactionInput {
  readonly transactionId: string;
  /** The version the caller read. The write refuses if the row has moved on. */
  readonly expectedVersion: number;
  readonly magnitude?: Money;
  readonly direction?: MoneyDirection;
  readonly bookingDate?: CalendarDay;
  readonly valueDate?: CalendarDay | null;
  readonly merchant?: string | null;
  readonly description?: string;
  readonly note?: string | null;
  readonly status?: TransactionStatus;
}

/**
 * The fingerprint definition a correction records. A correction computes no
 * fingerprint — see the provenance comment below — so this names the
 * correction path explicitly rather than reusing a commit's version, which
 * would claim a dedup decision that was never made.
 */
export const CORRECTION_FINGERPRINT_VERSION = 'correction/no-fingerprint-recomputed/1';

export type UpdateOwnTransactionError =
  | PrincipalContextMissing
  | NotFound
  | VersionConflict
  | NoChange
  | StoreFailure;

export class UpdateOwnTransaction {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateOwnTransactionInput,
  ): Promise<Result<Transaction, UpdateOwnTransactionError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());
    const id = TransactionId.of(input.transactionId);

    let current: Transaction | null;
    try {
      current = await this.transactions.findById(principal, id);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (current === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'transaction', id });
    }
    if (current.version !== input.expectedVersion) {
      return Result.err(versionConflict(input.expectedVersion, current.version));
    }

    const correction = buildCorrection(input);
    const next = applyCorrection(current, correction);
    const now = this.clock.now();
    const actorRef = ActorRef.of(principal.userId);

    let revision;
    try {
      revision = correctionRevision({
        id: this.ids.nextId(),
        before: current,
        after: next,
        actorRef,
        recordedAt: now,
      });
    } catch (error) {
      // A no-op correction is an expected caller outcome, not a defect:
      // re-submitting an unchanged form is ordinary. Every other malformation
      // is a defect and keeps throwing.
      if (error instanceof InvalidRevisionError && /at least one field/.test(error.message)) {
        return Result.err({
          kind: 'NO_CHANGE',
          message:
            'the correction changes nothing; nothing was recorded, because a revision that changed no value is noise that makes the real corrections harder to find',
        });
      }
      throw error;
    }

    const provenance = createProvenance({
      id: this.ids.nextId(),
      transactionId: next.id,
      tenantId: principal.tenantId,
      userId: principal.userId,
      revisionNumber: next.version,
      // The ORIGIN OF THESE VALUES is a person, whatever the origin of the
      // row was. Recording CSV here would attribute the user's figure to the
      // institution, which is precisely the confusion this module refuses.
      sourceKind: 'MANUAL',
      importRef: null,
      rowRef: null,
      actorRef,
      accountRef: next.accountRef,
      versions: {
        parserVersion: MANUAL_ENTRY_PARSER_VERSION,
        mappingVersion: MANUAL_ENTRY_MAPPING_VERSION,
        normalizationVersion: MANUAL_ENTRY_NORMALIZATION_VERSION,
        // The fingerprint is NOT recomputed on correction. Dedup identity is
        // the identity of the SOURCE movement; letting an edit change it
        // would make the same statement row importable again. So the
        // correction's provenance names the correction path's own version
        // rather than borrowing the commit's, and the column stays NOT NULL
        // rather than admitting a null that reads as "not applicable".
        fingerprintVersion: CORRECTION_FINGERPRINT_VERSION,
      },
      sourceDirection: sourceDirectionOf(next.amount),
      directionMapping: 'MANUAL_ENTRY',
      categoryAssignmentSource: 'NONE',
      createdAt: now,
    });

    try {
      await this.transactions.correct(principal, {
        transaction: next,
        revision,
        provenance,
        expectedVersion: input.expectedVersion,
      });
    } catch (error) {
      if (error instanceof TransactionVersionConflictError) {
        return Result.err(versionConflict(error.expectedVersion, error.actualVersion));
      }
      return Result.err(toStoreFailure(error));
    }
    return Result.ok(next);
  }
}

function buildCorrection(input: UpdateOwnTransactionInput): TransactionCorrection {
  if ((input.magnitude === undefined) !== (input.direction === undefined)) {
    throw new InvalidTransactionInputError(
      'correcting an amount requires both the magnitude and the direction; a magnitude without a direction has no sign under the canonical convention, and a direction without a magnitude changes nothing',
    );
  }
  const amount =
    input.magnitude !== undefined && input.direction !== undefined
      ? signedAmountFor(input.magnitude, input.direction)
      : undefined;
  return {
    ...(amount !== undefined ? { amount } : {}),
    ...(input.bookingDate !== undefined ? { bookingDate: input.bookingDate } : {}),
    ...(input.valueDate !== undefined ? { valueDate: input.valueDate } : {}),
    ...(input.merchant !== undefined ? { merchant: HsfField.optional(input.merchant) } : {}),
    ...(input.description !== undefined ? { description: HsfField.of(input.description) } : {}),
    ...(input.note !== undefined ? { note: HsfField.optional(input.note) } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
}

function versionConflict(expected: number, actual: number): VersionConflict {
  return {
    kind: 'VERSION_CONFLICT',
    expectedVersion: expected,
    actualVersion: actual,
    message:
      `this transaction is at version ${actual}, not ${expected} — somebody changed it since it was read. ` +
      'Nothing was written: silently overwriting the other correction would discard a change a person deliberately made.',
  };
}
