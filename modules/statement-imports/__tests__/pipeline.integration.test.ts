/**
 * The whole vertical slice against live PostgreSQL: source, parse, normalize,
 * stage, preview, review, commit — plus the four properties the module exists
 * to guarantee.
 *
 *  1. **Retention decides before the first durable source byte.** A refusing
 *     provider leaves ZERO rows in all four tables and zero canonical
 *     transactions, counted as the bootstrap superuser with RLS bypassed —
 *     because counting as `karar_app` would prove the rows are hidden, not
 *     that they are absent.
 *  2. **Parsing never writes a financial record.** After a parse the ledger is
 *     still empty; only a reviewed commit fills it.
 *  3. **The commit is atomic.** A failure inside the transaction leaves NO
 *     SUBSET — no transactions, no revisions, no provenance, no row links, no
 *     outbox row, and the import still reviewable.
 *  4. **The commit is idempotent.** A retry after an ambiguous response
 *     produces no duplicate and the same result.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@karar/shared-kernel';
import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import { PrismaSourceObservationWriter } from '@karar/financial-connections';
import {
  MerchantRuleEvaluator,
  PrismaMerchantRuleDirectory,
  PrismaStatementCommitWriter,
} from '@karar/transactions';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { CommitStatementImport } from '../application/use-cases/commit-statement-import.js';
import { EraseStatementImport } from '../application/use-cases/erase-statement-import.js';
import { ParseStatementSource } from '../application/use-cases/parse-statement-source.js';
import { PreviewStatementImport } from '../application/use-cases/preview-statement-import.js';
import { RejectStatementImport } from '../application/use-cases/reject-statement-import.js';
import { StartStatementImport } from '../application/use-cases/start-statement-import.js';
import { StoreImportSource } from '../application/use-cases/store-import-source.js';
import type { StatementColumnMapping } from '../domain/column-mapping.js';
import type {
  StatementRetentionDecision,
  StatementRetentionDecisionPort,
} from '../application/ports/statement-retention-decision.js';
import type { StatementImportOutboxPort } from '../application/ports/statement-import-outbox.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { TransactionsCanonicalNarrativeAdapter } from '../infrastructure/adapters/transactions-canonical-narrative-encryptor.js';
import { TransactionsDeterministicCategoryAdapter } from '../infrastructure/adapters/transactions-deterministic-category.js';
import { StreamingCsvParser } from '../infrastructure/parsing/streaming-csv-parser.js';
import { PlatformOutboxStatementImportRecorder } from '../infrastructure/persistence/platform-outbox-recorder.js';
import { PrismaCanonicalDedupLookupReader } from '../infrastructure/persistence/prisma-canonical-dedup-lookup.js';
import { PrismaStatementCommitUnitOfWork } from '../infrastructure/persistence/prisma-statement-commit-unit-of-work.js';
import { PrismaStatementImportRepository } from '../infrastructure/persistence/prisma-statement-import-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  accountsRepository,
  bytesOf,
  buildHandle,
  dropDatabase,
  fixedClock,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  streamOf,
  superuserMaintenanceProfile,
  syntheticEventCatalogue,
  testDedupFingerprints,
  testEncryption,
  testFileFingerprints,
  testNoConnections,
  testRetention,
  testSourceStore,
  testTransactionsEncryption,
  withAdapter,
} from './fixtures.js';
// The marker is IMPORTED, never typed. `tsc` emits these tests into the same
// dist/ a deployment ships, so a fixture value written here travels exactly as
// far as one written in source — which the retention closure test proves by
// scanning every dist/ in the production closure.
import { SYNTHETIC_RETENTION_MARKER } from '@karar/financial-retention-local-fixtures';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'STATEMENT-IMPORTS PIPELINE TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_imports_pipeline`;
const LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

/**
 * A synthetic statement. Two ordinary lines and one that cannot be read, so
 * every assertion about counts has all three kinds in it.
 *
 * The merchant names are `SYNTHETIC MERCHANT ...` and the amounts are round
 * numbers: nothing here resembles a real person's statement.
 */
const STATEMENT = [
  'Booking Date,Description,Amount',
  '2026-08-10,SYNTHETIC MERCHANT ONE,-45.00',
  '2026-08-11,SYNTHETIC MERCHANT TWO,120.50',
  '2026-08-12,SYNTHETIC MERCHANT THREE,not-a-number',
  '',
].join('\n');

const MAPPING: StatementColumnMapping = {
  bookingDateColumn: 0,
  valueDateColumn: null,
  eventOccurredAtColumn: null,
  sourceTimezoneColumn: null,
  descriptionColumn: 1,
  merchantColumn: null,
  amount: { kind: 'SIGNED', amountColumn: 2, signFrame: 'ACCOUNT_HOLDER' },
  currencyColumn: null,
  statedCurrencyCode: 'QAR',
  sourceBalanceColumn: null,
  sourceBalanceKind: null,
  sourceReferenceColumn: null,
  instrumentMaskColumn: null,
  accountIdentifierColumn: null,
  dateOrder: 'ISO',
  hasHeaderRow: true,
};

/** Every table this slice writes, counted as the superuser with RLS bypassed. */
interface TableCounts {
  readonly imports: number;
  readonly sources: number;
  readonly rows: number;
  readonly row_errors: number;
  readonly transactions: number;
  readonly revisions: number;
  readonly provenance: number;
  readonly outbox: number;
}

async function counts(): Promise<TableCounts> {
  const result = await withAdapter(database, 'superuser', (adapter) =>
    adapter.query<Record<string, string>>(
      `SELECT (SELECT count(*) FROM public.statement_imports) AS imports,
              (SELECT count(*) FROM public.statement_import_sources) AS sources,
              (SELECT count(*) FROM public.statement_import_rows) AS rows,
              (SELECT count(*) FROM public.statement_import_row_errors) AS row_errors,
              (SELECT count(*) FROM public.transactions) AS transactions,
              (SELECT count(*) FROM public.transaction_revisions) AS revisions,
              (SELECT count(*) FROM public.transaction_provenance) AS provenance,
              (SELECT count(*) FROM platform.outbox_events) AS outbox`,
    ),
  );
  const row = result.rows[0] ?? {};
  const at = (key: string): number => Number(row[key] ?? 0);
  return {
    imports: at('imports'),
    sources: at('sources'),
    rows: at('rows'),
    row_errors: at('row_errors'),
    transactions: at('transactions'),
    revisions: at('revisions'),
    provenance: at('provenance'),
    outbox: at('outbox'),
  };
}

interface Wiring {
  readonly start: StartStatementImport;
  readonly store: StoreImportSource;
  readonly parse: ParseStatementSource;
  readonly preview: PreviewStatementImport;
  readonly reject: RejectStatementImport;
  readonly commit: CommitStatementImport;
  readonly erase: EraseStatementImport;
  readonly sourceStore: ReturnType<typeof testSourceStore>;
}

/**
 * The real composition, with the LOCAL providers.
 *
 * `retention` and `outbox` are injectable so a test can make one of them
 * refuse and observe what the rest of the pipeline does — which is how the
 * gate and the atomicity guarantee are proven rather than asserted.
 */
function wire(
  handle: PrismaHandle,
  clock: Clock,
  overrides: {
    readonly retention?: StatementRetentionDecisionPort;
    readonly outbox?: StatementImportOutboxPort;
    readonly sourceStore?: ReturnType<typeof testSourceStore>;
  } = {},
): Wiring {
  const encryption = testEncryption();
  const repository = new PrismaStatementImportRepository(handle, encryption);
  const sourceStore = overrides.sourceStore ?? testSourceStore();
  const retention = overrides.retention ?? testRetention();
  const accounts = new FinancialAccountsCanonicalAccountAdapter(accountsRepository(handle));
  const dedup = new PrismaCanonicalDedupLookupReader(handle);
  const fingerprints = testDedupFingerprints();
  const ids = new Uuidv7IdSource();
  const outbox =
    overrides.outbox ??
    new PlatformOutboxStatementImportRecorder(syntheticEventCatalogue(), clock, 'karar-tests');

  return {
    start: new StartStatementImport(
      repository,
      accounts,
      // Never names a connection here; the fixture refuses every id, so this
      // wiring cannot make the gate pass by accident.
      testNoConnections(),
      retention,
      ids,
      clock,
    ),
    store: new StoreImportSource(
      repository,
      sourceStore,
      testFileFingerprints(),
      retention,
      ids,
      clock,
    ),
    parse: new ParseStatementSource(
      repository,
      sourceStore,
      new StreamingCsvParser(),
      accounts,
      fingerprints,
      dedup,
      ids,
      clock,
    ),
    preview: new PreviewStatementImport(repository),
    reject: new RejectStatementImport(repository, clock),
    commit: new CommitStatementImport(
      repository,
      new PrismaStatementCommitUnitOfWork(
        handle,
        new TransactionsCanonicalNarrativeAdapter(testTransactionsEncryption()),
        // The canonical rows are written by the module that owns them, on the
        // transaction this unit of work opens. Wired here exactly as a
        // composition root would wire it.
        new PrismaStatementCommitWriter(),
        outbox,
        // And the source link's freshness by the module that owns THAT table,
        // on the same transaction. Passed explicitly even though it is the
        // constructor's default, so this wiring says what a deployment writes
        // rather than leaving one of the three writers implied.
        new PrismaSourceObservationWriter(),
      ),
      accounts,
      sourceStore,
      dedup,
      new TransactionsDeterministicCategoryAdapter(
        new MerchantRuleEvaluator(new PrismaMerchantRuleDirectory(handle)),
      ),
      retention,
      ids,
      clock,
    ),
    erase: new EraseStatementImport(repository, sourceStore, clock),
    sourceStore,
  };
}

/** A retention provider that refuses, with known provenance. */
const REFUSING_RETENTION: StatementRetentionDecisionPort = {
  decideFor: (_actor, dataset): Promise<StatementRetentionDecision> =>
    Promise.resolve({
      state: 'PENDING_LEGAL_REVIEW',
      dataset,
      reason: 'the financial-data retention decision is with legal review',
      packVersion: `synthetic-local/${SYNTHETIC_RETENTION_MARKER}`,
    }),
};

describe.skipIf(unreachable !== null)('statement-imports pipeline', () => {
  let handle: PrismaHandle;
  let accountId: string;
  const clock = fixedClock();

  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    accountId = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account One', clock);
  }, 180_000);

  afterAll(async () => {
    await handle?.end();
    await dropDatabase(database);
  }, 60_000);

  describe('retention decides before the first durable source byte', () => {
    it('leaves ZERO rows anywhere when the decision is refused', async () => {
      const before = await counts();
      const refusing = wire(handle, clock, { retention: REFUSING_RETENTION });

      const started = await refusing.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(false);
      if (started.ok) return;
      expect(started.error.kind).toBe('retention_unresolved');

      // Counted as the bootstrap superuser with RLS BYPASSED. Counting as
      // karar_app would prove the rows are hidden, not that they are absent.
      const after = await counts();
      expect(after).toEqual(before);
      // And the store was never reached: no ciphertext exists either.
      expect(refusing.sourceStore.storedObjectCount).toBe(0);
    });

    it('carries the decision itself outward, not a rephrasing of it', async () => {
      const refusing = wire(handle, clock, { retention: REFUSING_RETENTION });
      const started = await refusing.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(false);
      if (started.ok) return;
      if (started.error.kind !== 'retention_unresolved') return;
      // An operator needs to know whether the answer was "legal has not ruled"
      // or "we could not ask": those have different remedies.
      expect(started.error.decision.state).toBe('PENDING_LEGAL_REVIEW');
      expect(started.error.dataset).toBe('statement_import_source');
    });
  });

  describe('the happy path', () => {
    it('runs source -> parse -> preview -> commit, and only the commit writes records', async () => {
      const pipeline = wire(handle, clock);

      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const importId = started.value.id;
      expect(started.value.state).toBe('DRAFT');
      expect(started.value.retention.state).toBe('DECIDED');

      const stored = await pipeline.store.execute(
        {
          importId,
          content: streamOf(bytesOf(STATEMENT)),
          mediaType: 'text/csv',
          maxBytes: LIMITS.maxBytes,
        },
        ACTOR_A1,
      );
      expect(stored.ok).toBe(true);
      if (!stored.ok) return;
      expect(stored.value.state).toBe('SOURCE_STORED');

      const ledgerBeforeParse = await counts();

      const parsed = await pipeline.parse.execute({ importId, mapping: MAPPING, limits: LIMITS }, ACTOR_A1);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.state).toBe('REVIEW_REQUIRED');
      expect(parsed.value.counts.rowCount).toBe(3);
      expect(parsed.value.counts.validRowCount).toBe(2);
      expect(parsed.value.counts.invalidRowCount).toBe(1);

      // PARSING NEVER WRITES A FINANCIAL RECORD.
      const ledgerAfterParse = await counts();
      expect(ledgerAfterParse.transactions).toBe(ledgerBeforeParse.transactions);
      expect(ledgerAfterParse.revisions).toBe(ledgerBeforeParse.revisions);
      expect(ledgerAfterParse.provenance).toBe(ledgerBeforeParse.provenance);

      const preview = await pipeline.preview.execute({ importId, limits: LIMITS }, ACTOR_A1);
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      expect(preview.value.awaitsDecision).toBe(true);
      expect(preview.value.counts.invalidRowCount).toBe(1);
      expect(preview.value.rowErrors).toHaveLength(1);
      expect(preview.value.rowErrors[0]).toEqual({
        rowNumber: 3,
        safeField: 'AMOUNT',
        reasonCode: 'UNREADABLE_AMOUNT',
      });
      // The preview exposes NO value read out of the file.
      const rendered = JSON.stringify(preview.value);
      expect(rendered).not.toContain('SYNTHETIC MERCHANT');
      expect(rendered).not.toContain('not-a-number');
      expect(rendered).not.toContain('120.50');
      expect(rendered).not.toContain('local-src-');

      const committed = await pipeline.commit.execute(
        { importId, expectedVersion: parsed.value.version },
        ACTOR_A1,
      );
      expect(committed.ok).toBe(true);
      if (!committed.ok) return;
      expect(committed.value.committedTransactionCount).toBe(2);
      expect(committed.value.alreadyCommitted).toBe(false);

      const after = await counts();
      expect(after.transactions).toBe(ledgerAfterParse.transactions + 2);
      expect(after.revisions).toBe(ledgerAfterParse.revisions + 2);
      expect(after.provenance).toBe(ledgerAfterParse.provenance + 2);
      expect(after.outbox).toBe(ledgerAfterParse.outbox + 1);
    }, 60_000);

    it('records provenance naming this import and its row, with all four versions', async () => {
      const provenance = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{
          source_kind: string;
          import_ref: string;
          row_ref: string;
          parser_version: string;
          mapping_version: string;
          normalization_version: string;
          fingerprint_version: string;
          direction_mapping: string;
        }>(
          `SELECT source_kind, import_ref, row_ref, parser_version, mapping_version,
                  normalization_version, fingerprint_version, direction_mapping
             FROM public.transaction_provenance ORDER BY row_ref`,
        ),
      );
      expect(provenance.rows).toHaveLength(2);
      for (const row of provenance.rows) {
        expect(row.source_kind).toBe('CSV');
        expect(row.import_ref).not.toBe('');
        expect(row.parser_version).toContain('statement-csv');
        expect(row.mapping_version).toContain('statement-csv');
        expect(row.normalization_version).toContain('statement-csv');
        expect(row.fingerprint_version).not.toBe('');
        expect(row.direction_mapping).toBe('SOURCE_SIGNED_AMOUNT');
      }
      expect(provenance.rows.map((row) => row.row_ref)).toEqual(['1', '2']);
    });

    it('signs the amounts under the canonical convention', async () => {
      const amounts = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ amount_minor: string; booking_date: Date }>(
          `SELECT amount_minor, booking_date FROM public.transactions ORDER BY booking_date`,
        ),
      );
      expect(amounts.rows.map((row) => row.amount_minor)).toEqual(['-4500', '12050']);
    });

    it('enqueues an outbox notice carrying two identifiers and nothing else', async () => {
      const events = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ event_name: string; envelope: { payload: Record<string, unknown> } }>(
          `SELECT event_name, envelope FROM platform.outbox_events ORDER BY created_at DESC LIMIT 1`,
        ),
      );
      const envelope = events.rows[0];
      expect(envelope?.event_name).toBe('statement_import.committed');
      // Not even a count: the platform treats `identifier-only` as literally
      // identifiers, and a count is a fact about a person's spending volume.
      expect(Object.keys(envelope?.envelope.payload ?? {}).sort()).toEqual([
        'accountId',
        'importId',
      ]);
      // No merchant, no amount, no currency, no date, no narrative.
      expect(JSON.stringify(envelope?.envelope.payload)).not.toContain('SYNTHETIC');
    });
  });

  describe('a field the database bounds more tightly than the domain once did', () => {
    it('refuses the row and parses the rest, instead of failing the whole import', async () => {
      // The instrument mask column is bounded at 32 bytes in SQL so it cannot
      // become storage for a full card number. Parsing WRITES the rows it
      // read, so before the domain enforced that bound too, one over-long
      // cell reached PostgreSQL and ended the entire parse as an untyped
      // store failure — the other rows, which were fine, were lost with it.
      const pipeline = wire(handle, clock);

      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const importId = started.value.id;

      const csv = [
        'Booking Date,Description,Amount,Card',
        // Values no other test in this file commits, so the good row counts
        // as valid rather than as a duplicate of an earlier import.
        '2026-09-03,SYNTHETIC MERCHANT FOUR,-77.25,****4321',
        `2026-09-04,SYNTHETIC MERCHANT FIVE,31.75,${'9'.repeat(33)}`,
        '',
      ].join('\n');

      const stored = await pipeline.store.execute(
        {
          importId,
          content: streamOf(bytesOf(csv)),
          mediaType: 'text/csv',
          maxBytes: LIMITS.maxBytes,
        },
        ACTOR_A1,
      );
      expect(stored.ok).toBe(true);
      if (!stored.ok) return;

      const parsed = await pipeline.parse.execute(
        { importId, mapping: { ...MAPPING, instrumentMaskColumn: 3 }, limits: LIMITS },
        ACTOR_A1,
      );

      // The import is alive and awaiting a decision — not a store failure.
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.state).toBe('REVIEW_REQUIRED');
      expect(parsed.value.counts.rowCount).toBe(2);
      expect(parsed.value.counts.validRowCount).toBe(1);
      expect(parsed.value.counts.invalidRowCount).toBe(1);
      expect(parsed.value.counts.exactDuplicateCount).toBe(0);

      const preview = await pipeline.preview.execute({ importId, limits: LIMITS }, ACTOR_A1);
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      expect(preview.value.rowErrors).toEqual([
        { rowNumber: 2, safeField: 'INSTRUMENT_MASK', reasonCode: 'FIELD_TOO_LARGE' },
      ]);

      // And the refusal names the field without quoting what was in it.
      expect(JSON.stringify(preview.value)).not.toContain('9999');
    });
  });

  describe('the commit is idempotent', () => {
    it('answers a retry with the same result and writes nothing a second time', async () => {
      const pipeline = wire(handle, clock);
      const before = await counts();

      // Find the committed import and retry it, exactly as a caller that never
      // saw the first response would.
      const committedImport = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ id: string; version: number }>(
          `SELECT id, version FROM public.statement_imports WHERE state = 'COMMITTED' LIMIT 1`,
        ),
      );
      const target = committedImport.rows[0];
      expect(target).toBeDefined();
      if (target === undefined) return;

      const retry = await pipeline.commit.execute(
        { importId: target.id, expectedVersion: target.version },
        ACTOR_A1,
      );
      expect(retry.ok).toBe(true);
      if (!retry.ok) return;
      expect(retry.value.alreadyCommitted).toBe(true);
      expect(retry.value.committedTransactionCount).toBe(2);
      expect(retry.value.transactionIds).toHaveLength(2);

      const after = await counts();
      expect(after).toEqual(before);
    }, 60_000);
  });

  describe('the same file, imported twice', () => {
    it('lands in DUPLICATE rather than being refused as a write', async () => {
      const pipeline = wire(handle, clock);
      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;

      const stored = await pipeline.store.execute(
        {
          importId: started.value.id,
          content: streamOf(bytesOf(STATEMENT)),
          mediaType: 'text/csv',
          maxBytes: LIMITS.maxBytes,
        },
        ACTOR_A1,
      );
      expect(stored.ok).toBe(true);
      if (!stored.ok) return;
      // A REVIEW outcome a person can see and act on, not an error.
      expect(stored.value.state).toBe('DUPLICATE');
      expect(stored.value.refusalCode).toBe('SOURCE_ALREADY_IMPORTED');
    }, 60_000);
  });

  describe('the commit is atomic', () => {
    it('leaves NO SUBSET when the outbox refuses inside the transaction', async () => {
      // A refusal at the LAST step but one, so every earlier write in the
      // transaction has already happened when it fires. If the transaction is
      // not really one transaction, this is where it shows.
      const failing: StatementImportOutboxPort = {
        record: () => Promise.reject(new Error('synthetic outbox failure')),
      };
      // ONE store instance across both halves of this test: the LOCAL adapter
      // keeps ciphertext in process memory, so a second instance would have
      // nothing to verify and the retry would fail on integrity rather than
      // on the property under test. A deployment binds one store.
      const sourceStore = testSourceStore();
      const pipeline = wire(handle, clock, { outbox: failing, sourceStore });

      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const importId = started.value.id;

      const stored = await pipeline.store.execute(
        {
          importId,
          // A DIFFERENT statement, so file-duplicate detection does not fire.
          // Every line distinct from the committed statement, so both valid
          // rows are genuinely new content rather than duplicates.
          content: streamOf(
            bytesOf(
              STATEMENT.replace('ONE', 'FOUR')
                .replace('-45.00', '-46.00')
                .replace('TWO', 'FIVE')
                .replace('120.50', '121.50'),
            ),
          ),
          mediaType: 'text/csv',
          maxBytes: LIMITS.maxBytes,
        },
        ACTOR_A1,
      );
      expect(stored.ok && stored.value.state).toBe('SOURCE_STORED');

      const parsed = await pipeline.parse.execute({ importId, mapping: MAPPING, limits: LIMITS }, ACTOR_A1);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const before = await counts();
      const committed = await pipeline.commit.execute(
        { importId, expectedVersion: parsed.value.version },
        ACTOR_A1,
      );
      expect(committed.ok).toBe(false);
      if (committed.ok) return;
      expect(committed.error.kind).toBe('commit_failed');

      // NO SUBSET: not one transaction, revision, provenance row, outbox row,
      // or row link, and the import is still exactly where it was.
      const after = await counts();
      expect(after).toEqual(before);

      const state = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ state: string; committed_transaction_count: number }>(
          `SELECT state, committed_transaction_count FROM public.statement_imports WHERE id = $1`,
          [importId],
        ),
      );
      expect(state.rows[0]?.state).toBe('REVIEW_REQUIRED');
      expect(state.rows[0]?.committed_transaction_count).toBe(0);

      const links = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ count: string }>(
          `SELECT count(*) FROM public.statement_import_rows
            WHERE import_id = $1 AND committed_transaction_id IS NOT NULL`,
          [importId],
        ),
      );
      expect(Number(links.rows[0]?.count)).toBe(0);

      // AND THE RETRY IS SAFE. The same import, the same version — because
      // nothing moved — committed through a pipeline whose outbox works. If
      // the failed attempt had left any subset behind, this is where it would
      // surface: as a duplicate refusal, or as a version conflict.
      const working = wire(handle, clock, { sourceStore });
      const retried = await working.commit.execute(
        { importId, expectedVersion: parsed.value.version },
        ACTOR_A1,
      );
      expect(retried.ok).toBe(true);
      if (!retried.ok) return;
      expect(retried.value.committedTransactionCount).toBe(2);
      expect(retried.value.alreadyCommitted).toBe(false);
    }, 60_000);
  });

  describe('rejection and erasure', () => {
    it('rejects without deleting, so the person can see what was refused', async () => {
      const pipeline = wire(handle, clock);
      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;

      const rejected = await pipeline.reject.execute({ importId: started.value.id }, ACTOR_A1);
      expect(rejected.ok).toBe(true);
      if (!rejected.ok) return;
      expect(rejected.value.state).toBe('REJECTED');
      expect(rejected.value.refusalCode).toBeNull();

      const still = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ count: string }>(
          `SELECT count(*) FROM public.statement_imports WHERE id = $1`,
          [started.value.id],
        ),
      );
      expect(Number(still.rows[0]?.count)).toBe(1);
    }, 60_000);

    it('erases the stored object AND the rows, and leaves the transactions alone', async () => {
      const sourceStore = testSourceStore();
      const pipeline = wire(handle, clock, { sourceStore });
      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const importId = started.value.id;

      await pipeline.store.execute(
        {
          importId,
          content: streamOf(bytesOf(STATEMENT.replace('ONE', 'SIX').replace('-45.00', '-47.00'))),
          mediaType: 'text/csv',
          maxBytes: LIMITS.maxBytes,
        },
        ACTOR_A1,
      );
      expect(sourceStore.storedObjectCount).toBe(1);
      await pipeline.parse.execute({ importId, mapping: MAPPING, limits: LIMITS }, ACTOR_A1);

      const transactionsBefore = (await counts()).transactions;

      const erased = await pipeline.erase.execute({ importId }, ACTOR_A1);
      expect(erased.ok).toBe(true);
      if (!erased.ok) return;
      expect(erased.value.storedObjectDeleted).toBe(true);
      expect(erased.value.rowsDeleted).toBe(true);
      // The ciphertext is gone too — a cascade cannot reach a byte the
      // database does not hold.
      expect(sourceStore.storedObjectCount).toBe(0);

      const remaining = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ imports: string; rows: string; errors: string; sources: string }>(
          `SELECT (SELECT count(*) FROM public.statement_imports WHERE id = $1) AS imports,
                  (SELECT count(*) FROM public.statement_import_rows WHERE import_id = $1) AS rows,
                  (SELECT count(*) FROM public.statement_import_row_errors WHERE import_id = $1) AS errors,
                  (SELECT count(*) FROM public.statement_import_sources WHERE import_id = $1) AS sources`,
          [importId],
        ),
      );
      expect(remaining.rows[0]).toEqual({ imports: '0', rows: '0', errors: '0', sources: '0' });
      // The financial records a committed import produced survive the file.
      expect((await counts()).transactions).toBe(transactionsBefore);
    }, 60_000);
  });

  describe('deduplication reuses the transactions module’s fingerprint', () => {
    it('stages an already-recorded line as EXACT_DUPLICATE rather than committing it twice', async () => {
      const pipeline = wire(handle, clock);
      const started = await pipeline.start.execute({ accountId }, ACTOR_A1);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const importId = started.value.id;

      // The SAME two lines as the first committed statement, in a file with a
      // different byte sequence so the file-duplicate check does not fire
      // first. The content identity is what must be recognised.
      const restated = [
        'Booking Date,Description,Amount',
        '2026-08-10,SYNTHETIC MERCHANT ONE,-45.00',
        '2026-08-11,SYNTHETIC MERCHANT TWO,120.50',
        '',
      ].join('\n');
      await pipeline.store.execute(
        {
          importId,
          content: streamOf(bytesOf(restated)),
          mediaType: 'text/csv',
          maxBytes: LIMITS.maxBytes,
        },
        ACTOR_A1,
      );
      const parsed = await pipeline.parse.execute({ importId, mapping: MAPPING, limits: LIMITS }, ACTOR_A1);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.counts.exactDuplicateCount).toBe(2);
      expect(parsed.value.counts.validRowCount).toBe(0);

      const before = await counts();
      const committed = await pipeline.commit.execute(
        { importId, expectedVersion: parsed.value.version },
        ACTOR_A1,
      );
      expect(committed.ok).toBe(true);
      if (!committed.ok) return;
      expect(committed.value.committedTransactionCount).toBe(0);
      expect((await counts()).transactions).toBe(before.transactions);
    }, 60_000);
  });
});
