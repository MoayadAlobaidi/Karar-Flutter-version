/**
 * The boundary this module closed: **nothing here writes a table
 * `modules/transactions` owns.**
 *
 * The canonical transactions, their revisions, their provenance and their
 * category assignments used to be written from this module's own commit
 * writer. It was atomicity that put them here — a commit spanning two
 * database transactions is not atomic — and it was recorded as debt rather
 * than left to be discovered. The writer now lives in `modules/transactions`
 * as `PrismaStatementCommitWriter`, satisfying `ImportedRecordCommitPort`
 * that module declares, and it JOINS the transaction
 * `PrismaStatementCommitUnitOfWork` opens here. One unit of work, two
 * modules, each writing only its own rows.
 *
 * A comment saying so would not survive the next person in a hurry, so this
 * scans the module's own source instead. It reads the four table names and the
 * four Prisma delegates that stand for them, and fails on any statement that
 * would WRITE one.
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

/** The four tables migrations 0090, 0091 and 0093 create for that module. */
const OWNED_TABLES = [
  'transactions',
  'transaction_revisions',
  'transaction_provenance',
  'transaction_category_assignments',
] as const;

/** The Prisma delegates that stand for the same four tables. */
const OWNED_DELEGATES = [
  'transaction',
  'transactionRevision',
  'transactionProvenance',
  'transactionCategoryAssignment',
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
  String.raw`\b(insert\s+into|update|delete\s+from)\s+(public\.)?(${OWNED_TABLES.join('|')})\b`,
  'i',
);

const PRISMA_WRITE = new RegExp(
  String.raw`\.\s*(${OWNED_DELEGATES.join('|')})\s*\.\s*(${WRITE_METHODS.join('|')})\s*\(`,
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

describe('this module writes no table modules/transactions owns', () => {
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

  it.each(OWNED_TABLES)('issues no raw SQL that writes public.%s', (table) => {
    const pattern = new RegExp(
      String.raw`\b(insert\s+into|update|delete\s+from)\s+(public\.)?${table}\b`,
      'i',
    );
    const offenders = files.filter((file) => pattern.test(code(file)));
    expect(offenders.map((file) => path.relative(MODULE_ROOT, file))).toEqual([]);
  });

  it.each(OWNED_DELEGATES)('calls no write method on the %s delegate', (delegate) => {
    const pattern = new RegExp(
      String.raw`\.\s*${delegate}\s*\.\s*(${WRITE_METHODS.join('|')})\s*\(`,
    );
    const offenders = files.filter((file) => pattern.test(code(file)));
    expect(offenders.map((file) => path.relative(MODULE_ROOT, file))).toEqual([]);
  });

  it('would catch a violation reintroduced in either form', () => {
    // The scan proving itself. Both shapes the old writer used are checked
    // against synthetic source, so a future edit that loosens a pattern fails
    // here rather than passing quietly over a real write.
    const rawWrite = "await tx.$executeRaw`INSERT INTO public.transaction_revisions (id) VALUES (1)`;";
    const prismaWrite = 'await tx.transaction.create({ data: { id } });';
    expect(RAW_SQL_WRITE.test(rawWrite)).toBe(true);
    expect(PRISMA_WRITE.test(prismaWrite)).toBe(true);
    // And that it does not fire on the read this module legitimately makes.
    expect(PRISMA_WRITE.test('await tx.transaction.findMany({ where });')).toBe(false);
    expect(RAW_SQL_WRITE.test('SELECT 1 FROM public.transactions WHERE id = $1')).toBe(false);
  });

  it('names the module that owns those tables as a dependency, not the reverse', () => {
    // The direction that makes the move legal: this module may import
    // `@karar/transactions` through its package root; that module imports
    // nothing from here, so the two cannot form a cycle.
    const manifest = JSON.parse(readFileSync(path.join(MODULE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.['@karar/transactions']).toBeDefined();

    const transactionsRoot = path.resolve(MODULE_ROOT, '..', 'transactions');
    const importsThisModule = sourceFiles(transactionsRoot).filter((file) =>
      /@karar\/statement-imports/.test(code(file)),
    );
    expect(importsThisModule.map((file) => path.relative(transactionsRoot, file))).toEqual([]);
  });
});
