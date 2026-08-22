/**
 * The two rules the balance-kind column exists to keep, asserted against this
 * module's own SOURCE rather than against the intention behind it.
 *
 * Both are guarantees of ABSENCE, and an absence cannot fail a test by being
 * absent. It fails when someone adds the missing thing later — a helper that
 * fills in a kind nobody reported, a reduce over amounts behind a name like
 * `currentBalance` — so the assertion has to be that the shape is not there,
 * checked over the files as they are on disk.
 *
 *   1. **No kind is ever inferred from another, and none is defaulted.**
 *      `AVAILABLE` is not derived from `BOOKED` by subtracting pending
 *      amounts, `BOOKED` is not derived from `AVAILABLE`, and a `CREDIT_LIMIT`
 *      is not read as money the person has. A kind exists for an account only
 *      because a source stated it. The behavioural half of this is proved in
 *      the domain suite (`latestReported` answers `null` for a kind nobody
 *      reported) and against live PostgreSQL (an INSERT that omits the kind is
 *      refused by the database rather than defaulted); what is proved HERE is
 *      that no production file contains a balance-kind literal to substitute
 *      or a coalescing expression to substitute it with.
 *
 *   2. **No balance is computed by summing transactions and then labelled
 *      source-reported.** A summed figure looks authoritative and is wrong the
 *      moment one transaction is missing, misdated or duplicated, and the
 *      person reading it cannot tell. So no money path in this module adds
 *      anything to anything.
 *
 * Only production source is scanned. `__tests__` is excluded deliberately:
 * this file itself has to name the literals it is looking for, and so do the
 * fixtures that record snapshots.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BALANCE_KINDS } from '../domain/balance-snapshot.js';

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
const read = (relative: string): string =>
  fs.readFileSync(path.join(MODULE_ROOT, relative), 'utf8');

/**
 * `CURRENT` is deliberately absent from this list: it is also an `AccountType`
 * member, so the bare literal is not diagnostic of anything. It is covered
 * instead by the coalescing check below, which looks at what happens to the
 * `balanceKind` identifier rather than at which strings exist.
 */
const UNAMBIGUOUS_KIND_LITERALS = BALANCE_KINDS.filter((kind) => kind !== 'CURRENT');

describe('balance kinds are reported, never inferred and never defaulted', () => {
  it('the scan sees the files it is meant to see', () => {
    // The positive control every absence test needs: a scanner pointed at
    // nothing passes silently, and would keep passing after the guarantee was
    // gone.
    expect(SOURCES.length).toBeGreaterThan(20);
    expect(SOURCES).toContain(path.join('domain', 'balance-snapshot.ts'));
    expect(SOURCES).toContain(path.join('application', 'use-cases', 'record-reported-balance.ts'));
    expect(read(path.join('domain', 'balance-snapshot.ts'))).toContain('BALANCE_KINDS');
  });

  it('no production file outside the declaring one contains a balance-kind literal', () => {
    // A kind literal anywhere else is the raw material for substitution: a
    // fallback, a mapping table, a branch that answers one kind's question
    // with another kind's row.
    const declaring = path.join('domain', 'balance-snapshot.ts');
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      if (relative === declaring) continue;
      const contents = read(relative);
      for (const kind of UNAMBIGUOUS_KIND_LITERALS) {
        if (contents.includes(`'${kind}'`) || contents.includes(`"${kind}"`)) {
          offenders.push(`${relative} contains the literal ${kind}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nothing defaults, coalesces, or reassigns the balance kind', () => {
    // The kind travels from the caller to the column untouched. `??`, `||`,
    // and an assignment from a literal are the three ways a guess gets written
    // as though a source had stated it.
    const forbidden = [
      /balanceKind\s*(\?\?|\|\|)/,
      /balanceKind\s*[:=]\s*['"`]/,
      /\?\?\s*['"`](BOOKED|AVAILABLE|OUTSTANDING|CREDIT_LIMIT|OTHER_SOURCE_REPORTED)['"`]/,
    ];
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const contents = read(relative);
      for (const pattern of forbidden) {
        const hit = pattern.exec(contents);
        if (hit !== null) offenders.push(`${relative}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the balance kind is a REQUIRED field everywhere it is accepted', () => {
    // An optional field is a default waiting to be written: `balanceKind?:`
    // means some call site omits it and something downstream decides.
    for (const relative of [
      path.join('domain', 'balance-snapshot.ts'),
      path.join('application', 'use-cases', 'record-reported-balance.ts'),
    ]) {
      const contents = read(relative);
      expect({ relative, optional: /balanceKind\?\s*:/.test(contents) }).toEqual({
        relative,
        optional: false,
      });
      expect(contents).toContain('readonly balanceKind: BalanceKind;');
    }
  });

  it('no money path in this module adds anything to anything', () => {
    // Rule 2. A reported balance is a fact someone else asserted; a summed one
    // is a different concept that must arrive under its own name with its own
    // honest label, and this is what keeps the second from being written into
    // the first.
    const moneyArithmetic = [
      /minorUnits\s*[+\-*/]/,
      /[+\-*/]\s*[A-Za-z_.]*minorUnits/,
      /\.add\(/,
      /_sum\b/,
      /\.aggregate\(/,
      /\bsum\s*\(\s*amount/i,
      /SUM\(/i,
    ];
    const offenders: string[] = [];
    for (const relative of SOURCES) {
      const contents = read(relative);
      for (const pattern of moneyArithmetic) {
        const hit = pattern.exec(contents);
        if (hit !== null) offenders.push(`${relative}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the single reduce in this module counts erased ROWS and touches no money', () => {
    // Pinned rather than blanket-banned, because it is legitimate and the
    // blanket ban would have been a lie. `totalErased` adds per-kind row
    // COUNTS. If a second reduce ever appears, or if this file gains a money
    // type, this is where it is noticed.
    const withReduce = SOURCES.filter((relative) => read(relative).includes('.reduce('));
    expect(withReduce).toEqual([
      path.join('application', 'ports', 'financial-record-eraser.ts'),
    ]);
    const eraser = read(withReduce[0] ?? '');
    expect(eraser).not.toContain('Money');
    expect(eraser).not.toContain('minorUnits');
    expect(eraser).not.toContain('currency');
  });
});
