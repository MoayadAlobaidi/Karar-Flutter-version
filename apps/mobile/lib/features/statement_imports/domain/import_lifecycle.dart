// THE IMPORT LIFECYCLE, IN THE CLIENT'S OWN WORDS.
//
// Every vocabulary here mirrors one the contract already declares —
// `IMPORT_STATES`, `IMPORT_REFUSAL_CODES` and the reconciliation verdict in
// `modules/statement-imports/domain`. Mirroring rather than re-deriving is
// deliberate: the client needs a type it can switch on exhaustively, and the
// generated enumerations are the ONE reading of the contract that produces it.
// The translation between the two lives in `data/` as an exhaustive switch and
// nowhere else, so a member added to the contract stops this client compiling
// until somebody decides what it means to a person.
//
// Each vocabulary carries an `unrecognised` member. It is not a default and it
// is never a stand-in for a real member: it is what a value THIS BUILD DOES NOT
// SHIP FOR becomes, so a newer server cannot make an old client display the
// wrong answer confidently.
//
// PURE DART. No Flutter, no Riverpod, no generated DTO. The domain describes
// what an import is; it does not know how one is fetched or drawn.
import 'package:meta/meta.dart';

/// Where an import is in the sequence the subject drives.
///
/// `DRAFT -> SOURCE_STORED -> PARSING -> REVIEW_REQUIRED -> COMMITTING ->
/// COMMITTED`, with `REJECTED`, `FAILED`, `DUPLICATE` and `ERASED` as the other
/// destinations. The client never advances this itself — the server owns the
/// transition list — but it must be able to say which of them it is looking at.
enum ImportLifecycleState {
  draft,
  sourceStored,
  parsing,
  reviewRequired,
  committing,
  committed,
  rejected,
  failed,
  duplicate,
  erased,

  /// A state this build does not know.
  unrecognised;

  /// Whether the import has settled. A settled import is never awaiting a
  /// decision, whatever else it reports.
  bool get isSettled => switch (this) {
        ImportLifecycleState.committed ||
        ImportLifecycleState.rejected ||
        ImportLifecycleState.failed ||
        ImportLifecycleState.duplicate ||
        ImportLifecycleState.erased =>
          true,
        ImportLifecycleState.draft ||
        ImportLifecycleState.sourceStored ||
        ImportLifecycleState.parsing ||
        ImportLifecycleState.reviewRequired ||
        ImportLifecycleState.committing =>
          false,
        // An unknown state is NOT assumed settled. Assuming it were would offer
        // a person the erase action on an import that might be mid-commit.
        ImportLifecycleState.unrecognised => false,
      };

  /// Whether work is in flight server-side, so the surface should keep polling
  /// rather than present a decision.
  bool get isInFlight => switch (this) {
        ImportLifecycleState.parsing || ImportLifecycleState.committing => true,
        ImportLifecycleState.draft ||
        ImportLifecycleState.sourceStored ||
        ImportLifecycleState.reviewRequired ||
        ImportLifecycleState.committed ||
        ImportLifecycleState.rejected ||
        ImportLifecycleState.failed ||
        ImportLifecycleState.duplicate ||
        ImportLifecycleState.erased ||
        ImportLifecycleState.unrecognised =>
          false,
      };
}

/// Why an IMPORT — rather than one line of it — was refused.
///
/// Distinct from [RowIssueReason] because they answer different questions: a
/// row reason says which line to look at, a refusal says why there is nothing
/// to look at. Every member gets its own sentence on the review surface. None
/// of them is ever collapsed into "something went wrong": a person who is told
/// their file was too large can split it, and a person told it was a
/// spreadsheet can export it again as CSV, and neither remedy survives being
/// rounded off.
enum ImportRefusal {
  sourceTooLarge,
  tooManyRows,
  tooManyColumns,
  fieldTooLarge,
  bufferedRowsExceeded,
  bufferedBytesExceeded,
  deadlineExceeded,
  cancelled,
  tooManyErrors,
  unsupportedMediaType,
  invalidEncoding,
  binaryContent,
  spreadsheetContent,
  compressedContent,
  malformedQuoting,
  emptySource,
  noHeaderRow,
  mappingAmbiguous,
  multipleAccountsInSource,
  currencyMismatch,
  reconciliationMismatch,
  sourceAlreadyImported,
  sourceIntegrityFailed,
  sourceUnreadable,

  /// A refusal code this build does not know. Shown as an honest "this build
  /// cannot explain this code", never as a generic failure and never silently.
  unrecognised,
}

/// Whether the statement's own stated balance agrees with the rows it carries.
///
/// `notAvailable` is a real answer and is NOT the same as `matched`: the
/// statement stated no balance, so nothing was checked. Presenting the two
/// alike would tell a person their file reconciled when nobody compared
/// anything.
enum ReconciliationOutcome {
  notAvailable,
  matched,
  mismatched,
  unrecognised,
}

/// What the parse counted. Numbers about the person's own file, and the only
/// quantitative thing the preview boundary lets across.
@immutable
final class ImportCounts {
  const ImportCounts({
    required this.rowCount,
    required this.validRowCount,
    required this.invalidRowCount,
    required this.exactDuplicateCount,
    required this.probableDuplicateCount,
    required this.committedTransactionCount,
  });

  /// An import that has not been parsed has counted nothing. Distinct from a
  /// parse that found nothing, which the state reports.
  static const ImportCounts none = ImportCounts(
    rowCount: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    exactDuplicateCount: 0,
    probableDuplicateCount: 0,
    committedTransactionCount: 0,
  );

  final int rowCount;
  final int validRowCount;
  final int invalidRowCount;
  final int exactDuplicateCount;

  /// Present and always 0 — probable-duplicate detection is not implemented.
  /// The contract carries the field deliberately so that "none looked for"
  /// cannot read as "none found", and the client keeps that distinction.
  final int probableDuplicateCount;

  final int committedTransactionCount;

  @override
  bool operator ==(Object other) =>
      other is ImportCounts &&
      other.rowCount == rowCount &&
      other.validRowCount == validRowCount &&
      other.invalidRowCount == invalidRowCount &&
      other.exactDuplicateCount == exactDuplicateCount &&
      other.probableDuplicateCount == probableDuplicateCount &&
      other.committedTransactionCount == committedTransactionCount;

  @override
  int get hashCode => Object.hash(
        rowCount,
        validRowCount,
        invalidRowCount,
        exactDuplicateCount,
        probableDuplicateCount,
        committedTransactionCount,
      );

  /// Carries no value of the subject's: six counts about their own file.
  @override
  String toString() => 'ImportCounts(rows: $rowCount)';
}
