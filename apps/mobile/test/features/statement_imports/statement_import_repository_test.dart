// THE REPOSITORY, AGAINST THE REAL GENERATED CLIENT.
//
// The transport is faked; `KararApiClient` is not. Everything these tests
// exercise — the path, the media type, the body encoding, the DTO decoding — is
// the generated reading of the contract, so a contract change that the client
// has not absorbed fails here rather than in production.
//
// The two properties worth stating up front:
//
//   * THE FILE BYTES ARE PASSED BY IDENTITY. Nothing copies, re-encodes,
//     normalises or trims them between the picker and the wire. A client that
//     "cleaned" the file would change what the platform parses and would break
//     the fingerprint it uses to notice an already-imported statement;
//   * EVERY TYPED CODE ARRIVES AS ITSELF. A refusal is not flattened into a
//     generic failure on the way in, because a person cannot act on a generic
//     failure.
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/statement_imports/data/api_statement_imports_repository.dart';
import 'package:karar_mobile/features/statement_imports/domain/column_mapping.dart';
import 'package:karar_mobile/features/statement_imports/domain/import_lifecycle.dart';
import 'package:karar_mobile/features/statement_imports/domain/row_issue.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_import.dart';

import '../../core/support/fakes.dart';

({ApiStatementImportsRepository repository, FakeApiTransport transport}) repositoryFor(
  Object? body, {
  int statusCode = 200,
}) {
  final transport = FakeApiTransport(
    (ApiRequest request) async => ApiResponse(statusCode: statusCode, body: body),
  );
  return (
    repository: ApiStatementImportsRepository(KararApiClient(transport)),
    transport: transport,
  );
}

Map<String, Object?> countsBody({
  int rowCount = 10,
  int validRowCount = 8,
  int invalidRowCount = 2,
  int exactDuplicateCount = 0,
}) => <String, Object?>{
  'rowCount': rowCount,
  'validRowCount': validRowCount,
  'invalidRowCount': invalidRowCount,
  'exactDuplicateCount': exactDuplicateCount,
  'probableDuplicateCount': 0,
  'committedTransactionCount': 0,
};

Map<String, Object?> importBody({
  String state = 'SOURCE_STORED',
  String? refusalCode,
  String reconciliation = 'NOT_AVAILABLE',
  int version = 4,
}) => <String, Object?>{
  'importId': '11111111-1111-4111-8111-111111111111',
  'accountId': '22222222-2222-4222-8222-222222222222',
  'connectionId': null,
  'state': state,
  'stateChangedAt': '2026-04-03T10:00:00Z',
  'mediaType': 'text/csv',
  'rail': 'USER_FILE_UPLOAD',
  'availability': 'EXECUTABLE',
  'hasStoredSource': true,
  'retentionState': 'DECIDED',
  'versions': null,
  'counts': countsBody(),
  'reconciliationStatus': reconciliation,
  'statedBalance': null,
  'refusalCode': refusalCode,
  'awaitsDecision': true,
  'committedAt': null,
  'erasedAt': null,
  'createdAt': '2026-04-03T09:00:00Z',
  'version': version,
};

Map<String, Object?> previewBody({
  List<Map<String, Object?>> rowErrors = const <Map<String, Object?>>[],
  int? reportedErrorCount,
  int totalErrorCount = 0,
  String? refusalCode,
}) => <String, Object?>{
  'importId': '11111111-1111-4111-8111-111111111111',
  'accountId': '22222222-2222-4222-8222-222222222222',
  'connectionId': null,
  'state': 'REVIEW_REQUIRED',
  'hasStoredSource': true,
  'counts': countsBody(),
  'reconciliationStatus': 'MATCHED',
  'versions': null,
  'refusalCode': refusalCode,
  'awaitsDecision': true,
  'reportedErrorCount': reportedErrorCount ?? rowErrors.length,
  'totalErrorCount': totalErrorCount,
  'rowErrors': rowErrors,
  'page': <String, Object?>{
    'limit': 50,
    'returned': rowErrors.length,
    'hasMore': false,
    'nextCursor': null,
  },
};

void main() {
  group('the upload hands the platform exactly the bytes it was given', () {
    test('the bytes travel by identity, unchanged and uncopied', () async {
      // A byte-order mark, a Windows line ending, a padded cell and non-ASCII
      // text: everything a well-meaning client might "fix" on the way past.
      final bytes = Uint8List.fromList(<int>[
        0xEF, 0xBB, 0xBF, // BOM
        0x61, 0x2C, 0x20, 0x62, 0x20, // 'a, b '
        0x0D, 0x0A, // CRLF
      ]);
      final harness = repositoryFor(importBody());

      await harness.repository.uploadSource(importId: 'abc', bytes: bytes);

      final raw = harness.transport.requests.single.rawBody;
      expect(raw, isNotNull);
      expect(
        identical(raw!.bytes, bytes),
        isTrue,
        reason:
            'the bytes must reach the transport as the same object. A copy '
            'is a place for a transformation to be added later.',
      );
    });

    test('the media type comes from the contract, not from this feature', () {
      // Nothing in `lib/features/statement_imports` spells a media type for
      // the wire; the generator derived it from the contract.
      final harness = repositoryFor(importBody());
      return harness.repository
          .uploadSource(importId: 'abc', bytes: Uint8List.fromList(<int>[1]))
          .then((_) {
            expect(harness.transport.requests.single.rawBody!.mediaType, 'text/csv');
          });
    });

    test('the upload is replayable, so a mid-flight failure is not a guess', () async {
      final harness = repositoryFor(importBody());
      await harness.repository.uploadSource(importId: 'abc', bytes: Uint8List.fromList(<int>[1]));
      expect(harness.transport.requests.single.idempotencyKey, isNotNull);
      expect(harness.transport.requests.single.isReplayable, isTrue);
    });
  });

  group('a typed refusal arrives as itself', () {
    test('a duplicate upload is a success carrying its own code', () async {
      // Re-uploading a committed file answers 200 in DUPLICATE with
      // SOURCE_ALREADY_IMPORTED. Treating it as a failure would tell a person
      // their import broke when in fact it was refused for a stated reason.
      final harness = repositoryFor(
        importBody(state: 'DUPLICATE', refusalCode: 'SOURCE_ALREADY_IMPORTED'),
      );

      final result = await harness.repository.uploadSource(
        importId: 'abc',
        bytes: Uint8List.fromList(<int>[1]),
      );

      final snapshot = (result as Success<StatementImportSnapshot>).value;
      expect(snapshot.state, ImportLifecycleState.duplicate);
      expect(snapshot.refusal, ImportRefusal.sourceAlreadyImported);
    });

    test('a spreadsheet refusal is not flattened into a generic one', () async {
      final harness = repositoryFor(
        importBody(state: 'FAILED', refusalCode: 'SPREADSHEET_CONTENT'),
      );
      final result = await harness.repository.uploadSource(
        importId: 'abc',
        bytes: Uint8List.fromList(<int>[1]),
      );
      expect(
        (result as Success<StatementImportSnapshot>).value.refusal,
        ImportRefusal.spreadsheetContent,
      );
    });

    test('a refusal code this build does not ship becomes unrecognised', () async {
      // Never a real member: a newer platform must not make an old client
      // confidently display the wrong reason.
      final harness = repositoryFor(
        importBody(state: 'FAILED', refusalCode: 'SOME_CODE_FROM_THE_FUTURE'),
      );
      final result = await harness.repository.uploadSource(
        importId: 'abc',
        bytes: Uint8List.fromList(<int>[1]),
      );
      expect(
        (result as Success<StatementImportSnapshot>).value.refusal,
        ImportRefusal.unrecognised,
      );
    });

    test('no refusal code stays null rather than becoming a reason', () async {
      final harness = repositoryFor(importBody());
      final result = await harness.repository.uploadSource(
        importId: 'abc',
        bytes: Uint8List.fromList(<int>[1]),
      );
      expect((result as Success<StatementImportSnapshot>).value.refusal, isNull);
    });
  });

  group('the preview carries codes and counts, and no cell', () {
    test('a row error decodes to its line, field and reason', () async {
      final harness = repositoryFor(
        previewBody(
          rowErrors: <Map<String, Object?>>[
            <String, Object?>{
              'rowNumber': 14,
              'safeField': 'AMOUNT',
              'reasonCode': 'AMBIGUOUS_DECIMAL_SEPARATOR',
            },
          ],
          totalErrorCount: 1,
        ),
      );

      final result = await harness.repository.readPreview(importId: 'abc');
      final preview = (result as Success<StatementImportPreview>).value;

      expect(preview.rowIssues.single.rowNumber, 14);
      expect(preview.rowIssues.single.field, StatementField.amount);
      expect(preview.rowIssues.single.reason, RowIssueReason.ambiguousDecimalSeparator);
    });

    test('an over-long field surfaces as its own typed reason', () async {
      final harness = repositoryFor(
        previewBody(
          rowErrors: <Map<String, Object?>>[
            <String, Object?>{
              'rowNumber': 3,
              'safeField': 'DESCRIPTION',
              'reasonCode': 'FIELD_TOO_LARGE',
            },
          ],
          totalErrorCount: 1,
        ),
      );
      final result = await harness.repository.readPreview(importId: 'abc');
      final issue = (result as Success<StatementImportPreview>).value.rowIssues.single;
      expect(issue.reason, RowIssueReason.fieldTooLarge);
      expect(issue.field, StatementField.description);
      expect(issue.reason.remedy, RowIssueRemedy.respectABound);
    });

    test('a truncated report says so, carrying both counts', () async {
      // Collapsing the two would turn a truncated report into a
      // complete-looking one.
      final harness = repositoryFor(
        previewBody(
          rowErrors: <Map<String, Object?>>[
            <String, Object?>{
              'rowNumber': 1,
              'safeField': 'ROW',
              'reasonCode': 'COLUMN_COUNT_MISMATCH',
            },
          ],
          reportedErrorCount: 1,
          totalErrorCount: 900,
        ),
      );

      final result = await harness.repository.readPreview(importId: 'abc');
      final preview = (result as Success<StatementImportPreview>).value;

      expect(preview.reportedErrorCount, 1);
      expect(preview.totalErrorCount, 900);
      expect(preview.isTruncated, isTrue);
    });

    test('a complete report is not reported as truncated', () async {
      final harness = repositoryFor(previewBody(totalErrorCount: 0));
      final result = await harness.repository.readPreview(importId: 'abc');
      expect((result as Success<StatementImportPreview>).value.isTruncated, isFalse);
    });

    test('the preview carries no version, so it cannot be committed blind', () async {
      final harness = repositoryFor(previewBody());
      final result = await harness.repository.readPreview(importId: 'abc');
      final preview = (result as Success<StatementImportPreview>).value;
      expect(preview.snapshot.version, isNull);
      expect(preview.snapshot.canCommit, isFalse);
    });

    test('counts decode, including the always-zero probable duplicates', () async {
      final harness = repositoryFor(previewBody());
      final result = await harness.repository.readPreview(importId: 'abc');
      final counts = (result as Success<StatementImportPreview>).value.snapshot.counts;
      expect(counts.rowCount, 10);
      expect(counts.validRowCount, 8);
      expect(counts.invalidRowCount, 2);
      expect(counts.probableDuplicateCount, 0);
    });
  });

  group('the parse sends the mapping the person stated', () {
    test('a signed mapping carries its sign frame', () async {
      final harness = repositoryFor(importBody(state: 'REVIEW_REQUIRED'));

      await harness.repository.parseSource(
        importId: 'abc',
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(amountColumn: 2, signFrame: AmountSignFrame.bankLedger),
          hasHeaderRow: true,
          statedCurrencyCode: 'QAR',
          dateOrder: StatementDateOrder.dayFirst,
        ),
      );

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      final mapping = body['mapping']! as Map<String, Object?>;
      final amount = mapping['amount']! as Map<String, Object?>;

      expect(amount['kind'], 'SIGNED');
      expect(amount['signFrame'], 'BANK_LEDGER');
      expect(mapping['dateOrder'], 'DAY_FIRST');
      expect(mapping['statedCurrency'], 'QAR');
      expect(mapping['hasHeaderRow'], isTrue);
    });

    test('an unstated date order is omitted rather than defaulted', () async {
      // Sending a value nobody chose is exactly the guess the platform refuses
      // to make. Omitting it produces typed AMBIGUOUS_DATE_ORDER row errors.
      final harness = repositoryFor(importBody(state: 'REVIEW_REQUIRED'));

      await harness.repository.parseSource(
        importId: 'abc',
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(amountColumn: 2, signFrame: AmountSignFrame.accountHolder),
          hasHeaderRow: true,
          statedCurrencyCode: 'QAR',
        ),
      );

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      final mapping = body['mapping']! as Map<String, Object?>;
      expect(mapping.containsKey('dateOrder'), isFalse);
    });

    test('a debit and credit pair carries both columns and no frame', () async {
      final harness = repositoryFor(importBody(state: 'REVIEW_REQUIRED'));

      await harness.repository.parseSource(
        importId: 'abc',
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: DebitCreditAmountMapping(debitColumn: 2, creditColumn: 3),
          hasHeaderRow: false,
          statedCurrencyCode: 'QAR',
        ),
      );

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      final amount = (body['mapping']! as Map<String, Object?>)['amount']! as Map<String, Object?>;
      expect(amount['kind'], 'DEBIT_CREDIT');
      expect(amount['debitColumn'], 2);
      expect(amount['creditColumn'], 3);
      expect(amount.containsKey('signFrame'), isFalse);
    });

    test('a stated balance travels as exact minor-unit characters', () async {
      // Never a JSON number: a number is a float, and a float is not a ledger
      // value.
      final harness = repositoryFor(importBody(state: 'REVIEW_REQUIRED'));

      await harness.repository.parseSource(
        importId: 'abc',
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(amountColumn: 2, signFrame: AmountSignFrame.accountHolder),
          hasHeaderRow: true,
          statedCurrencyCode: 'QAR',
        ),
        statedBalance: const StatedStatementBalance(
          minorUnits: '125000',
          kind: StatementBalanceKind.closing,
          currencyCode: 'QAR',
        ),
      );

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      final balance = body['statedBalance']! as Map<String, Object?>;
      expect(balance['minorUnits'], isA<String>());
      expect(balance['minorUnits'], '125000');
      expect(balance['kind'], 'CLOSING');
    });

    test('no stated balance is omitted entirely', () async {
      final harness = repositoryFor(importBody(state: 'REVIEW_REQUIRED'));
      await harness.repository.parseSource(
        importId: 'abc',
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(amountColumn: 2, signFrame: AmountSignFrame.accountHolder),
          hasHeaderRow: true,
          statedCurrencyCode: 'QAR',
        ),
      );
      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      expect(body.containsKey('statedBalance'), isFalse);
    });
  });

  group('the commit', () {
    test('sends the expected version and reports an idempotent retry', () async {
      final harness = repositoryFor(<String, Object?>{
        'importId': '11111111-1111-4111-8111-111111111111',
        'committedTransactionCount': 7,
        'alreadyCommitted': true,
        'transactionIds': <String>[],
      });

      final result = await harness.repository.commit(importId: 'abc', expectedVersion: 9);

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      expect(body['expectedVersion'], 9);

      final receipt = (result as Success<ImportCommitReceipt>).value;
      expect(receipt.alreadyCommitted, isTrue);
      expect(receipt.committedTransactionCount, 7);
    });

    test('a platform refusal becomes a typed failure, not a throw', () async {
      final harness = repositoryFor(<String, Object?>{
        'code': 'RECONCILIATION_BLOCKED',
        'title': 'Blocked',
        'status': 409,
      }, statusCode: 409);
      final result = await harness.repository.commit(importId: 'abc', expectedVersion: 1);
      expect(result, isA<Failed<ImportCommitReceipt>>());
    });
  });

  group('erasure', () {
    test('reports what was removed', () async {
      final harness = repositoryFor(<String, Object?>{
        'importId': '11111111-1111-4111-8111-111111111111',
        'storedObjectDeleted': true,
        'rowsDeleted': true,
      });
      final result = await harness.repository.erase(importId: 'abc');
      final receipt = (result as Success<ImportErasureReceipt>).value;
      expect(receipt.storedObjectDeleted, isTrue);
      expect(receipt.rowsDeleted, isTrue);
    });
  });
}
