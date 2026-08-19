// READS A FEW LINES OF THE CHOSEN FILE, SO THE MAPPING STEP HAS SOMETHING TO
// SHOW.
//
// ## This is not the parser, and must never become one
//
// `modules/statement-imports/infrastructure/parsing/streaming-csv-parser.ts` is
// the parser. It is the authority on what every line of the file means, it runs
// server-side under the platform's bounds, and its answers are the ones that
// become financial records. THIS reads at most [sampleRowLimit] lines for one
// purpose: putting the file's own columns in front of the person so that
// "column 4" is a thing they can see rather than a thing they must count.
//
// Consequences of that, all deliberate:
//
//   * it derives NOTHING. No mapping is guessed, no column is scored, no header
//     is matched against a list of known names. The person states the mapping;
//     this only draws the grid they state it against;
//   * it decides nothing about validity. A line this reader splits happily may
//     still be refused by the platform, and that is not a disagreement — the
//     platform applies rules this deliberately does not have;
//   * it never sends anything. The sample stays on the device.
//
// ## Strict UTF-8, like the platform
//
// Decoding is strict. A malformed sequence is a refusal, not a repair: decoding
// with replacement would put U+FFFD inside somebody's merchant name and then
// show it to them as though their bank had written it. The platform refuses the
// same case with `INVALID_ENCODING`, so the client's answer and the server's
// agree instead of the client quietly accepting what the server will reject.
//
// Nothing is trimmed, normalised, case-folded or stripped. RFC 4180 quote
// decoding — removing a field's surrounding quotes and turning `""` into `"` —
// is how the FORMAT encodes a value, not a modification of it, and it is the
// only transformation performed.
import 'dart:convert';
import 'dart:typed_data';

import '../domain/statement_sample.dart';

/// How many bytes are examined to find the sample's lines.
///
/// One maximal row the platform would accept is `maxColumns` × `maxFieldBytes`
/// = 512 KiB, so a budget of 1 MiB holds at least one whole row of any file the
/// platform would take. Files smaller than this are read entirely.
const int _sampleByteBudget = 1024 * 1024;

/// The outcome of reading a sample: the grid, or why there is none.
final class SampleReading {
  const SampleReading.success(this.sample) : problem = null;

  const SampleReading.refused(SampleProblem this.problem) : sample = null;

  final StatementSample? sample;
  final SampleProblem? problem;
}

/// Reads the first few lines of [bytes] for the mapping step.
SampleReading readStatementSample(Uint8List bytes) {
  if (bytes.isEmpty) {
    return const SampleReading.refused(SampleProblem.empty);
  }

  final String text;
  try {
    text = utf8.decode(_decodablePrefix(bytes));
  } on FormatException {
    return const SampleReading.refused(SampleProblem.invalidEncoding);
  }

  return _splitRows(text);
}

/// The largest prefix of [bytes] that is safe to decode on its own.
///
/// A line feed (0x0A) can never occur inside a UTF-8 multi-byte sequence —
/// continuation bytes are all >= 0x80 — so cutting at the last line feed within
/// the budget always lands on a character boundary. When the budget holds no
/// line feed at all, the whole file is decoded rather than guessing at a
/// boundary: the file is already bounded at 10 MiB, and a wrong guess would
/// report a valid file as badly encoded.
Uint8List _decodablePrefix(Uint8List bytes) {
  if (bytes.length <= _sampleByteBudget) {
    return bytes;
  }
  for (var index = _sampleByteBudget - 1; index >= 0; index--) {
    if (bytes[index] == 0x0A) {
      return Uint8List.sublistView(bytes, 0, index + 1);
    }
  }
  return bytes;
}

const int _quote = 0x22;
const int _comma = 0x2C;
const int _lineFeed = 0x0A;
const int _carriageReturn = 0x0D;

/// Splits [text] into at most [sampleRowLimit] rows, RFC 4180 style.
SampleReading _splitRows(String text) {
  final rows = <SampleRow>[];
  final fields = <UntrustedCell>[];
  final field = StringBuffer();
  var inQuotes = false;
  var widest = 0;

  // Whether the row being built holds anything at all. A file's trailing
  // newline would otherwise produce a final row of one empty cell, which would
  // be shown to the person as a line their file does not have.
  var rowHasContent = false;

  SampleProblem? closeRow() {
    fields.add(UntrustedCell(field.toString()));
    field.clear();
    if (fields.length > maxSampleColumns) {
      return SampleProblem.tooManyColumns;
    }
    widest = fields.length > widest ? fields.length : widest;
    rows.add(SampleRow(List<UntrustedCell>.unmodifiable(fields)));
    fields.clear();
    rowHasContent = false;
    return null;
  }

  final units = text.codeUnits;
  for (var index = 0; index < units.length; index++) {
    final unit = units[index];

    if (inQuotes) {
      if (unit == _quote) {
        // A doubled quote inside a quoted field is one literal quote.
        if (index + 1 < units.length && units[index + 1] == _quote) {
          field.writeCharCode(_quote);
          index++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field.writeCharCode(unit);
      rowHasContent = true;
      continue;
    }

    if (unit == _quote) {
      inQuotes = true;
      rowHasContent = true;
      continue;
    }
    if (unit == _comma) {
      fields.add(UntrustedCell(field.toString()));
      field.clear();
      rowHasContent = true;
      if (fields.length > maxSampleColumns) {
        return const SampleReading.refused(SampleProblem.tooManyColumns);
      }
      continue;
    }
    if (unit == _lineFeed) {
      final problem = closeRow();
      if (problem != null) {
        return SampleReading.refused(problem);
      }
      if (rows.length == sampleRowLimit) {
        return SampleReading.success(
          StatementSample(rows: List<SampleRow>.unmodifiable(rows), columnCount: widest),
        );
      }
      continue;
    }
    if (unit == _carriageReturn &&
        index + 1 < units.length &&
        units[index + 1] == _lineFeed) {
      // CRLF: the carriage return belongs to the line ending, not to the field.
      continue;
    }
    field.writeCharCode(unit);
    rowHasContent = true;
  }

  // An unterminated quote. Splitting it anyway would silently merge fields and
  // mis-number every column after it — which is precisely how a person maps
  // "column 4" onto a column that is not there.
  if (inQuotes) {
    return const SampleReading.refused(SampleProblem.malformedQuoting);
  }

  if (rowHasContent || field.isNotEmpty || fields.isNotEmpty) {
    final problem = closeRow();
    if (problem != null) {
      return SampleReading.refused(problem);
    }
  }

  if (rows.isEmpty) {
    return const SampleReading.refused(SampleProblem.empty);
  }

  return SampleReading.success(
    StatementSample(rows: List<SampleRow>.unmodifiable(rows), columnCount: widest),
  );
}
