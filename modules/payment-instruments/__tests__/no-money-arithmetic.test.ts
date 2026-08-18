/**
 * NOTHING IN THIS MODULE ADDS ANYTHING TO ANYTHING — asserted against this
 * module's own SOURCE rather than against the intention behind it.
 *
 * This is a guarantee of ABSENCE, and an absence cannot fail a test by being
 * absent. It fails when someone adds the missing thing later — a `reduce` over
 * instrument amounts behind a name like `cardSpend`, an `aggregate` call in
 * the repository, a helper that divides a wallet balance between the two
 * cards on it — so the assertion has to be that the shape is not there,
 * checked over the files as they are on disk.
 *
 * The scan style is `modules/financial-accounts/__tests__/
 * balance-kind-not-inferred.test.ts`, and the reason is the same one that
 * file gives: the schema half of the guarantee (no balance COLUMN) is proved
 * against `information_schema`, and the code half has to be proved against
 * the code.
 *
 * **Why it matters more here than almost anywhere.** ADR-0028: "two virtual
 * cards on one wallet look like two more balances, and the person's money
 * appears to triple". A per-card figure computed in this module would be
 * exactly that, and it would be wrong in a way the person reading it cannot
 * detect — the number would be plausible, internally consistent, and about a
 * balance that does not exist.
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
 * talks about balances, sums and aggregates constantly — it must, because
 * explaining why they are absent is most of what its comments do — and its
 * refusal messages quote the words a caller used. A scan over raw text would
 * therefore fire on the very sentences that document the guarantee, and the
 * only way to keep it passing would be to stop explaining. What must not
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

describe('no money arithmetic exists anywhere in payment-instruments', () => {
  it('the scan sees the files it is meant to see', () => {
    // The positive control every absence test needs: a scanner pointed at
    // nothing passes silently, and would keep passing after the guarantee was
    // gone.
    expect(SOURCES.length).toBeGreaterThan(15);
    expect(SOURCES).toContain(path.join('domain', 'payment-instrument.ts'));
    expect(SOURCES).toContain(
      path.join('infrastructure', 'persistence', 'prisma-payment-instrument-repository.ts'),
    );
    expect(read(path.join('domain', 'payment-instrument.ts'))).toContain('INSTRUMENT_TYPES');
    // And the stripper is doing its job rather than blanking the file: the
    // code survives, the prose does not.
    const stripped = readCode(path.join('domain', 'payment-instrument.ts'));
    expect(stripped).toContain('export function createPaymentInstrument');
    expect(stripped).not.toContain('ADR-0028');
  });

  it('no production file imports a money type', () => {
    // `Money` is the kernel's exact-arithmetic type. This module has no use
    // for one, and importing it would be the first line of a per-card figure.
    const offenders = SOURCES.filter((relative) =>
      /\bimport\b[^;]*\bMoney\b[^;]*from/s.test(readCode(relative)),
    );
    expect(offenders).toEqual([]);
  });

  it('no production file names a balance, an amount, or a limit', () => {
    // Identifier-level, not comment-level: the migration header and this
    // module's own prose talk about balances constantly, and must. What must
    // not exist is a symbol.
    const forbiddenIdentifier =
      /\b(?:balance|amount|minorUnits|creditLimit|availableBalance|headroom|spendLimit)\s*[:=(]/;
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const hit = forbiddenIdentifier.exec(readCode(relative));
      if (hit !== null) offenders.push(`${relative}: ${hit[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no production file sums, reduces, or aggregates', () => {
    const moneyArithmetic = [
      /minorUnits\s*[+\-*/]/,
      /[+\-*/]\s*[A-Za-z_.]*minorUnits/,
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

  it('the repository offers no count, and no path that could return one', () => {
    // A count is the shape a total takes before it becomes one: "how many
    // cards" is harmless, "how much on them" is the next request, and the
    // second is easiest to add where the first already lives.
    const repository = readCode(
      path.join('infrastructure', 'persistence', 'prisma-payment-instrument-repository.ts'),
    );
    for (const forbidden of ['.count(', 'aggregate', 'groupBy', '_sum', '_count']) {
      expect({ forbidden, present: repository.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
    // Word-boundaried: `listOwnForAccount(` ends in the letters of `count(`
    // and is not a counting method, so a substring check would fail on the
    // very method that returns the list instead of a number.
    const port = readCode(path.join('application', 'ports', 'payment-instrument-repository.ts'));
    expect(/\bcount\s*\(/.test(port)).toBe(false);
    expect(/\btotal/i.test(port)).toBe(false);
  });

  it('the account-access port cannot answer a balance question', () => {
    // The one place a figure could legitimately arrive from another module.
    // The summary type has two fields and neither is a number.
    const port = readCode(path.join('application', 'ports', 'balance-bearing-account-access.ts'));
    const summary = /export interface BalanceBearingAccountSummary \{([\s\S]*?)\n\}/.exec(port);
    expect(summary).not.toBeNull();
    const body = summary?.[1] ?? '';
    // The declared FIELD names, not the type names they are annotated with:
    // `BalanceBearingAccountRef` legitimately contains the word this scan is
    // looking for, and it is a reference to an account rather than a figure.
    const fields = [...body.matchAll(/readonly\s+([A-Za-z_]\w*)\s*[?:]/g)].map((m) => m[1] ?? '');
    expect(fields).toEqual(['accountRef', 'lifecycleState']);
    for (const field of fields) {
      for (const forbidden of ['balance', 'amount', 'currency', 'minor', 'limit', 'total']) {
        expect({ field, forbidden, present: field.toLowerCase().includes(forbidden) }).toEqual({
          field,
          forbidden,
          present: false,
        });
      }
    }
    // And the adapter reads exactly one field off the account entity.
    const adapter = readCode(
      path.join(
        'infrastructure',
        'adapters',
        'financial-accounts-balance-bearing-account-access.ts',
      ),
    );
    expect(adapter).toContain('account.status');
    const accountFieldReads = [...adapter.matchAll(/\baccount\.[A-Za-z_]\w*/g)].map((m) => m[0]);
    expect([...new Set(accountFieldReads)]).toEqual(['account.status']);
  });
});

describe('no production file interpolates driver text into a caller-visible message', () => {
  it('never renders an error into a message string', () => {
    // The redaction rule. A driver message can carry a connection string, the
    // failing SQL, or a fragment of the ciphertext of a card mask; the cause
    // travels non-enumerable instead.
    // Scanned over the whole file rather than only near a `message:` key: the
    // three shapes below have no legitimate use anywhere in this module, so
    // the blanket ban is both simpler and stricter than a proximity rule that
    // a multi-line message string could slip past.
    // The lookbehind is load-bearing: `built.error.message` is a DOMAIN rule
    // violation's own stable sentence, which this module composes deliberately
    // and which carries nothing from a driver. What must never be rendered is
    // the bare `error` a `catch` binds.
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
