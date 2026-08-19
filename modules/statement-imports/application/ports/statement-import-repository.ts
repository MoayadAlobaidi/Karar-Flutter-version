/**
 * Persistence ports for the import aggregate — declared inward (architecture
 * test 5), named by no implementation.
 *
 * An import, its stored source, its staged rows and its row errors are ONE
 * aggregate. They are not four repositories a caller can use out of step:
 * `stageParse` writes the rows, the errors and the resulting import state
 * together, because a set of rows with no import state is a parse nobody can
 * find and an import state with no rows is a review screen with nothing on it.
 *
 * Every method takes the acting principal, and the implementation runs each
 * statement inside a principal-context transaction (transaction-local
 * `app.tenant_id` / `app.user_id` GUCs bound from the caller's own record,
 * never from client input — tenancy.md §2). Without that context the RLS
 * policies match nothing: reads return empty, writes affect zero rows.
 *
 * The principal is a parameter HERE, at the port, because the repository has
 * to bind it into the database session. It is never a parameter on a use-case
 * INPUT — see `principal.ts` for why that distinction is the whole isolation
 * argument.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { StoredSourceDescriptor } from '../../domain/encrypted-source.js';
import type { HsfField } from '../../domain/hsf-field.js';
import type { RowError } from '../../domain/reason-codes.js';
import type { DirectionMapping, SourceDirection } from '../../domain/statement-row.js';
import type { SourceBalanceKind } from '../../domain/column-mapping.js';
import type { StatementImport } from '../../domain/statement-import.js';
import type {
  CommittedTransactionRef,
  StatementImportId,
  StatementImportRowId,
} from '../../domain/refs.js';
import type { ImportsPrincipal } from '../principal.js';

/** What a staged row is, once mapped, normalised and fingerprinted. */
export const ROW_STATES = [
  'VALID',
  'INVALID',
  'EXACT_DUPLICATE',
  'PROBABLE_DUPLICATE',
  'COMMITTED',
  'SKIPPED',
] as const;
export type RowState = (typeof ROW_STATES)[number];

/** One staged row, as the repository writes and reads it. */
export interface StagedRow {
  readonly id: StatementImportRowId;
  readonly rowNumber: number;
  readonly rowState: RowState;
  readonly bookingDate: CalendarDay | null;
  readonly valueDate: CalendarDay | null;
  readonly eventOccurredAt: Date | null;
  readonly sourceTimezone: string | null;
  /** Exact minor units. `null` on an INVALID row — never zero. */
  readonly amountMinorUnits: bigint | null;
  readonly currencyCode: string | null;
  readonly sourceDirection: SourceDirection | null;
  readonly directionMapping: DirectionMapping | null;
  readonly description: HsfField | null;
  readonly merchant: HsfField | null;
  readonly sourceReference: HsfField | null;
  readonly instrumentMask: HsfField | null;
  readonly sourceBalanceMinorUnits: bigint | null;
  readonly sourceBalanceKind: SourceBalanceKind | null;
  /**
   * Content identity, computed through `modules/transactions`'
   * `DedupFingerprintPort` — the canonical ALGORITHM, never a second one.
   *
   * The NAME is local, and deliberately. `public.transactions` owns
   * `dedup_fingerprint`, `fingerprint_version` and `occurrence_ordinal` for
   * the dedup identity of a canonical transaction, and that module asserts
   * against the live catalogue that no other table wears them. A staged row
   * is a CANDIDATE awaiting review rather than a canonical transaction, so it
   * should not read as though it were that identity in the first place.
   */
  readonly stagedRowFingerprint: string | null;
  readonly stagedRowFingerprintVersion: string | null;
  /** Which occurrence of that content this line claims to be, once resolved. */
  readonly stagedRowOrdinal: number | null;
  readonly committedTransactionRef: CommittedTransactionRef | null;
}

/** A staged row before it has an identity — the write shape. */
export type NewStagedRow = Omit<StagedRow, 'id' | 'committedTransactionRef'> & {
  readonly id: StatementImportRowId;
};

/** Everything one parse writes, together. */
export interface ParseStaging {
  readonly rows: readonly NewStagedRow[];
  readonly errors: readonly (RowError & { readonly id: string })[];
  /** The import as it should be afterwards — REVIEW_REQUIRED, FAILED, or DUPLICATE. */
  readonly parsedImport: StatementImport;
  readonly expectedVersion: number;
}

export interface StatementImportRepository {
  /** Creates the DRAFT import. Nothing about the file exists yet. */
  create(actor: ImportsPrincipal, imported: StatementImport): Promise<void>;

  findById(actor: ImportsPrincipal, id: StatementImportId): Promise<StatementImport | null>;

  /**
   * Records the retention decision and moves the import forward, in one
   * write, refusing if the row has moved on.
   *
   * Together rather than as two calls, because the whole ordering guarantee
   * is that no source byte exists before the decision does — and two calls
   * would create a window in which the decision was recorded but the
   * lifecycle had not caught up, which is precisely the window a second
   * writer could store bytes in.
   */
  update(
    actor: ImportsPrincipal,
    imported: StatementImport,
    expectedVersion: number,
  ): Promise<void>;

  /**
   * Attaches the stored source to the import and moves it to SOURCE_STORED,
   * in one write.
   *
   * The database refuses this INSERT outright when the import's retention
   * question is open (migration 0100, SQLSTATE `KAR54`), so a caller that
   * skipped the gate gets a refusal rather than a stored statement.
   */
  attachSource(
    actor: ImportsPrincipal,
    importId: StatementImportId,
    sourceId: string,
    descriptor: StoredSourceDescriptor,
    storedAt: Date,
    imported: StatementImport,
    expectedVersion: number,
  ): Promise<void>;

  findSource(
    actor: ImportsPrincipal,
    importId: StatementImportId,
  ): Promise<StoredSourceDescriptor | null>;

  /**
   * Replaces the staged rows and errors for one import and moves it forward,
   * in one write.
   *
   * REPLACES, not appends. A re-parse of the same file must produce one set
   * of rows and not two, and a caller that had to remember to clear first
   * would eventually not. The database refuses staged rows for an import that
   * is not PARSING (migration 0101, SQLSTATE `KAR57`), so the replacement
   * cannot half-happen against a review already underway.
   */
  stageParse(actor: ImportsPrincipal, staging: ParseStaging): Promise<void>;

  listRows(actor: ImportsPrincipal, importId: StatementImportId): Promise<readonly StagedRow[]>;

  listRowErrors(
    actor: ImportsPrincipal,
    importId: StatementImportId,
    limit: number,
  ): Promise<readonly RowError[]>;

  countRowErrors(actor: ImportsPrincipal, importId: StatementImportId): Promise<number>;

  /**
   * Whether this principal has already COMMITTED an import of this exact
   * file, by keyed per-subject fingerprint.
   *
   * Only COMMITTED counts. A rejected, failed or erased import of the same
   * file is not a duplicate — it is a person retrying, and refusing them
   * would make one bad upload permanently unrepeatable.
   */
  findCommittedImportWithFile(
    actor: ImportsPrincipal,
    fileFingerprintVersion: string,
    fileFingerprint: string,
  ): Promise<StatementImportId | null>;

  /**
   * Deletes the import and everything beneath it. The stored OBJECT is not
   * reached by this — `ON DELETE CASCADE` cannot reach a byte the database
   * does not hold — so `EraseStatementImport` deletes it through
   * `EncryptedSourceStorePort` first.
   */
  deleteImport(actor: ImportsPrincipal, importId: StatementImportId): Promise<boolean>;
}

/** The version conflict, raised by the repository and mapped by the use case. */
export class StatementImportVersionConflictError extends Error {
  override readonly name = 'StatementImportVersionConflictError';

  constructor(
    readonly expectedVersion: number,
    message: string,
  ) {
    super(message);
  }
}
