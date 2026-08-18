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
 *
 * ## Two gates, both before anything is derived and long before anything is
 * ## written
 *
 * 1. **Retention.** MODULE.md declares the retention of every table here as
 *    an unresolved legal decision and says ingestion fails closed until a
 *    decision exists. `TransactionRetentionDecisionPort` is what makes that
 *    true rather than documented.
 * 2. **The account.** `FinancialAccountAccessPort` resolves an account
 *    **visible to this principal** and reports its currency, lifecycle state
 *    and provider claim. Without it this use case accepted any UUID: another
 *    user's account, another tenant's, one nobody minted, or one denominated
 *    in a different currency. RLS cannot catch that — the row carries the
 *    caller's own tenant and user, so the policy is satisfied; what is wrong
 *    is the account the row points at.
 *
 * Retention is asked first, and the order matters. When retention is
 * unresolved every account id gets the same refusal, so an unresolved legal
 * decision cannot be turned into a probe against another context's data. The
 * reverse order would answer "that account is not yours" to a caller the
 * platform is not allowed to write anything for at all.
 *
 * Both gates run before the fingerprint is computed, before any narrative is
 * encrypted, and before the repository is touched. Refusing after encryption
 * would already have produced ciphertext of the subject's narrative; refusing
 * after a write would leave the record the gate exists to prevent.
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
  type AccountCurrencyMismatch,
  type AccountNotWritable,
  type DuplicateTransaction,
  type NotFound,
  type OccurrenceOrdinalNotNext,
  type PrincipalContextMissing,
  type RetentionUndecided,
  type StoreFailure,
} from '../errors.js';
import type { DedupFingerprintPort } from '../ports/dedup-fingerprint.js';
import {
  isWritableLifecycleState,
  type AccountAccessSummary,
  type FinancialAccountAccessPort,
} from '../ports/financial-account-access.js';
import type { IdSource } from '../ports/id-source.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type {
  RetentionPendingLegalReview,
  RetentionUnavailable,
  TransactionRetentionDecision,
  TransactionRetentionDecisionPort,
} from '../ports/transaction-retention-decision.js';
import {
  DuplicateTransactionError,
  OccurrenceOrdinalNotNextError,
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
  /**
   * Which occurrence of this content the entry claims to be. 1 for the first;
   * 2 for a genuine identical repeat. Verified against what is recorded, not
   * trusted — only the next unused ordinal is claimable, so a high number is
   * not a way past duplicate review.
   */
  readonly occurrenceOrdinal?: number;
}

export type CreateManualTransactionError =
  | PrincipalContextMissing
  | RetentionUndecided
  | NotFound
  | AccountNotWritable
  | AccountCurrencyMismatch
  | OccurrenceOrdinalNotNext
  | DuplicateTransaction
  | StoreFailure;

export class CreateManualTransaction {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly fingerprints: DedupFingerprintPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
    private readonly retention: TransactionRetentionDecisionPort,
    private readonly accounts: FinancialAccountAccessPort,
  ) {}

  async execute(
    input: CreateManualTransactionInput,
  ): Promise<Result<Transaction, CreateManualTransactionError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());

    // GATE 1 — retention. Nothing is derived, nothing is encrypted, nothing
    // is written until somebody has decided how long this record may be kept.
    let decision: TransactionRetentionDecision;
    try {
      decision = await this.retention.decide(principal);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (decision.state !== 'DECIDED') {
      return Result.err(retentionUndecided(decision));
    }

    const accountRef = AccountRef.of(input.accountId);
    const amount = signedAmountFor(input.magnitude, input.direction);

    // GATE 2 — the account. Resolving through the port is the ONLY thing that
    // ties this record to an account that exists, is this principal's, and
    // can hold this currency.
    let account: AccountAccessSummary | null;
    try {
      account = await this.accounts.resolveOwnAccount(principal, accountRef);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (account === null) {
      // Absent, another user's, another tenant's, never minted — one answer,
      // deliberately. See application/errors.ts: a distinguishable denial is
      // an existence oracle over another subject's account inventory.
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'financial_account',
        id: accountRef.accountId,
      });
    }
    const refusal = refuseUnwritableAccount(account);
    if (refusal !== null) return Result.err(refusal);
    if (account.currencyCode !== amount.currency.code) {
      return Result.err({
        kind: 'ACCOUNT_CURRENCY_MISMATCH',
        accountId: accountRef.accountId,
        accountCurrency: account.currencyCode,
        transactionCurrency: amount.currency.code,
        message:
          `this account is held in ${account.currencyCode} and the amount is in ` +
          `${amount.currency.code}; the amount is not converted, because this platform stores no ` +
          'exchange rate it did not observe and a converted figure would be a number nobody can defend',
      });
    }

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
    // description travels as written and the version records that. The
    // occurrence ordinal is NOT part of it: the digest states what the
    // content is, and how many times that content occurred is the separate
    // column travelling beside it.
    const fingerprint = await this.fingerprints.fingerprint(principal, {
      accountRef,
      bookingDate: transaction.bookingDate,
      amountMinorUnits: amount.minorUnits,
      currencyCode: amount.currency.code,
      normalizedNarrative: description.reveal(),
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
            'this exact transaction is already recorded on this account as occurrence ' +
            `${occurrenceOrdinal}; if it genuinely happened again, record the next occurrence so both are distinguishable`,
        });
      }
      if (error instanceof OccurrenceOrdinalNotNextError) {
        return Result.err({
          kind: 'OCCURRENCE_ORDINAL_NOT_NEXT',
          requestedOrdinal: error.requestedOrdinal,
          nextOrdinal: error.nextOrdinal,
          message:
            `occurrence ${error.requestedOrdinal} cannot be claimed for this transaction: the next ` +
            `occurrence of this content is ${error.nextOrdinal}. An ordinal asserts that identical ` +
            'content genuinely happened again, so it can only ever be the next one — otherwise the ' +
            'same statement row could be committed twice under two different numbers with no review',
        });
      }
      return Result.err(toStoreFailure(error));
    }
    return Result.ok(transaction);
  }
}

/**
 * The refusal for an account the principal owns but may not write to.
 *
 * Archived and closed are separate reasons rather than one "not active"
 * because they mean different things to a person: an archived account is one
 * they put away and can bring back, a closed one is finished. Recording new
 * movements into either would produce records the subject believes they
 * stopped keeping.
 */
function refuseUnwritableAccount(account: AccountAccessSummary): AccountNotWritable | null {
  if (account.providerConnected) {
    return {
      kind: 'ACCOUNT_NOT_WRITABLE',
      accountId: account.accountRef.accountId,
      reason: 'PROVIDER_CONNECTED',
      message:
        'this account reports an external provider connection. No provider connector exists in this ' +
        'phase, so that claim could not have been created legitimately; and a hand-typed record filed ' +
        'into a stream the subject believes came from their bank is a fabricated financial fact',
    };
  }
  if (isWritableLifecycleState(account.lifecycleState)) return null;
  const reason =
    account.lifecycleState === 'ARCHIVED'
      ? 'ARCHIVED'
      : account.lifecycleState === 'CLOSED'
        ? 'CLOSED'
        : 'UNRECOGNIZED_STATE';
  return {
    kind: 'ACCOUNT_NOT_WRITABLE',
    accountId: account.accountRef.accountId,
    reason,
    message:
      reason === 'UNRECOGNIZED_STATE'
        ? 'this account is in a state this module does not recognise, so it is not writable — an ' +
          'unmapped state is not permission to record money against an account'
        : `this account is ${account.lifecycleState.toLowerCase()}; recording new movements into it ` +
          'would produce records the account holder believes they stopped keeping',
  };
}

/** Turns a non-DECIDED retention answer into the typed refusal. */
function retentionUndecided(
  decision: RetentionPendingLegalReview | RetentionUnavailable,
): RetentionUndecided {
  const detail =
    decision.state === 'PENDING_LEGAL_REVIEW' ? decision.openQuestion : decision.reason;
  return {
    kind: 'RETENTION_UNDECIDED',
    state: decision.state,
    message:
      'no retention decision governs transaction records here, so nothing durable may be written: ' +
      `${decision.state} — ${detail}. How long a HIGHLY_SENSITIVE_FINANCIAL record may be kept is a ` +
      'legal decision, and writing the record first while waiting for it is the outcome the gate exists to prevent',
  };
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
