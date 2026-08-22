/**
 * The boundary this module closed: **nothing here writes a table another
 * module owns.**
 *
 * It closed in two moves, and both were debts recorded honestly before they
 * were paid. The canonical transactions, their revisions, their provenance and
 * their category assignments used to be written from this module's own commit
 * writer; the source link's freshness observation used to be an `updateMany`
 * against `public.account_source_links` from the same file, which this suite
 * NAMED as an exception rather than failing on. Both were there for one
 * reason — a commit spanning two database transactions is not atomic — and
 * both are now written by the module that owns the rows, on the transaction
 * `PrismaStatementCommitUnitOfWork` opens here:
 *
 *   `public.transactions`, `..._revisions`, `..._provenance`,
 *   `..._category_assignments`   `modules/transactions`, through
 *       `PrismaStatementCommitWriter` / `ImportedRecordCommitPort`.
 *   `public.account_source_links`   `modules/financial-connections`, through
 *       `PrismaSourceObservationWriter` / `SourceObservationWriterPort`.
 *
 * One unit of work, three modules, each writing only its own rows.
 *
 * A comment saying so would not survive the next person in a hurry, so this
 * scans the module's own source instead. It reads the five table names and the
 * five Prisma delegates that stand for them, and fails on any statement that
 * would WRITE one. **There is no exception list, and adding one is the thing
 * this file exists to make impossible** — a boundary with a named exception is
 * a boundary that moves every time somebody is in a hurry.
 *
 * **Reads are not violations and are not looked for.** `PrismaCanonicalDedupLookupReader`
 * selects from `public.transactions` on purpose: this module reuses the
 * transactions module's canonical fingerprint rather than inventing a second
 * definition of "the same transaction", and asking that table what it already
 * holds is how a duplicate line is recognised before anything is committed.
 * What must not exist is a write.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every table this module may not write, and who owns it: the four migrations
 * 0090, 0091 and 0093 create for `modules/transactions`, and the one migration
 * 0097 creates for `modules/financial-connections`.
 */
const FOREIGN_TABLES = [
  'transactions',
  'transaction_revisions',
  'transaction_provenance',
  'transaction_category_assignments',
  'account_source_links',
] as const;

/** The Prisma delegates that stand for the same five tables. */
const FOREIGN_DELEGATES = [
  'transaction',
  'transactionRevision',
  'transactionProvenance',
  'transactionCategoryAssignment',
  'accountSourceLink',
] as const;

const WRITE_METHODS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
] as const;

const RAW_SQL_WRITE = new RegExp(
  String.raw`\b(insert\s+into|update|delete\s+from)\s+(public\.)?(${FOREIGN_TABLES.join('|')})\b`,
  'i',
);

const PRISMA_WRITE = new RegExp(
  String.raw`\.\s*(${FOREIGN_DELEGATES.join('|')})\s*\.\s*(${WRITE_METHODS.join('|')})\s*\(`,
);

/**
 * Source with comments removed.
 *
 * The names above appear all over this module's PROSE — the ports explain at
 * length which tables they do not touch — so a scan over raw text would either
 * fail on documentation or be written loosely enough to miss real code. The
 * check is about statements, so the comments go first.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every production TypeScript file in this module: no tests, no build output. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'dist' || entry === 'node_modules' || entry === '__tests__') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

describe('this module writes only its own tables', () => {
  const files = sourceFiles(MODULE_ROOT);

  it('scans a real module rather than passing vacuously', () => {
    // The scan is only worth what it covers: if the file list were ever empty
    // — a moved directory, a renamed layer — every assertion below would pass
    // while proving nothing.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.includes(path.join('infrastructure', 'persistence')))).toBe(
      true,
    );
  });

  it.each(FOREIGN_TABLES)('issues no raw SQL that writes public.%s', (table) => {
    const pattern = new RegExp(
      String.raw`\b(insert\s+into|update|delete\s+from)\s+(public\.)?${table}\b`,
      'i',
    );
    const offenders = files.filter((file) => pattern.test(code(file)));
    expect(offenders.map((file) => path.relative(MODULE_ROOT, file))).toEqual([]);
  });

  it.each(FOREIGN_DELEGATES)('calls no write method on the %s delegate', (delegate) => {
    const pattern = new RegExp(
      String.raw`\.\s*${delegate}\s*\.\s*(${WRITE_METHODS.join('|')})\s*\(`,
    );
    const offenders = files.filter((file) => pattern.test(code(file)));
    expect(offenders.map((file) => path.relative(MODULE_ROOT, file))).toEqual([]);
  });

  it('would catch a violation reintroduced in either form, on the tables of either owner', () => {
    // The scan proving itself. Both shapes each retired writer used are
    // checked against synthetic source, so a future edit that loosens a
    // pattern fails here rather than passing quietly over a real write.
    const rawWrite = "await tx.$executeRaw`INSERT INTO public.transaction_revisions (id) VALUES (1)`;";
    const prismaWrite = 'await tx.transaction.create({ data: { id } });';
    expect(RAW_SQL_WRITE.test(rawWrite)).toBe(true);
    expect(PRISMA_WRITE.test(prismaWrite)).toBe(true);
    // And the exact two shapes the source-link freshness write used to have,
    // which this suite once named as an exception instead of failing on.
    const rawLinkWrite =
      'await tx.$executeRaw`UPDATE public.account_source_links SET last_observed_at = now()`;';
    const prismaLinkWrite = 'await tx.accountSourceLink.updateMany({ where, data });';
    expect(RAW_SQL_WRITE.test(rawLinkWrite)).toBe(true);
    expect(PRISMA_WRITE.test(prismaLinkWrite)).toBe(true);
    // And that none of it fires on the reads this module legitimately makes.
    expect(PRISMA_WRITE.test('await tx.transaction.findMany({ where });')).toBe(false);
    expect(PRISMA_WRITE.test('await tx.accountSourceLink.findFirst({ where });')).toBe(false);
    expect(RAW_SQL_WRITE.test('SELECT 1 FROM public.transactions WHERE id = $1')).toBe(false);
    expect(RAW_SQL_WRITE.test('SELECT 1 FROM public.account_source_links WHERE id = $1')).toBe(
      false,
    );
  });

  it('names the modules that own those tables as dependencies, not the reverse', () => {
    // The direction that makes both moves legal: this module may import
    // `@karar/transactions` and `@karar/financial-connections` through their
    // package roots; neither imports anything from here, so none of the three
    // can form a cycle.
    const manifest = JSON.parse(readFileSync(path.join(MODULE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.['@karar/transactions']).toBeDefined();
    expect(manifest.dependencies?.['@karar/financial-connections']).toBeDefined();

    for (const owner of ['transactions', 'financial-connections']) {
      const ownerRoot = path.resolve(MODULE_ROOT, '..', owner);
      const importsThisModule = sourceFiles(ownerRoot).filter((file) =>
        /@karar\/statement-imports/.test(code(file)),
      );
      expect(importsThisModule.map((file) => path.relative(ownerRoot, file))).toEqual([]);
    }
  });
});
