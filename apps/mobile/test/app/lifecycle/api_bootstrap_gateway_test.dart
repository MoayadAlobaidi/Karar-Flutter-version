// The DTO-to-application mapping boundary.
//
// This is the pattern every feature repository copies, so it is tested as a
// pattern: the generated client is driven through a fake transport, the DTO is
// mapped, and an unknown enumeration value is mapped to `unknown` rather than
// to a convenient default.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/lifecycle/api_bootstrap_gateway.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';

import '../../core/support/fakes.dart';

Map<String, Object?> bootstrapBody({
  Map<String, Object?>? binding,
  Map<String, Object?>? operatingEntity,
  Map<String, Object?>? capabilities,
  bool emailVerified = true,
}) =>
    <String, Object?>{
      'user': <String, Object?>{
        'userId': '11111111-1111-4111-8111-111111111111',
        'emailVerified': emailVerified,
      },
      'session': <String, Object?>{'sessionId': '22222222-2222-4222-8222-222222222222'},
      'binding': binding ??
          <String, Object?>{
            'kind': 'BOUND',
            'tenant': <String, Object?>{
              'tenantId': '33333333-3333-4333-8333-333333333333',
              'name': 'Test Tenant',
              'roleHint': 'MEMBER',
            },
          },
      'jurisdiction': <String, Object?>{
        'state': 'VERIFIED',
        'jurisdictionId': 'jurisdiction-a',
      },
      'operatingEntity': operatingEntity ??
          <String, Object?>{
            'state': 'ASSIGNED',
            'entity': <String, Object?>{
              'id': '44444444-4444-4444-8444-444444444444',
              'name': 'Test Operating Entity',
              'jurisdictionRef': 'jurisdiction-a',
              'contactReference': 'privacy@example.invalid',
            },
          },
      'policyPack': <String, Object?>{'version': '1.0.0', 'status': 'ACTIVE'},
      'capabilities': capabilities ??
          <String, Object?>{'state': 'RESOLVED', 'items': <Object?>[]},
    };

ApiBootstrapGateway gatewayReturning(Object? body, {int statusCode = 200}) =>
    ApiBootstrapGateway(
      KararApiClient(
        FakeApiTransport(
          (ApiRequest request) async => ApiResponse(statusCode: statusCode, body: body),
        ),
      ),
    );

void main() {
  group('mapping', () {
    test('maps a fully resolved bootstrap context', () async {
      final result = await gatewayReturning(bootstrapBody()).load();

      final snapshot = result.valueOrNull;
      expect(snapshot, isNotNull);
      expect(snapshot!.userId, '11111111-1111-4111-8111-111111111111');
      expect(snapshot.emailVerified, isTrue);
      expect(snapshot.sessionId, '22222222-2222-4222-8222-222222222222');
      expect(snapshot.jurisdictionState, JurisdictionState.verified);
      expect(snapshot.jurisdictionId, 'jurisdiction-a');
      expect(snapshot.operatingEntityState, OperatingEntityState.assigned);
      expect(snapshot.operatingEntity?.name, 'Test Operating Entity');
      expect(snapshot.operatingEntity?.contactReference, 'privacy@example.invalid');
      expect(snapshot.policyPackVersion, '1.0.0');
      expect(snapshot.policyPackStatus, 'ACTIVE');
      expect(snapshot.capabilityState, CapabilityResolutionState.resolved);
      expect(snapshot.capabilities, isEmpty);

      final binding = snapshot.binding;
      expect(binding, isA<TenantBound>());
      expect((binding as TenantBound).tenant.tenantId, '33333333-3333-4333-8333-333333333333');
    });

    test('maps each binding branch of the discriminated union', () async {
      final unbound = await gatewayReturning(
        bootstrapBody(binding: <String, Object?>{'kind': 'UNBOUND'}),
      ).load();
      expect(unbound.valueOrNull?.binding, isA<TenantUnbound>());

      final selection = await gatewayReturning(
        bootstrapBody(
          binding: <String, Object?>{
            'kind': 'TENANT_SELECTION_REQUIRED',
            'choices': <Object?>[
              <String, Object?>{'tenantId': 'tenant-a', 'name': 'A', 'roleHint': 'MEMBER'},
              <String, Object?>{'tenantId': 'tenant-b', 'name': 'B', 'roleHint': 'OWNER'},
            ],
          },
        ),
      ).load();
      final binding = selection.valueOrNull?.binding;
      expect(binding, isA<TenantSelectionRequired>());
      expect((binding! as TenantSelectionRequired).choices.length, 2);
    });

    test('an operating entity that did not resolve carries no entity', () async {
      final result = await gatewayReturning(
        bootstrapBody(
          operatingEntity: <String, Object?>{'state': 'UNAVAILABLE', 'entity': null},
        ),
      ).load();

      expect(result.valueOrNull?.operatingEntityState, OperatingEntityState.unavailable);
      expect(result.valueOrNull?.operatingEntity, isNull);
    });

    test('an empty capability list is RESOLVED, not absent', () async {
      final result = await gatewayReturning(
        bootstrapBody(
          capabilities: <String, Object?>{'state': 'RESOLVED', 'items': <Object?>[]},
        ),
      ).load();

      final snapshot = result.valueOrNull!;
      expect(snapshot.capabilityState, CapabilityResolutionState.resolved);
      expect(snapshot.capabilities, isEmpty);
      expect(snapshot.hasCapability('anything'), isFalse);
    });

    test('capability views carry their actionable requirements', () async {
      final result = await gatewayReturning(
        bootstrapBody(
          capabilities: <String, Object?>{
            'state': 'RESOLVED',
            'items': <Object?>[
              <String, Object?>{
                'id': 'consent.manage',
                'status': 'AVAILABLE',
                'requirements': <Object?>[
                  <String, Object?>{'kind': 'CONSENT_REQUIRED', 'detail': 'ignored by the client'},
                ],
              },
            ],
          },
        ),
      ).load();

      final snapshot = result.valueOrNull!;
      expect(snapshot.capabilities.single.id, 'consent.manage');
      expect(snapshot.capabilities.single.requirements, <String>['CONSENT_REQUIRED']);
      expect(snapshot.hasCapability('consent.manage'), isTrue);
      expect(snapshot.hasCapability('consent.manage', status: 'BLOCKED'), isFalse);
    });
  });

  group('forward compatibility', () {
    test('an unrecognised enumeration value maps to unknown, never to a default', () async {
      final result = await gatewayReturning(
        <String, Object?>{
          ...bootstrapBody(),
          'jurisdiction': <String, Object?>{
            'state': 'SOMETHING_NEWER',
            'jurisdictionId': 'jurisdiction-a',
          },
          'operatingEntity': <String, Object?>{'state': 'SOMETHING_NEWER', 'entity': null},
          'capabilities': <String, Object?>{'state': 'SOMETHING_NEWER', 'items': <Object?>[]},
        },
      ).load();

      final snapshot = result.valueOrNull!;
      expect(snapshot.jurisdictionState, JurisdictionState.unknown);
      expect(snapshot.operatingEntityState, OperatingEntityState.unknown);
      expect(snapshot.capabilityState, CapabilityResolutionState.unknown);
    });

    test('an unrecognised union branch is a contract violation, never a guess', () async {
      // A server that adds a binding kind must degrade the client, not crash
      // it: the decode throws and the gateway converts it to a typed failure,
      // which the startup coordinator turns into BOOTSTRAP_UNAVAILABLE.
      final result = await gatewayReturning(
        bootstrapBody(binding: <String, Object?>{'kind': 'SOMETHING_NEWER'}),
      ).load();

      expect(result.isFailure, isTrue);
      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });
  });

  group('failures', () {
    test('an ApiException becomes a typed failure, not an exception', () async {
      final gateway = ApiBootstrapGateway(
        KararApiClient(
          FakeApiTransport(
            (ApiRequest request) async => throw const ApiException(
              BootstrapUnavailableFailure(code: 'BOOTSTRAP_UNAVAILABLE', retryable: true),
              statusCode: 503,
            ),
          ),
        ),
      );

      final result = await gateway.load();

      expect(result.isFailure, isTrue);
      expect(result.failureOrNull, isA<BootstrapUnavailableFailure>());
    });

    test('a body that is not an object is a contract violation', () async {
      final result = await gatewayReturning(<Object?>['not', 'an', 'object']).load();

      expect(result.isFailure, isTrue);
      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a missing required field is a contract violation, not a crash', () async {
      final body = bootstrapBody()..remove('session');

      final result = await gatewayReturning(body).load();

      expect(result.isFailure, isTrue);
      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });
  });

  test('the generated client sends the documented request', () async {
    final transport = FakeApiTransport(
      (ApiRequest request) async => ApiResponse(statusCode: 200, body: bootstrapBody()),
    );
    await ApiBootstrapGateway(KararApiClient(transport)).load();

    final request = transport.requests.single;
    expect(request.path, '/platform/bootstrap');
    expect(request.method.wireName, 'GET');
    expect(request.requiresAuthentication, isTrue);
    expect(request.isReplayable, isTrue);
  });
}
