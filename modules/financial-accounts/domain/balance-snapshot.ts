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

import type { Money } from '@karar/shared-kernel';

import type { SourceKind } from './financial-account.js';
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
   * WHICH artefact reported it — an opaque in-module reference such as the
   * statement import that produced the figure. Required: a balance whose
   * origin is unrecorded cannot be explained to the person it belongs to.
   */
  readonly sourceReference: SourceReference;
  /** When this platform LEARNED it, which is not when it was true. */
  readonly capturedAt: Date;
  readonly createdAt: Date;
}

/** Longest source reference the schema admits (migration 0089). */
export const MAX_SOURCE_REFERENCE_LENGTH = 200;

export function isValidSourceReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed.length <= MAX_SOURCE_REFERENCE_LENGTH;
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
