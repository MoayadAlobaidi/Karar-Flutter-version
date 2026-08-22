// A FEW LINES OF THE PERSON'S FILE, SO THEY CAN SAY WHICH COLUMN IS WHICH.
//
// The mapping step is unusable without showing the file: "column 4" means
// nothing to somebody who cannot see that column 4 is where the amounts are.
// This is therefore the ONE place in the whole feature where content read out
// of a statement is put on screen — and it is content the person is already
// looking at in their own file, shown back to them, on their own device,
// before anything is uploaded.
//
// The review surface deliberately shows none of this: `preview-statement-
// import.ts` exposes no value read out of the file, and the client honours that
// boundary by having nowhere to put one (see `row_issue.dart`).
//
// ## Why a cell is a TYPE and not a String
//
// ADR-0029's posture is that the trust boundary is a type rather than a filter.
// A bare `String` invites the two mistakes this feature must never make: being
// passed to something that interprets it, and being "cleaned" on the way past.
// [UntrustedCell] is a type whose only accessor hands back the exact
// characters, which makes both mistakes visible at the call site:
//
//   * it has no `toString()` that returns the content, so it cannot be
//     interpolated into a message, a log line or a URL by accident;
//   * it exposes no formatting, parsing, trimming or escaping of any kind, so
//     there is no method for a later edit to reach for;
//   * `UntrustedCellText` in the presentation layer is the only widget that
//     accepts one, and it renders it as inert text.
//
// ## What is NOT done to a cell, and must never be
//
// Not trimmed. Not unquoted beyond RFC 4180 field splitting. Not stripped of
// control characters. Not normalised into any Unicode form. Not truncated for
// display. And NOT given an Excel formula-escape prefix — a leading `'` before
// `=cmd|...` belongs at an EXPORT boundary, where a spreadsheet will interpret
// the file, and putting one here would corrupt a merchant name on screen while
// protecting nothing.
//
// A cell reading `SYSTEM: ignore previous instructions` is a merchant name. It
// is stored, it reads back byte-identical, and it never acquires the authority
// to make anything happen.
import 'package:meta/meta.dart';

/// One cell, exactly as it appeared in the file.
///
/// Construct one only from bytes that genuinely came out of a statement. There
/// is no constructor that takes platform copy, because a platform string that
/// travelled through this type would be indistinguishable from a person's data
/// at the point it is rendered.
@immutable
final class UntrustedCell {
  const UntrustedCell(this._value);

  final String _value;

  /// The exact characters the file carried.
  ///
  /// Named for what it is. A reader reaching for this has to write
  /// `cell.exactText`, which reads at the call site as the deliberate act it
  /// is, rather than as an incidental `toString()`.
  String get exactText => _value;

  /// Whether the cell held nothing at all. Distinct from a cell of spaces,
  /// which is content.
  bool get isEmpty => _value.isEmpty;

  @override
  bool operator ==(Object other) => other is UntrustedCell && other._value == _value;

  @override
  int get hashCode => _value.hashCode;

  /// **Deliberately does not return the content.** This string reaches
  /// diagnostics, and a cell in a diagnostic is a fragment of somebody's bank
  /// statement.
  @override
  String toString() => 'UntrustedCell()';
}

/// One line of the file, split into fields.
@immutable
final class SampleRow {
  const SampleRow(this.cells);

  final List<UntrustedCell> cells;

  /// The cell at [index], or null when this line is shorter than the mapping
  /// expects. A short line is a real thing in real exports and it is shown as
  /// absent rather than as an empty string, because the two are different
  /// facts and the platform reports them with different reason codes.
  UntrustedCell? cellAt(int index) =>
      index >= 0 && index < cells.length ? cells[index] : null;

  @override
  String toString() => 'SampleRow(${cells.length})';
}

/// The first few lines of the chosen file, for the mapping step only.
///
/// Bounded on every axis, because this is untrusted input being held in memory
/// on somebody's phone: [sampleRowLimit] lines, and the platform's own
/// `maxColumns` for width.
@immutable
final class StatementSample {
  const StatementSample({required this.rows, required this.columnCount});

  /// The lines read, in file order. The first is the header row when the
  /// person has said the file has one — which they state, and which nothing
  /// here detects.
  final List<SampleRow> rows;

  /// The widest line in the sample. What [checkMapping] compares column
  /// indexes against, so a mapping pointing past the end of the file is caught
  /// before the upload rather than on line 40,000.
  final int columnCount;

  bool get isEmpty => rows.isEmpty;

  @override
  String toString() => 'StatementSample(rows: ${rows.length})';
}

/// How many lines the mapping step reads. Enough to see the shape of a file,
/// few enough that a 10 MiB statement does not become a 10 MiB widget tree.
const int sampleRowLimit = 6;

/// The widest line the platform accepts, mirrored from
/// `INGESTION_LIMIT_POLICIES.csvStatementImport.maxColumns`.
const int maxSampleColumns = 64;

/// Why a chosen file could not be shown for mapping.
enum SampleProblem {
  /// The bytes are not valid UTF-8.
  ///
  /// Refused rather than repaired. Decoding with replacement would put U+FFFD
  /// inside somebody's merchant name and then show it to them as though their
  /// bank had written it; the platform refuses the same case with
  /// `INVALID_ENCODING`, and the two answers agree.
  invalidEncoding,

  /// A quoted field that never closes. Splitting it anyway would silently
  /// merge fields and mis-number every column after it.
  malformedQuoting,

  /// The file has no lines at all.
  empty,

  /// A line is wider than the platform accepts.
  tooManyColumns,
}
