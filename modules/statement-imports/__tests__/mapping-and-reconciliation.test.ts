/**
 * Column mapping, row mapping, and reconciliation — the three pure rulesets
 * that decide what a statement line MEANS.
 *
 * The assertions that matter most are the refusals. A wrong sign frame turns
 * every expense in a file into income; a wrong reconciliation rule reports a
 * matched statement for every file including the ones read wrongly.
 */

import { describe, expect, it } from 'vitest';

import { Currency } from '@karar/shared-kernel';

import { checkMapping, type StatementColumnMapping } from '../domain/column-mapping.js';
import { permitsCommit, reconcile } from '../domain/reconciliation.js';
import { distinctAccountIdentifiers, mapStatementRow } from '../domain/statement-row.js';

const QAR = Currency.get('QAR');
const USD = Currency.get('USD');

const BASE: StatementColumnMapping = {
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

function readRow(fields: readonly string[], mapping: StatementColumnMapping = BASE) {
  return mapStatementRow({
    rowNumber: 1,
    fields,
    mapping,
    accountCurrency: QAR,
    resolveCurrency: (code) => Currency.tryGet(code) ?? null,
  });
}

describe('mapping validation, before a byte is read', () => {
  it('accepts the base mapping', () => {
    expect(checkMapping(BASE, 3)).toEqual([]);
  });

  it('REFUSES a mapping with no currency determined — the account is not an answer', () => {
    const violations = checkMapping({ ...BASE, statedCurrencyCode: null }, 3);
    expect(violations.map((v) => v.kind)).toContain('CURRENCY_NOT_DETERMINED');
  });

  it('REFUSES a mapping with the currency determined twice — the two can disagree', () => {
    const violations = checkMapping({ ...BASE, currencyColumn: 3 }, 4);
    expect(violations.map((v) => v.kind)).toContain('CURRENCY_DOUBLY_DETERMINED');
  });

  it('REFUSES a balance column with no stated kind', () => {
    const violations = checkMapping({ ...BASE, sourceBalanceColumn: 3 }, 4);
    expect(violations.map((v) => v.kind)).toContain('BALANCE_KIND_NOT_STATED');
  });

  it('REFUSES a timezone column with no instant column', () => {
    const violations = checkMapping({ ...BASE, sourceTimezoneColumn: 3 }, 4);
    expect(violations.map((v) => v.kind)).toContain('TIMEZONE_WITHOUT_INSTANT');
  });

  it('REFUSES one column mapped to two fields', () => {
    const violations = checkMapping({ ...BASE, merchantColumn: 1 }, 3);
    expect(violations.map((v) => v.kind)).toContain('COLUMN_USED_TWICE');
  });

  it('REFUSES a column index past the end of the row', () => {
    expect(checkMapping(BASE, 2).map((v) => v.kind)).toContain('COLUMN_INDEX_INVALID');
  });

  it('carries no way to name an institution, a type or a wallet kind', () => {
    // ADR-0028: a rule built on institution + type + currency silently merges
    // two accounts a person legitimately duplicates. The mapping cannot
    // express the question, so the rule is unwritable rather than absent.
    expect(Object.keys(BASE)).not.toContain('institutionColumn');
    expect(Object.keys(BASE)).not.toContain('accountTypeColumn');
    expect(Object.keys(BASE)).not.toContain('walletKindColumn');
  });
});

describe('the sign frame is stated, never detected', () => {
  it('takes an ACCOUNT_HOLDER sign as given', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT ONE', '-45.00']);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.row.amountMinorUnits).toBe(-4500n);
    expect(read.row.directionMapping).toBe('SOURCE_SIGNED_AMOUNT');
    expect(read.row.sourceDirection).toBe('NOT_STATED');
  });

  it('INVERTS a BANK_LEDGER sign, and records that it did', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT ONE', '-45.00'], {
      ...BASE,
      amount: { kind: 'SIGNED', amountColumn: 2, signFrame: 'BANK_LEDGER' },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.row.amountMinorUnits).toBe(4500n);
    // Recorded separately so an inverted import is visible AS an inversion,
    // rather than indistinguishable from a correctly-signed one.
    expect(read.row.directionMapping).toBe('SOURCE_SIGNED_AMOUNT_INVERTED');
  });
});

describe('separate debit and credit columns', () => {
  const mapping: StatementColumnMapping = {
    ...BASE,
    amount: { kind: 'DEBIT_CREDIT', debitColumn: 2, creditColumn: 3 },
  };

  it('reads a debit as money out and a credit as money in', () => {
    const debit = readRow(['2026-08-12', 'SYNTHETIC MERCHANT ONE', '45.00', ''], mapping);
    expect(debit.ok && debit.row.amountMinorUnits).toBe(-4500n);
    expect(debit.ok && debit.row.sourceDirection).toBe('DEBIT');

    const credit = readRow(['2026-08-12', 'SYNTHETIC MERCHANT TWO', '', '45.00'], mapping);
    expect(credit.ok && credit.row.amountMinorUnits).toBe(4500n);
    expect(credit.ok && credit.row.sourceDirection).toBe('CREDIT');
  });

  it('REFUSES both columns present, and both absent, as TWO different errors', () => {
    const both = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '45.00', '45.00'], mapping);
    expect(both.ok).toBe(false);
    if (both.ok) return;
    expect(both.errors[0]?.reasonCode).toBe('DEBIT_AND_CREDIT_BOTH_PRESENT');

    const neither = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '', ''], mapping);
    expect(neither.ok).toBe(false);
    if (neither.ok) return;
    expect(neither.errors[0]?.reasonCode).toBe('DEBIT_AND_CREDIT_BOTH_ABSENT');
  });

  it('REFUSES a sign marker inside a debit column — the column already said it', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '(45.00)', ''], mapping);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors[0]?.reasonCode).toBe('AMBIGUOUS_DIRECTION');
  });
});

describe('currency', () => {
  it('REFUSES a line in a currency this platform does not support', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '45.00'], {
      ...BASE,
      statedCurrencyCode: 'ZZZ',
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors[0]?.reasonCode).toBe('UNKNOWN_CURRENCY');
  });

  it('reads a per-line currency column when the mapping names one', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '45.00', 'qar'], {
      ...BASE,
      statedCurrencyCode: null,
      currencyColumn: 3,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // Case-folded, because a currency CODE is case-insensitive by definition
    // and refusing `qar` would be refusing a correct value for its casing.
    expect(read.row.currencyCode).toBe('QAR');
  });

  it('REFUSES a line in a currency the account is not held in', () => {
    // Never converted: this platform stores no exchange rate it did not
    // observe, and a converted figure on a bank statement is a number nobody
    // can defend.
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '45.00', USD.code], {
      ...BASE,
      statedCurrencyCode: null,
      currencyColumn: 3,
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors.map((error) => error.reasonCode)).toContain('CURRENCY_MISMATCH');
  });
});

describe('errors are collected, never short-circuited', () => {
  it('reports every problem on one line, not the first', () => {
    const read = readRow(['not-a-date', '', 'not-a-number']);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors.map((error) => error.safeField).sort()).toEqual([
      'AMOUNT',
      'BOOKING_DATE',
      'DESCRIPTION',
    ]);
  });

  it('names a line number, a safe field and a reason code — and nothing else', () => {
    const read = readRow(['not-a-date', 'SYNTHETIC MERCHANT', '45.00']);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    const error = read.errors[0];
    expect(Object.keys(error ?? {}).sort()).toEqual(['reasonCode', 'rowNumber', 'safeField']);
    // The offending value appears nowhere in the error.
    expect(JSON.stringify(read.errors)).not.toContain('not-a-date');
  });
});

describe('optional fields', () => {
  it('treats an absent optional field as absence, not as an error', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '45.00', ''], {
      ...BASE,
      valueDateColumn: 3,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.row.valueDate).toBeNull();
  });

  it('drops a stated timezone that has no instant to interpret', () => {
    const read = readRow(['2026-08-12', 'SYNTHETIC MERCHANT', '45.00', '', 'Asia/Qatar'], {
      ...BASE,
      eventOccurredAtColumn: 3,
      sourceTimezoneColumn: 4,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.row.eventOccurredAt).toBeNull();
    expect(read.row.sourceTimezone).toBeNull();
  });

  it('keeps a stated instant and its stated zone together', () => {
    const read = readRow(
      ['2026-08-12', 'SYNTHETIC MERCHANT', '45.00', '2026-08-12T14:30:00+03:00', 'Asia/Qatar'],
      { ...BASE, eventOccurredAtColumn: 3, sourceTimezoneColumn: 4 },
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.row.eventOccurredAt?.toISOString()).toBe('2026-08-12T11:30:00.000Z');
    expect(read.row.sourceTimezone).toBe('Asia/Qatar');
  });
});

describe('several accounts in one file', () => {
  it('reports the distinct identifiers so the import can refuse rather than mix', () => {
    const mapping = { ...BASE, accountIdentifierColumn: 3 };
    const rows = [
      readRow(['2026-08-12', 'SYNTHETIC ONE', '45.00', 'ACCT-A'], mapping),
      readRow(['2026-08-13', 'SYNTHETIC TWO', '46.00', 'ACCT-B'], mapping),
    ]
      .filter((read): read is Extract<typeof read, { ok: true }> => read.ok)
      .map((read) => read.row);
    expect(distinctAccountIdentifiers(rows)).toEqual(['ACCT-A', 'ACCT-B']);
  });

  it('does not persist the identifier — it exists only to make a refusal possible', () => {
    const mapping = { ...BASE, accountIdentifierColumn: 3 };
    const read = readRow(['2026-08-12', 'SYNTHETIC ONE', '45.00', 'ACCT-A'], mapping);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // It is on the MAPPED row (an in-memory value) and has no column in
    // `statement_import_rows` — asserted exhaustively by the schema suite.
    expect(read.row.accountIdentifier).toBe('ACCT-A');
  });
});

describe('reconciliation', () => {
  const line = (rowNumber: number, amount: bigint, balance: bigint | null) => ({
    rowNumber,
    amountMinorUnits: amount,
    currencyCode: 'QAR',
    sourceBalanceMinorUnits: balance,
    sourceBalanceKind: balance === null ? null : ('RUNNING' as const),
  });

  it('answers NOT_AVAILABLE when the source stated no balance, and permits the commit', () => {
    const outcome = reconcile({
      stated: null,
      rows: [line(1, -4500n, null)],
      currency: QAR,
    });
    expect(outcome).toEqual({ status: 'NOT_AVAILABLE', reason: 'SOURCE_STATED_NO_BALANCE' });
    expect(permitsCommit(outcome)).toBe(true);
  });

  it('answers NOT_AVAILABLE for a closing figure with no anchor to walk from', () => {
    // Sum(amounts) is a NET MOVEMENT, not a balance. Comparing it to a
    // closing figure would be comparing two different kinds of number.
    const outcome = reconcile({
      stated: { minorUnits: 10_000n, kind: 'CLOSING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, null)],
      currency: QAR,
    });
    expect(outcome).toEqual({
      status: 'NOT_AVAILABLE',
      reason: 'NO_ANCHOR_TO_COMPARE_AGAINST',
    });
  });

  it('MATCHES a continuous walk that ends at the stated closing balance', () => {
    const outcome = reconcile({
      stated: { minorUnits: 5_500n, kind: 'CLOSING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, 10_000n), line(2, -4500n, 5_500n)],
      currency: QAR,
    });
    expect(outcome).toEqual({ status: 'MATCHED' });
    expect(permitsCommit(outcome)).toBe(true);
  });

  it('MISMATCHES at the first line whose running balance does not follow', () => {
    const outcome = reconcile({
      stated: { minorUnits: 5_500n, kind: 'CLOSING', currencyCode: 'QAR' },
      // The second line says -45.00 but the balance moved by -46.00.
      rows: [line(1, -4500n, 10_000n), line(2, -4500n, 5_400n)],
      currency: QAR,
    });
    expect(outcome).toEqual({ status: 'MISMATCHED', firstDivergentRowNumber: 2 });
    expect(permitsCommit(outcome)).toBe(false);
  });

  it('MISMATCHES on the file total with no line number, when every line follows', () => {
    const outcome = reconcile({
      stated: { minorUnits: 9_999n, kind: 'CLOSING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, 10_000n), line(2, -4500n, 5_500n)],
      currency: QAR,
    });
    expect(outcome).toEqual({ status: 'MISMATCHED', firstDivergentRowNumber: null });
  });

  it('reports exactly, with no tolerance — one minor unit is a mismatch', () => {
    const outcome = reconcile({
      stated: { minorUnits: 5_501n, kind: 'CLOSING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, 10_000n), line(2, -4500n, 5_500n)],
      currency: QAR,
    });
    expect(outcome.status).toBe('MISMATCHED');
  });

  it('refuses to compare across currencies rather than converting', () => {
    const outcome = reconcile({
      stated: { minorUnits: 5_500n, kind: 'CLOSING', currencyCode: 'USD' },
      rows: [line(1, -4500n, 10_000n)],
      currency: QAR,
    });
    expect(outcome).toEqual({
      status: 'NOT_AVAILABLE',
      reason: 'SOURCE_BALANCE_CURRENCY_DIFFERS',
    });
  });

  it('refuses a partial walk rather than vouching for lines nobody compared', () => {
    const outcome = reconcile({
      stated: { minorUnits: 5_500n, kind: 'CLOSING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, 10_000n), line(2, -4500n, null)],
      currency: QAR,
    });
    expect(outcome).toEqual({
      status: 'NOT_AVAILABLE',
      reason: 'RUNNING_BALANCES_INCOMPLETE',
    });
  });

  it('anchors a walk on a stated OPENING balance', () => {
    const outcome = reconcile({
      stated: { minorUnits: 14_500n, kind: 'OPENING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, 10_000n), line(2, -4500n, 5_500n)],
      currency: QAR,
    });
    expect(outcome).toEqual({ status: 'MATCHED' });
  });

  it('MISMATCHES the first line when the stated opening does not lead to it', () => {
    const outcome = reconcile({
      stated: { minorUnits: 14_501n, kind: 'OPENING', currencyCode: 'QAR' },
      rows: [line(1, -4500n, 10_000n)],
      currency: QAR,
    });
    expect(outcome).toEqual({ status: 'MISMATCHED', firstDivergentRowNumber: 1 });
  });
});
