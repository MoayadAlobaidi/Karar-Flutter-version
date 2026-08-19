/**
 * The instrument mask bound, held in two places at once.
 *
 * `statement_import_rows.instrument_mask_ciphertext` is bounded in SQL so the
 * column cannot quietly become storage for a full card number. That bound is
 * a security control and it stays. But a bound enforced ONLY at INSERT fires
 * far too late: the whole import ends as an untyped store failure, when what
 * actually happened is that one cell in one row was too long. Every other
 * over-long field is an ordinary row error, and this one has to be too.
 *
 * So the domain refuses it first, and these tests hold the domain's number
 * equal to the migration's — a bound repeated in two languages is a bound
 * that will drift unless something fails when it does.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Currency } from '@karar/shared-kernel';

import { INSTRUMENT_MASK_MAX_BYTES } from '../domain/hsf-field.js';
import { type StatementColumnMapping } from '../domain/column-mapping.js';
import { mapStatementRow } from '../domain/statement-row.js';

const QAR = Currency.get('QAR');

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
  instrumentMaskColumn: 3,
  accountIdentifierColumn: null,
  dateOrder: 'ISO',
  hasHeaderRow: true,
};

function rowWithMask(mask: string) {
  return mapStatementRow({
    rowNumber: 7,
    fields: ['2026-02-11', 'Grocery', '-25.00', mask],
    mapping: MAPPING,
    accountCurrency: QAR,
    resolveCurrency: (code) => Currency.tryGet(code) ?? null,
  });
}

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

describe('instrument mask bound', () => {
  it('accepts an ordinary card tail', () => {
    const outcome = rowWithMask('****1234');

    expect(outcome.ok).toBe(true);
  });

  it('refuses an over-long mask as a typed row error, not a failed import', () => {
    const tooLong = '*'.repeat(INSTRUMENT_MASK_MAX_BYTES + 1);
    const outcome = rowWithMask(tooLong);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors).toContainEqual(
      expect.objectContaining({
        rowNumber: 7,
        safeField: 'INSTRUMENT_MASK',
        reasonCode: 'FIELD_TOO_LARGE',
      }),
    );
  });

  it('measures bytes, not characters, because the column measures bytes', () => {
    // Twenty Arabic characters — under any character bound of 32, and over
    // the byte bound the database will apply.
    const arabic = 'م'.repeat(20);
    expect(arabic.length).toBeLessThanOrEqual(INSTRUMENT_MASK_MAX_BYTES);
    expect(utf8Bytes(arabic)).toBeGreaterThan(INSTRUMENT_MASK_MAX_BYTES);

    const outcome = rowWithMask(arabic);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors).toContainEqual(
      expect.objectContaining({ safeField: 'INSTRUMENT_MASK', reasonCode: 'FIELD_TOO_LARGE' }),
    );
  });

  it('refuses one row without refusing the rest of the file', () => {
    const good = rowWithMask('**5678');
    const bad = rowWithMask('9'.repeat(INSTRUMENT_MASK_MAX_BYTES + 1));

    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(false);
  });

  it('holds the domain bound equal to the migration bound', () => {
    const migration = readFileSync(
      fileURLToPath(
        new URL(
          '../../../packages/platform/db/migrations/0101_statement_import_rows.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    const declared = /octet_length\(instrument_mask_ciphertext\)\s*<=\s*(\d+)/.exec(migration);

    expect(declared, 'the migration must still bound the mask ciphertext').not.toBeNull();
    expect(Number(declared?.[1])).toBe(INSTRUMENT_MASK_MAX_BYTES);
  });
});
