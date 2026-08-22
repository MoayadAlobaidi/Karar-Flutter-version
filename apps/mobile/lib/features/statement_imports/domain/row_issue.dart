// ONE REFUSED LINE: A NUMBER, A FIELD NAME AND A REASON. NEVER A VALUE.
//
// `modules/statement-imports/domain/reason-codes.ts` states the rule this file
// exists to keep on the client side of the boundary: a row error is a line
// number, a SAFE field name and a reason code, and there is deliberately no
// fourth field. The natural error message — "could not read amount '1.234,56'
// on row 14" — is a fragment of somebody's bank statement, and it travels into
// a screenshot, a support ticket and a crash report the moment it is rendered.
//
// The server withholds the value. THIS TYPE HAS NOWHERE TO PUT ONE, so the UI
// above it cannot leak what the API never sent, and a later edit that wanted to
// show the offending cell would have to add a field here first — which is a
// reviewable diff rather than an accident.
//
// The field name is OURS, not the file's. A CSV header is content from the
// file: it can say `Amount` and it can equally say `Acct 4471-2299-0031
// balance`. Echoing a header back is the same leak as echoing a cell, so
// [StatementField] is this client's own closed vocabulary and is never derived
// from header text.
import 'package:meta/meta.dart';

/// Which part of a line a refusal is about, in the module's own words.
///
/// [row] is the whole line — used when the line could not be split into fields
/// at all, so no field name is meaningful yet.
enum StatementField {
  row,
  bookingDate,
  valueDate,
  eventOccurredAt,
  sourceTimezone,
  amount,
  debitAmount,
  creditAmount,
  currency,
  description,
  merchant,
  sourceBalance,
  sourceReference,
  instrumentMask,

  /// A field name this build does not know.
  unrecognised,
}

/// Why a line was refused.
///
/// The ambiguity members are the ones worth reading twice. `1.234` is one
/// thousand two hundred and thirty-four under one convention and one point two
/// three four under another; `03/04/2026` is March under one and April under
/// another. Neither has an answer available from the value itself, so neither
/// is guessed — these are refusals that send the file back to the mapping step,
/// not defaults wearing the costume of a decision.
///
/// [remedy] is what separates them in the interface: a convention the person
/// can state, versus a file they have to fix, versus a bound they have to
/// respect. A reason with the wrong remedy sends somebody to edit their bank's
/// export when all they had to do was tick "day first".
enum RowIssueReason {
  requiredFieldMissing,
  unreadableAmount,
  ambiguousDecimalSeparator,
  ambiguousDateOrder,
  unreadableDate,
  unreadableInstant,
  unknownTimezone,
  unknownCurrency,
  currencyMismatch,
  ambiguousDirection,
  debitAndCreditBothPresent,
  debitAndCreditBothAbsent,
  fieldTooLarge,
  tooManyColumns,
  columnCountMismatch,
  invalidEncoding,
  malformedQuoting,
  amountExceedsRange,
  decimalPlacesExceedCurrency,

  /// A reason code this build does not know.
  unrecognised;

  /// What the person can actually do about this line.
  ///
  /// Exhaustive and with no default arm: a reason added to the contract must be
  /// given a remedy by a person, not absorbed into whichever branch came first.
  RowIssueRemedy get remedy => switch (this) {
        // A convention nobody stated. The mapping step is the remedy — the
        // person states it and parses again. Nobody edits their statement.
        RowIssueReason.ambiguousDateOrder ||
        RowIssueReason.ambiguousDecimalSeparator ||
        RowIssueReason.ambiguousDirection =>
          RowIssueRemedy.stateAConvention,
        // The mapping points at the wrong column, or at a column that is not
        // there on every line. Re-mapping fixes it.
        RowIssueReason.requiredFieldMissing ||
        RowIssueReason.columnCountMismatch ||
        RowIssueReason.debitAndCreditBothPresent ||
        RowIssueReason.debitAndCreditBothAbsent ||
        RowIssueReason.currencyMismatch =>
          RowIssueRemedy.correctTheMapping,
        // The file itself carries something this platform cannot read. The
        // remedy is a different export, not a different mapping.
        RowIssueReason.unreadableAmount ||
        RowIssueReason.unreadableDate ||
        RowIssueReason.unreadableInstant ||
        RowIssueReason.unknownTimezone ||
        RowIssueReason.unknownCurrency ||
        RowIssueReason.invalidEncoding ||
        RowIssueReason.malformedQuoting ||
        RowIssueReason.amountExceedsRange ||
        RowIssueReason.decimalPlacesExceedCurrency =>
          RowIssueRemedy.correctTheFile,
        // A declared bound. Nothing about the mapping or the values changes it.
        RowIssueReason.fieldTooLarge || RowIssueReason.tooManyColumns =>
          RowIssueRemedy.respectABound,
        RowIssueReason.unrecognised => RowIssueRemedy.unknown,
      };
}

/// The kind of thing that would make a refused line succeed.
enum RowIssueRemedy {
  stateAConvention,
  correctTheMapping,
  correctTheFile,
  respectABound,
  unknown,
}

/// One refusal about one line. Three fields, and there is never a fourth.
@immutable
final class RowIssue {
  const RowIssue({
    required this.rowNumber,
    required this.field,
    required this.reason,
  });

  /// 1-based among the DATA rows. Never an offset into the file, so a person
  /// counting rows in a spreadsheet lands on the same line this names.
  final int rowNumber;

  final StatementField field;

  final RowIssueReason reason;

  @override
  bool operator ==(Object other) =>
      other is RowIssue &&
      other.rowNumber == rowNumber &&
      other.field == field &&
      other.reason == reason;

  @override
  int get hashCode => Object.hash(rowNumber, field, reason);

  /// Safe to log in full: a line number and two closed-vocabulary members, by
  /// construction carrying nothing read out of the file.
  @override
  String toString() => 'RowIssue(row: $rowNumber, ${field.name}, ${reason.name})';
}
