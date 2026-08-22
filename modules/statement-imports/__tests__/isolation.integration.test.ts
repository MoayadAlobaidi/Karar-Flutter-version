/**
 * The adversarial isolation suite: a subject's statement, staged rows and row
 * errors are reachable by that subject and by nobody else.
 *
 * Every probe runs as `karar_app` — the role the application actually runs as
 * — because that is the only role whose confinement means anything. A test
 * that proved isolation as a superuser would be proving that RLS is bypassed
 * for superusers, which nobody doubted.
 *
 * **The same-tenant pair is the important one.** Two people in one household
 * tenant are two subjects whose imports sit in the same four tables, and a
 * tenant-only policy would pass every cross-tenant assertion here and still
 * let one of them read the other's bank statement.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ParseStatementSource } from '../application/use-cases/parse-statement-source.js';
import { PreviewStatementImport } from '../application/use-cases/preview-statement-import.js';
import { StartStatementImport } from '../application/use-cases/start-statement-import.js';
import { StoreImportSource } from '../application/use-cases/store-import-source.js';
import type { StatementColumnMapping } from '../domain/column-mapping.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { StreamingCsvParser } from '../infrastructure/parsing/streaming-csv-parser.js';
import { PrismaCanonicalDedupLookupReader } from '../infrastructure/persistence/prisma-canonical-dedup-lookup.js';
import { PrismaStatementImportRepository } from '../infrastructure/persistence/prisma-statement-import-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  ACTOR_B1,
  accountsRepository,
  asApp,
  buildHandle,
  bytesOf,
  dropDatabase,
  fixedClock,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  streamOf,
  superuserMaintenanceProfile,
  testDedupFingerprints,
  testEncryption,
  testFileFingerprints,
  testNoConnections,
  testRetention,
  testSourceStore,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'STATEMENT-IMPORTS ISOLATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_imports_isolation`;
const LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

const STATEMENT = [
  'Booking Date,Description,Amount',
  '2026-08-10,SYNTHETIC MERCHANT ALPHA,-45.00',
  '2026-08-11,SYNTHETIC MERCHANT BETA,unreadable',
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

describe.skipIf(unreachable !== null)('statement-imports isolation', () => {
  let handle: PrismaHandle;
  let repository: PrismaStatementImportRepository;
  let preview: PreviewStatementImport;
  let victimImportId: string;
  const clock = fixedClock();

  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    repository = new PrismaStatementImportRepository(handle, testEncryption());
    preview = new PreviewStatementImport(repository);

    const accounts = new FinancialAccountsCanonicalAccountAdapter(accountsRepository(handle));
    const sourceStore = testSourceStore();
    const ids = new Uuidv7IdSource();
    const accountId = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account A1', clock);

    const start = new StartStatementImport(
      repository,
      accounts,
      // This suite never names a connection; the fixture REFUSES every id, so a
      // future edit that starts naming one fails here instead of passing
      // against a stub that says yes.
      testNoConnections(),
      testRetention(),
      ids,
      clock,
    );
    const store = new StoreImportSource(
      repository,
      sourceStore,
      testFileFingerprints(),
      testRetention(),
      ids,
      clock,
    );
    const parse = new ParseStatementSource(
      repository,
      sourceStore,
      new StreamingCsvParser(),
      accounts,
      testDedupFingerprints(),
      new PrismaCanonicalDedupLookupReader(handle),
      ids,
      clock,
    );

    const started = await start.execute({ accountId }, ACTOR_A1);
    if (!started.ok) throw new Error(`fixture could not start an import: ${started.error.kind}`);
    victimImportId = started.value.id;
    await store.execute(
      {
        importId: victimImportId,
        content: streamOf(bytesOf(STATEMENT)),
        mediaType: 'text/csv',
        maxBytes: LIMITS.maxBytes,
      },
      ACTOR_A1,
    );
    await parse.execute({ importId: victimImportId, mapping: MAPPING, limits: LIMITS }, ACTOR_A1);
  }, 180_000);

  afterAll(async () => {
    await handle?.end();
    await dropDatabase(database);
  }, 60_000);

  it('the owner reads their own import, its rows and its errors', async () => {
    const own = await preview.execute({ importId: victimImportId, limits: LIMITS }, ACTOR_A1);
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    expect(own.value.counts.validRowCount).toBe(1);
    expect(own.value.counts.invalidRowCount).toBe(1);
    expect(own.value.totalErrorCount).toBe(1);
  });

  it('ANOTHER USER IN THE SAME TENANT cannot see it', async () => {
    // The case a tenant-only policy would miss entirely.
    const other = await preview.execute({ importId: victimImportId, limits: LIMITS }, ACTOR_A2);
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error.kind).toBe('import_not_found');
  });

  it('a user in ANOTHER TENANT cannot see it', async () => {
    const other = await preview.execute({ importId: victimImportId, limits: LIMITS }, ACTOR_B1);
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error.kind).toBe('import_not_found');
  });

  it('answers both denials identically, so a guessed id is not a membership test', async () => {
    const absent = await preview.execute(
      { importId: '99999999-0000-4000-8000-000000000099', limits: LIMITS },
      ACTOR_A1,
    );
    const foreign = await preview.execute({ importId: victimImportId, limits: LIMITS }, ACTOR_A2);
    expect(absent.ok).toBe(false);
    expect(foreign.ok).toBe(false);
    if (absent.ok || foreign.ok) return;
    // Identical kind AND identical message: anything else tells the guesser
    // that the import is real and whose it is.
    expect(foreign.error.kind).toBe(absent.error.kind);
    expect((foreign.error as { message: string }).message).toBe(
      (absent.error as { message: string }).message,
    );
  });

  describe('raw SQL as karar_app, which is the only probe that proves anything', () => {
    const rowsVisibleTo = async (actor: {
      tenantId: string;
      userId: string;
    }): Promise<Record<string, number>> => {
      const result = await asApp(
        database,
        { tenantId: actor.tenantId, userId: actor.userId },
        (tx) =>
          tx.query<Record<string, string>>(
            `SELECT (SELECT count(*) FROM public.statement_imports) AS imports,
                    (SELECT count(*) FROM public.statement_import_sources) AS sources,
                    (SELECT count(*) FROM public.statement_import_rows) AS rows,
                    (SELECT count(*) FROM public.statement_import_row_errors) AS row_errors`,
          ),
      );
      const row = result.rows[0] ?? {};
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    };

    it('shows the owner every row of their own import', async () => {
      const visible = await rowsVisibleTo({
        tenantId: TenantId.toString(ACTOR_A1.tenantId),
        userId: UserId.toString(ACTOR_A1.userId),
      });
      expect(visible.imports).toBe(1);
      expect(visible.sources).toBe(1);
      expect(visible.rows).toBe(2);
      expect(visible.row_errors).toBe(1);
    });

    it.each([
      ['the same tenant, another user', ACTOR_A2],
      ['another tenant', ACTOR_B1],
    ])('shows NOTHING to %s', async (_label, actor) => {
      const visible = await rowsVisibleTo({
        tenantId: TenantId.toString(actor.tenantId),
        userId: UserId.toString(actor.userId),
      });
      expect(visible).toEqual({ imports: 0, sources: 0, rows: 0, row_errors: 0 });
    });

    it('shows NOTHING with no principal context bound at all', async () => {
      // NULLIF makes an unset GUC a NULL predicate: no context, no rows.
      const visible = await rowsVisibleTo({ tenantId: '', userId: '' });
      expect(visible).toEqual({ imports: 0, sources: 0, rows: 0, row_errors: 0 });
    });

    it('lets NOBODY ELSE update or delete the owner’s rows', async () => {
      const affected = await asApp(
        database,
        {
          tenantId: TenantId.toString(ACTOR_A2.tenantId),
          userId: UserId.toString(ACTOR_A2.userId),
        },
        async (tx) => {
          const updated = await tx.query(
            `UPDATE public.statement_import_rows SET row_state = 'SKIPPED', updated_at = now()`,
          );
          const deleted = await tx.query(`DELETE FROM public.statement_imports`);
          return { updated: updated.rowCount ?? 0, deleted: deleted.rowCount ?? 0 };
        },
      );
      // Not an error — RLS makes the rows invisible, so the statements affect
      // nothing. That is the correct outcome: a refusal would confirm the rows
      // exist.
      expect(affected).toEqual({ updated: 0, deleted: 0 });

      const stillThere = await rowsVisibleTo({
        tenantId: TenantId.toString(ACTOR_A1.tenantId),
        userId: UserId.toString(ACTOR_A1.userId),
      });
      expect(stillThere.imports).toBe(1);
      expect(stillThere.rows).toBe(2);
    });

    it('lets NOBODY ELSE insert a row into the owner’s import', async () => {
      // The WITH CHECK arm: writing somebody else's tenant/user into a row is
      // refused rather than accepted and then hidden.
      let refused = false;
      try {
        await asApp(
          database,
          {
            tenantId: TenantId.toString(ACTOR_A2.tenantId),
            userId: UserId.toString(ACTOR_A2.userId),
          },
          (tx) =>
            tx.query(
              `INSERT INTO public.statement_import_rows
                 (id, tenant_id, user_id, import_id, row_number, row_state, updated_at)
               VALUES ('88888888-0000-4000-8000-000000000088', $1, $2, $3, 99, 'INVALID', now())`,
              [
                TenantId.toString(ACTOR_A1.tenantId),
                UserId.toString(ACTOR_A1.userId),
                victimImportId,
              ],
            ),
        );
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
    });
  });

  it('never returns a decrypted narrative or a fingerprint through a read path', async () => {
    const rows = await repository.listRows(ACTOR_A1, victimImportId as never);
    const valid = rows.find((row) => row.rowState === 'VALID');
    expect(valid).toBeDefined();
    // The repository DOES decrypt for its own callers — that is its job. What
    // must never happen is the narrative reaching a client, and the only read
    // path that faces one is the preview.
    expect(valid?.description).not.toBeNull();

    const view = await preview.execute({ importId: victimImportId, limits: LIMITS }, ACTOR_A1);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const rendered = JSON.stringify(view.value);
    expect(rendered).not.toContain('SYNTHETIC MERCHANT');
    expect(rendered).not.toContain('unreadable');
    expect(rendered).not.toContain(valid?.stagedRowFingerprint ?? 'IMPOSSIBLE');
  });
});
