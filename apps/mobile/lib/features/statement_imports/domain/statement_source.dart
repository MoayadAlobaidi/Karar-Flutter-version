// THE FILE THE PERSON CHOSE, AND THE BOUNDS IT IS HELD TO.
//
// The bytes live here exactly as they were read. Nothing in this file — or
// anywhere on the path to the upload — trims, re-encodes, normalises, repairs
// or reflows them. The platform parses what the person's bank wrote, and a
// client that "cleaned" the file first would be changing a financial record in
// the one place nobody can check (ADR-0029).
//
// ## The size bound is the server's, not one this client invented
//
// `INGESTION_LIMIT_POLICIES.csvStatementImport.maxBytes` in
// `packages/platform/src/ingestion/limits.ts` is 10 MiB, and [maxSourceBytes]
// is that same number. Checking it here does NOT make the client an authority:
// the server checks the declared length before reading a byte and the
// accumulated length on every chunk, and refuses with `SOURCE_TOO_LARGE`
// regardless of what this client believed. The check exists so a person with a
// 400 MB file is told in the moment they choose it rather than after uploading
// it over a mobile connection.
//
// A bound that drifts from the server's is worse than no bound, so the constant
// names its source and `statement_source_test.dart` states the number
// independently — two places that must be edited together, rather than one that
// can quietly disagree with the platform.
import 'dart:typed_data';

import 'package:meta/meta.dart';

/// The largest source this ingestion path accepts, in bytes.
///
/// Mirrors `INGESTION_LIMIT_POLICIES.csvStatementImport.maxBytes`
/// (`packages/platform/src/ingestion/limits.ts`). 10 MiB.
const int maxSourceBytes = 10 * 1024 * 1024;

/// The only media type this ingestion path accepts.
///
/// Stated here as the vocabulary the PICKER filters on — what a document
/// provider is asked to offer. It is deliberately NOT what the upload sends:
/// the contract declares the request media type and the generated client
/// carries it, so nothing here spells one out for the wire.
const String csvMediaType = 'text/csv';

/// A file the person chose, as it was read.
@immutable
final class SelectedStatementSource {
  const SelectedStatementSource({required this.bytes, required this.declaredMediaType});

  /// The file's bytes, unmodified. Handed to the generated client by identity;
  /// what the person chose is what the platform parses.
  final Uint8List bytes;

  /// What the document provider said this file is. Advisory only: the platform
  /// decides for itself whether the content is CSV, and refuses binary,
  /// spreadsheet and compressed content by inspecting it rather than by
  /// trusting a label the file carried.
  final String declaredMediaType;

  int get byteCount => bytes.length;

  /// Whether this source can be offered to the platform at all.
  ///
  /// Null when it can. A non-null answer is a refusal this client can state
  /// without a round trip; it never turns a refusal the SERVER would make into
  /// an acceptance.
  SourceProblem? get problem {
    if (bytes.isEmpty) {
      return SourceProblem.empty;
    }
    if (bytes.length > maxSourceBytes) {
      return SourceProblem.tooLarge;
    }
    return null;
  }

  /// Carries no bytes and no length: a size is a fact about somebody's
  /// statement, and this string ends up in diagnostics.
  @override
  String toString() => 'SelectedStatementSource()';
}

/// Why a chosen file cannot be offered to the platform.
///
/// Deliberately small. This client refuses only what it can refuse HONESTLY —
/// a file with no bytes, and a file past the declared bound. It does not
/// pre-judge encoding, quoting, or whether the content is really a
/// spreadsheet: the platform inspects content and answers with its own typed
/// refusal codes, and a client that guessed would produce a second, quieter
/// vocabulary standing next to the real one.
enum SourceProblem {
  /// The file has no bytes at all.
  empty,

  /// Past `maxSourceBytes`. The platform would refuse this as
  /// `SOURCE_TOO_LARGE`; saying so before the upload saves the upload.
  tooLarge,
}
