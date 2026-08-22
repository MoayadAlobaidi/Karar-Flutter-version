/**
 * Reading the parse request: a column mapping and, optionally, the balance the
 * statement itself states.
 *
 * THE MAPPING IS BY COLUMN INDEX, NEVER BY HEADER TEXT. A header is untrusted
 * content from somebody's file — it can be missing, duplicated, translated, or
 * itself contain an account number — and matching on it is how a column of
 * dates silently becomes a column of amounts. Every field below is a 0-based
 * integer index, and `columnCount` is not something this layer knows, so the
 * module's own `checkMapping` is what finally validates the shape against the
 * file. What is refused HERE is what can be refused without reading the file:
 * a non-integer, a negative index, a discriminator nobody recognises.
 *
 * `accountIdentifierColumn` IS FOR DETECTION ONLY. It lets the parse notice
 * that a file covers more than one account and refuse. It never selects an
 * account: the account is the one the draft was created against, and a file
 * cannot redirect itself into somebody else's records.
 *
 * THE STATED BALANCE IS EXACT MINOR UNITS AS CHARACTERS. It is compared
 * against a sum of rows; a float would make the comparison lie in the one
 * place a mismatch is supposed to block a commit.
 */

import type { StatedStatementBalance, StatementColumnMapping } from '@karar/statement-imports';

import { bodyOf, readAmount } from './request-input.js';

export interface InputRefusal {
  readonly field: string;
  readonly why: string;
}

export type Read<T> = { readonly value: T } | InputRefusal;

export interface ParseInput {
  readonly mapping: StatementColumnMapping;
  readonly statedBalance: StatedStatementBalance | null;
}

function refusal(field: string, why: string): InputRefusal {
  return { field, why };
}

function columnIndex(raw: unknown, field: string): Read<number> {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
    ? { value: raw }
    : refusal(field, 'must be a 0-based column index');
}

function optionalColumnIndex(raw: unknown, field: string): Read<number | null> {
  if (raw === undefined || raw === null) return { value: null };
  return columnIndex(raw, field);
}

function optionalEnum(
  raw: unknown,
  field: string,
  vocabulary: readonly string[],
): Read<string | null> {
  if (raw === undefined || raw === null) return { value: null };
  return typeof raw === 'string' && vocabulary.includes(raw)
    ? { value: raw }
    : refusal(field, 'is not a value this platform recognises');
}

const SIGN_FRAMES = ['ACCOUNT_HOLDER', 'BANK_LEDGER'] as const;
const SOURCE_BALANCE_KINDS = ['RUNNING', 'LEDGER', 'AVAILABLE', 'CLOSING'] as const;
const STATEMENT_BALANCE_KINDS = ['OPENING', 'CLOSING', 'LEDGER', 'AVAILABLE'] as const;
const DATE_ORDERS = ['ISO', 'DAY_FIRST', 'MONTH_FIRST'] as const;

function readAmountColumns(raw: unknown): Read<StatementColumnMapping['amount']> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refusal('amount', 'is required');
  }
  const source = raw as Record<string, unknown>;
  if (source['kind'] === 'SIGNED') {
    const column = columnIndex(source['amountColumn'], 'amount.amountColumn');
    if ('field' in column) return column;
    const frame = source['signFrame'];
    if (typeof frame !== 'string' || !(SIGN_FRAMES as readonly string[]).includes(frame)) {
      // A signed column without its frame is unreadable: a bank ledger and an
      // account holder disagree about which way is positive.
      return refusal('amount.signFrame', "must be 'ACCOUNT_HOLDER' or 'BANK_LEDGER'");
    }
    return {
      value: {
        kind: 'SIGNED',
        amountColumn: column.value,
        signFrame: frame as 'ACCOUNT_HOLDER' | 'BANK_LEDGER',
      },
    };
  }
  if (source['kind'] === 'DEBIT_CREDIT') {
    const debit = columnIndex(source['debitColumn'], 'amount.debitColumn');
    if ('field' in debit) return debit;
    const credit = columnIndex(source['creditColumn'], 'amount.creditColumn');
    if ('field' in credit) return credit;
    return {
      value: { kind: 'DEBIT_CREDIT', debitColumn: debit.value, creditColumn: credit.value },
    };
  }
  return refusal('amount.kind', "must be 'SIGNED' or 'DEBIT_CREDIT'");
}

function readStatedBalance(raw: unknown): Read<StatedStatementBalance | null> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return refusal('statedBalance', 'must be an object or null');
  }
  const source = raw as Record<string, unknown>;
  const amount = readAmount({ minorUnits: source['minorUnits'], currency: source['currency'] });
  if (amount === 'INVALID') {
    return refusal('statedBalance', 'needs exact minorUnits as a string and an ISO 4217 currency');
  }
  const kind = source['kind'];
  if (typeof kind !== 'string' || !(STATEMENT_BALANCE_KINDS as readonly string[]).includes(kind)) {
    // A balance of unstated kind cannot be reconciled against anything.
    return refusal('statedBalance.kind', 'is not a statement balance kind');
  }
  return {
    value: {
      minorUnits: BigInt(amount.minorUnits),
      kind: kind as StatedStatementBalance['kind'],
      currencyCode: amount.currency,
    },
  };
}

export function readParseInput(body: unknown): Read<ParseInput> {
  const source = bodyOf(body);
  const raw = source['mapping'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refusal('mapping', 'is required');
  }
  const mapping = raw as Record<string, unknown>;

  const bookingDateColumn = columnIndex(mapping['bookingDateColumn'], 'mapping.bookingDateColumn');
  if ('field' in bookingDateColumn) return bookingDateColumn;
  const descriptionColumn = columnIndex(mapping['descriptionColumn'], 'mapping.descriptionColumn');
  if ('field' in descriptionColumn) return descriptionColumn;
  const amount = readAmountColumns(mapping['amount']);
  if ('field' in amount) return amount;
  if (typeof mapping['hasHeaderRow'] !== 'boolean') {
    return refusal('mapping.hasHeaderRow', 'must be a boolean');
  }

  const optionalColumns: Array<[keyof StatementColumnMapping, string]> = [
    ['valueDateColumn', 'mapping.valueDateColumn'],
    ['eventOccurredAtColumn', 'mapping.eventOccurredAtColumn'],
    ['sourceTimezoneColumn', 'mapping.sourceTimezoneColumn'],
    ['merchantColumn', 'mapping.merchantColumn'],
    ['currencyColumn', 'mapping.currencyColumn'],
    ['sourceBalanceColumn', 'mapping.sourceBalanceColumn'],
    ['sourceReferenceColumn', 'mapping.sourceReferenceColumn'],
    ['instrumentMaskColumn', 'mapping.instrumentMaskColumn'],
    ['accountIdentifierColumn', 'mapping.accountIdentifierColumn'],
  ];
  const columns: Record<string, number | null> = {};
  for (const [key, field] of optionalColumns) {
    const read = optionalColumnIndex(mapping[key], field);
    if ('field' in read) return read;
    columns[key] = read.value;
  }

  const statedCurrency = mapping['statedCurrency'] ?? null;
  if (
    statedCurrency !== null &&
    (typeof statedCurrency !== 'string' || !/^[A-Z]{3}$/.test(statedCurrency))
  ) {
    return refusal('mapping.statedCurrency', 'must be an ISO 4217 alphabetic code or null');
  }
  const sourceBalanceKind = optionalEnum(
    mapping['sourceBalanceKind'],
    'mapping.sourceBalanceKind',
    SOURCE_BALANCE_KINDS,
  );
  if ('field' in sourceBalanceKind) return sourceBalanceKind;
  const dateOrder = optionalEnum(mapping['dateOrder'], 'mapping.dateOrder', DATE_ORDERS);
  if ('field' in dateOrder) return dateOrder;

  const statedBalance = readStatedBalance(source['statedBalance']);
  if ('field' in statedBalance) return statedBalance;

  return {
    value: {
      mapping: {
        bookingDateColumn: bookingDateColumn.value,
        valueDateColumn: columns['valueDateColumn'] ?? null,
        eventOccurredAtColumn: columns['eventOccurredAtColumn'] ?? null,
        sourceTimezoneColumn: columns['sourceTimezoneColumn'] ?? null,
        descriptionColumn: descriptionColumn.value,
        merchantColumn: columns['merchantColumn'] ?? null,
        amount: amount.value,
        currencyColumn: columns['currencyColumn'] ?? null,
        statedCurrencyCode: statedCurrency,
        sourceBalanceColumn: columns['sourceBalanceColumn'] ?? null,
        sourceBalanceKind: sourceBalanceKind.value as StatementColumnMapping['sourceBalanceKind'],
        sourceReferenceColumn: columns['sourceReferenceColumn'] ?? null,
        instrumentMaskColumn: columns['instrumentMaskColumn'] ?? null,
        accountIdentifierColumn: columns['accountIdentifierColumn'] ?? null,
        dateOrder: dateOrder.value as StatementColumnMapping['dateOrder'],
        hasHeaderRow: mapping['hasHeaderRow'],
      },
      statedBalance: statedBalance.value,
    },
  };
}
