/**
 * CreateManualTransaction — a person records one movement of money.
 *
 * Manual entry is a **first-class path**, not a stopgap (MODULE.md, challenge
 * C9). It produces exactly the same shape as a committed CSV row: a
 * transaction, revision 1, and a provenance record naming manual input — so
 * every stored financial fact is explainable back to manual input or to an
 * exact source row, with no third category of "just there".
 *
 * The input carries a MAGNITUDE plus a direction, never a signed amount. The
 * canonical sign convention (money out is negative) is applied here, in one
 * place, so no caller can store a sign the convention did not produce; a
 * magnitude that already carries a sign is refused as contradictory input
 * rather than silently reinterpreted.
 *
 * No `userId`, no `tenantId`: the principal comes from context.
 */

import { Clock, Money, Result } from '@karar/shared-kernel';
import type { Currency } from '@karar/shared-kernel';

import { HsfField } from '../../domain/hsf-field.js';
import { createProvenance, type CategoryAssignmentSource } from '../../domain/provenance.js';
import { originalRevision } from '../../domain/revision.js';
import { AccountRef, ActorRef, TransactionId } from '../../domain/refs.js';
import { signedAmountFor, sourceDirectionOf, type MoneyDirection } from '../../domain/sign-convention.js';
import { createTransaction, OriginalAmount, type Transaction } from '../../domain/transaction.js';
import {
  InvalidTransactionInputError,
  principalContextMissing,
  toStoreFailure,
  type DuplicateTransaction,
  type PrincipalContextMissing,
  type StoreFailure,
} from '../errors.js';
import type { DedupFingerprintPort } from '../ports/dedup-fingerprint.js';
import type { IdSource } from '../ports/id-source.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import {
  DuplicateTransactionError,
  type TransactionRepository,
} from '../ports/transaction-repository.js';

/**
 * The processing versions a manual entry records.
 *
 * A manual entry has no parser, no column mapping, and no text normalisation
 * — but the columns are NOT NULL and the versions are recorded anyway,
 * naming the manual path's own trivial versions. A nullable version column
 * would let "we do not know which parser ran" hide as "not applicable", and
 * those two are not the same answer.
 */
export const MANUAL_ENTRY_PARSER_VERSION = 'manual-entry/1';
export const MANUAL_ENTRY_MAPPING_VERSION = 'manual-entry/1';
export const MANUAL_ENTRY_NORMALIZATION_VERSION = 'manual-entry/1';

export interface CreateManualTransactionInput {
  readonly accountId: string;
  /** Non-negative magnitude; the direction decides the stored sign. */
  readonly magnitude: Money;
  readonly direction: MoneyDirection;
  readonly bookingDate: Date;
  readonly valueDate?: Date | null;
  readonly merchant?: string | null;
  readonly description: string;
  readonly note?: string | null;
  /** All-or-nothing pair; a lone member is refused. */
  readonly originalMagnitude?: Money | null;
  readonly originalCurrency?: Currency | null;
  /** 1 for the first such movement; 2 for a genuine identical repeat. */
  readonly occurrenceOrdinal?: number;
}

export type CreateManualTransactionError =
  | PrincipalContextMissing
  | DuplicateTransaction
  | StoreFailure;

export class CreateManualTransaction {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly fingerprints: DedupFingerprintPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateManualTransactionInput,
  ): Promise<Result<Transaction, CreateManualTransactionError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());

    const accountRef = AccountRef.of(input.accountId);
    const amount = signedAmountFor(input.magnitude, input.direction);
    const description = HsfField.of(input.description);
    const merchant = HsfField.optional(input.merchant);
    const note = HsfField.optional(input.note);
    const occurrenceOrdinal = requireOrdinal(input.occurrenceOrdinal);
    const originalAmount = OriginalAmount.of(
      input.originalMagnitude ?? null,
      input.originalCurrency ?? null,
    );
    const now = this.clock.now();

    const transaction = createTransaction({
      id: TransactionId.of(this.ids.nextId()),
      tenantId: principal.tenantId,
      userId: principal.userId,
      accountRef,
      amount,
      bookingDate: input.bookingDate,
      valueDate: input.valueDate ?? null,
      merchant,
      description,
      note,
      originalAmount,
      sourceKind: 'MANUAL',
      status: 'POSTED',
      createdAt: now,
      version: 1,
    });

    const actorRef = ActorRef.of(principal.userId);
    const revision = originalRevision({
      id: this.ids.nextId(),
      transaction,
      attribution: 'MANUAL_ENTRY',
      actorRef,
      recordedAt: now,
    });

    // The fingerprint is computed over the SAME narrative the user typed. A
    // manual entry has no normalisation ruleset of its own, so the
    // description travels as written and the version records that.
    const fingerprint = await this.fingerprints.fingerprint(principal, {
      accountRef,
      bookingDate: transaction.bookingDate,
      amountMinorUnits: amount.minorUnits,
      currencyCode: amount.currency.code,
      normalizedNarrative: description.reveal(),
      occurrenceOrdinal,
    });

    const provenance = createProvenance({
      id: this.ids.nextId(),
      transactionId: transaction.id,
      tenantId: principal.tenantId,
      userId: principal.userId,
      revisionNumber: 1,
      sourceKind: 'MANUAL',
      importRef: null,
      rowRef: null,
      actorRef,
      accountRef,
      versions: {
        parserVersion: MANUAL_ENTRY_PARSER_VERSION,
        mappingVersion: MANUAL_ENTRY_MAPPING_VERSION,
        normalizationVersion: MANUAL_ENTRY_NORMALIZATION_VERSION,
        fingerprintVersion: fingerprint.version,
      },
      // What the "source" said about direction is what the person said, in
      // the product's own account-holder frame — recorded as such, so a
      // manual entry is never mistaken for a bank-frame import.
      sourceDirection: sourceDirectionOf(amount),
      directionMapping: 'MANUAL_ENTRY',
      categoryAssignmentSource: 'NONE' satisfies CategoryAssignmentSource,
      createdAt: now,
    });

    try {
      await this.transactions.commit(principal, {
        transaction,
        revision,
        provenance,
        fingerprint,
        occurrenceOrdinal,
      });
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        return Result.err({
          kind: 'DUPLICATE_TRANSACTION',
          fingerprintVersion: error.fingerprintVersion,
          message:
            'this exact transaction is already recorded on this account; if it genuinely happened twice, record the second one with the next occurrence ordinal so both are distinguishable',
        });
      }
      return Result.err(toStoreFailure(error));
    }
    return Result.ok(transaction);
  }
}

function requireOrdinal(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidTransactionInputError(
      `'occurrenceOrdinal' must be a positive integer, got ${String(value)}`,
    );
  }
  return value;
}
