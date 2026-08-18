/**
 * `TransactionRevision` — append-only history so a user correction never
 * silently overwrites an imported value.
 *
 * The failure this exists to prevent: a statement says 45.00, the user edits
 * it to 54.00 because they remember it differently, and the record now claims
 * the bank said 54.00. Nothing in the row remembers otherwise, so the
 * institution's own figure is gone and no reconciliation can ever detect the
 * divergence. That is a fabricated financial fact created by an ordinary UI
 * affordance.
 *
 * The rule here: **the imported value stays attributable forever.** Revision
 * 1 of every imported transaction records the values as committed from the
 * source, attributed to that source. Every later change appends a revision
 * attributed to `USER_INPUT`, carrying the previous value and the new one for
 * exactly the fields that moved. Reconstructing "what did the statement
 * actually say" is then reading the earliest revision, not an archaeology
 * exercise.
 *
 * Revisions are append-only by design and by schema (migration 0091: no
 * UPDATE, no DELETE grant, immutability trigger). Nothing edits a revision;
 * a mistaken correction is corrected by another correction.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import type { Money } from '@karar/shared-kernel';

import type { HsfField } from './hsf-field.js';
import { hsfFieldsEqual } from './hsf-field.js';
import type { ActorRef, TransactionId } from './refs.js';
import type { Transaction, TransactionStatus } from './transaction.js';

/**
 * Who or what produced this version of the values.
 *
 * `SOURCE_IMPORT` and `MANUAL_ENTRY` are the two ways revision 1 can arise —
 * a reviewed statement row, or a person typing the original. `USER_INPUT` is
 * every subsequent correction and is the attribution that must never be
 * confused with the first two: the whole point is that a corrected value
 * carries a different attribution from the value the source supplied.
 */
export const REVISION_ATTRIBUTIONS = ['SOURCE_IMPORT', 'MANUAL_ENTRY', 'USER_INPUT'] as const;
export type RevisionAttribution = (typeof REVISION_ATTRIBUTIONS)[number];

/** The correctable fields, as a revision records them. */
export const REVISABLE_FIELDS = [
  'amount',
  'bookingDate',
  'valueDate',
  'merchant',
  'description',
  'note',
  'status',
] as const;
export type RevisableField = (typeof REVISABLE_FIELDS)[number];

/**
 * The value snapshot a revision carries. HSF text stays wrapped, so a
 * revision cannot leak a merchant name through a log line either.
 */
export interface RevisionValues {
  readonly amount: Money;
  readonly bookingDate: Date;
  readonly valueDate: Date | null;
  readonly merchant: HsfField | null;
  readonly description: HsfField;
  readonly note: HsfField | null;
  readonly status: TransactionStatus;
}

export interface TransactionRevision {
  readonly id: string;
  readonly transactionId: TransactionId;
  readonly tenantId: string;
  readonly userId: string;
  /** 1 for the value as first committed; increments by exactly one thereafter. */
  readonly revisionNumber: number;
  readonly attribution: RevisionAttribution;
  /** The acting principal for a USER_INPUT revision; the importing principal otherwise. */
  readonly actorRef: ActorRef;
  /** The values AS OF this revision — a complete snapshot, not a patch. */
  readonly values: RevisionValues;
  /** Which fields differ from the previous revision. Empty on revision 1. */
  readonly changedFields: readonly RevisableField[];
  readonly recordedAt: Date;
}

export class InvalidRevisionError extends Error {
  override readonly name = 'InvalidRevisionError';
}

/** The current values of a transaction, as a revision snapshot. */
export function valuesOf(transaction: Transaction): RevisionValues {
  return Object.freeze({
    amount: transaction.amount,
    bookingDate: transaction.bookingDate,
    valueDate: transaction.valueDate,
    merchant: transaction.merchant,
    description: transaction.description,
    note: transaction.note,
    status: transaction.status,
  });
}

/**
 * Fields whose value differs between two snapshots, in declaration order so
 * the list is deterministic (a set that reorders would make two identical
 * corrections produce two different rows).
 */
export function changedFieldsBetween(
  before: RevisionValues,
  after: RevisionValues,
): readonly RevisableField[] {
  const changed: RevisableField[] = [];
  if (!before.amount.equals(after.amount)) changed.push('amount');
  if (before.bookingDate.getTime() !== after.bookingDate.getTime()) changed.push('bookingDate');
  if (instantOrNull(before.valueDate) !== instantOrNull(after.valueDate)) changed.push('valueDate');
  if (!hsfFieldsEqual(before.merchant, after.merchant)) changed.push('merchant');
  if (!hsfFieldsEqual(before.description, after.description)) changed.push('description');
  if (!hsfFieldsEqual(before.note, after.note)) changed.push('note');
  if (before.status !== after.status) changed.push('status');
  return Object.freeze(changed);
}

function instantOrNull(value: Date | null): number | null {
  return value === null ? null : value.getTime();
}

/**
 * The first revision: the values exactly as committed, attributed to where
 * they came from. `USER_INPUT` is refused here — revision 1 is by definition
 * the original, and letting a correction masquerade as one would defeat the
 * whole mechanism.
 */
export function originalRevision(fields: {
  readonly id: string;
  readonly transaction: Transaction;
  readonly attribution: 'SOURCE_IMPORT' | 'MANUAL_ENTRY';
  readonly actorRef: ActorRef;
  readonly recordedAt: Date;
}): TransactionRevision {
  return Object.freeze({
    id: fields.id,
    transactionId: fields.transaction.id,
    tenantId: fields.transaction.tenantId,
    userId: fields.transaction.userId,
    revisionNumber: 1,
    attribution: fields.attribution,
    actorRef: fields.actorRef,
    values: valuesOf(fields.transaction),
    changedFields: Object.freeze([] as RevisableField[]),
    recordedAt: fields.recordedAt,
  });
}

/**
 * A correction revision. Always `USER_INPUT`: a correction is by definition
 * what a person did to a value, and attributing it to the source would be the
 * exact lie this module refuses.
 *
 * Refuses a no-op correction. A revision that changed nothing is noise in the
 * history, and a history full of noise is a history nobody reads.
 */
export function correctionRevision(fields: {
  readonly id: string;
  readonly before: Transaction;
  readonly after: Transaction;
  readonly actorRef: ActorRef;
  readonly recordedAt: Date;
}): TransactionRevision {
  if (fields.after.version !== fields.before.version + 1) {
    throw new InvalidRevisionError(
      `a correction revision follows exactly one version (${fields.before.version} -> ${fields.after.version} is not a single step)`,
    );
  }
  const beforeValues = valuesOf(fields.before);
  const afterValues = valuesOf(fields.after);
  const changedFields = changedFieldsBetween(beforeValues, afterValues);
  if (changedFields.length === 0) {
    throw new InvalidRevisionError(
      'a correction revision must change at least one field; recording a no-op would put noise into the history that makes the real corrections harder to find',
    );
  }
  return Object.freeze({
    id: fields.id,
    transactionId: fields.after.id,
    tenantId: fields.after.tenantId,
    userId: fields.after.userId,
    revisionNumber: fields.after.version,
    attribution: 'USER_INPUT' as const,
    actorRef: fields.actorRef,
    values: afterValues,
    changedFields,
    recordedAt: fields.recordedAt,
  });
}

/**
 * The values as the SOURCE supplied them, from a revision history — the
 * question "what did the statement actually say" answered directly.
 *
 * Returns `null` for a history whose first revision is a manual entry: there
 * was no source, and inventing one would be worse than saying so.
 */
export function sourceSuppliedValues(
  history: readonly TransactionRevision[],
): RevisionValues | null {
  let earliest: TransactionRevision | null = null;
  for (const revision of history) {
    if (earliest === null || revision.revisionNumber < earliest.revisionNumber) {
      earliest = revision;
    }
  }
  if (earliest === null || earliest.attribution !== 'SOURCE_IMPORT') return null;
  return earliest.values;
}

/**
 * True when at least one field of the record has been corrected away from
 * what the source supplied — the flag a reconciliation or an export needs in
 * order to say "this figure is the user's, not the bank's".
 */
export function divergesFromSource(history: readonly TransactionRevision[]): boolean {
  const original = sourceSuppliedValues(history);
  if (original === null) return false;
  return history.some(
    (revision) => revision.attribution === 'USER_INPUT' && revision.changedFields.length > 0,
  );
}
