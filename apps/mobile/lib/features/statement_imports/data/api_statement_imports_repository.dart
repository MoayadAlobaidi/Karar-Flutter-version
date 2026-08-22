// THE STATEMENT-IMPORT REPOSITORY, OVER THE GENERATED CLIENT.
//
// Every request here is issued by a generated method. No path, no query name,
// no body field and no media type is spelled out: the contract declares each
// once and the generator emits it once.
//
// THE UPLOAD PASSES BYTES BY IDENTITY. `bytes` goes into the generated method
// exactly as the picker produced it — not copied, not decoded, not re-encoded,
// not normalised, not trimmed of a byte-order mark. What the person's bank
// wrote is what the platform parses. A client that "helpfully" cleaned the file
// would be altering a financial record in the one place its owner cannot check
// (ADR-0029), and it would break the file fingerprint the platform uses to
// notice that a statement has already been imported.
//
// The upload carries an IDEMPOTENCY KEY derived from the import it belongs to.
// An upload that fails mid-flight leaves a client unable to know whether it
// took effect; without a key the transport may not replay it, and a person is
// left to guess whether to try again. The key is the import's own id, which is
// already the server's name for this exact operation on this exact draft — a
// retry is the same upload, and the platform treats it as one.
import 'dart:typed_data';

import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../financial_accounts/data/contract_mapping.dart';
import '../domain/column_mapping.dart';
import '../domain/statement_import.dart';
import '../domain/statement_imports_repository.dart';
import 'statement_import_contract_mapping.dart';

/// [StatementImportsRepository] over the generated client.
final class ApiStatementImportsRepository implements StatementImportsRepository {
  const ApiStatementImportsRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<StatementImportSnapshot>> startImport({
    required String accountId,
    String? connectionId,
  }) =>
      guarded<StatementImportSnapshot>(
        'financial.statementImports.start',
        () async => snapshotFromViewDto(
          await _client.createOwnStatementImport(
            body: CreateOwnStatementImportRequestDto(
              accountId: accountId,
              connectionId: connectionId == null
                  ? const Omittable<String>.omitted()
                  : Omittable<String>.sent(connectionId),
            ),
          ),
        ),
      );

  @override
  Future<Result<StatementImportSnapshot>> uploadSource({
    required String importId,
    required Uint8List bytes,
  }) =>
      guarded<StatementImportSnapshot>(
        'financial.statementImports.upload',
        () async => snapshotFromViewDto(
          await _client.uploadOwnStatementImportSource(
            importId: importId,
            body: bytes,
            idempotencyKey: importId,
          ),
        ),
      );

  @override
  Future<Result<StatementImportSnapshot>> parseSource({
    required String importId,
    required StatementColumnMapping mapping,
    StatedStatementBalance? statedBalance,
  }) =>
      guarded<StatementImportSnapshot>(
        'financial.statementImports.parse',
        () async => snapshotFromViewDto(
          await _client.parseOwnStatementImportSource(
            importId: importId,
            body: ParseOwnStatementImportSourceRequestDto(
              mapping: mappingToDto(mapping),
              statedBalance: statedBalance == null
                  ? const Omittable<StatedStatementBalanceDto>.omitted()
                  : Omittable<StatedStatementBalanceDto>.sent(
                      statedBalanceToDto(statedBalance),
                    ),
            ),
          ),
        ),
      );

  @override
  Future<Result<StatementImportPreview>> readPreview({
    required String importId,
    int? limit,
    String? cursor,
  }) =>
      guarded<StatementImportPreview>(
        'financial.statementImports.preview',
        () async => previewFromDto(
          await _client.listOwnStatementImportPreview(
            importId: importId,
            limit: limit,
            cursor: cursor,
          ),
        ),
      );

  @override
  Future<Result<ImportCommitReceipt>> commit({
    required String importId,
    required int expectedVersion,
  }) =>
      guarded<ImportCommitReceipt>(
        'financial.statementImports.commit',
        () async => commitReceiptFromDto(
          await _client.commitOwnStatementImport(
            importId: importId,
            body: CommitOwnStatementImportRequestDto(expectedVersion: expectedVersion),
            // The commit is the one operation here that creates financial
            // records. A retry after a successful commit must answer the
            // original receipt rather than writing a second set, which is what
            // the key buys — the platform is idempotent on it by contract.
            idempotencyKey: importId,
          ),
        ),
      );

  @override
  Future<Result<ImportErasureReceipt>> erase({required String importId}) =>
      guarded<ImportErasureReceipt>(
        'financial.statementImports.erase',
        () async => erasureReceiptFromDto(
          await _client.eraseOwnStatementImport(importId: importId),
        ),
      );
}
