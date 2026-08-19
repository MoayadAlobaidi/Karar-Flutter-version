// HOW THE COLUMNS OF ONE CSV BECOME THE FIELDS OF A TRANSACTION — DECLARED BY
// THE PERSON, NEVER INFERRED FROM THE FILE.
//
// This mirrors `modules/statement-imports/domain/column-mapping.ts`. The rules
// below are that module's, restated in Dart so the interface can refuse an
// unusable mapping while the person is still looking at it rather than after a
// round trip. The SERVER remains the authority: it re-checks every one of these
// and its answer wins. Checking here buys a better sentence at a better moment,
// not a shortcut past the real check.
//
// ## Why a mapping is an input and not a detection
//
// A header row is not a schema. `Date` might be the booking date or the value
// date; `Amount` might be signed in the account holder's frame or in the
// bank's. Sniffing works often enough to be believed and fails silently the
// rest of the time, and every failure is a wrong financial record that looks
// exactly like a right one.
//
// So NOTHING IN THIS FILE READS HEADER TEXT. There is no `guessMapping`, no
// scoring of candidate columns and no "we think this is the date column". The
// mapping is column INDEXES the person chose. The header row is shown to them
// as something to read; it is never something this code matches on.
//
// ## The account is not here, and that is the point
//
// There is no institution column and no rule that derives an account from
// issuer + type + currency: that combination is exactly what a real person
// legitimately duplicates, and a rule built on it silently merges two accounts
// that were never the same. [accountIdentifierColumn] exists for the opposite
// purpose — it lets the parse DETECT that a file describes more than one
// account and refuse, rather than quietly mixing them into the one that was
// chosen.
import 'package:meta/meta.dart';

/// Which frame a single signed amount column is written in.
///
/// There is no default and no detection. A wrong frame turns every expense in a
/// file into income, which is the single most common defect in statement
/// processing and the reason this is stated rather than sniffed.
enum AmountSignFrame {
  /// Money out of the person's pocket is negative. Retail statements printed
  /// for customers usually use this.
  accountHolder,

  /// The customer's current account is a LIABILITY of the bank, so a deposit
  /// credits it and a withdrawal debits it; the signs invert.
  bankLedger,
}

/// How a date with an ambiguous shape is to be read.
///
/// `03/04` is the fourth of March under one answer and the third of April under
/// another. Nothing here picks for the person.
enum StatementDateOrder { iso, dayFirst, monthFirst }

/// What a source-stated balance column means. Never inferred from the header.
///
/// A running balance, a ledger balance and an available balance are three
/// different numbers, and reconciling against the wrong one reports a mismatch
/// that is not there.
enum SourceBalanceKind { running, ledger, available, closing }

/// How the amount is expressed in the file.
///
/// A statement carries either a single signed amount or separate debit and
/// credit columns, and the two need different rules. Both are expressible;
/// neither is guessed.
@immutable
sealed class AmountMapping {
  const AmountMapping();

  /// Every column index this arm names, so the duplicate-use check can see them
  /// without knowing which arm it holds.
  List<int> get columns;
}

/// One signed amount column, in a frame the person has stated.
@immutable
final class SignedAmountMapping extends AmountMapping {
  const SignedAmountMapping({required this.amountColumn, required this.signFrame});

  final int amountColumn;

  /// Required. Reading `-45.00` in the wrong frame turns a payment into income.
  final AmountSignFrame signFrame;

  @override
  List<int> get columns => <int>[amountColumn];

  @override
  bool operator ==(Object other) =>
      other is SignedAmountMapping &&
      other.amountColumn == amountColumn &&
      other.signFrame == signFrame;

  @override
  int get hashCode => Object.hash(amountColumn, signFrame);
}

/// Separate debit and credit columns.
///
/// No frame is needed and none is accepted: a value in the debit column is
/// money out and a value in the credit column is money in. That is what those
/// columns mean on a statement printed for a customer, and a file that means
/// the opposite is a file whose columns are mislabelled — a review question,
/// not a flag.
@immutable
final class DebitCreditAmountMapping extends AmountMapping {
  const DebitCreditAmountMapping({required this.debitColumn, required this.creditColumn});

  final int debitColumn;
  final int creditColumn;

  @override
  List<int> get columns => <int>[debitColumn, creditColumn];

  @override
  bool operator ==(Object other) =>
      other is DebitCreditAmountMapping &&
      other.debitColumn == debitColumn &&
      other.creditColumn == creditColumn;

  @override
  int get hashCode => Object.hash(debitColumn, creditColumn);
}

/// The declared mapping.
///
/// Column numbers are 0-based indexes into the parsed fields, NEVER header
/// text: a header is content from the file, and matching on it would make the
/// mapping depend on a string that can carry an account number.
@immutable
final class StatementColumnMapping {
  const StatementColumnMapping({
    required this.bookingDateColumn,
    required this.descriptionColumn,
    required this.amount,
    required this.hasHeaderRow,
    this.valueDateColumn,
    this.eventOccurredAtColumn,
    this.sourceTimezoneColumn,
    this.merchantColumn,
    this.currencyColumn,
    this.statedCurrencyCode,
    this.sourceBalanceColumn,
    this.sourceBalanceKind,
    this.sourceReferenceColumn,
    this.instrumentMaskColumn,
    this.accountIdentifierColumn,
    this.dateOrder,
  });

  /// Required. The day the institution booked the movement.
  final int bookingDateColumn;

  /// Required. The statement narrative.
  final int descriptionColumn;

  final AmountMapping amount;

  /// Whether the file's first row is a header. Stated; never sniffed.
  final bool hasHeaderRow;

  final int? valueDateColumn;

  /// Only when the source genuinely supplies an instant. Nothing derives one
  /// from the booking day: midnight on a booked day is a moment nobody
  /// observed.
  final int? eventOccurredAtColumn;

  /// Only when the source STATES a zone. Never the device's.
  final int? sourceTimezoneColumn;

  final int? merchantColumn;

  /// Exactly one of this and [statedCurrencyCode] carries the answer.
  final int? currencyColumn;

  /// The currency the whole file is in, when it carries no column for one.
  /// STATED, because a file with neither is a file whose currency nobody knows,
  /// and assuming the account's would turn a USD statement into QAR without a
  /// single visible sign.
  final String? statedCurrencyCode;

  final int? sourceBalanceColumn;
  final SourceBalanceKind? sourceBalanceKind;
  final int? sourceReferenceColumn;
  final int? instrumentMaskColumn;

  /// NOT an account selector. A column whose distinct values reveal that the
  /// file describes more than one account, so the import can refuse instead of
  /// mixing them into the one the person chose.
  final int? accountIdentifierColumn;

  /// Stated, or null when nobody stated one. Null is not a default: a file
  /// whose dates are unambiguous does not need it, and one whose dates are
  /// ambiguous produces typed row errors rather than a plausible guess.
  final StatementDateOrder? dateOrder;

  /// Every column index this mapping names, in declaration order.
  List<int> get declaredColumns => <int>[
        bookingDateColumn,
        ...amount.columns,
        descriptionColumn,
        ...<int?>[
          valueDateColumn,
          eventOccurredAtColumn,
          sourceTimezoneColumn,
          merchantColumn,
          currencyColumn,
          sourceBalanceColumn,
          sourceReferenceColumn,
          instrumentMaskColumn,
          accountIdentifierColumn,
        ].whereType<int>(),
      ];

  StatementColumnMapping copyWith({
    int? bookingDateColumn,
    int? descriptionColumn,
    AmountMapping? amount,
    bool? hasHeaderRow,
    int? Function()? valueDateColumn,
    int? Function()? eventOccurredAtColumn,
    int? Function()? sourceTimezoneColumn,
    int? Function()? merchantColumn,
    int? Function()? currencyColumn,
    String? Function()? statedCurrencyCode,
    int? Function()? sourceBalanceColumn,
    SourceBalanceKind? Function()? sourceBalanceKind,
    int? Function()? sourceReferenceColumn,
    int? Function()? instrumentMaskColumn,
    int? Function()? accountIdentifierColumn,
    StatementDateOrder? Function()? dateOrder,
  }) =>
      StatementColumnMapping(
        bookingDateColumn: bookingDateColumn ?? this.bookingDateColumn,
        descriptionColumn: descriptionColumn ?? this.descriptionColumn,
        amount: amount ?? this.amount,
        hasHeaderRow: hasHeaderRow ?? this.hasHeaderRow,
        valueDateColumn:
            valueDateColumn == null ? this.valueDateColumn : valueDateColumn(),
        eventOccurredAtColumn: eventOccurredAtColumn == null
            ? this.eventOccurredAtColumn
            : eventOccurredAtColumn(),
        sourceTimezoneColumn: sourceTimezoneColumn == null
            ? this.sourceTimezoneColumn
            : sourceTimezoneColumn(),
        merchantColumn: merchantColumn == null ? this.merchantColumn : merchantColumn(),
        currencyColumn: currencyColumn == null ? this.currencyColumn : currencyColumn(),
        statedCurrencyCode:
            statedCurrencyCode == null ? this.statedCurrencyCode : statedCurrencyCode(),
        sourceBalanceColumn:
            sourceBalanceColumn == null ? this.sourceBalanceColumn : sourceBalanceColumn(),
        sourceBalanceKind:
            sourceBalanceKind == null ? this.sourceBalanceKind : sourceBalanceKind(),
        sourceReferenceColumn: sourceReferenceColumn == null
            ? this.sourceReferenceColumn
            : sourceReferenceColumn(),
        instrumentMaskColumn: instrumentMaskColumn == null
            ? this.instrumentMaskColumn
            : instrumentMaskColumn(),
        accountIdentifierColumn: accountIdentifierColumn == null
            ? this.accountIdentifierColumn
            : accountIdentifierColumn(),
        dateOrder: dateOrder == null ? this.dateOrder : dateOrder(),
      );

  /// Carries indexes and a currency code, never a cell.
  @override
  String toString() => 'StatementColumnMapping(columns: ${declaredColumns.length})';
}

/// What a mapping got wrong, before a single line is read.
enum MappingViolation {
  /// A column index that is negative, or past the end of the file's rows.
  columnIndexInvalid,

  /// One column mapped to two fields. One column cannot be two facts, and
  /// letting it be both is how a value date becomes a booking date.
  columnUsedTwice,

  /// No currency column and no stated currency: the currency of this file is
  /// not known, and the account's is not an answer.
  currencyNotDetermined,

  /// Both a column and a stated code: the two can disagree, and resolving that
  /// means choosing on somebody else's behalf which one their statement meant.
  currencyDoublyDetermined,

  /// A balance column with no stated kind.
  balanceKindNotStated,

  /// A timezone column with no instant column: a zone with nothing to interpret
  /// is not a fact about the statement.
  timezoneWithoutInstant,
}

/// Validates a mapping on its own terms.
///
/// Everything checked here is checkable before a byte of the file is read, and
/// saying so while the person is still on the mapping screen is cheaper for
/// them than being told after an upload and a parse.
///
/// [columnCount] is how many columns the file's rows actually have, when that
/// is known from the local sample, or null when it is not. A null skips only
/// the past-the-end half of [MappingViolation.columnIndexInvalid]; every other
/// rule still applies.
List<MappingViolation> checkMapping(
  StatementColumnMapping mapping, {
  int? columnCount,
}) {
  final violations = <MappingViolation>{};
  final columns = mapping.declaredColumns;

  for (final column in columns) {
    if (column < 0 || (columnCount != null && column >= columnCount)) {
      violations.add(MappingViolation.columnIndexInvalid);
    }
  }

  final seen = <int>{};
  for (final column in columns) {
    if (!seen.add(column)) {
      violations.add(MappingViolation.columnUsedTwice);
    }
  }

  final hasCurrencyColumn = mapping.currencyColumn != null;
  final hasStatedCurrency = mapping.statedCurrencyCode != null;
  if (!hasCurrencyColumn && !hasStatedCurrency) {
    violations.add(MappingViolation.currencyNotDetermined);
  }
  if (hasCurrencyColumn && hasStatedCurrency) {
    violations.add(MappingViolation.currencyDoublyDetermined);
  }

  if (mapping.sourceBalanceColumn != null && mapping.sourceBalanceKind == null) {
    violations.add(MappingViolation.balanceKindNotStated);
  }

  if (mapping.sourceTimezoneColumn != null && mapping.eventOccurredAtColumn == null) {
    violations.add(MappingViolation.timezoneWithoutInstant);
  }

  return violations.toList(growable: false);
}
