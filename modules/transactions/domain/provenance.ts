/**
 * `TransactionProvenance` — the traceable origin of every stored financial
 * fact.
 *
 * **The invariant: every stored financial fact is explainable back to manual
 * input or to one exact CSV row.** No transaction exists in this module
 * without a provenance record, and no provenance record is vague about which
 * of the two it is.
 *
 * "Explainable" here means mechanically, not narratively. Given a provenance
 * row you can name: which ingestion attempt (`importRef`), which row of it
 * (`rowRef`), who acted (`actorRef`), against which account (`accountRef`),
 * which parser read the bytes (`parserVersion`), which column mapping was
 * applied (`mappingVersion`), which normalisation rules ran (digits,
 * separators, accounting negatives — `normalizationVersion`), and which
 * fingerprint definition decided it was not a duplicate
 * (`fingerprintVersion`). Change any of those and the same source row can
 * legitimately produce a different transaction; without them recorded, a
 * later "why does this row now import differently?" is unanswerable.
 *
 * Provenance is tied to a REVISION, not only to the transaction. The values a
 * user corrected have a different origin from the values the statement
 * supplied, and a provenance model that only described the transaction would
 * describe the wrong thing the moment anyone edits anything.
 *
 * The source's own debit/credit semantics live here (`sourceDirection`,
 * `directionMapping`) rather than being dissolved into the stored sign — see
 * `sign-convention.ts` for why that separation is the point.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import type { AccountRef, ActorRef, ImportRef, RowRef, TransactionId } from './refs.js';
import type { DirectionMapping, SourceDirection } from './sign-convention.js';
import type { SourceKind } from './transaction.js';

/**
 * How a category came to be attached at the moment this provenance was
 * written. `NONE` is honest and common: most rows arrive uncategorised.
 *
 * This is a snapshot of the assignment source at commit time, kept alongside
 * the rest of the origin story; the live assignment chain (with supersession)
 * is `TransactionCategoryAssignment`.
 */
export const CATEGORY_ASSIGNMENT_SOURCES = ['NONE', 'USER', 'RULE'] as const;
export type CategoryAssignmentSource = (typeof CATEGORY_ASSIGNMENT_SOURCES)[number];

export class InvalidProvenanceError extends Error {
  override readonly name = 'InvalidProvenanceError';
}

/**
 * The versions of the deterministic machinery that produced a fact.
 *
 * All four are required for a CSV-sourced fact and all four are recorded for
 * a manual one too, where they name the manual path's own trivial versions.
 * A nullable version column would let "we do not know" hide as "not
 * applicable", and the difference between those two is the difference
 * between a traceable record and an untraceable one.
 */
export interface ProcessingVersions {
  /** Which parser turned bytes into rows. */
  readonly parserVersion: string;
  /** Which column mapping turned a row into typed fields. */
  readonly mappingVersion: string;
  /** Which normalisation ruleset ran (digits, separators, accounting negatives). */
  readonly normalizationVersion: string;
  /** Which fingerprint definition decided this was not a duplicate. */
  readonly fingerprintVersion: string;
}

export interface TransactionProvenance {
  readonly id: string;
  readonly transactionId: TransactionId;
  readonly tenantId: string;
  readonly userId: string;
  /** The revision whose values this record explains. */
  readonly revisionNumber: number;
  readonly sourceKind: SourceKind;
  /** The ingestion attempt; `null` for manual entry, where there was none. */
  readonly importRef: ImportRef | null;
  /** The exact source row; `null` for manual entry. */
  readonly rowRef: RowRef | null;
  readonly actorRef: ActorRef;
  readonly accountRef: AccountRef;
  readonly versions: ProcessingVersions;
  /** What the source itself said about direction, before any sign was chosen. */
  readonly sourceDirection: SourceDirection;
  /** How the stored sign was derived from that. */
  readonly directionMapping: DirectionMapping;
  readonly categoryAssignmentSource: CategoryAssignmentSource;
  readonly createdAt: Date;
}

/**
 * Builds and validates a provenance record. Enforces the two structural
 * rules that make the invariant real rather than aspirational:
 *
 *  - a CSV-sourced fact MUST name both its import and its exact row — a CSV
 *    provenance without a row reference explains nothing;
 *  - a MANUAL fact must name NEITHER — a manual entry that carries an import
 *    reference is claiming an origin it does not have, which is worse than
 *    carrying none.
 */
export function createProvenance(fields: TransactionProvenance): TransactionProvenance {
  const hasImport = fields.importRef !== null;
  const hasRow = fields.rowRef !== null;
  if (fields.sourceKind === 'CSV') {
    if (!hasImport || !hasRow) {
      throw new InvalidProvenanceError(
        'a CSV-sourced fact must name both its import and its exact source row; ' +
          'provenance that cannot point at the line it came from does not make the fact explainable',
      );
    }
  } else if (hasImport || hasRow) {
    throw new InvalidProvenanceError(
      'a manually entered fact must carry neither an import reference nor a row reference; ' +
        'claiming a source it does not have is worse than claiming none',
    );
  }
  for (const [name, value] of Object.entries(fields.versions)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new InvalidProvenanceError(
        `${name} must be a non-empty version string; an unrecorded version turns "why did this row import differently?" into an unanswerable question`,
      );
    }
  }
  if (!Number.isInteger(fields.revisionNumber) || fields.revisionNumber < 1) {
    throw new InvalidProvenanceError(
      `revisionNumber must be a positive integer, got ${String(fields.revisionNumber)}`,
    );
  }
  return Object.freeze({ ...fields, versions: Object.freeze({ ...fields.versions }) });
}

/** Everything a provenance record must answer, for the completeness assertion. */
export const PROVENANCE_REQUIRED_FACTS = [
  'sourceKind',
  'actorRef',
  'accountRef',
  'parserVersion',
  'mappingVersion',
  'normalizationVersion',
  'fingerprintVersion',
  'sourceDirection',
  'directionMapping',
  'categoryAssignmentSource',
] as const;

/**
 * True when a provenance record answers every question the invariant
 * requires, including the source-kind-conditional pair. Used by the
 * completeness test and by the commit path as a last structural check before
 * a fact becomes durable.
 */
export function isExplainable(provenance: TransactionProvenance): boolean {
  const versionsPresent = Object.values(provenance.versions).every(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  const originPresent =
    provenance.sourceKind === 'CSV'
      ? provenance.importRef !== null && provenance.rowRef !== null
      : provenance.importRef === null && provenance.rowRef === null;
  return (
    versionsPresent &&
    originPresent &&
    provenance.actorRef.trim() !== '' &&
    provenance.accountRef.accountId.trim() !== ''
  );
}
