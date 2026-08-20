// THE SHARED RED-TEAM CORPUS, FED THROUGH THE REAL ROW MAPPER.
//
// `untrusted-content.test.ts` proves the boundary with a corpus written for
// this module. This proves it with the corpus written for the WHOLE platform,
// which is wider — SQL, shell, template, path, log, formula, bidi, encoded and
// secret-shaped cases — and which later phases reuse for chat, retrieval and
// tool output. One corpus, many surfaces; a per-surface corpus is how a
// surface ends up proving only the attacks its author happened to imagine.
//
// The assertion is NOT that these are rejected. It is that they are ACCEPTED
// and preserved byte-identical, because every one of them is a legitimate
// merchant narrative to somebody, and a platform that mangled them would be
// corrupting financial records to defend a boundary it already has.
import { describe, expect, it } from 'vitest';

import { FUTURE_ONLY, REACHABLE_TODAY, RED_TEAM_CORPUS } from '@karar/content-trust';
import { Currency } from '@karar/shared-kernel';

import { mapStatementRow } from '../domain/statement-row.js';
import type { StatementColumnMapping } from '../domain/column-mapping.js';

const QAR = Currency.get('QAR');
const NUL = '\u0000';

const MAPPING: StatementColumnMapping = {
  bookingDateColumn: 0,
  valueDateColumn: null,
  eventOccurredAtColumn: null,
  sourceTimezoneColumn: null,
  descriptionColumn: 1,
  merchantColumn: 2,
  amount: { kind: 'SIGNED', amountColumn: 3, signFrame: 'ACCOUNT_HOLDER' },
  currencyColumn: null,
  statedCurrencyCode: 'QAR',
  sourceBalanceColumn: null,
  sourceBalanceKind: null,
  sourceReferenceColumn: 4,
  instrumentMaskColumn: null,
  accountIdentifierColumn: null,
  dateOrder: 'ISO',
  hasHeaderRow: true,
};

function mapWith(value: string) {
  return mapStatementRow({
    rowNumber: 1,
    fields: ['2026-08-10', value, value, '-45.00', value],
    mapping: MAPPING,
    accountCurrency: QAR,
    resolveCurrency: (code) => Currency.tryGet(code) ?? null,
  });
}

describe('the shared red-team corpus is data on every current surface', () => {
  it('has cases, and separates what is reachable now from what is not', () => {
    // A corpus that shrank to nothing would pass every loop below in silence.
    expect(RED_TEAM_CORPUS.length).toBeGreaterThanOrEqual(30);
    expect(REACHABLE_TODAY.length).toBeGreaterThanOrEqual(25);
    expect(FUTURE_ONLY.length).toBeGreaterThanOrEqual(3);
    expect(REACHABLE_TODAY.length + FUTURE_ONLY.length).toBe(RED_TEAM_CORPUS.length);
    expect(new Set(RED_TEAM_CORPUS.map((entry) => entry.id)).size).toBe(RED_TEAM_CORPUS.length);
  });

  it('carries no real host', () => {
    // A corpus with a resolvable endpoint in it is a corpus that can exfiltrate.
    for (const entry of RED_TEAM_CORPUS) {
      const host = /https?:\/\/([^/"')\s]+)/.exec(entry.value);
      if (host !== null) expect(host[1], entry.id).toMatch(/\.invalid$/);
    }
  });

  it('maps every reachable case as an ordinary row, preserved', () => {
    // CONTROL CHARACTERS ARE THE ONE THING NORMALISATION REMOVES, and that is
    // the defence rather than an accident: a NUL is how `statement.csv` is
    // made to read as `.exe`, and a CR/LF is how a merchant name forges a log
    // line. Everything else — quotes, dollars, angle brackets, formula
    // sigils, bidi overrides, Arabic, base64 — survives byte for byte,
    // because each of those is somebody's real merchant name.
    const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
    let mapped = 0;
    for (const entry of REACHABLE_TODAY) {
      const outcome = mapWith(entry.value);

      expect(outcome.ok, `${entry.id}: ${entry.note}`).toBe(true);
      if (!outcome.ok) continue;
      mapped += 1;

      // Compared on the invariant that matters: every VISIBLE character
      // survives, and no control character does. Normalisation removes some
      // controls outright and turns CR/LF/tab into a space, so an exact
      // byte comparison would assert the collapsing rule rather than the
      // security property — and the security property is the one at stake.
      const visible = (text: string) => text.replace(CONTROLS, '').replace(/\s+/g, ' ').trim();
      const stored = outcome.row.description.reveal();
      expect(stored, entry.id).not.toMatch(CONTROLS);
      expect(visible(stored), entry.id).toBe(visible(entry.value));
      expect(visible(outcome.row.merchant?.reveal() ?? ''), entry.id).toBe(visible(entry.value));
      expect(visible(outcome.row.sourceReference?.reveal() ?? ''), entry.id).toBe(
        visible(entry.value),
      );
      // The derived facts are the ones the file stated, unaffected by the text.
      expect(outcome.row.amountMinorUnits, entry.id).toBe(-4500n);
      expect(outcome.row.bookingDate.toString(), entry.id).toBe('2026-08-10');
      expect(outcome.row.currencyCode, entry.id).toBe('QAR');
    }
    expect(mapped).toBeGreaterThanOrEqual(25);
  });

  it('removes the control characters that make a name lie', () => {
    // Named separately because it is a DIFFERENT claim from preservation.
    const controlBearing = REACHABLE_TODAY.filter((entry) =>
      /[\u0000\r\n]/.test(entry.value),
    );
    expect(controlBearing.length).toBeGreaterThan(0);

    for (const entry of controlBearing) {
      const outcome = mapWith(entry.value);
      expect(outcome.ok, entry.id).toBe(true);
      if (!outcome.ok) continue;
      const stored = outcome.row.description.reveal();
      expect(stored, entry.id).not.toMatch(/[\u0000\r\n]/);
      // The visible text is still there; only the control byte is gone.
      expect(stored.length, entry.id).toBeGreaterThan(0);
    }
  });
});
