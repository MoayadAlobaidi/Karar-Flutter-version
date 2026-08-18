/**
 * RecordReportedBalance — a person records what a source said their balance
 * was, at a stated moment.
 *
 * **The figure is a fact someone else asserted, never one this platform
 * computed.** Nothing on this path sums transactions, nets anything, or
 * projects a balance forward; a derived running balance is a different
 * concept and will arrive under its own name with its own honest label
 * (`domain/balance-snapshot.ts`). `capturedAt` is read from the clock rather
 * than taken from the caller, because when this platform LEARNED a figure is
 * a fact about this platform and not something a caller may assert; `asOf` is
 * the caller's, because when the balance was true is the source's claim.
 *
 * **Why this use case exists at all.** `BalanceSnapshotRepository.append` was
 * reachable with no policy in front of it — a durable write into a table
 * classified `HIGHLY_SENSITIVE_FINANCIAL` whose declared retention is
 * unresolved. A repository cannot hold that gate: it is infrastructure, and
 * policy decided in an adapter is policy nobody can find. So the write path
 * gets the use case it was missing, and the gate lives where every other
 * decision in this module lives.
 *
 * The retention gate runs FIRST, before the account is read, before the
 * domain builds anything, and before any statement reaches the database — the
 * same ordering and the same reasoning as `CreateManualAccount`. A refusal
 * writes nothing.
 *
 * `sourceKind` is fixed to `MANUAL` here and is not an input: how a record
 * came to exist is a fact about its making, not a claim the caller gets to
 * assert. A statement import records its own balances through its own path,
 * with `CSV` and the import's identifier.
 *
 * `balanceKind` is the opposite case and IS a required input: which balance a
 * source quoted is the SOURCE's claim, not this platform's, so it can neither
 * be fixed here nor defaulted. Recording an AVAILABLE figure creates one
 * AVAILABLE snapshot and nothing else — no BOOKED row is derived alongside
 * it, and no existing kind is rewritten.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock, Money } from '@karar/shared-kernel';

import {
  createBalanceSnapshot,
  type BalanceKind,
  type BalanceSnapshot,
} from '../../domain/balance-snapshot.js';
import type { BalanceSnapshotId, FinancialAccountId } from '../../domain/refs.js';
import {
  ACCOUNT_NOT_FOUND,
  retentionUnresolved,
  storeFailure,
  type RecordReportedBalanceError,
} from '../errors.js';
import type { BalanceSnapshotRepository } from '../ports/balance-snapshot-repository.js';
import {
  permitsDurableWrite,
  type FinancialAccountRetentionDecisionPort,
} from '../ports/financial-account-retention-decision.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import type { IdSource } from '../ports/id-source.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/** Deliberately carries no owner identifier — the principal is context. */
export interface RecordReportedBalanceInput {
  readonly accountId: FinancialAccountId;
  /** Exact minor units plus currency; signed, because a card owes money. */
  readonly amount: Money;
  /** When the balance was TRUE, per the source. */
  readonly asOf: Date;
  /**
   * WHICH balance the source quoted. REQUIRED, and deliberately not optional:
   * there is no default anywhere on this path, because a default would be
   * this code guessing on the source's behalf and recording the guess as
   * though the source had said it. A caller that does not know which balance
   * it was given cannot record one.
   */
  readonly balanceKind: BalanceKind;
  /** The artefact that reported it, by UUID. Never narrative. */
  readonly sourceReference: string;
}

export class RecordReportedBalance {
  constructor(
    private readonly accounts: FinancialAccountRepository,
    private readonly snapshots: BalanceSnapshotRepository,
    private readonly retention: FinancialAccountRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RecordReportedBalanceInput,
    actor: AccountsPrincipal,
  ): Promise<Result<BalanceSnapshot, RecordReportedBalanceError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let decision;
    try {
      decision = await this.retention.decideFor(
        principal.value,
        'financial_account_balance_snapshots',
      );
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('financial_account_balance_snapshots', decision));
    }

    // Visibility answered from the ACCOUNT, so a snapshot can never be
    // attached to a row the caller cannot see — and so the currency the
    // domain checks against is the account's real one.
    let account;
    try {
      account = await this.accounts.findOwnById(principal.value, input.accountId);
    } catch (error) {
      return Result.err(storeFailure('own-account read', error));
    }
    if (account === null) return Result.err(ACCOUNT_NOT_FOUND);

    const now = this.clock.now();
    const built = createBalanceSnapshot({
      id: this.ids.nextId() as BalanceSnapshotId,
      account,
      amount: input.amount,
      asOf: input.asOf,
      sourceKind: 'MANUAL',
      // Passed straight through. No `??`, no fallback, no inference from
      // another kind already on file for this account.
      balanceKind: input.balanceKind,
      sourceReference: input.sourceReference,
      capturedAt: now,
      createdAt: now,
    });
    if (!built.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: built.error,
        message: built.error.message,
      });
    }

    try {
      return Result.ok(await this.snapshots.append(principal.value, built.value));
    } catch (error) {
      return Result.err(storeFailure('reported-balance append', error));
    }
  }
}
