/**
 * A balance snapshot: what a SOURCE reported an account's balance to be, at a
 * stated moment.
 *
 * ## The one rule this file exists to keep
 *
 * **A balance here is a fact someone else asserted, never a figure this
 * platform computed.** It is the number printed on a statement, or the number
 * the user typed. It is not the sum of the transactions this platform happens
 * to hold. Summing transactions produces a figure that looks authoritative
 * and is wrong the moment one transaction is missing, misdated, or
 * duplicated — and the person reading it cannot tell the difference. So a
 * derived running balance is a DIFFERENT concept: it must arrive with its own
 * name, its own field, and its own honest label rather than being written
 * into this one. Nothing in this module computes a balance, and a test
 * asserts that this module exports no function that does.
 *
 * ## Exactness
 *
 * `amount` is a shared-kernel `Money`: exact integer minor units plus the
 * currency whose ISO 4217 exponent scales them (ADR-0006). No float exists on
 * this path — 1000 minor units is ten QAR or one KWD, and the exponent is
 * never assumed. Amounts are deliberately signable: a credit card reports a
 * negative balance, and forcing it positive would make the record lie about
 * debt.
 */

import { Result } from '@karar/shared-kernel';
import type { Money } from '@karar/shared-kernel';

import type { FinancialAccountRuleViolation } from './errors.js';
import type {
  ConstructibleSourceKind,
  FinancialAccount,
  SourceKind,
} from './financial-account.js';
import type {
  BalanceSnapshotId,
  FinancialAccountId,
  SourceReference,
} from './refs.js';
import type { TenantId, UserId } from '@karar/shared-kernel';

export interface BalanceSnapshot {
  readonly id: BalanceSnapshotId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly accountId: FinancialAccountId;
  /** Exact minor units in the account's currency. Never a float, never derived. */
  readonly amount: Money;
  /** When the balance was TRUE, per the source. */
  readonly asOf: Date;
  /** Who reported it. `EXTERNAL_PROVIDER` is unreachable in Phase 5. */
  readonly sourceKind: SourceKind;
  /**
   * WHICH artefact reported it — the identifier of the statement import or
   * the manual entry that produced the figure. Required: a balance whose
   * origin is unrecorded cannot be explained to the person it belongs to.
   *
   * A UUID, and nothing else. `sourceKind` already says what KIND of artefact
   * it is, so this field only ever has to name one; see
   * `isValidSourceReference`.
   */
  readonly sourceReference: SourceReference;
  /** When this platform LEARNED it, which is not when it was true. */
  readonly capturedAt: Date;
  readonly createdAt: Date;
}

/**
 * The shape of a source reference: a UUID, in the canonical textual form
 * PostgreSQL's `uuid` type accepts.
 *
 * **Why a UUID and not bounded free text.** This column used to be 200
 * characters of arbitrary text on a table classified
 * `HIGHLY_SENSITIVE_FINANCIAL`. Nothing stopped a caller putting a statement
 * line, an account number, or an explanatory sentence in a field whose stated
 * job is to NAME an artefact — and a field that can hold narrative on an HSF
 * table either has to be encrypted or has to stop being able to hold
 * narrative. Migration 0089's header records the choice and the reason it was
 * taken this way round: the only legitimate content was always an identifier,
 * the identifier has to stay comparable and joinable to explain a figure to
 * the person it belongs to, and encrypting a value whose sole operation is
 * equality would have hidden the narrative rather than made it
 * unrepresentable. A `uuid` column cannot hold a sentence at all.
 */
const SOURCE_REFERENCE_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isValidSourceReference(value: string): boolean {
  return SOURCE_REFERENCE_SHAPE.test(value.trim());
}

/** Everything the snapshot factory needs. Time and identity are arguments. */
export interface NewBalanceSnapshot {
  readonly id: BalanceSnapshotId;
  /** The account the figure is about, already read under the principal. */
  readonly account: FinancialAccount;
  readonly amount: Money;
  readonly asOf: Date;
  /** `EXTERNAL_PROVIDER` is not accepted — it is unreachable by type. */
  readonly sourceKind: ConstructibleSourceKind;
  readonly sourceReference: string;
  readonly capturedAt: Date;
  readonly createdAt: Date;
}

/**
 * Build a reported balance, or say exactly why not.
 *
 * Two rules, and both of them are things the database also refuses — stated
 * here so a caller gets an answer in its own vocabulary rather than a driver
 * error. The tenant, user and account are taken from the ACCOUNT rather than
 * from the input: a snapshot is about an account that was already read under
 * the acting principal, so there is no second place for an owner to be named
 * and no way for the two to disagree.
 */
export function createBalanceSnapshot(
  input: NewBalanceSnapshot,
): Result<BalanceSnapshot, FinancialAccountRuleViolation> {
  if (!isValidSourceReference(input.sourceReference)) {
    return Result.err({
      kind: 'invalid_source_reference',
      message:
        'a reported balance names the artefact that reported it by identifier — a UUID — and by ' +
        'nothing else; the column is a uuid precisely so a statement line, an account number, or ' +
        'an explanation cannot be written into a field on a HIGHLY_SENSITIVE_FINANCIAL table',
    });
  }
  if (input.amount.currency.code !== input.account.currency.code) {
    return Result.err({
      kind: 'snapshot_currency_mismatch',
      accountId: input.account.id,
      message:
        `the reported balance is in ${input.amount.currency.code} but the account holds ` +
        `${input.account.currency.code} — minor units are scaled by their currency's exponent, so a ` +
        'mismatched pair is not a conversion, it is a figure that means something nobody stated',
    });
  }
  return Result.ok(
    Object.freeze({
      id: input.id,
      tenantId: input.account.tenantId,
      userId: input.account.userId,
      accountId: input.account.id,
      amount: input.amount,
      asOf: input.asOf,
      sourceKind: input.sourceKind as SourceKind,
      sourceReference: input.sourceReference.trim() as SourceReference,
      capturedAt: input.capturedAt,
      createdAt: input.createdAt,
    }),
  );
}

/**
 * Newest-first ordering by the instant the balance was TRUE, with the capture
 * instant breaking ties — two sources reporting the same `asOf` are ordered
 * by which one this platform learned later, because that is the one whose
 * information is more recent. Pure and total: no clock is read.
 */
export function byMostRecentlyTrue(left: BalanceSnapshot, right: BalanceSnapshot): number {
  const byAsOf = right.asOf.getTime() - left.asOf.getTime();
  if (byAsOf !== 0) return byAsOf;
  return right.capturedAt.getTime() - left.capturedAt.getTime();
}

/**
 * The snapshot a source most recently said was true, or null when there is
 * none. This SELECTS a reported fact; it does not compute one — the
 * distinction is the whole point of this file.
 */
export function latestReported(
  snapshots: readonly BalanceSnapshot[],
): BalanceSnapshot | null {
  if (snapshots.length === 0) return null;
  return [...snapshots].sort(byMostRecentlyTrue)[0] ?? null;
}
