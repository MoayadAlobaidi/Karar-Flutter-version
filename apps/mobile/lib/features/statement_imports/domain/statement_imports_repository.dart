// THE PORT, AND THE USE CASES OVER IT.
//
// The sequence the person drives, one method per step:
//
//   start -> upload the bytes -> parse under a stated mapping -> review ->
//   commit, or erase.
//
// There is deliberately NO `updateMapping`. The mapping is an ARGUMENT to the
// parse and there is no stored draft of one, so correcting it means parsing
// again with the corrected mapping. A method here that appeared to save a
// mapping and changed nothing would be worse than its absence.
//
// Every method answers `Result`, never a throw: an expected outcome is a value,
// and a sealed `Result` means a caller cannot forget the failure branch.
import 'dart:typed_data';

import '../../../core/errors/result.dart';
import 'column_mapping.dart';
import 'statement_import.dart';

/// The statement-import surface.
abstract interface class StatementImportsRepository {
  /// Creates a draft against one of the person's own accounts.
  ///
  /// The retention decision for the source bytes is resolved by the platform
  /// HERE, before a durable byte can exist.
  Future<Result<StatementImportSnapshot>> startImport({
    required String accountId,
    String? connectionId,
  });

  /// Uploads the CSV bytes for a draft import.
  ///
  /// [bytes] is handed to the platform unmodified. Re-uploading a file this
  /// person already committed answers a snapshot in `DUPLICATE` carrying
  /// `SOURCE_ALREADY_IMPORTED` rather than importing the same statement twice
  /// — a success, not a failure, and the surface presents it as one.
  Future<Result<StatementImportSnapshot>> uploadSource({
    required String importId,
    required Uint8List bytes,
  });

  /// Parses the stored source under a stated mapping.
  ///
  /// Writes nothing financial. The import moves to `REVIEW_REQUIRED` and waits
  /// for a person.
  Future<Result<StatementImportSnapshot>> parseSource({
    required String importId,
    required StatementColumnMapping mapping,
    StatedStatementBalance? statedBalance,
  });

  /// Reads one page of the review surface.
  Future<Result<StatementImportPreview>> readPreview({
    required String importId,
    int? limit,
    String? cursor,
  });

  /// Commits the reviewed import, writing its valid rows as transactions.
  ///
  /// [expectedVersion] is required by the contract and by this signature. It
  /// comes from the response to the last write — the upload or the parse.
  Future<Result<ImportCommitReceipt>> commit({
    required String importId,
    required int expectedVersion,
  });

  /// Erases the import, its stored source and its staged rows.
  ///
  /// This is how a person says no. Transactions a committed import already
  /// produced are NOT erased: they are ordinary records of the person's, and
  /// removing them as a side effect of tidying an import would delete data
  /// nobody asked to lose.
  Future<Result<ImportErasureReceipt>> erase({required String importId});
}

/// Starts the sequence against an account the person chose.
final class StartStatementImport {
  const StartStatementImport(this._repository);

  final StatementImportsRepository _repository;

  Future<Result<StatementImportSnapshot>> call({
    required String accountId,
    String? connectionId,
  }) =>
      _repository.startImport(accountId: accountId, connectionId: connectionId);
}

/// Hands the chosen file's bytes to the platform.
final class UploadStatementSource {
  const UploadStatementSource(this._repository);

  final StatementImportsRepository _repository;

  Future<Result<StatementImportSnapshot>> call({
    required String importId,
    required Uint8List bytes,
  }) =>
      _repository.uploadSource(importId: importId, bytes: bytes);
}

/// Parses under the mapping the person stated.
final class ParseStatementSource {
  const ParseStatementSource(this._repository);

  final StatementImportsRepository _repository;

  Future<Result<StatementImportSnapshot>> call({
    required String importId,
    required StatementColumnMapping mapping,
    StatedStatementBalance? statedBalance,
  }) =>
      _repository.parseSource(
        importId: importId,
        mapping: mapping,
        statedBalance: statedBalance,
      );
}

/// Reads what the parse produced.
final class ReadStatementImportPreview {
  const ReadStatementImportPreview(this._repository);

  final StatementImportsRepository _repository;

  Future<Result<StatementImportPreview>> call({
    required String importId,
    int? limit,
    String? cursor,
  }) =>
      _repository.readPreview(importId: importId, limit: limit, cursor: cursor);
}

/// Writes the reviewed rows as transactions.
final class CommitStatementImport {
  const CommitStatementImport(this._repository);

  final StatementImportsRepository _repository;

  Future<Result<ImportCommitReceipt>> call({
    required String importId,
    required int expectedVersion,
  }) =>
      _repository.commit(importId: importId, expectedVersion: expectedVersion);
}

/// Removes the staged statement.
final class EraseStatementImport {
  const EraseStatementImport(this._repository);

  final StatementImportsRepository _repository;

  Future<Result<ImportErasureReceipt>> call({required String importId}) =>
      _repository.erase(importId: importId);
}
