/**
 * How the columns of one CSV become the fields of a transaction — DECLARED by
 * the person, never inferred from the file.
 *
 * ## Why a mapping is an input and not a detection
 *
 * A header row is not a schema. `Date` might be the booking date or the value
 * date; `Amount` might be signed in the account holder's frame or in the
 * bank's; `Ref` might be the source's transaction reference or a branch code.
 * Sniffing them works often enough to be believed and fails silently the rest
 * of the time, and every failure is a wrong financial record that looks
 * exactly like a right one.
 *
 * So the mapping is a value the caller supplies: which column index carries
 * which field, and — the part that matters most — which conventions the
 * source uses. Where a convention is not stated, this module does not choose
 * one. `normalization.ts` refuses the ambiguous values, the rows carry
 * `AMBIGUOUS_*` reason codes, and the import lands in `REVIEW_REQUIRED` where
 * a person can state the convention and re-parse.
 *
 * ## The account is NOT here, and that is the point
 *
 * There is no `institutionColumn`, no `accountTypeColumn` and no rule that
 * derives an account from institution + type + currency. That combination is
 * exactly what a real person legitimately duplicates — two current accounts
 * at one bank in one currency, two credit cards from one issuer — and a rule
 * built on it silently merges two accounts that were never the same
 * (ADR-0028). The import targets ONE account, chosen by the person before the
 * file is read.
 *
 * `accountIdentifierColumn` exists for the opposite purpose. It does not
 * choose an account; it DETECTS that the file describes more than one, so the
 * import can refuse rather than quietly mixing a current account and the
 * credit card printed beneath it into whichever one was selected.
 *
 * ## Amount: one signed column, or two
 *
 * A statement carries either a single signed amount or separate debit and
 * credit columns, and the two shapes need different rules. Both are
 * expressible; neither is guessed. With a single column the source's sign
 * frame must be STATED (`ACCOUNT_HOLDER` or `BANK_LEDGER`), because reading
 * `-45.00` in the wrong frame turns a payment into income. With two columns
 * the meaning is structural — a value in the debit column is money out — and
 * a line carrying both, or neither, is an error rather than a sum.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import type { RowErrorReasonCode } from './reason-codes.js';
import type { DateOrder } from './normalization.js';

/**
 * The identifier for this mapping ruleset. Stored on every committed
 * transaction's provenance, so a later reader can say which rules put which
 * column where.
 */
export const MAPPING_VERSION = 'statement-csv/mapping/v1';

/**
 * Which frame a single signed amount column is written in.
 *
 * `ACCOUNT_HOLDER` — money out of the person's pocket is negative. Retail
 * statements printed for customers usually use this.
 * `BANK_LEDGER` — the customer's current account is a LIABILITY of the bank,
 * so a deposit CREDITS it and a withdrawal DEBITS it; the signs invert.
 *
 * There is no default and no detection. `modules/transactions`'
 * `sign-convention.ts` records why: this is the single most common source of
 * sign bugs in statement processing, and a wrong frame turns every expense in
 * a file into income.
 */
export const AMOUNT_SIGN_FRAMES = ['ACCOUNT_HOLDER', 'BANK_LEDGER'] as const;
export type AmountSignFrame = (typeof AMOUNT_SIGN_FRAMES)[number];

/** What a source-stated balance column means. Never inferred from the header. */
export const SOURCE_BALANCE_KINDS = ['RUNNING', 'LEDGER', 'AVAILABLE', 'CLOSING'] as const;
export type SourceBalanceKind = (typeof SOURCE_BALANCE_KINDS)[number];

/** What the file-level balance a source states is a balance OF. */
export const STATEMENT_BALANCE_KINDS = ['OPENING', 'CLOSING', 'LEDGER', 'AVAILABLE'] as const;
export type StatementBalanceKind = (typeof STATEMENT_BALANCE_KINDS)[number];

/** One signed amount column, in a frame the caller has stated. */
export interface SignedAmountColumns {
  readonly kind: 'SIGNED';
  readonly amountColumn: number;
  readonly signFrame: AmountSignFrame;
}

/**
 * Separate debit and credit columns.
 *
 * No frame is needed and none is accepted: a value in the debit column is
 * money out of the account and a value in the credit column is money in.
 * That is what those two columns mean on a statement printed for a customer,
 * and a file that means the opposite is a file whose columns are mislabelled
 * — which is a review question, not a flag.
 */
export interface DebitCreditColumns {
  readonly kind: 'DEBIT_CREDIT';
  readonly debitColumn: number;
  readonly creditColumn: number;
}

export type AmountColumns = SignedAmountColumns | DebitCreditColumns;

/**
 * The declared mapping. Column numbers are 0-based indexes into the parsed
 * fields, never header text: a header is content from the file, and matching
 * on it would make the mapping depend on a string that can carry an account
 * number.
 */
export interface StatementColumnMapping {
  /** Required. The day the institution booked the movement (ADR-0027). */
  readonly bookingDateColumn: number;
  readonly valueDateColumn: number | null;
  /**
   * Only when the source genuinely supplies an instant. Nothing derives one
   * from the booking day: midnight on a booked day is a moment nobody
   * observed.
   */
  readonly eventOccurredAtColumn: number | null;
  /**
   * Only when the source STATES a zone. Never the server's, never the
   * device's, and never one inferred from the account's country.
   */
  readonly sourceTimezoneColumn: number | null;
  /** Required. The statement narrative. */
  readonly descriptionColumn: number;
  readonly merchantColumn: number | null;
  readonly amount: AmountColumns;
  /**
   * The currency column, when the file carries one per line. When it does
   * not, `statedCurrencyCode` names the currency the file is in — STATED,
   * because a file with no currency column and no stated currency is a file
   * whose currency nobody knows, and assuming the account's would turn a USD
   * statement into QAR without a single visible sign.
   */
  readonly currencyColumn: number | null;
  readonly statedCurrencyCode: string | null;
  readonly sourceBalanceColumn: number | null;
  readonly sourceBalanceKind: SourceBalanceKind | null;
  readonly sourceReferenceColumn: number | null;
  readonly instrumentMaskColumn: number | null;
  /**
   * Not an account selector. A column whose distinct values reveal that the
   * file describes more than one account, so the import can refuse instead of
   * mixing them into the one the person chose. See the header.
   */
  readonly accountIdentifierColumn: number | null;
  /** Stated, or `null` when nobody stated one. `null` is not a default. */
  readonly dateOrder: DateOrder | null;
  /** Whether the file's first row is a header. Stated; never sniffed. */
  readonly hasHeaderRow: boolean;
}

/** What a mapping got wrong, before a single line is read. */
export interface MappingViolation {
  readonly kind: MappingViolationKind;
  readonly message: string;
}

export const MAPPING_VIOLATION_KINDS = [
  'COLUMN_INDEX_INVALID',
  'COLUMN_USED_TWICE',
  'CURRENCY_NOT_DETERMINED',
  'CURRENCY_DOUBLY_DETERMINED',
  'BALANCE_KIND_NOT_STATED',
  'TIMEZONE_WITHOUT_INSTANT',
] as const;
export type MappingViolationKind = (typeof MAPPING_VIOLATION_KINDS)[number];

function violation(kind: MappingViolationKind, message: string): MappingViolation {
  return Object.freeze({ kind, message });
}

/** Every column index the mapping names, in declaration order. */
export function declaredColumns(mapping: StatementColumnMapping): readonly number[] {
  const amountColumns =
    mapping.amount.kind === 'SIGNED'
      ? [mapping.amount.amountColumn]
      : [mapping.amount.debitColumn, mapping.amount.creditColumn];
  return [
    mapping.bookingDateColumn,
    ...amountColumns,
    mapping.descriptionColumn,
    ...[
      mapping.valueDateColumn,
      mapping.eventOccurredAtColumn,
      mapping.sourceTimezoneColumn,
      mapping.merchantColumn,
      mapping.currencyColumn,
      mapping.sourceBalanceColumn,
      mapping.sourceReferenceColumn,
      mapping.instrumentMaskColumn,
      mapping.accountIdentifierColumn,
    ].filter((column): column is number => column !== null),
  ];
}

/**
 * Validates a mapping on its own terms. Everything here is checkable before a
 * byte of the file is read, and refusing here is cheaper for everyone than
 * refusing on line 40,000.
 *
 * The two currency rules are the interesting ones. **Not determined** — no
 * column and no stated code — is refused rather than defaulted to the
 * account's currency, because a USD statement imported into a QAR account
 * would then contain 30,000 rows whose currency nobody ever chose. **Doubly
 * determined** — a column AND a stated code — is refused because the two can
 * disagree, and resolving the disagreement means picking a winner on somebody
 * else's behalf.
 */
export function checkMapping(
  mapping: StatementColumnMapping,
  columnCount: number | null,
): readonly MappingViolation[] {
  const violations: MappingViolation[] = [];
  const columns = declaredColumns(mapping);

  for (const column of columns) {
    if (!Number.isInteger(column) || column < 0) {
      violations.push(
        violation(
          'COLUMN_INDEX_INVALID',
          `column index ${String(column)} is not a non-negative integer`,
        ),
      );
    } else if (columnCount !== null && column >= columnCount) {
      violations.push(
        violation(
          'COLUMN_INDEX_INVALID',
          `column index ${column} is past the end of a row with ${columnCount} columns`,
        ),
      );
    }
  }

  const seen = new Set<number>();
  for (const column of columns) {
    if (seen.has(column)) {
      violations.push(
        violation(
          'COLUMN_USED_TWICE',
          `column ${column} is mapped to more than one field; one column cannot be two facts, and ` +
            'silently letting it be both is how a value date becomes a booking date',
        ),
      );
    }
    seen.add(column);
  }

  const hasCurrencyColumn = mapping.currencyColumn !== null;
  const hasStatedCurrency = mapping.statedCurrencyCode !== null;
  if (!hasCurrencyColumn && !hasStatedCurrency) {
    violations.push(
      violation(
        'CURRENCY_NOT_DETERMINED',
        'no currency column and no stated currency: the currency of this file is not known, and ' +
          "the account's currency is not an answer — a USD statement imported into a QAR account " +
          'would carry a currency nobody chose on every row',
      ),
    );
  }
  if (hasCurrencyColumn && hasStatedCurrency) {
    violations.push(
      violation(
        'CURRENCY_DOUBLY_DETERMINED',
        'both a currency column and a stated currency: the two can disagree, and resolving that ' +
          "disagreement means choosing on somebody else's behalf which one their statement meant",
      ),
    );
  }

  if (mapping.sourceBalanceColumn !== null && mapping.sourceBalanceKind === null) {
    violations.push(
      violation(
        'BALANCE_KIND_NOT_STATED',
        'a balance column with no stated kind: a running balance, a ledger balance and an ' +
          'available balance are three different numbers, and reconciling against the wrong one ' +
          'reports a mismatch that is not there',
      ),
    );
  }

  if (mapping.sourceTimezoneColumn !== null && mapping.eventOccurredAtColumn === null) {
    violations.push(
      violation(
        'TIMEZONE_WITHOUT_INSTANT',
        'a timezone column with no instant column: a zone with nothing to interpret is not a fact ' +
          'about the statement, and storing it would make it indistinguishable from one this ' +
          'platform supplied',
      ),
    );
  }

  return Object.freeze(violations);
}

/**
 * The reason code a per-line refusal carries when a mapping's convention is
 * missing rather than a value being malformed.
 *
 * Kept next to the mapping because the remedy is the mapping: a person fixes
 * `dateOrder` or `signFrame` and re-parses, rather than editing their bank's
 * export.
 */
export function unstatedConventionReason(
  what: 'DATE_ORDER' | 'DECIMAL_SEPARATOR' | 'DIRECTION',
): RowErrorReasonCode {
  switch (what) {
    case 'DATE_ORDER':
      return 'AMBIGUOUS_DATE_ORDER';
    case 'DECIMAL_SEPARATOR':
      return 'AMBIGUOUS_DECIMAL_SEPARATOR';
    case 'DIRECTION':
      return 'AMBIGUOUS_DIRECTION';
  }
}
