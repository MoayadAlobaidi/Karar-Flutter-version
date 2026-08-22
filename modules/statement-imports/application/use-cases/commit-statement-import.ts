/**
 * CommitStatementImport — the reviewed rows become the person's financial
 * records, atomically, once.
 *
 * ## REVALIDATE EVERYTHING, because time passed
 *
 * An import can sit in `REVIEW_REQUIRED` for days. Everything the parse
 * established may have moved since, and none of it is re-checked by accident.
 * So before a single row is written this use case re-establishes:
 *
 *  1. **The principal** — context, never input.
 *  2. **The import** — visible to this principal, in `REVIEW_REQUIRED`, at the
 *     version the caller read.
 *  3. **The account** — still visible, still writable, still in the same
 *     currency. An account closed last week must not receive three hundred
 *     movements.
 *  4. **Retention** — asked again. A decision that has moved to
 *     `PENDING_LEGAL_REVIEW` since the upload is telling this platform
 *     something it must act on.
 *  5. **The stored source's integrity checksum** — the bytes being committed
 *     are the bytes that were reviewed. Verified without decrypting.
 *  6. **The source link** — an import with no stored statement has nothing to
 *     be a commit OF.
 *  7. **The processing versions** — the parser, mapping, normalisation and
 *     fingerprint versions recorded at parse are the ones running now. A
 *     deployment between review and commit can change what a line MEANS, and
 *     committing under new rules records figures nobody previewed.
 *  8. **The dedup state** — re-read, not remembered. Another import, a manual
 *     entry, or a second device may have recorded the same content since the
 *     preview was built.
 *  9. **Reconciliation** — a `MISMATCHED` verdict blocks. The file says the
 *     account ended at one figure and its own lines say another.
 *
 * Only then does the write open.
 *
 * ## ONE transaction, no subset
 *
 * `StatementCommitPort.commit` writes the canonical transactions, their
 * revision 1, their provenance, the deterministic category assignments where
 * an exact reviewed rule applied, the staged rows' write-once links, the
 * source freshness observation, the identifier-only outbox notice, and the
 * `COMMITTED` state — in one database transaction. A failure at any point
 * leaves none of them.
 *
 * ## Idempotent, and the proof is a column rather than a promise
 *
 * The port re-reads the import INSIDE the transaction. Already `COMMITTED`
 * means it writes nothing and answers with the transaction ids the first
 * commit produced, so a caller that never saw the first response gets the same
 * answer and nobody's spending is recorded twice. The write-once row link
 * (migration 0101, SQLSTATE `KAR56`) is what makes that unforgeable.
 *
 * ## Nothing inside the transaction calls out
 *
 * Identifiers are minted, categories resolved and narrative prepared BEFORE
 * the transaction opens. Holding a database transaction open across a call to
 * a key provider or a policy pack is how a connection pool starves under
 * load, and this is the widest transaction in the module.
 */

import { Currency, Result } from '@karar/shared-kernel';
import type { CalendarDay, Clock } from '@karar/shared-kernel';
// Declared by the module that owns what a written transaction is, and imported
// rather than restated: two structurally identical declarations do not fail
// when they drift, they diverge silently.
import {
  SUGGESTS_NO_TRANSFERS,
  type TransferSuggestionTriggerPort,
} from '@karar/transactions';

import { permitsCommit, reconcile } from '../../domain/reconciliation.js';
import { transitionTo, type StatementImport } from '../../domain/statement-import.js';
import { StatementImportId } from '../../domain/refs.js';
import {
  ACCOUNT_NOT_FOUND,
  IMPORT_NOT_FOUND,
  accountAccessUnavailable,
  commitFailed,
  notInExpectedState,
  retentionUnresolved,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotFound,
  type AccountNotWritable,
  type CommitFailed,
  type CurrencyMismatch,
  type ImportNotFound,
  type ImportNotInExpectedState,
  type ReconciliationBlocked,
  type RetentionUnresolved,
  type SourceIntegrityFailed,
  type StoreFailure,
  type VersionConflict,
} from '../errors.js';
import {
  isWritableLifecycleState,
  type CanonicalAccountAccessPort,
} from '../ports/canonical-account-access.js';
import type { CanonicalDedupLookupPort } from '../ports/canonical-dedup-lookup.js';
import type { EncryptedSourceStorePort } from '../ports/encrypted-source-store.js';
import {
  RETENTION_GOVERNED_DATASETS,
  type StatementRetentionDecisionPort,
} from '../ports/statement-retention-decision.js';
import type { IdSource } from '../ports/id-source.js';
import {
  StatementCommitConflictError,
  type DeterministicCategoryPort,
  type PreparedRowCommit,
  type StatementCommitPort,
  type StatementCommitReceipt,
} from '../ports/statement-commit.js';
import {
  StatementImportVersionConflictError,
  type StagedRow,
  type StatementImportRepository,
} from '../ports/statement-import-repository.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

export interface CommitStatementImportInput {
  readonly importId: string;
  /**
   * The version the caller read when it built the preview.
   *
   * Required, not optional. A commit is the one operation here that cannot be
   * undone, and "commit whatever this import is now" is a different — and
   * much worse — request than "commit the thing I was shown".
   */
  readonly expectedVersion: number;
}

/** What the commit did. Counts, ids, and whether this call did the work. */
export interface StatementImportCommitted {
  readonly importId: string;
  readonly committedTransactionCount: number;
  /** True when this call found the work already done. A retry, answered. */
  readonly alreadyCommitted: boolean;
  readonly transactionIds: readonly string[];
}

export type CommitStatementImportError =
  | MissingPrincipalContext
  | ImportNotFound
  | ImportNotInExpectedState
  | VersionConflict
  | AccountNotFound
  | AccountNotWritable
  | AccountAccessUnavailable
  | CurrencyMismatch
  | RetentionUnresolved
  | SourceIntegrityFailed
  | ReconciliationBlocked
  | CommitFailed
  | StoreFailure;

export class CommitStatementImport {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly commits: StatementCommitPort,
    private readonly accounts: CanonicalAccountAccessPort,
    private readonly sources: EncryptedSourceStorePort,
    private readonly dedup: CanonicalDedupLookupPort,
    private readonly categories: DeterministicCategoryPort,
    private readonly retention: StatementRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
    /**
     * The platform's own transfer-suggestion pass, declared by
     * `@karar/transactions` and satisfied by `modules/transfer-matching`. Run
     * AFTER the commit unit has landed, over the transactions it wrote.
     *
     * A statement is where both sides of one movement usually arrive together
     * — the outflow on one account's file and the inflow on another's — so
     * this is the call site that matters most for a person's totals not being
     * doubled (ADR-0028). What it produces is a QUESTION and never a fact.
     *
     * It defaults to `SUGGESTS_NO_TRANSFERS` so that this module's own suites
     * need not stand up a transfer-matching repository, and the hole that
     * default opens is closed by a test that reads the composition root's
     * source and fails if the real trigger stops being passed here.
     */
    private readonly transferSuggestions: TransferSuggestionTriggerPort = SUGGESTS_NO_TRANSFERS,
  ) {}

  async execute(
    input: CommitStatementImportInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImportCommitted, CommitStatementImportError>> {
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

    // A retry after an ambiguous response arrives here, not at the port: the
    // caller never saw the first answer, so it is asking the same question
    // again and deserves the same answer rather than a state error.
    if (imported.state === 'COMMITTED') {
      let rows: readonly StagedRow[];
      try {
        rows = await this.imports.listRows(acting, importId);
      } catch (error) {
        return Result.err(storeFailure('read the committed statement rows', error));
      }
      return Result.ok({
        importId,
        committedTransactionCount: imported.counts.committedTransactionCount,
        alreadyCommitted: true,
        transactionIds: rows
          .map((row) => row.committedTransactionRef)
          .filter((ref): ref is NonNullable<typeof ref> => ref !== null),
      });
    }
    if (imported.state !== 'REVIEW_REQUIRED') {
      return Result.err(notInExpectedState(imported.state, ['REVIEW_REQUIRED']));
    }
    if (imported.version !== input.expectedVersion) {
      return Result.err({
        kind: 'version_conflict',
        expectedVersion: input.expectedVersion,
        message:
          'this statement import changed since it was previewed, so it was not committed. The ' +
          'set of rows a person approves and the set that gets written must be the same set, ' +
          'and re-reading is cheap next to writing several hundred financial records nobody saw',
      });
    }

    // REVALIDATION 3 — the account.
    let account;
    try {
      account = await this.accounts.resolveOwnAccount(acting, imported.accountRef);
    } catch (error) {
      return Result.err(accountAccessUnavailable(error));
    }
    if (account === null) return Result.err(ACCOUNT_NOT_FOUND);
    if (!isWritableLifecycleState(account.lifecycleState)) {
      return Result.err({
        kind: 'account_not_writable',
        lifecycleState: account.lifecycleState,
        message:
          `this account is ${account.lifecycleState.toLowerCase()} now, though it was not when ` +
          'the statement was reviewed. Committing would produce records the account holder ' +
          'believes they stopped keeping',
      } satisfies AccountNotWritable);
    }
    const currency = Currency.tryGet(account.currencyCode);
    if (currency === undefined) {
      return Result.err(storeFailure('resolve the account currency', new Error('unsupported')));
    }

    // REVALIDATION 4 — retention, asked again.
    for (const dataset of RETENTION_GOVERNED_DATASETS) {
      let decision;
      try {
        decision = await this.retention.decideFor(acting, dataset);
      } catch (error) {
        return Result.err(storeFailure('resolve statement retention', error));
      }
      if (decision.state !== 'DECIDED') {
        return Result.err(retentionUnresolved(dataset, decision));
      }
    }

    // REVALIDATIONS 5 and 6 — the source link, and its integrity.
    let descriptor;
    try {
      descriptor = await this.imports.findSource(acting, importId);
    } catch (error) {
      return Result.err(storeFailure('read the stored statement', error));
    }
    if (descriptor === null) {
      return Result.err({
        kind: 'source_integrity_failed',
        message:
          'this import has no stored statement, so there is nothing it could be a commit OF. ' +
          'Writing the staged rows anyway would produce financial records whose source cannot ' +
          'be produced on request',
      } satisfies SourceIntegrityFailed);
    }
    let intact: boolean;
    try {
      intact = await this.sources.verify(acting, {
        storeKind: descriptor.storeKind,
        objectRef: descriptor.objectRef,
        byteLength: descriptor.byteLength,
        algorithm: descriptor.algorithm,
        keyVersion: descriptor.keyVersion,
        nonce: descriptor.nonce,
        authTag: descriptor.authTag,
        integrityChecksumAlgorithm: descriptor.integrityChecksumAlgorithm,
        integrityChecksum: descriptor.integrityChecksum,
      });
    } catch {
      intact = false;
    }
    if (!intact) {
      return Result.err({
        kind: 'source_integrity_failed',
        message:
          'the stored statement no longer matches the integrity checksum recorded when it was ' +
          'stored, so nothing was committed. The bytes a person reviewed and the bytes about to ' +
          'become their records must be the same bytes',
      } satisfies SourceIntegrityFailed);
    }

    // REVALIDATION 7 — the versions.
    const versions = imported.versions;
    if (versions === null) {
      return Result.err(notInExpectedState(imported.state, ['REVIEW_REQUIRED']));
    }

    let rows: readonly StagedRow[];
    try {
      rows = await this.imports.listRows(acting, importId);
    } catch (error) {
      return Result.err(storeFailure('read the staged statement rows', error));
    }
    const committable = rows.filter((row) => row.rowState === 'VALID');

    // REVALIDATION 8b — THE CURRENCY, COMPARED RATHER THAN ASSUMED.
    //
    // The account's currency was re-read a few dozen lines above (REVALIDATION
    // 3) and, until this gate existed, was never compared to anything. The
    // staged rows carry the currency the FILE stated, and the write below took
    // `row.currencyCode ?? currency.code` — so a row that disagreed with the
    // account was written verbatim, in the account's own ledger, under a
    // currency the account is not held in.
    //
    // The gate that was supposed to catch this runs at PARSE time, against the
    // account currency as it was THEN. Between parse and commit the currency
    // can legitimately change: `checkCurrencyChange` in the accounts module
    // permits it while the account holds no financial records, and "financial
    // records" is answered by a query over `public.transactions` and
    // `public.transaction_provenance` — neither of which knows about rows
    // staged in `statement_import_rows`. So an account with a fully staged,
    // fully previewed QAR statement reads as empty, its currency moves to KWD,
    // and the commit writes QAR minor units onto a KWD account. A line of
    // 120.50 QAR lands as 12050 minor units and renders as 12.050 KWD, because
    // the two currencies do not share an exponent.
    //
    // `CurrencyMismatch` was declared in this use case's error union and given
    // an RFC 7807 mapping (409, CURRENCY_MISMATCH) from the beginning, and was
    // constructed nowhere in the repository. This is the construction. The
    // manual write path already refuses the identical case with
    // ACCOUNT_CURRENCY_MISMATCH; the two write paths now agree.
    //
    // It refuses rather than converts, and it refuses rather than rewriting
    // the row to the account's currency: an amount is a number in a currency,
    // and relabelling it is the corruption, not the fix.
    for (const row of committable) {
      const stated = row.currencyCode;
      if (stated !== null && stated !== undefined && stated !== currency.code) {
        return Result.err({
          kind: 'currency_mismatch',
          accountCurrency: currency.code,
          sourceCurrency: stated,
          message:
            `line ${String(row.rowNumber)} states ${stated} and this account is held in ` +
            `${currency.code}. Nothing here converts between currencies, and writing the ` +
            'amount unchanged would put one currency\u2019s minor units on the other\u2019s ' +
            'ledger. Nothing was written',
        } satisfies CurrencyMismatch);
      }
    }

    // REVALIDATION 9 — reconciliation, recomputed from the staged rows and
    // the balance the FILE stated. Never from a total this platform derived.
    const outcome = reconcile({
      stated: imported.statedBalance,
      rows: committable.map((row) => ({
        rowNumber: row.rowNumber,
        amountMinorUnits: row.amountMinorUnits ?? 0n,
        currencyCode: row.currencyCode ?? currency.code,
        sourceBalanceMinorUnits: row.sourceBalanceMinorUnits,
        sourceBalanceKind: row.sourceBalanceKind,
      })),
      currency,
    });
    if (!permitsCommit(outcome)) {
      return Result.err({
        kind: 'reconciliation_blocked',
        outcome,
        message:
          'the balance this file states and the balance its own lines add up to do not agree ' +
          'exactly, so nothing was committed. At least one of the two is being read wrongly, and ' +
          'committing either way writes records that are wrong in a way nobody can see afterwards',
      } satisfies ReconciliationBlocked);
    }

    // REVALIDATION 8 — the dedup state, re-read rather than remembered.
    const digests = committable
      .map((row) => row.stagedRowFingerprint)
      .filter((value): value is string => value !== null);
    let recorded;
    try {
      recorded = await this.dedup.recordedOccurrences(
        acting,
        imported.accountRef,
        versions.fingerprintVersion,
        digests,
      );
    } catch (error) {
      return Result.err(storeFailure('look up already-recorded transactions', error));
    }
    const highest = new Map<string, number>();
    for (const entry of recorded) highest.set(entry.fingerprint, Math.max(0, ...entry.ordinals));

    // Everything below is resolved BEFORE the transaction opens.
    const committedAt = this.clock.now();
    const prepared: PreparedRowCommit[] = [];
    for (const row of committable) {
      const digest = row.stagedRowFingerprint;
      const description = row.description;
      const bookingDate: CalendarDay | null = row.bookingDate;
      if (digest === null || description === null || bookingDate === null) continue;
      const ordinal = (highest.get(digest) ?? 0) + 1;
      highest.set(digest, ordinal);

      // Both narrative fields go to the rules, raw. Which one a rule is
      // matched against is a categorisation rule and lives with the rules, not
      // here — this loop used to pass only the description, so a bank that
      // supplied a clean merchant column had it ignored.
      // Declared without an initialiser, as the manual path does: the catch
      // returns, so there is no route past this block with it unassigned, and
      // a  here is a value nothing ever reads.
      let category;
      try {
        category = await this.categories.match(acting, {
          merchant: row.merchant?.reveal() ?? null,
          description: description.reveal(),
        });
      } catch (error) {
        return Result.err(storeFailure('resolve a deterministic category', error));
      }

      prepared.push({
        rowId: row.id,
        rowNumber: row.rowNumber,
        transactionId: this.ids.nextId(),
        revisionId: this.ids.nextId(),
        provenanceId: this.ids.nextId(),
        categoryAssignmentId: this.ids.nextId(),
        accountRef: imported.accountRef,
        bookingDate,
        valueDate: row.valueDate,
        eventOccurredAt: row.eventOccurredAt,
        sourceTimezone: row.sourceTimezone,
        amountMinorUnits: row.amountMinorUnits ?? 0n,
        currencyCode: row.currencyCode ?? currency.code,
        description,
        merchant: row.merchant,
        sourceDirection: row.sourceDirection ?? 'NOT_STATED',
        directionMapping: row.directionMapping ?? 'SOURCE_SIGNED_AMOUNT',
        dedupFingerprint: digest,
        fingerprintVersion: versions.fingerprintVersion,
        occurrenceOrdinal: ordinal,
        categoryCode: category?.categoryCode ?? null,
        categoryRuleVersion: category?.ruleVersion ?? null,
      });
    }

    const committing = transitionTo(imported, 'COMMITTING', committedAt);
    const committed = transitionTo(committing, 'COMMITTED', committedAt, {
      counts: { ...imported.counts, committedTransactionCount: prepared.length },
    });

    let receipt: StatementCommitReceipt;
    try {
      receipt = await this.commits.commit(acting, {
        committingImport: committing,
        committedImport: committed,
        expectedVersion: imported.version,
        rows: prepared,
        versions,
        actorId: acting.userId,
        committedAt,
        notice: {
          importId,
          accountId: imported.accountRef.accountId,
          occurredAt: committedAt,
        },
        freshness: freshnessFor(imported, committable, committedAt),
      });
    } catch (error) {
      if (error instanceof StatementImportVersionConflictError) {
        return Result.err({
          kind: 'version_conflict',
          expectedVersion: error.expectedVersion,
          message:
            'this statement import changed while the commit was running, so nothing was written',
        });
      }
      if (error instanceof StatementCommitConflictError) {
        return Result.err(commitFailed(error));
      }
      return Result.err(commitFailed(error));
    }

    // AFTER the unit of work has landed, and never inside it. Two reasons, and
    // both are load-bearing. A suggestion is about transactions that EXIST, so
    // it cannot run against rows a rollback may still remove. And the import
    // must not fail because a question could not be asked: the outcome is not
    // read, a throw is swallowed, and the person's committed statement stands.
    //
    // The already-committed early return above deliberately does NOT reach
    // here. That path writes nothing, and re-scanning a person's windows every
    // time a client repeats a commit call would turn an idempotent answer into
    // repeated work over their history.
    try {
      await this.transferSuggestions.suggestTransfersFor(
        // Restated field by field rather than cast: the two principal shapes
        // are structurally identical today, and a cast would keep compiling if
        // either gained a field this module has no business forwarding.
        { tenantId: acting.tenantId, userId: acting.userId },
        receipt.transactionIds,
      );
    } catch {
      // Deliberately ignored — see `TransferSuggestionTriggerPort`. A missing
      // suggestion leaves a question unasked; a failed commit would leave a
      // person's reviewed statement unrecorded.
    }

    return Result.ok({
      importId,
      committedTransactionCount: receipt.committedTransactionCount,
      alreadyCommitted: receipt.alreadyCommitted,
      transactionIds: receipt.transactionIds,
    });
  }
}

/**
 * What the source link should record about this import having arrived.
 *
 * `null` when the import names no connection, or when no row carried a
 * booking date — a coverage window with no days in it describes nothing, and
 * writing one would claim this source provided history it did not.
 */
function freshnessFor(
  imported: StatementImport,
  rows: readonly StagedRow[],
  observedAt: Date,
): { connectionId: string; observedAt: Date; coverageStart: CalendarDay; coverageEnd: CalendarDay } | null {
  const connectionId = imported.connectionRef?.connectionId ?? null;
  if (connectionId === null) return null;
  const days = rows
    .map((row) => row.bookingDate)
    .filter((day): day is CalendarDay => day !== null)
    .sort((left, right) => left.compare(right));
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return null;
  return { connectionId, observedAt, coverageStart: first, coverageEnd: last };
}
