// THE TRANSACTION CONTRACT, DECODED AND ENCODED.
//
// Every body here is a well-formed contract payload driven through the
// GENERATED client and DTOs into the domain. The screen tests above this one
// use scripted repositories, so this is the only place that proves the real
// mapping — and it is the mapping where two things matter most:
//
//   * a CALENDAR DAY stays a day. `bookingDate` and `valueDate` are
//     `format: date` and become [CalendarDay], in both directions, so no zone
//     offset is ever applied to a day an institution wrote on its books;
//   * an AMOUNT stays characters. `minorUnits` is never parsed to a number,
//     and a value the contract forbids is a stated failure rather than
//     something that renders as money.
//
// Every fixture is synthetic. No real bank, telco or wallet is named.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/financial_accounts/domain/calendar_day.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/transactions/data/api_transactions_repository.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/domain/transactions_repository.dart';

import '../../core/support/fakes.dart';

Map<String, Object?> amountBody({
  String minorUnits = '-81000',
  String currency = 'QAR',
  int exponent = 2,
}) => <String, Object?>{'minorUnits': minorUnits, 'currency': currency, 'exponent': exponent};

/// One transaction, exactly as the contract declares it: every field present,
/// the nullable ones carrying null rather than being left out.
Map<String, Object?> transactionBody({
  String direction = 'MONEY_OUT',
  String status = 'POSTED',
  String sourceKind = 'MANUAL',
  String availability = 'EXECUTABLE',
  String? valueDate,
  Object? originalAmount,
  Map<String, Object?>? amount,
}) => <String, Object?>{
  'transactionId': 'transaction-0001',
  'accountId': 'account-0001',
  'amount': amount ?? amountBody(),
  'direction': direction,
  'bookingDate': '2026-03-01',
  'valueDate': valueDate,
  'eventOccurredAt': null,
  'sourceTimezone': null,
  'merchant': null,
  'description': 'A synthetic movement',
  'note': null,
  'originalAmount': originalAmount,
  'sourceKind': sourceKind,
  'availability': availability,
  'status': status,
  'createdAt': '2026-03-01T09:00:00.000Z',
  'version': 1,
};

Map<String, Object?> revisionValuesBody() => <String, Object?>{
  'amount': amountBody(),
  'direction': 'MONEY_OUT',
  'bookingDate': '2026-03-01',
  'valueDate': '2026-03-02',
  'eventOccurredAt': null,
  'sourceTimezone': null,
  'merchant': null,
  'description': 'A synthetic movement',
  'note': null,
  'status': 'POSTED',
};

Map<String, Object?> categoryAssignmentBody({
  String assignmentSource = 'USER',
  String? ruleVersion,
}) => <String, Object?>{
  'assignmentId': 'assignment-0001',
  'categoryCode': 'HOUSEHOLD.UTILITIES',
  'assignmentSource': assignmentSource,
  'ruleVersion': ruleVersion,
  'status': 'ACTIVE',
  'assignedAt': '2026-03-02T09:00:00.000Z',
};

Map<String, Object?> provenanceBody({
  String sourceDirection = 'DEBIT',
  String directionMapping = 'MANUAL_ENTRY',
  String categoryAssignmentSource = 'NONE',
}) => <String, Object?>{
  'revisionNumber': 1,
  'sourceKind': 'MANUAL',
  'availability': 'EXECUTABLE',
  'accountId': 'account-0001',
  'importedFromStatement': false,
  'versions': <String, Object?>{
    'parserVersion': 'p-1',
    'mappingVersion': 'm-1',
    'normalizationVersion': 'n-1',
    'fingerprintVersion': 'f-1',
  },
  'sourceDirection': sourceDirection,
  'directionMapping': directionMapping,
  'categoryAssignmentSource': categoryAssignmentSource,
  'createdAt': '2026-03-01T09:00:00.000Z',
};

Map<String, Object?> pageBody(List<Object?> items) => <String, Object?>{
  'items': items,
  'page': <String, Object?>{
    'limit': 50,
    'returned': items.length,
    'hasMore': false,
    'nextCursor': null,
  },
};

({ApiTransactionsRepository repository, FakeApiTransport transport}) repositoryFor(Object? body) {
  final transport = FakeApiTransport(
    (ApiRequest request) async => ApiResponse(statusCode: 200, body: body),
  );
  return (repository: ApiTransactionsRepository(KararApiClient(transport)), transport: transport);
}

Future<Transaction> transactionFrom(Map<String, Object?> body) async {
  final result = await repositoryFor(pageBody(<Object?>[body])).repository.listOwn();
  return (result as Success<Page<Transaction>>).value.items.single;
}

void main() {
  group('a transaction is mapped out of the generated DTO', () {
    test('every direction and status maps, and an unknown one is unrecognised', () async {
      expect(
        (await transactionFrom(transactionBody(direction: 'MONEY_IN'))).direction,
        MoneyDirection.moneyIn,
      );
      expect(
        (await transactionFrom(transactionBody(direction: 'MONEY_OUT'))).direction,
        MoneyDirection.moneyOut,
      );
      expect(
        (await transactionFrom(transactionBody(direction: 'SOMETHING_NEWER'))).direction,
        MoneyDirection.unrecognised,
      );
      expect(
        (await transactionFrom(transactionBody(status: 'VOIDED'))).status,
        TransactionStatus.voided,
      );
      expect(
        (await transactionFrom(transactionBody(status: 'SOMETHING_NEWER'))).status,
        TransactionStatus.unrecognised,
      );
      expect(
        (await transactionFrom(transactionBody(sourceKind: 'CSV'))).sourceKind,
        SourceKind.csv,
      );
      expect(
        (await transactionFrom(transactionBody(availability: 'NOT_IMPLEMENTED'))).availability,
        RailAvailability.notImplemented,
      );
    });

    test('a booking day is a day, with no time and no zone', () async {
      final held = await transactionFrom(transactionBody(valueDate: '2026-03-02'));
      expect(held.bookingDate, isA<CalendarDay>());
      expect(held.bookingDate.iso8601, '2026-03-01');
      expect(held.valueDate!.iso8601, '2026-03-02');
      // An absent value date stays absent rather than becoming the booking day.
      expect((await transactionFrom(transactionBody())).valueDate, isNull);
    });

    test('an instant stays an instant, normalised to UTC', () async {
      final held = await transactionFrom(transactionBody());
      expect(held.createdAt.isUtc, isTrue);
      expect(held.createdAt, DateTime.utc(2026, 3, 1, 9));
    });

    test('money keeps its exact characters and the contract exponent', () async {
      final held = await transactionFrom(
        transactionBody(
          amount: amountBody(
            minorUnits: '-123456789012345678901234567890',
            currency: 'BHD',
            exponent: 3,
          ),
        ),
      );
      expect(held.amount.minorUnits, '-123456789012345678901234567890');
      expect(held.amount.currency, 'BHD');
      // Three, from the response — not two, from a table in the client.
      expect(held.amount.exponent, 3);
      expect(held.amount.isNegative, isTrue);
    });

    test('an original amount is carried only when the platform sent one', () async {
      expect((await transactionFrom(transactionBody())).originalAmount, isNull);
      final held = await transactionFrom(
        transactionBody(
          originalAmount: amountBody(minorUnits: '-22200', currency: 'USD'),
        ),
      );
      expect(held.originalAmount!.minorUnits, '-22200');
      expect(held.originalAmount!.currency, 'USD');
    });

    test('a minor-unit value the contract forbids is a stated violation', () async {
      final result = await repositoryFor(
        pageBody(<Object?>[
          // A float, which the contract never sends and a ledger cannot use.
          transactionBody(amount: amountBody(minorUnits: '12.50')),
        ]),
      ).repository.listOwn();
      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a malformed day is a stated violation naming the field', () async {
      final malformed = Map<String, Object?>.of(transactionBody())
        ..['bookingDate'] = '2026-03-01T00:00:00Z';
      final result = await repositoryFor(pageBody(<Object?>[malformed])).repository.listOwn();
      expect(result.failureOrNull, isA<ContractViolationFailure>());
      expect(
        (result.failureOrNull! as ContractViolationFailure).location,
        'TransactionView.bookingDate',
      );
    });

    test('a missing required field is a stated violation naming the field', () async {
      final missing = Map<String, Object?>.of(transactionBody())..remove('amount');
      final result = await repositoryFor(pageBody(<Object?>[missing])).repository.listOwn();
      expect(
        (result.failureOrNull! as ContractViolationFailure).location,
        'TransactionView.amount',
      );
    });
  });

  group('the detail, its history and its provenance', () {
    test('a detail carries its revisions and its active category', () async {
      final result = await repositoryFor(<String, Object?>{
        'transaction': transactionBody(),
        'revisions': <Object?>[
          <String, Object?>{
            'revisionNumber': 1,
            'attribution': 'MANUAL_ENTRY',
            'changedFields': <Object?>[],
            'values': revisionValuesBody(),
            'recordedAt': '2026-03-01T09:00:00.000Z',
          },
          <String, Object?>{
            'revisionNumber': 2,
            'attribution': 'USER_INPUT',
            'changedFields': <Object?>['merchant', 'valueDate', 'SOMETHING_NEWER'],
            'values': revisionValuesBody(),
            'recordedAt': '2026-03-02T09:00:00.000Z',
          },
        ],
        'activeCategory': categoryAssignmentBody(),
        'divergesFromSource': true,
      }).repository.read('transaction-0001');

      final detail = (result as Success<TransactionDetail>).value;
      expect(detail.divergesFromSource, isTrue);
      expect(detail.revisions, hasLength(2));
      expect(detail.revisions.first.attribution, RevisionAttribution.manualEntry);
      expect(detail.revisions.last.changedFields, <RevisableField>[
        RevisableField.merchant,
        RevisableField.valueDate,
        // A field name this build does not know is named as unrecognised, not
        // dropped and not guessed at.
        RevisableField.unrecognised,
      ]);
      expect(detail.revisions.last.values.valueDate!.iso8601, '2026-03-02');
      expect(detail.activeCategory!.categoryCode, 'HOUSEHOLD.UTILITIES');
      expect(detail.activeCategory!.assignmentSource, AssignmentSource.user);
      expect(detail.activeCategory!.ruleVersion, isNull);
    });

    test('a transaction with no category assignment has none', () async {
      final result = await repositoryFor(<String, Object?>{
        'transaction': transactionBody(),
        'revisions': <Object?>[],
        'activeCategory': null,
        'divergesFromSource': false,
      }).repository.read('transaction-0001');
      expect((result as Success<TransactionDetail>).value.activeCategory, isNull);
    });

    test('provenance carries the algorithm versions and never a fingerprint', () async {
      final result = await repositoryFor(pageBody(<Object?>[provenanceBody()])).repository
          .listProvenance('transaction-0001');

      final row = (result as Success<List<TransactionProvenance>>).value.single;
      expect(row.sourceDirection, SourceDirection.debit);
      expect(row.directionMapping, DirectionMapping.manualEntry);
      expect(row.categoryAssignmentSource, CategoryAssignmentOrigin.none);
      expect(row.versions.fingerprintVersion, 'f-1');
      expect(row.importedFromStatement, isFalse);
    });

    test('an unknown provenance vocabulary value is unrecognised', () async {
      final result = await repositoryFor(
        pageBody(<Object?>[
          provenanceBody(
            sourceDirection: 'SOMETHING_NEWER',
            directionMapping: 'SOMETHING_NEWER',
            categoryAssignmentSource: 'SOMETHING_NEWER',
          ),
        ]),
      ).repository.listProvenance('transaction-0001');

      final row = (result as Success<List<TransactionProvenance>>).value.single;
      expect(row.sourceDirection, SourceDirection.unrecognised);
      expect(row.directionMapping, DirectionMapping.unrecognised);
      expect(row.categoryAssignmentSource, CategoryAssignmentOrigin.unrecognised);
    });
  });

  group('a delete reports what it actually did', () {
    Future<TransactionDeletionOutcome> outcomeFor(
      String outcome, {
      String? code,
      int matches = 0,
    }) async {
      final result = await repositoryFor(<String, Object?>{
        'transactionId': 'transaction-0001',
        'outcome': outcome,
        'transferMatchesDeleted': matches,
        'code': code,
      }).repository.delete('transaction-0001');
      return (result as Success<TransactionDeletionOutcome>).value;
    }

    test('a complete delete is applied', () async {
      final held = await outcomeFor('DELETED', matches: 2);
      expect(held.applied, isTrue);
      expect(held.transferMatchesDeleted, 2);
      expect(held.code, isNull);
    });

    test('a partial delete is NOT applied, and says why', () async {
      final held = await outcomeFor('PARTIALLY_APPLIED', code: 'DELETION_PARTIALLY_APPLIED');
      expect(held.applied, isFalse);
      expect(held.code, 'DELETION_PARTIALLY_APPLIED');
    });

    test('an outcome this build does not recognise is not applied', () async {
      // Reporting "deleted" for a delete that did not finish is the one answer
      // this mapping must never give.
      final held = await outcomeFor('SOMETHING_NEWER');
      expect(held.applied, isFalse);
      // A refusal code this build has no name for renders as none rather than
      // as an invented one.
      expect((await outcomeFor('PARTIALLY_APPLIED', code: 'SOMETHING_NEWER')).code, isNull);
    });
  });

  group('what the client sends', () {
    test('a manual entry sends a magnitude and a direction, never a sign', () async {
      final held = repositoryFor(transactionBody());
      await held.repository.createManual(
        ManualTransactionDraft(
          accountId: 'account-0001',
          entry: const MoneyEntry(
            magnitude: Money(minorUnits: '81000', currency: 'QAR', exponent: 2),
            direction: MoneyDirection.moneyOut,
          ),
          bookingDate: const CalendarDay(year: 2026, month: 3, day: 1),
          description: '  A synthetic movement  ',
        ),
      );

      final request = held.transport.requests.single;
      expect(request.path, '/financial/transactions');
      expect(request.method.wireName, 'POST');
      final body = request.body! as Map<String, Object?>;
      expect(
        (body['magnitude']! as Map<String, Object?>)['minorUnits'],
        '81000',
        reason: 'the magnitude is unsigned; the platform applies the sign',
      );
      expect(body['direction'], 'MONEY_OUT');
      // A day goes out as a day.
      expect(body['bookingDate'], '2026-03-01');
      expect(body['description'], 'A synthetic movement');
      // Nothing the draft did not name is sent at all.
      expect(body.containsKey('valueDate'), isFalse);
      expect(body.containsKey('merchant'), isFalse);
      expect(body.containsKey('note'), isFalse);
    });

    test('a correction clears explicitly and leaves the rest alone', () async {
      final held = repositoryFor(transactionBody());
      await held.repository.correct(
        'transaction-0001',
        const TransactionCorrection(
          expectedVersion: 4,
          clearNote: true,
          merchant: 'A synthetic merchant',
        ),
      );

      final request = held.transport.requests.single;
      expect(request.method.wireName, 'PATCH');
      final body = request.body! as Map<String, Object?>;
      expect(body['expectedVersion'], 4);
      // CLEARED: present, carrying null.
      expect(body.containsKey('note'), isTrue);
      expect(body['note'], isNull);
      // CHANGED: present, carrying a value.
      expect(body['merchant'], 'A synthetic merchant');
      // LEFT ALONE: absent.
      expect(body.containsKey('valueDate'), isFalse);
      expect(body.containsKey('magnitude'), isFalse);
      expect(body.containsKey('direction'), isFalse);
      expect(body.containsKey('status'), isFalse);
      expect(body.containsKey('description'), isFalse);
    });

    test('a corrected amount travels with its direction or not at all', () async {
      final held = repositoryFor(transactionBody());
      await held.repository.correct(
        'transaction-0001',
        const TransactionCorrection(
          expectedVersion: 1,
          entry: MoneyEntry(
            magnitude: Money(minorUnits: '450', currency: 'QAR', exponent: 2),
            direction: MoneyDirection.moneyIn,
          ),
        ),
      );
      final body = held.transport.requests.single.body! as Map<String, Object?>;
      expect((body['magnitude']! as Map<String, Object?>)['minorUnits'], '450');
      expect(body['direction'], 'MONEY_IN');
    });

    test('a filter travels as contract vocabulary, not as Dart enum names', () async {
      final held = repositoryFor(pageBody(<Object?>[]));
      await held.repository.listOwn(
        filter: TransactionFilter(
          accountId: 'account-0001',
          currencyCode: 'QAR',
          direction: MoneyDirection.moneyOut,
          status: TransactionStatus.posted,
          sourceKind: SourceKind.csv,
          bookedFrom: const CalendarDay(year: 2026, month: 3, day: 1),
          bookedTo: const CalendarDay(year: 2026, month: 3, day: 31),
        ),
      );

      final query = held.transport.requests.single.query;
      expect(query['direction'], 'MONEY_OUT');
      expect(query['status'], 'POSTED');
      expect(query['sourceKind'], 'CSV');
      expect(query['bookedFrom'], '2026-03-01');
      expect(query['bookedTo'], '2026-03-31');
      expect(query['accountId'], 'account-0001');
      expect(query['currency'], 'QAR');
    });

    test('a category assignment names the code and nothing else', () async {
      final held = repositoryFor(categoryAssignmentBody());
      await held.repository.assignCategory('transaction-0001', 'HOUSEHOLD.UTILITIES');

      final request = held.transport.requests.single;
      expect(request.path, '/financial/transactions/transaction-0001/category');
      expect(request.method.wireName, 'PUT');
      expect((request.body! as Map<String, Object?>).keys.toSet(), <String>{
        'categoryCode',
      }, reason: 'there is no confidence and no suggestion on this route');
    });

    test('a vocabulary member this build cannot write never leaves the device', () async {
      // `unrecognised` names a value the PLATFORM sent that this build does not
      // know. Echoing it back would assert a meaning the client does not have,
      // so the request is refused before it is issued.
      final held = repositoryFor(pageBody(<Object?>[]));
      final result = await held.repository.listOwn(
        filter: const TransactionFilter(direction: MoneyDirection.unrecognised),
      );
      expect(result.failureOrNull, isA<InvalidRequestFailure>());
      expect((result.failureOrNull! as InvalidRequestFailure).fields, contains('direction'));
      expect(held.transport.requests, isEmpty);
    });
  });
}
