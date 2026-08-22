/**
 * `ImportedRecordCommitPort` — the canonical records ONE reviewed statement
 * import produces, written on a database transaction the CALLER already
 * opened.
 *
 * ## Why this port exists
 *
 * `modules/statement-imports` turns a person's uploaded statement into
 * financial records. Those records are rows in `public.transactions`,
 * `public.transaction_revisions`, `public.transaction_provenance` and
 * `public.transaction_category_assignments` — four tables THIS module owns,
 * behind this module's RLS policies, its encryption and its cascade. So the
 * ingestion module declares what it needs, this module writes it, and
 * ingestion never writes a table it does not own.
 *
 * The obvious seam — `TransactionRepository.commit`, once per row — cannot be
 * used, and that is the whole reason this port has an unusual shape. `commit`
 * opens its OWN transaction per record, and a statement commit must land as
 * ONE unit with the import's state moves and its row links, or the two
 * failure modes are both silent and both terrible: records with no row links
 * means a retry writes them a second time, and row links with no records
 * means an import that reports success over financial records that do not
 * exist.
 *
 * ## So the transaction itself is the parameter
 *
 * The caller opens exactly one unit of work, binds its principal into it, and
 * hands the open handle here. Everything this port writes joins that unit:
 * one commit, one rollback, no subset. That is the same reasoning the
 * transactional outbox uses (ADR-0012) — a write that must not be able to
 * land without another write shares its transaction rather than trusting a
 * sequence of calls.
 *
 * `RecordWriteUnit` is opaque on purpose. The application layer holds a
 * handle it cannot use; the adapter that created it, and the adapter that
 * joins it, know what it is. That keeps the ORM out of this layer
 * (architecture test 4) without pretending the transaction is not there.
 *
 * ## What the caller must have done before it calls
 *
 * The unit must already carry the principal context, because the RLS policies
 * on all four tables decide what may be written and they read the
 * transaction-local GUCs. The `principal` below is passed as well and lands in
 * the `tenant_id` / `user_id` columns — defence in depth that catches an
 * honest mistake early. RLS is the boundary.
 *
 * Narrative arrives ALREADY ENCRYPTED, under this module's own key and
 * domain-separation label (`CanonicalNarrativeEncryptorPort` on the ingestion
 * side binds `HsfFieldEncryptionPort` from this module's public API for
 * exactly that). Encrypting here would mean calling a key provider while
 * holding somebody else's transaction open, which is how a connection pool
 * starves under load — and this is the widest transaction the ingestion
 * module opens.
 *
 * ## Refusals are this module's typed errors, never a driver message
 *
 * The duplicate rule and the occurrence-ordinal rule are enforced by
 * migration 0090's `transactions_dedup_key` and `transactions_occurrence_guard`
 * (SQLSTATE `KAR02` and `KAR01`). An implementation maps them to
 * `DuplicateTransactionError` and `OccurrenceOrdinalNotNextError` from
 * `transaction-repository.ts` — the SAME typed refusals the single-record
 * path raises — so a caller writes one mapping rather than learning this
 * module's SQLSTATEs. No driver text crosses this seam.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { CategoryCode } from '../../domain/category-catalogue.js';
import type { ProcessingVersions } from '../../domain/provenance.js';
import type { AccountRef, ActorRef, ImportRef, RowRef, TransactionId } from '../../domain/refs.js';
import type { DirectionMapping, SourceDirection } from '../../domain/sign-convention.js';
import type { TransactionsPrincipal } from './principal-context.js';

/**
 * An opaque handle to a database transaction the caller already opened.
 *
 * Restated here rather than imported, because the module that opens the
 * transaction depends on this one and this one must not depend back — a cycle
 * would be the boundary this port exists to respect, wearing a hat. There is
 * no shape to drift: it is a wrapper around `unknown`.
 */
export interface RecordWriteUnit {
  readonly unit: unknown;
}

/**
 * The narrative columns of one row, already ciphertext.
 *
 * **No note.** `public.transactions` has one and an imported statement line
 * never does: a note is a thing a PERSON writes on a transaction, and an
 * import that could write one would be inventing it. The columns are absent
 * from this type rather than nullable in it, so an import cannot supply one
 * at all; the implementation writes them NULL.
 */
export interface ImportedNarrativeColumns {
  readonly hsfAlgorithm: string;
  readonly hsfKeyVersion: string;
  readonly descriptionCiphertext: Uint8Array;
  readonly descriptionNonce: Uint8Array;
  readonly descriptionAuthTag: Uint8Array;
  readonly merchantCiphertext: Uint8Array | null;
  readonly merchantNonce: Uint8Array | null;
  readonly merchantAuthTag: Uint8Array | null;
}

/**
 * One imported line, as the four rows it becomes.
 *
 * Every identifier is minted by the caller BEFORE the transaction opens, so a
 * retry can compare against what it asked for rather than against what it
 * hopes was written.
 */
export interface ImportedRecordCommit {
  readonly transactionId: TransactionId;
  readonly revisionId: string;
  readonly provenanceId: string;
  readonly categoryAssignmentId: string;
  readonly accountRef: AccountRef;
  readonly bookingDate: CalendarDay;
  readonly valueDate: CalendarDay | null;
  /** Only when the source supplied a real instant. Never derived from the day. */
  readonly eventOccurredAt: Date | null;
  /** Only when the source stated a zone. Never this platform's. */
  readonly sourceTimezone: string | null;
  /** Exact minor units, already signed under the canonical convention. */
  readonly amountMinorUnits: bigint;
  readonly currencyCode: string;
  /** The transaction row's narrative. */
  readonly narrative: ImportedNarrativeColumns;
  /**
   * The revision row's narrative — the same text, a different ciphertext.
   *
   * Two encryptions rather than one reused blob, because the AEAD context
   * binds the ROW id: a revision's ciphertext must not authenticate against a
   * transaction's row, or narrative could be transplanted between them.
   */
  readonly revisionNarrative: ImportedNarrativeColumns;
  readonly sourceDirection: SourceDirection;
  readonly directionMapping: DirectionMapping;
  /** CONTENT identity. Says nothing about occurrence — that is the ordinal. */
  readonly dedupFingerprint: string;
  readonly fingerprintVersion: string;
  /**
   * Which occurrence of that content this record is. 1 for the first.
   *
   * Verified by the database, not trusted: `transactions_occurrence_guard`
   * refuses anything but the next unused ordinal for this content identity,
   * so a caller cannot skip duplicate review by naming a high number.
   */
  readonly occurrenceOrdinal: number;
  /** The EXACT source line, so "explain this number" stays answerable. */
  readonly rowRef: RowRef;
  /**
   * A category an exact, reviewed rule assigned — or `null`, which is the
   * ordinary answer and writes no assignment row at all. An absent category
   * is honest; a guessed one applied four hundred times in one action is not.
   */
  readonly categoryCode: CategoryCode | null;
  readonly categoryRuleVersion: string | null;
}

/** Everything one statement commit writes into this module's tables. */
export interface ImportedRecordBatch {
  readonly records: readonly ImportedRecordCommit[];
  /** The ingestion attempt these records came from, recorded on provenance. */
  readonly importRef: ImportRef;
  /** The acting subject, recorded on every revision, provenance and assignment. */
  readonly actorRef: ActorRef;
  /** The four versions that read the file, recorded on every provenance row. */
  readonly versions: ProcessingVersions;
  /** One instant for the whole batch, so the records agree with each other. */
  readonly committedAt: Date;
}

export interface ImportedRecordCommitPort {
  /**
   * Writes every record's transaction, revision 1, provenance and — where a
   * rule applied — its category assignment, on the caller's open unit.
   *
   * Adds no transaction of its own and commits nothing: the caller's unit
   * decides whether any of this survives. A throw aborts that unit, which is
   * how "everything, or nothing" is kept across the two modules.
   *
   * Throws `DuplicateTransactionError` when this exact occurrence of this
   * exact content is already recorded for this principal on this account, and
   * `OccurrenceOrdinalNotNextError` when the ordinal is not the next unused
   * one for that content identity.
   */
  writeImportedRecords(
    unit: RecordWriteUnit,
    principal: TransactionsPrincipal,
    batch: ImportedRecordBatch,
  ): Promise<void>;
}
