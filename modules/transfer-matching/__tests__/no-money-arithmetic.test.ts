/**
 * NOTHING HERE COMPUTES AN INSIGHT, A TOTAL, A NET WORTH OR A CATEGORY CHANGE
 * — asserted against this module's own SOURCE rather than against the
 * intention behind it.
 *
 * ADR-0028 ends with the sentence this suite exists to keep true: *"Nothing
 * here computes an insight, a score, a budget or a net worth. This ADR
 * establishes relationships, not conclusions."*
 *
 * This is a guarantee of ABSENCE, and an absence cannot fail a test by being
 * absent. It fails when someone adds the missing thing later — a `reduce` over
 * matched amounts behind a name like `transferredThisMonth`, an `aggregate`
 * call in the repository, a helper that nets two transactions off against each
 * other — so the assertion has to be that the shape is not there, checked over
 * the files as they are on disk.
 *
 * The scan style is `modules/financial-accounts/__tests__/
 * balance-kind-not-inferred.test.ts`, including its most important habit:
 * **the one legitimate exception is PINNED rather than blanket-banned.** This
 * module performs exactly ONE arithmetic operation — the unary negation in
 * `domain/equal-and-opposite.ts` that answers whether two amounts are exactly
 * equal and opposite — and a blanket ban the code has to violate somewhere is
 * a ban that gets deleted. So the pin is explicit: that file, that operation,
 * and nothing else anywhere.
 *
 * Only production source is scanned. `__tests__` is excluded deliberately:
 * this file itself has to name the patterns it is looking for.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every production `.ts` file in the module, relative to the module root. */
function productionSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'dist' || entry.name === 'node_modules') {
          continue;
        }
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        found.push(path.relative(MODULE_ROOT, full));
      }
    }
  };
  walk(MODULE_ROOT);
  return found;
}

const SOURCES = productionSources();

/** The file as written, comments included. */
const readRaw = (relative: string): string =>
  fs.readFileSync(path.join(MODULE_ROOT, relative), 'utf8');

/**
 * The file with comments and string literals blanked out.
 *
 * Both removals are necessary and for the same reason: this module's prose
 * talks about totals, sums and net figures constantly — it must, because
 * explaining why they are absent is most of what its comments do — and its
 * refusal messages describe the rules in the same words. A scan over raw text
 * would therefore fire on the very sentences that document the guarantee, and
 * the only way to keep it passing would be to stop explaining. What must not
 * exist is a SYMBOL, so the scan looks at code.
 */
function readCode(relative: string): string {
  return (
    readRaw(relative)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      // Template literals first, then quoted strings; each collapses to an
      // empty literal so the surrounding syntax still parses to the eye.
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  );
}

/** Kept for assertions that are genuinely about the prose. */
const read = readRaw;

describe('nothing in transfer-matching computes a total, a net or an insight', () => {
  it('the scan sees the files it is meant to see', () => {
    // The positive control every absence test needs: a scanner pointed at
    // nothing passes silently, and would keep passing after the guarantee was
    // gone.
    expect(SOURCES.length).toBeGreaterThan(15);
    expect(SOURCES).toContain(path.join('domain', 'transfer-match.ts'));
    expect(SOURCES).toContain(path.join('domain', 'equal-and-opposite.ts'));
    expect(SOURCES).toContain(
      path.join('infrastructure', 'persistence', 'prisma-transfer-match-repository.ts'),
    );
    // And the stripper is doing its job rather than blanking the file: the
    // code survives, the prose does not.
    const stripped = readCode(path.join('domain', 'transfer-match.ts'));
    expect(stripped).toContain('export function suggestTransferMatch');
    expect(stripped).not.toContain('ADR-0028');
  });

  it('THE PIN: exactly one arithmetic operation exists, and it is the negation', () => {
    // The whole guarantee in one assertion. `-inflowMinorUnits` is the only
    // arithmetic in the module; it answers a boolean and produces no
    // intermediate figure, which is what keeps a net amount from ever existing
    // as a value something could decide to keep.
    // A UNARY minus: one not preceded by an operand. The variable-length
    // lookbehind is what separates it from a binary subtraction — `a - b` and
    // `getTime() - other` are subtractions of two things, and neither is the
    // operation being pinned.
    const declaring = path.join('domain', 'equal-and-opposite.ts');
    const negations: string[] = [];
    for (const relative of SOURCES) {
      const contents = readCode(relative);
      for (const hit of contents.matchAll(/(?<![\w)\]]\s*)-\s*[A-Za-z_$][\w$]*/g)) {
        negations.push(`${relative}: ${hit[0].trim()}`);
      }
    }
    expect(negations).toEqual([`${declaring}: -inflowMinorUnits`]);
  });

  it('no production file imports a money type', () => {
    // `Money` is the kernel's exact-arithmetic type. This module compares two
    // bigints and stores neither, so importing one would be the first line of
    // a figure that outlives the comparison.
    const offenders = SOURCES.filter((relative) =>
      /\bimport\b[^;]*\bMoney\b[^;]*from/s.test(readCode(relative)),
    );
    expect(offenders).toEqual([]);
  });

  it('no production file names a total, a net figure, a balance or an insight', () => {
    const forbiddenIdentifier =
      /\b(?:total|netAmount|netMinorUnits|balance|insight|score|budget|netWorth|categoryChange)\s*[:=(]/;
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const hit = forbiddenIdentifier.exec(readCode(relative));
      if (hit !== null) offenders.push(`${relative}: ${hit[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no production file sums, reduces, aggregates, or adds two amounts', () => {
    const moneyArithmetic = [
      /minorUnits\s*[+*/]/,
      /[+*/]\s*[A-Za-z_.]*minorUnits/,
      /minorUnits\s*-\s*[A-Za-z_$0-9]/,
      /\.reduce\(/,
      /\.aggregate\(/,
      /\.groupBy\(/,
      /_sum\b/,
      /_avg\b/,
      /\bsum\s*\(\s*amount/i,
      /SUM\(/i,
    ];
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const contents = readCode(relative);
      for (const pattern of moneyArithmetic) {
        const hit = pattern.exec(contents);
        if (hit !== null) offenders.push(`${relative}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the one division divides TIME, and lives in the window file alone', () => {
    // Calendar-day separation, not money. Pinned the same way as the negation
    // so that a second division anywhere is a test failure rather than a
    // judgement call.
    // ` / ` with spaces on both sides: a division operator as this repository
    // writes one. A regular-expression literal has no spaces around its
    // delimiters, and an import specifier has none either, so neither is
    // mistaken for arithmetic.
    const declaring = path.join('domain', 'suggestion-window.ts');
    const divisions = SOURCES.filter((relative) => /\s\/\s/.test(readCode(relative)));
    expect(divisions).toEqual([declaring]);
    const window = readCode(declaring);
    expect(window).toContain('MILLISECONDS_PER_DAY');
    expect(window).not.toContain('minorUnits');
  });

  it('the repository offers no count, aggregate or grouping', () => {
    // "How much did I move between my own accounts this month" is an INSIGHT:
    // it needs amounts this table does not store, a period nobody stated, and
    // a treatment of unconfirmed matches nobody has decided.
    const repository = readCode(
      path.join('infrastructure', 'persistence', 'prisma-transfer-match-repository.ts'),
    );
    for (const forbidden of ['aggregate', 'groupBy', '_sum', '_count']) {
      expect({ forbidden, present: repository.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
    // `.count` survives only as `deleteMany`'s row count, which is a number of
    // ROWS and never of money.
    const port = readCode(path.join('application', 'ports', 'transfer-match-repository.ts'));
    expect(/\bcount\s*\(/.test(port)).toBe(false);
    expect(/\btotal/i.test(port)).toBe(false);
  });

  it('the transaction-access port carries no narrative and no derived figure', () => {
    // The one place another module's subject data could arrive. Six fields,
    // and no merchant, description, note, category or provenance among them.
    const port = readCode(path.join('application', 'ports', 'matchable-transaction-access.ts'));
    const summary = /export interface MatchableTransactionSummary \{([\s\S]*?)\n\}/.exec(port);
    expect(summary).not.toBeNull();
    const fields = [...(summary?.[1] ?? '').matchAll(/readonly\s+([A-Za-z_]\w*)\s*[?:]/g)].map(
      (m) => m[1] ?? '',
    );
    expect(fields).toEqual([
      'transactionRef',
      'accountRef',
      'amountMinorUnits',
      'currencyCode',
      'bookingDate',
      'status',
    ]);
    for (const field of fields) {
      for (const forbidden of ['merchant', 'description', 'note', 'category', 'provenance']) {
        expect({ field, forbidden, present: field.toLowerCase().includes(forbidden) }).toEqual({
          field,
          forbidden,
          present: false,
        });
      }
    }
    // And the adapter drops that narrative at the boundary rather than
    // carrying it in and ignoring it.
    const adapter = readCode(
      path.join('infrastructure', 'adapters', 'transactions-matchable-transaction-access.ts'),
    );
    for (const forbidden of ['transaction.merchant', 'transaction.description', 'transaction.note']) {
      expect({ forbidden, present: adapter.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
  });

  it('a STORED match has three fields per side, and none is a figure', () => {
    const domain = readCode(path.join('domain', 'transfer-match.ts'));
    const stored = /export interface MatchSide \{([\s\S]*?)\n\}/.exec(domain);
    expect(stored).not.toBeNull();
    const fields = [...(stored?.[1] ?? '').matchAll(/readonly\s+([A-Za-z_]\w*)\s*[?:]/g)].map(
      (m) => m[1] ?? '',
    );
    expect(fields).toEqual(['transactionRef', 'accountRef', 'currencyCode']);
  });

  it('nothing assigns a category, a status or a flag to a transaction', () => {
    // The other half of "no category change": this module must not reach back
    // into the transactions it relates.
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const contents = readCode(relative);
      for (const pattern of [/\bassignCategory\b/, /\bcategoryCode\b/, /\bcorrect\(/, /\bcommit\(/]) {
        const hit = pattern.exec(contents);
        if (hit !== null) offenders.push(`${relative}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('no production file interpolates driver text into a caller-visible message', () => {
  it('never renders an error into a message string', () => {
    // Scanned over the whole file rather than only near a `message:` key: the
    // three shapes below have no legitimate use anywhere in this module, so
    // the blanket ban is both simpler and stricter than a proximity rule that
    // a multi-line message string could slip past. The lookbehind is
    // load-bearing: `built.error.message` is a DOMAIN rule violation's own
    // stable sentence, which this module composes deliberately and which
    // carries nothing from a driver.
    const forbidden = [
      /(?<![.\w])error\.message\b/,
      /\bString\(\s*error\s*\)/,
      /\$\{[^}]*(?<![.\w])error\b/,
    ];
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const contents = readCode(relative);
      for (const pattern of forbidden) {
        const hit = pattern.exec(contents);
        if (hit !== null) offenders.push(`${relative}: ${hit[0].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every error factory attaches the cause NON-ENUMERABLY', () => {
    // Read RAW: the property name is a string literal, and the stripper this
    // file uses elsewhere blanks string literals on purpose.
    const errors = read(path.join('application', 'errors.ts'));
    const defineCalls = [...errors.matchAll(/Object\.defineProperty\(\s*\w+,\s*'cause'/g)];
    expect(defineCalls.length).toBeGreaterThanOrEqual(2);
    expect(errors).toContain('enumerable: false');
    // A serialized failure must not carry the cause at all.
    expect(errors).not.toMatch(/cause:\s*error/);
  });
});
