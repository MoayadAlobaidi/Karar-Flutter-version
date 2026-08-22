/**
 * Response serialization for transactions, revisions, provenance and category
 * assignments — CLOSED field sets, picked by name.
 *
 * THE SIGN IS RESTATED IN WORDS, ON PURPOSE. `amount` is signed under the
 * canonical convention (money leaving the account is negative) and
 * `direction` says the same thing as `MONEY_OUT` / `MONEY_IN`. A client that
 * renders an arrow from the word cannot get it backwards by mis-reading a
 * minus sign, and one that computes from the number cannot disagree with the
 * word.
 *
 * WHAT PROVENANCE DELIBERATELY OMITS, and why each omission matters:
 *   * the DEDUP FINGERPRINT and the occurrence ordinal. The fingerprint is a
 *     per-subject keyed MAC over the identifying parts of a movement.
 *     Publishing it would let anyone holding a candidate transaction confirm
 *     whether this subject has it — a confirmation oracle over somebody's
 *     spending. Only the fingerprint's ALGORITHM VERSION is emitted, which
 *     says how the identity was computed and nothing about what it is.
 *   * the import reference and the source row reference. A row reference is a
 *     handle into staged statement content; existence is reported as a
 *     boolean instead.
 *   * the actor reference. It identifies a principal, and the caller is
 *     already the only principal who can read this.
 *
 * There is no confidence and no score on a category assignment, here or
 * anywhere: this platform assigns categories deterministically or a person
 * does, and a percentage would be a number nobody computed.
 */

import type {
  FinancialCategory,
  Transaction,
  TransactionCategoryAssignment,
  TransactionProvenance,
  TransactionRevision,
} from '@karar/transactions';

import {
  amountWire,
  dayWire,
  instantWire,
  nullableDayWire,
  nullableInstantWire,
  nullableRevealWire,
  revealWire,
  type AmountWire,
} from './wire.js';

/**
 * MANUAL and CSV are the two rails a transaction can arrive on, and both run.
 * The field is emitted anyway so a client never has to know which of the
 * thirteen named rails are executable.
 */
function availabilityOf(sourceKind: string): 'EXECUTABLE' | 'NOT_IMPLEMENTED' {
  return sourceKind === 'MANUAL' || sourceKind === 'CSV' ? 'EXECUTABLE' : 'NOT_IMPLEMENTED';
}

/** The canonical convention, restated in words. Zero counts as money in. */
export function directionOfAmount(minorUnits: bigint): 'MONEY_OUT' | 'MONEY_IN' {
  return minorUnits < 0n ? 'MONEY_OUT' : 'MONEY_IN';
}

export interface TransactionWire {
  readonly transactionId: string;
  readonly accountId: string;
  readonly amount: AmountWire;
  readonly direction: 'MONEY_OUT' | 'MONEY_IN';
  readonly bookingDate: string;
  readonly valueDate: string | null;
  readonly eventOccurredAt: string | null;
  readonly sourceTimezone: string | null;
  readonly merchant: string | null;
  readonly description: string;
  readonly note: string | null;
  readonly originalAmount: AmountWire | null;
  readonly sourceKind: string;
  readonly availability: 'EXECUTABLE' | 'NOT_IMPLEMENTED';
  readonly status: string;
  readonly createdAt: string;
  readonly version: number;
}

export function transactionWire(transaction: Transaction): TransactionWire {
  return {
    transactionId: transaction.id,
    accountId: transaction.accountRef.accountId,
    amount: amountWire(transaction.amount),
    direction: directionOfAmount(transaction.amount.minorUnits),
    bookingDate: dayWire(transaction.bookingDate),
    valueDate: nullableDayWire(transaction.valueDate),
    eventOccurredAt: nullableInstantWire(transaction.eventOccurredAt),
    sourceTimezone: transaction.sourceTimezone,
    merchant: nullableRevealWire(transaction.merchant),
    description: revealWire(transaction.description),
    note: nullableRevealWire(transaction.note),
    originalAmount:
      transaction.originalAmount === null ? null : amountWire(transaction.originalAmount.amount),
    sourceKind: transaction.sourceKind,
    availability: availabilityOf(transaction.sourceKind),
    status: transaction.status,
    createdAt: instantWire(transaction.createdAt),
    version: transaction.version,
  };
}

export interface RevisionWire {
  readonly revisionNumber: number;
  readonly attribution: string;
  readonly changedFields: readonly string[];
  readonly values: {
    readonly amount: AmountWire;
    readonly direction: 'MONEY_OUT' | 'MONEY_IN';
    readonly bookingDate: string;
    readonly valueDate: string | null;
    readonly eventOccurredAt: string | null;
    readonly sourceTimezone: string | null;
    readonly merchant: string | null;
    readonly description: string;
    readonly note: string | null;
    readonly status: string;
  };
  readonly recordedAt: string;
}

export function revisionWire(revision: TransactionRevision): RevisionWire {
  const values = revision.values;
  return {
    revisionNumber: revision.revisionNumber,
    attribution: revision.attribution,
    changedFields: [...revision.changedFields],
    values: {
      amount: amountWire(values.amount),
      direction: directionOfAmount(values.amount.minorUnits),
      bookingDate: dayWire(values.bookingDate),
      valueDate: nullableDayWire(values.valueDate),
      eventOccurredAt: nullableInstantWire(values.eventOccurredAt),
      sourceTimezone: values.sourceTimezone,
      merchant: nullableRevealWire(values.merchant),
      description: revealWire(values.description),
      note: nullableRevealWire(values.note),
      status: values.status,
    },
    recordedAt: instantWire(revision.recordedAt),
  };
}

export interface ProvenanceWire {
  readonly revisionNumber: number;
  readonly sourceKind: string;
  readonly availability: 'EXECUTABLE' | 'NOT_IMPLEMENTED';
  readonly accountId: string;
  readonly importedFromStatement: boolean;
  readonly versions: {
    readonly parserVersion: string;
    readonly mappingVersion: string;
    readonly normalizationVersion: string;
    readonly fingerprintVersion: string;
  };
  readonly sourceDirection: string;
  readonly directionMapping: string;
  readonly categoryAssignmentSource: string;
  readonly createdAt: string;
}

export function provenanceWire(provenance: TransactionProvenance): ProvenanceWire {
  return {
    revisionNumber: provenance.revisionNumber,
    sourceKind: provenance.sourceKind,
    availability: availabilityOf(provenance.sourceKind),
    accountId: provenance.accountRef.accountId,
    // EXISTENCE, not the handle: `importRef` and `rowRef` address staged
    // statement content, and a boolean answers the only question a subject
    // asks here.
    importedFromStatement: provenance.importRef !== null,
    versions: {
      parserVersion: provenance.versions.parserVersion,
      mappingVersion: provenance.versions.mappingVersion,
      normalizationVersion: provenance.versions.normalizationVersion,
      // The ALGORITHM version. Never a fingerprint.
      fingerprintVersion: provenance.versions.fingerprintVersion,
    },
    sourceDirection: provenance.sourceDirection,
    directionMapping: provenance.directionMapping,
    categoryAssignmentSource: provenance.categoryAssignmentSource,
    createdAt: instantWire(provenance.createdAt),
  };
}

export interface CategoryAssignmentWire {
  readonly assignmentId: string;
  readonly categoryCode: string;
  readonly assignmentSource: string;
  readonly ruleVersion: string | null;
  readonly status: string;
  readonly assignedAt: string;
}

export function categoryAssignmentWire(
  assignment: TransactionCategoryAssignment,
): CategoryAssignmentWire {
  return {
    assignmentId: assignment.id,
    categoryCode: assignment.categoryCode,
    assignmentSource: assignment.assignmentSource,
    ruleVersion: assignment.ruleVersion,
    status: assignment.status,
    assignedAt: instantWire(assignment.assignedAt),
  };
}

export interface CategoryWire {
  readonly code: string;
  readonly parentCode: string | null;
  readonly labels: { readonly en: string; readonly ar: string };
  readonly catalogueVersion: string;
  readonly assignable: boolean;
  readonly retiredAt: string | null;
}

/**
 * `assignable` is computed with the module's own predicate and emitted as a
 * boolean, so a client never has to derive "may I choose this?" from a
 * timestamp it might compare in the wrong timezone.
 */
export function categoryWire(category: FinancialCategory, assignable: boolean): CategoryWire {
  return {
    code: category.code,
    parentCode: category.parentCode,
    labels: { en: category.labels.en, ar: category.labels.ar },
    catalogueVersion: category.catalogueVersion,
    assignable,
    retiredAt: nullableInstantWire(category.retiredAt),
  };
}
