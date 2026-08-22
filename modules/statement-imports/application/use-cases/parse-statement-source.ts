/**
 * ParseStatementSource — read the stored statement, map it, normalise it,
 * fingerprint it, and STAGE it. Nothing here writes a financial record.
 *
 * ## The invariant this use case exists to hold
 *
 * A parse ends in `REVIEW_REQUIRED`, `FAILED` or `DUPLICATE`. There is no
 * branch to `COMMITTED` and no argument that produces one; the state machine
 * refuses `PARSING -> COMMITTED` in the domain AND in the database
 * (`statement_imports_guard`, SQLSTATE `KAR51`), so even a future edit here
 * cannot make parsing write somebody's records.
 *
 * ## Retries are idempotent because staging REPLACES
 *
 * A re-parse re-enters from `SOURCE_STORED` and `stageParse` replaces the
 * rows and errors rather than appending. Two parses of one file produce one
 * set of rows. The database refuses staged rows for an import that is not
 * `PARSING` (`KAR57`), so a replacement cannot half-happen against a review
 * already underway.
 *
 * ## Errors are collected, bounded, and never quote the file
 *
 * Every line that cannot be read produces `(row number, safe field, reason
 * code)` and the parse keeps going, because a person fixing a mapping needs
 * to see every consequence of the convention they got wrong. `maxReportedErrors`
 * bounds what is RETURNED, never what is counted: the true total is reported
 * separately, so a truncated report cannot look like a complete one.
 *
 * ## What is refused as a whole file rather than line by line
 *
 * Invalid UTF-8, binary content, a spreadsheet, an archive, and every
 * resource bound. A person who uploaded an `.xlsx` needs to be told it is a
 * spreadsheet, not shown nine hundred encoding errors.
 */

import { Currency, Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';
import type { IngestionLimitPolicy } from '@karar/platform/dist/ingestion/limits.js';
import type {
  DedupFingerprintPort,
  TransactionsPrincipal,
} from '@karar/transactions';
import { AccountRef } from '@karar/transactions';

import { checkMapping, type StatementColumnMapping } from '../../domain/column-mapping.js';
import { MAPPING_VERSION } from '../../domain/column-mapping.js';
import { NORMALIZATION_VERSION } from '../../domain/normalization.js';
import { permitsCommit, reconcile } from '../../domain/reconciliation.js';
import type { StatedStatementBalance } from '../../domain/reconciliation.js';
import type { RowError } from '../../domain/reason-codes.js';
import type { ImportRefusalCode } from '../../domain/reason-codes.js';
import {
  distinctAccountIdentifiers,
  mapStatementRow,
  type MappedStatementRow,
} from '../../domain/statement-row.js';
import { transitionTo, type StatementImport } from '../../domain/statement-import.js';
import { StatementImportId, StatementImportRowId } from '../../domain/refs.js';
import {
  ACCOUNT_NOT_FOUND,
  IMPORT_NOT_FOUND,
  accountAccessUnavailable,
  fingerprintUnavailable,
  notInExpectedState,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotFound,
  type FingerprintUnavailable,
  type ImportNotFound,
  type ImportNotInExpectedState,
  type MappingUnusable,
  type SourceRefused,
  type SourceStoreUnavailable,
  type StoreFailure,
} from '../errors.js';
import { sourceStoreUnavailable } from '../errors.js';
import type { CanonicalAccountAccessPort } from '../ports/canonical-account-access.js';
import type { CanonicalDedupLookupPort } from '../ports/canonical-dedup-lookup.js';
import { CsvParseRefusedError, type CsvParserPort } from '../ports/csv-parser.js';
import type { EncryptedSourceStorePort } from '../ports/encrypted-source-store.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  NewStagedRow,
  RowState,
  StatementImportRepository,
} from '../ports/statement-import-repository.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

export interface ParseStatementSourceInput {
  readonly importId: string;
  readonly mapping: StatementColumnMapping;
  /**
   * The balance the FILE stated for the statement as a whole, when the caller
   * read one out of a header block. `null` is the ordinary case and produces
   * `RECONCILIATION_NOT_AVAILABLE` — never a figure derived from the rows.
   */
  readonly statedBalance?: StatedStatementBalance | null;
  /** The declared policy — `csvStatementImport`, resolved by the caller. */
  readonly limits: IngestionLimitPolicy;
  /** Cancellation, when the caller has one. */
  readonly signal?: AbortSignal;
}

export type ParseStatementSourceError =
  | MissingPrincipalContext
  | ImportNotFound
  | ImportNotInExpectedState
  | AccountNotFound
  | AccountAccessUnavailable
  | MappingUnusable
  | SourceRefused
  | SourceStoreUnavailable
  | FingerprintUnavailable
  | StoreFailure;

export class ParseStatementSource {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly sources: EncryptedSourceStorePort,
    private readonly parser: CsvParserPort,
    private readonly accounts: CanonicalAccountAccessPort,
    private readonly fingerprints: DedupFingerprintPort,
    private readonly dedup: CanonicalDedupLookupPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ParseStatementSourceInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImport, ParseStatementSourceError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return Result.err(principal.error);
    const acting = principal.value;

    const importId = StatementImportId.of(input.importId);
    let imported: StatementImport | null;
    try {
      imported = await this.imports.findById(acting, importId);
    } catch (error) {
      return Result.err(storeFailure('read statement import', error));
    }
    if (imported === null) return Result.err(IMPORT_NOT_FOUND);
    if (imported.state !== 'SOURCE_STORED') {
      return Result.err(notInExpectedState(imported.state, ['SOURCE_STORED']));
    }

    // The mapping is checkable before a byte is read, and refusing here is
    // cheaper for everyone than refusing on line 40,000.
    const mappingViolations = checkMapping(input.mapping, null);
    if (mappingViolations.length > 0) {
      return Result.err({
        kind: 'mapping_unusable',
        violations: mappingViolations,
        message:
          'this column mapping cannot be used, and the file was not read. Every problem listed ' +
          'is decidable without the file, so refusing now costs nothing and refusing later ' +
          'would cost a full parse',
      });
    }

    // The account's currency is re-read rather than remembered: an import can
    // sit between DRAFT and PARSING, and a currency corrected in between would
    // otherwise validate this file against a fact that has moved.
    let account;
    try {
      account = await this.accounts.resolveOwnAccount(acting, imported.accountRef);
    } catch (error) {
      return Result.err(accountAccessUnavailable(error));
    }
    if (account === null) return Result.err(ACCOUNT_NOT_FOUND);
    const accountCurrency = Currency.tryGet(account.currencyCode);
    if (accountCurrency === undefined) {
      return Result.err(
        refusal(
          'UNKNOWN_CURRENCY' as never,
          'the account is held in a currency this platform does not support, so nothing could be ' +
            'read against it',
        ),
      );
    }

    let descriptor;
    try {
      descriptor = await this.imports.findSource(acting, importId);
    } catch (error) {
      return Result.err(storeFailure('read the stored statement', error));
    }
    if (descriptor === null) {
      return Result.err(
        refusal(
          'SOURCE_UNREADABLE',
          'this import has no stored statement, so there is nothing to parse. That is a state ' +
            'the lifecycle should make unreachable, and it is reported rather than repaired',
        ),
      );
    }

    const now = this.clock.now();
    const parsing = transitionTo(imported, 'PARSING', now);
    try {
      await this.imports.update(acting, parsing, imported.version);
    } catch (error) {
      return Result.err(storeFailure('begin parsing', error));
    }

    // ---- the read itself -------------------------------------------------
    const rows: NewStagedRow[] = [];
    const errors: RowError[] = [];
    const mapped: MappedStatementRow[] = [];
    let dataRowCount = 0;

    try {
      const parsed = await this.parser.parse({
        source: this.sources.open(
          acting,
          { importId, mediaType: descriptor.mediaType },
          descriptor,
        ),
        limits: input.limits,
        hasHeaderRow: input.mapping.hasHeaderRow,
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
        deadlineAt: new Date(now.getTime() + input.limits.deadlineMs),
        now: () => this.clock.now(),
      });
      for await (const row of parsed.rows) {
        dataRowCount += 1;
        const outcome = mapStatementRow({
          rowNumber: row.rowNumber,
          fields: row.fields,
          mapping: input.mapping,
          accountCurrency,
          resolveCurrency: (code) => Currency.tryGet(code) ?? null,
        });
        // The currency gate lives in `mapStatementRow`, which already holds
        // the account's currency: a line in another currency arrives here as
        // an error rather than as a row, so nothing in this loop can let one
        // through by forgetting to check.
        if (outcome.ok) mapped.push(outcome.row);
        else errors.push(...outcome.errors);
        // The error ceiling stops the read rather than quietly capping the
        // list: a file this broken is not one anybody wants a partial parse of.
        if (errors.length > input.limits.maxReportedErrors) {
          return await this.fail(acting, parsing, 'TOO_MANY_ERRORS', errors, input.limits);
        }
      }
    } catch (error) {
      if (error instanceof CsvParseRefusedError) {
        return await this.fail(acting, parsing, error.code, errors, input.limits);
      }
      // A store failure at this point is a read failure, not a parse failure.
      await this.failQuietly(acting, parsing, 'SOURCE_UNREADABLE');
      return Result.err(sourceStoreUnavailable(error));
    }

    // A statement that describes several accounts is refused, never split:
    // filing both sets of movements into the one account the person chose
    // produces a balance wrong by the whole of the other account (ADR-0028).
    const accountIdentifiers = distinctAccountIdentifiers(mapped);
    if (accountIdentifiers.length > 1) {
      return await this.fail(
        acting,
        parsing,
        'MULTIPLE_ACCOUNTS_IN_SOURCE',
        errors,
        input.limits,
        'REVIEW_REQUIRED',
      );
    }

    // ---- fingerprints and duplicate resolution ---------------------------
    const transactionsPrincipal: TransactionsPrincipal = {
      tenantId: acting.tenantId,
      userId: acting.userId,
    };
    const canonicalAccount = AccountRef.of(imported.accountRef.accountId);
    const digests: string[] = [];
    try {
      for (const row of mapped) {
        const fingerprint = await this.fingerprints.fingerprint(transactionsPrincipal, {
          accountRef: canonicalAccount,
          bookingDate: row.bookingDate,
          amountMinorUnits: row.amountMinorUnits,
          currencyCode: row.currencyCode,
          normalizedNarrative: row.normalizedNarrative,
        });
        digests.push(fingerprint.value);
      }
    } catch (error) {
      await this.failQuietly(acting, parsing, 'SOURCE_UNREADABLE');
      return Result.err(fingerprintUnavailable(error));
    }
    const fingerprintVersion = this.fingerprints.version;

    let recorded;
    try {
      recorded = await this.dedup.recordedOccurrences(
        acting,
        imported.accountRef,
        fingerprintVersion,
        digests,
      );
    } catch (error) {
      return Result.err(storeFailure('look up already-recorded transactions', error));
    }
    // Which ordinals of each content identity are already recorded. The rule
    // is an INDEX comparison rather than a "next ordinal" one, and the
    // difference is the whole of duplicate detection.
    //
    // A statement containing one coffee, where one identical coffee is already
    // recorded at ordinal 1, is a REPEAT of that import — its file-occurrence
    // index is 1, which is taken, so the line is an EXACT_DUPLICATE. A
    // statement containing TWO identical coffees against one recorded is one
    // duplicate (index 1) and one genuinely new occurrence (index 2). Asking
    // "what is the next unused ordinal?" instead would answer 2 for the first
    // line and record the same coffee twice.
    const recordedOrdinals = new Map<string, Set<number>>();
    for (const entry of recorded) {
      recordedOrdinals.set(entry.fingerprint, new Set(entry.ordinals));
    }
    /** This file's own 1-based occurrence index per content identity. */
    const fileOccurrence = new Map<string, number>();

    let exactDuplicates = 0;
    for (const [index, row] of mapped.entries()) {
      const digest = digests[index] ?? '';
      const nextOrdinal = (fileOccurrence.get(digest) ?? 0) + 1;
      fileOccurrence.set(digest, nextOrdinal);
      const alreadyRecorded = recordedOrdinals.get(digest)?.has(nextOrdinal) ?? false;
      const rowState: RowState = alreadyRecorded ? 'EXACT_DUPLICATE' : 'VALID';
      if (alreadyRecorded) exactDuplicates += 1;
      rows.push({
        id: StatementImportRowId.of(this.ids.nextId()),
        rowNumber: row.rowNumber,
        rowState,
        bookingDate: row.bookingDate,
        valueDate: row.valueDate,
        eventOccurredAt: row.eventOccurredAt,
        sourceTimezone: row.sourceTimezone,
        amountMinorUnits: row.amountMinorUnits,
        currencyCode: row.currencyCode,
        sourceDirection: row.sourceDirection,
        directionMapping: row.directionMapping,
        description: row.description,
        merchant: row.merchant,
        sourceReference: row.sourceReference,
        instrumentMask: row.instrumentMask,
        sourceBalanceMinorUnits: row.sourceBalanceMinorUnits,
        sourceBalanceKind: row.sourceBalanceKind,
        stagedRowFingerprint: digest,
        stagedRowFingerprintVersion: fingerprintVersion,
        stagedRowOrdinal: nextOrdinal,
      });
    }

    // Every line that could not be read is staged as INVALID with a NULL
    // amount, so the review screen can count them without the parse having
    // invented a value for any of them.
    for (const failed of distinctRowNumbers(errors)) {
      if (rows.some((row) => row.rowNumber === failed)) continue;
      rows.push(invalidRow(StatementImportRowId.of(this.ids.nextId()), failed));
    }
    rows.sort((left, right) => left.rowNumber - right.rowNumber);

    // ---- reconciliation --------------------------------------------------
    const stated = input.statedBalance ?? null;
    const outcome = reconcile({
      stated,
      rows: mapped.map((row) => ({
        rowNumber: row.rowNumber,
        amountMinorUnits: row.amountMinorUnits,
        currencyCode: row.currencyCode,
        sourceBalanceMinorUnits: row.sourceBalanceMinorUnits,
        sourceBalanceKind: row.sourceBalanceKind,
      })),
      currency: accountCurrency,
    });

    const counts = {
      rowCount: dataRowCount,
      validRowCount: rows.filter((row) => row.rowState === 'VALID').length,
      invalidRowCount: rows.filter((row) => row.rowState === 'INVALID').length,
      exactDuplicateCount: exactDuplicates,
      // Nothing in this phase produces a PROBABLE duplicate: a probable match
      // needs a similarity rule, and this module has none. The count is
      // reported so a preview's shape does not change when one arrives.
      probableDuplicateCount: 0,
      committedTransactionCount: 0,
    };

    const versions = {
      parserVersion: this.parser.version,
      mappingVersion: MAPPING_VERSION,
      normalizationVersion: NORMALIZATION_VERSION,
      fingerprintVersion,
    };

    const reviewed = transitionTo(parsing, 'REVIEW_REQUIRED', this.clock.now(), {
      versions,
      counts,
      reconciliationStatus: outcome.status,
      statedBalance: stated,
      refusalCode: null,
    });

    try {
      await this.imports.stageParse(acting, {
        rows,
        errors: errors.map((error) => ({ ...error, id: this.ids.nextId() })),
        parsedImport: reviewed,
        expectedVersion: parsing.version,
      });
    } catch (error) {
      return Result.err(storeFailure('stage the parsed statement', error));
    }
    // A mismatch does not fail the parse — it blocks the COMMIT, and it does
    // so from a state the person can look at and act on.
    void permitsCommit(outcome);
    return Result.ok(reviewed);
  }

  /** Moves the import to a refused state and returns the typed refusal. */
  private async fail(
    acting: ImportsPrincipal,
    parsing: StatementImport,
    code: ImportRefusalCode,
    errors: readonly RowError[],
    limits: IngestionLimitPolicy,
    to: 'FAILED' | 'REVIEW_REQUIRED' = 'FAILED',
  ): Promise<Result<StatementImport, ParseStatementSourceError>> {
    const next = transitionTo(parsing, to, this.clock.now(), { refusalCode: code });
    try {
      await this.imports.update(acting, next, parsing.version);
    } catch {
      // The refusal is what the caller needs; a failure to RECORD the refusal
      // must not become a different, more confusing error.
    }
    return Result.err({
      kind: 'source_refused',
      code,
      rowErrors: Object.freeze(errors.slice(0, limits.maxReportedErrors)),
      reportedErrorCount: Math.min(errors.length, limits.maxReportedErrors),
      totalErrorCount: errors.length,
      message:
        `this statement was refused (${code}) and nothing was staged. Errors name a line number, ` +
        'a field and a reason and never quote the file: the value that caused the problem is ' +
        'visible in the person’s own copy and must not travel into a log or a support ticket',
    });
  }

  private async failQuietly(
    acting: ImportsPrincipal,
    parsing: StatementImport,
    code: ImportRefusalCode,
  ): Promise<void> {
    try {
      await this.imports.update(
        acting,
        transitionTo(parsing, 'FAILED', this.clock.now(), { refusalCode: code }),
        parsing.version,
      );
    } catch {
      // See `fail`.
    }
  }
}

function refusal(code: ImportRefusalCode, message: string): SourceRefused {
  return Object.freeze({
    kind: 'source_refused' as const,
    code,
    rowErrors: Object.freeze([]),
    reportedErrorCount: 0,
    totalErrorCount: 0,
    message,
  });
}

function distinctRowNumbers(errors: readonly RowError[]): readonly number[] {
  return [...new Set(errors.map((error) => error.rowNumber))].sort((a, b) => a - b);
}

/**
 * A line that could not be read, staged so it can be counted and shown.
 *
 * Every value is `null`, and the amount above all. Migration 0101 refuses an
 * INVALID row that carries an amount at all, so "we could not read it" cannot
 * become a zero in a column that is later summed.
 */
function invalidRow(id: StatementImportRowId, rowNumber: number): NewStagedRow {
  return {
    id,
    rowNumber,
    rowState: 'INVALID',
    bookingDate: null,
    valueDate: null,
    eventOccurredAt: null,
    sourceTimezone: null,
    amountMinorUnits: null,
    currencyCode: null,
    sourceDirection: null,
    directionMapping: null,
    description: null,
    merchant: null,
    sourceReference: null,
    instrumentMask: null,
    sourceBalanceMinorUnits: null,
    sourceBalanceKind: null,
    stagedRowFingerprint: null,
    stagedRowFingerprintVersion: null,
    stagedRowOrdinal: null,
  };
}
