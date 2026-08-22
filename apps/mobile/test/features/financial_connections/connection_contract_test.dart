// THE REPOSITORY, AGAINST THE REAL GENERATED CLIENT.
//
// The transport is faked; `KararApiClient` is not. The path, the query
// parameters and the DTO decoding are all the GENERATED reading of
// `openapi.yaml`, so a contract change this client has not absorbed fails here
// rather than in production.
//
// What is worth stating up front:
//
//   * A RESPONSE THAT CLAIMS A LIVE INSTITUTION LINK IS REFUSED. The contract
//     pins `impliesLiveInstitutionLink` to `false` and `providerAccessStatus`
//     to NOT_IMPLEMENTED. Either one flipped is a claim that this platform can
//     reach a bank, which is the single worst thing this surface could render;
//   * A RAIL AND ITS AVAILABILITY MUST AGREE. A bank rail reported as
//     EXECUTABLE is drift about the one field that separates "you typed this
//     in" from "an institution sent it";
//   * A VOCABULARY MEMBER THIS BUILD DOES NOT SHIP IS `unrecognised`, never a
//     real member — and the five lifecycle values stay five, because
//     NOT_CONFIGURED, UNAVAILABLE and NOT_IMPLEMENTED are three answers.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/financial_connections/data/api_financial_connections_repository.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connection.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connections_repository.dart';

import '../../core/support/fakes.dart';

({ApiFinancialConnectionsRepository repository, FakeApiTransport transport})
    repositoryFor(Object? body, {int statusCode = 200}) {
  final transport = FakeApiTransport(
    (ApiRequest request) async => ApiResponse(statusCode: statusCode, body: body),
  );
  return (
    repository: ApiFinancialConnectionsRepository(KararApiClient(transport)),
    transport: transport,
  );
}

Map<String, Object?> connectionBody({
  String rail = 'USER_FILE_UPLOAD',
  String availability = 'EXECUTABLE',
  String status = 'ACTIVE',
  bool impliesLiveInstitutionLink = false,
  String providerAccessStatus = 'NOT_IMPLEMENTED',
  String? institutionId = 'institution-0001',
}) =>
    <String, Object?>{
      'connectionId': 'connection-0001',
      'rail': rail,
      'availability': availability,
      'status': status,
      'displayLabel': 'Statements I upload',
      'institutionId': institutionId,
      'link': <String, Object?>{
        'impliesLiveInstitutionLink': impliesLiveInstitutionLink,
        'providerAccessStatus': providerAccessStatus,
      },
      'createdAt': '2026-01-04T08:00:00Z',
      'updatedAt': '2026-02-09T10:00:00Z',
      'version': 1,
    };

Map<String, Object?> listBody(List<Map<String, Object?>> items) => <String, Object?>{
      'items': items,
      'page': <String, Object?>{
        'limit': 50,
        'returned': items.length,
        'hasMore': false,
        'nextCursor': null,
      },
    };

Future<Result<FinancialConnectionPage>> readOne(
  Map<String, Object?> body, {
  ConnectionStatusFilter? status,
}) =>
    repositoryFor(listBody(<Map<String, Object?>>[body]))
        .repository
        .listOwn(status: status);

void main() {
  group('the generated client issues the request', () {
    test('a filter is sent as the contract wire value, never as a hand-written '
        'string', () async {
      final held = repositoryFor(listBody(const <Map<String, Object?>>[]));
      await held.repository.listOwn(status: ConnectionStatusFilter.notImplemented);

      final request = held.transport.requests.single;
      expect(request.method, HttpMethod.get);
      expect(request.query['status'], 'NOT_IMPLEMENTED');
      // The path is the generated one. This test asserts it is reached at all;
      // spelling it out here would be the second reading the architecture rule
      // exists to prevent.
      expect(request.path, endsWith('/connections'));
    });

    test('no filter sends no status at all', () async {
      final held = repositoryFor(listBody(const <Map<String, Object?>>[]));
      await held.repository.listOwn();
      expect(held.transport.requests.single.query['status'], isNull);
    });

    test('a status this build cannot name is refused before anything is sent',
        () {
      expect(
        () => connectionStatusToDto(ConnectionStatus.unrecognised),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('a response that claims a live institution link is refused', () {
    test('impliesLiveInstitutionLink true is a contract violation', () async {
      final result = await readOne(
        connectionBody(impliesLiveInstitutionLink: true),
      );
      expect(result, isA<Failed<FinancialConnectionPage>>());
      final failure = (result as Failed<FinancialConnectionPage>).failure;
      expect(failure, isA<ContractViolationFailure>());
      expect(
        (failure as ContractViolationFailure).location,
        'ConnectionSummaryView.link.impliesLiveInstitutionLink',
      );
    });

    test('a provider-access status this build cannot read is not implemented',
        () async {
      // The generated enum answers `unknown` for a value added later. That is
      // not evidence that anything was implemented, so it reads as false and
      // the row is accepted rather than refused.
      final result = await readOne(
        connectionBody(providerAccessStatus: 'SOMETHING_ADDED_LATER'),
      );
      final page = (result as Success<FinancialConnectionPage>).value;
      expect(page.items.single.providerAccessImplemented, isFalse);
    });
  });

  group('a rail and its availability must agree', () {
    test('a bank interface reported as EXECUTABLE is refused', () async {
      final result = await readOne(
        connectionBody(
          rail: 'DIRECT_BANK_OR_WALLET_API',
          availability: 'EXECUTABLE',
        ),
      );
      final failure = (result as Failed<FinancialConnectionPage>).failure;
      expect(failure, isA<ContractViolationFailure>());
      expect(
        (failure as ContractViolationFailure).location,
        'ConnectionSummaryView.availability',
      );
    });

    test('a file upload reported as NOT_IMPLEMENTED is refused', () async {
      final result = await readOne(
        connectionBody(
          rail: 'USER_FILE_UPLOAD',
          availability: 'NOT_IMPLEMENTED',
        ),
      );
      expect(result, isA<Failed<FinancialConnectionPage>>());
    });

    test('a bank interface reported as NOT_IMPLEMENTED is accepted and named',
        () async {
      final result = await readOne(
        connectionBody(
          rail: 'DIRECT_BANK_OR_WALLET_API',
          availability: 'NOT_IMPLEMENTED',
          status: 'NOT_IMPLEMENTED',
        ),
      );
      final connection =
          (result as Success<FinancialConnectionPage>).value.items.single;
      expect(connection.rail, ConnectionRail.directBankOrWalletApi);
      expect(connection.availability, RailAvailability.notImplemented);
      expect(connection.status, ConnectionStatus.notImplemented);
      expect(connection.isSuppliedBySubject, isFalse);
    });

    test('a rail added after this build shipped is accepted, whatever it claims',
        () async {
      final result = await readOne(
        connectionBody(rail: 'SOMETHING_ADDED_LATER', availability: 'EXECUTABLE'),
      );
      final connection =
          (result as Success<FinancialConnectionPage>).value.items.single;
      expect(connection.rail, ConnectionRail.unrecognised);
      expect(
        connection.isSuppliedBySubject,
        isFalse,
        reason: 'a rail this build cannot describe is not one the person '
            'supplied anything through',
      );
    });
  });

  group('the five lifecycle values stay five', () {
    test('each wire value maps to its own member', () async {
      const expected = <String, ConnectionStatus>{
        'ACTIVE': ConnectionStatus.active,
        'NOT_CONFIGURED': ConnectionStatus.notConfigured,
        'UNAVAILABLE': ConnectionStatus.unavailable,
        'RETIRED': ConnectionStatus.retired,
        'NOT_IMPLEMENTED': ConnectionStatus.notImplemented,
      };
      for (final entry in expected.entries) {
        final result = await readOne(
          connectionBody(
            rail: 'MANUAL',
            availability: 'EXECUTABLE',
            status: entry.key,
          ),
        );
        final connection =
            (result as Success<FinancialConnectionPage>).value.items.single;
        expect(connection.status, entry.value, reason: entry.key);
      }
      // The three that a careless reading would merge are three distinct
      // members, so no label can collapse them without somebody choosing to.
      expect(
        <ConnectionStatus>{
          ConnectionStatus.notConfigured,
          ConnectionStatus.unavailable,
          ConnectionStatus.notImplemented,
        },
        hasLength(3),
      );
    });

    test('a status added after this build shipped is unrecognised', () async {
      final result = await readOne(
        connectionBody(status: 'SOMETHING_ADDED_LATER'),
      );
      final connection =
          (result as Success<FinancialConnectionPage>).value.items.single;
      expect(connection.status, ConnectionStatus.unrecognised);
    });
  });

  group('the domain type carries nothing it must not', () {
    test('no credential of any shape has a field to arrive in', () {
      // The type has no field one could arrive in — the source scan in
      // `no_credential_surface_test.dart` proves that over the whole feature.
      // What is checked here is the other way a value escapes: a diagnostic
      // sink. The subject's own label for their own money must not reach one.
      expect(
        FinancialConnection(
          connectionId: 'connection-0001',
          rail: ConnectionRail.manual,
          availability: RailAvailability.executable,
          status: ConnectionStatus.active,
          displayLabel: 'A name only this person knows',
          institutionId: null,
          impliesLiveInstitutionLink: false,
          providerAccessImplemented: false,
          createdAt: DateTime.utc(2026),
          updatedAt: DateTime.utc(2026),
          version: 1,
        ).toString(),
        'FinancialConnection()',
      );
    });
  });
}
