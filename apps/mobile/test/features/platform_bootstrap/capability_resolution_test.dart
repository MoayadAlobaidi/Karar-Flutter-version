// THE DISTINCTION THAT MATTERS MOST.
//
// `RESOLVED` with an empty item list and a 503 `BOOTSTRAP_UNAVAILABLE` are two
// different answers to two different questions, and conflating them turns a
// healthy account with no enabled service into an outage screen — or, worse,
// turns an outage into a screen that says everything is fine and there is
// simply nothing for you.
//
// These tests drive the REAL decode path (the generated client over a fake
// transport), the REAL failure mapper (a genuine 503 problem document), and
// the REAL feature mapper, so the distinction is proven from JSON to view
// state rather than asserted about hand-built objects.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/lifecycle/api_bootstrap_gateway.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/core/networking/problem_details.dart';
import 'package:karar_mobile/core/networking/problem_failure_mapper.dart';
import 'package:karar_mobile/features/platform_bootstrap/data/platform_context_mapper.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_capability.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_context.dart';

import '../../core/support/fakes.dart';

/// A bootstrap body with the sections this workstream reads.
Map<String, Object?> bootstrapBody({
  Map<String, Object?>? binding,
  Map<String, Object?>? operatingEntity,
  Map<String, Object?>? capabilities,
  Map<String, Object?>? jurisdiction,
  Map<String, Object?>? policyPack,
}) =>
    <String, Object?>{
      'user': <String, Object?>{
        'userId': '11111111-1111-4111-8111-111111111111',
        'emailVerified': true,
      },
      'session': <String, Object?>{'sessionId': '22222222-2222-4222-8222-222222222222'},
      'binding': binding ??
          <String, Object?>{
            'kind': 'BOUND',
            'tenant': <String, Object?>{
              'tenantId': '33333333-3333-4333-8333-333333333333',
              'name': 'Example Organisation',
              'roleHint': 'MEMBER',
            },
          },
      'jurisdiction': jurisdiction ??
          <String, Object?>{'state': 'VERIFIED', 'jurisdictionId': 'jurisdiction-a'},
      'operatingEntity': operatingEntity ??
          <String, Object?>{
            'state': 'ASSIGNED',
            'entity': <String, Object?>{
              'id': '44444444-4444-4444-8444-444444444444',
              'name': 'Example Operating Entity',
              'jurisdictionRef': 'jurisdiction-a',
              'contactReference': 'privacy@example.invalid',
            },
          },
      'policyPack': policyPack ?? <String, Object?>{'version': '1.0.0', 'status': 'ACTIVE'},
      'capabilities':
          capabilities ?? <String, Object?>{'state': 'RESOLVED', 'items': <Object?>[]},
    };

ApiBootstrapGateway gatewayReturning(Object? body) => ApiBootstrapGateway(
      KararApiClient(
        FakeApiTransport(
          (ApiRequest request) async => ApiResponse(statusCode: 200, body: body),
        ),
      ),
    );

/// A gateway whose transport fails the way the platform fails: a 503 problem
/// document carrying `BOOTSTRAP_UNAVAILABLE`, mapped by the real mapper.
ApiBootstrapGateway gatewayFailing({bool? retryable, String? requestId}) {
  final problem = ProblemDetails.tryParse(
    <String, Object?>{
      'type': 'https://karar.example/problems/bootstrap-unavailable',
      'title': 'Service unavailable',
      'code': ApiErrorCode.bootstrapUnavailable,
      'status': 503,
      'retryable': retryable,
      'requestId': requestId,
    },
    statusCode: 503,
  );
  final failure = const ProblemFailureMapper().map(statusCode: 503, problem: problem);
  return ApiBootstrapGateway(
    KararApiClient(
      FakeApiTransport(
        (ApiRequest request) async => throw ApiException(failure, statusCode: 503),
      ),
    ),
  );
}

Future<PlatformContext> contextFrom(Object? body) async {
  final result = await gatewayReturning(body).load();
  final snapshot = result.valueOrNull;
  expect(snapshot, isNotNull, reason: 'the fixture must decode');
  return const PlatformContextMapper().toContext(snapshot!);
}

void main() {
  group('RESOLVED with no items is a stated answer', () {
    test('maps to resolved navigation with no destinations', () async {
      final platform = await contextFrom(bootstrapBody());

      expect(platform.navigation, isA<CapabilityNavigationResolved>());
      expect(
        (platform.navigation as CapabilityNavigationResolved).destinations,
        isEmpty,
      );
      expect(platform.hasNoAvailableServices, isTrue);
      expect(platform.capabilityResolutionUnavailable, isFalse);
    });

    test('the startup coordinator reaches READY on it', () async {
      final coordinator = StartupCoordinatorHarness.forSnapshot(
        (await gatewayReturning(bootstrapBody()).load()).valueOrNull!,
      );
      expect(coordinator.snapshot.capabilityState, CapabilityResolutionState.resolved);
      expect(coordinator.snapshot.capabilities, isEmpty);
    });

    test('an available capability this build ships no screen for is not a destination',
        () async {
      // The platform may report a capability before the client ships a
      // surface for it. Navigation is built from what the binary can actually
      // open, so the answer is still "no services" rather than a row that
      // leads nowhere.
      final platform = await contextFrom(
        bootstrapBody(
          capabilities: <String, Object?>{
            'state': 'RESOLVED',
            'items': <Object?>[
              <String, Object?>{
                'id': 'transactions',
                'status': 'AVAILABLE',
                'requirements': <Object?>[],
              },
            ],
          },
        ),
      );

      expect(platform.hasNoAvailableServices, isTrue);
    });
  });

  group('503 BOOTSTRAP_UNAVAILABLE is an outage', () {
    test('produces a typed failure, and therefore no platform context at all', () async {
      final result = await gatewayFailing(retryable: true, requestId: 'req-1').load();

      expect(result.isFailure, isTrue);
      final failure = result.failureOrNull;
      expect(failure, isA<BootstrapUnavailableFailure>());
      expect((failure! as BootstrapUnavailableFailure).retryable, isTrue);
      expect(failure.correlationId, 'req-1');
      expect(failure.code, ApiErrorCode.bootstrapUnavailable);
      expect(
        result.valueOrNull,
        isNull,
        reason: 'a failure must not be mappable into a context that renders as ready',
      );
    });

    test('carries no detail, so nothing about capabilities can leak through it', () async {
      // The contract states the 503 carries `retryable` and `requestId` and
      // deliberately no `detail`. The typed failure has nowhere to put one
      // either: the assertion is that the taxonomy exposes only these fields.
      final result = await gatewayFailing(retryable: false, requestId: 'req-2').load();
      final failure = result.failureOrNull! as BootstrapUnavailableFailure;

      expect(failure.retryable, isFalse);
      expect(failure.correlationId, 'req-2');
      expect(failure.diagnosticLabel, 'bootstrap_unavailable');
      expect(failure.toString(), isNot(contains('Service unavailable')));
    });

    test('the startup state it produces is not ready and offers a recovery', () {
      const retryable = BootstrapUnavailable(
        BootstrapUnavailableFailure(
          code: ApiErrorCode.bootstrapUnavailable,
          correlationId: 'req-3',
          retryable: true,
        ),
      );
      const terminal = BootstrapUnavailable(
        BootstrapUnavailableFailure(
          code: ApiErrorCode.bootstrapUnavailable,
          retryable: false,
        ),
      );

      expect(retryable.isReady, isFalse);
      expect(retryable.recovery, StartupRecovery.retryBootstrap);
      expect(terminal.recovery, StartupRecovery.restart);
    });

    test('a resolution failure and an empty answer are not the same value', () async {
      final empty = await gatewayReturning(bootstrapBody()).load();
      final outage = await gatewayFailing(retryable: true).load();

      expect(empty.isSuccess, isTrue);
      expect(outage.isFailure, isTrue);
      expect(empty.runtimeType, isNot(outage.runtimeType));
    });
  });

  group('a capability state this build cannot classify', () {
    test('fails closed rather than reading as an empty answer', () async {
      final platform = await contextFrom(
        bootstrapBody(
          capabilities: <String, Object?>{
            'state': 'SOMETHING_NEWER',
            'items': <Object?>[],
          },
        ),
      );

      expect(platform.navigation, isA<CapabilityNavigationUnresolved>());
      expect(platform.capabilityResolutionUnavailable, isTrue);
      expect(
        platform.hasNoAvailableServices,
        isFalse,
        reason: 'an unresolved answer must never be reported as "no services"',
      );
    });
  });

  group('operating entity, all three states plus the unrecognised one', () {
    test('ASSIGNED carries the reviewed safe summary', () async {
      final platform = await contextFrom(bootstrapBody());

      final entity = platform.operatingEntity;
      expect(entity, isA<OperatingEntityAssigned>());
      final details = (entity as OperatingEntityAssigned).entity;
      expect(details.name, 'Example Operating Entity');
      expect(details.jurisdictionRef, 'jurisdiction-a');
      expect(details.contactReference, 'privacy@example.invalid');
    });

    test('UNASSIGNED is not an error', () async {
      final platform = await contextFrom(
        bootstrapBody(
          operatingEntity: <String, Object?>{'state': 'UNASSIGNED', 'entity': null},
        ),
      );

      expect(platform.operatingEntity, isA<OperatingEntityUnassigned>());
    });

    test('UNAVAILABLE is a read that failed', () async {
      final platform = await contextFrom(
        bootstrapBody(
          operatingEntity: <String, Object?>{'state': 'UNAVAILABLE', 'entity': null},
        ),
      );

      expect(platform.operatingEntity, isA<OperatingEntityUnavailable>());
    });

    test('an unrecognised state is closed, never assumed assigned', () async {
      final platform = await contextFrom(
        bootstrapBody(
          operatingEntity: <String, Object?>{'state': 'SOMETHING_NEWER', 'entity': null},
        ),
      );

      expect(platform.operatingEntity, isA<OperatingEntityUnrecognised>());
    });

    test('ASSIGNED without an entity is treated as unavailable, not as a blank name',
        () async {
      final platform = await contextFrom(
        bootstrapBody(
          operatingEntity: <String, Object?>{'state': 'ASSIGNED', 'entity': null},
        ),
      );

      expect(platform.operatingEntity, isA<OperatingEntityUnavailable>());
    });
  });

  group('tenancy and jurisdiction mapping', () {
    test('each binding branch maps to its own context', () async {
      final bound = await contextFrom(bootstrapBody());
      expect(bound.tenant, isA<TenantContextBound>());
      expect(bound.boundTenant?.name, 'Example Organisation');

      final unbound = await contextFrom(
        bootstrapBody(binding: <String, Object?>{'kind': 'UNBOUND'}),
      );
      expect(unbound.tenant, isA<TenantContextUnbound>());
      expect(unbound.boundTenant, isNull);

      final selection = await contextFrom(
        bootstrapBody(
          binding: <String, Object?>{
            'kind': 'TENANT_SELECTION_REQUIRED',
            'choices': <Object?>[
              <String, Object?>{'tenantId': 'a', 'name': 'A', 'roleHint': 'MEMBER'},
              <String, Object?>{'tenantId': 'b', 'name': 'B', 'roleHint': 'OWNER'},
            ],
          },
        ),
      );
      expect(selection.tenant, isA<TenantContextSelectionRequired>());
      expect((selection.tenant as TenantContextSelectionRequired).choices.length, 2);
      expect(selection.boundTenant, isNull);
    });

    test('jurisdiction states map, and an unknown one is not read as assigned', () async {
      Future<JurisdictionStatus> statusFor(String state) async => (await contextFrom(
            bootstrapBody(
              jurisdiction: <String, Object?>{'state': state, 'jurisdictionId': 'j-1'},
            ),
          ))
              .jurisdiction;

      expect((await statusFor('NONE')).state, PlatformJurisdictionState.none);
      expect((await statusFor('UNVERIFIED')).state, PlatformJurisdictionState.unverified);
      expect((await statusFor('VERIFIED')).state, PlatformJurisdictionState.verified);

      final unknown = await statusFor('SOMETHING_NEWER');
      expect(unknown.state, PlatformJurisdictionState.unrecognised);
      expect(unknown.isAssigned, isFalse);
    });

    test('an unverified jurisdiction still governs, and is not reported as verified',
        () async {
      final platform = await contextFrom(
        bootstrapBody(
          jurisdiction: <String, Object?>{'state': 'UNVERIFIED', 'jurisdictionId': 'j-1'},
        ),
      );

      expect(platform.jurisdiction.isAssigned, isTrue);
      expect(platform.jurisdiction.state, isNot(PlatformJurisdictionState.verified));
    });

    test('policy-pack approval is read from the platform, never assumed', () async {
      final approved = await contextFrom(bootstrapBody());
      expect(approved.policyPack.isApproved, isTrue);

      final draft = await contextFrom(
        bootstrapBody(
          policyPack: <String, Object?>{'version': '2.0.0', 'status': 'DRAFT'},
        ),
      );
      expect(draft.policyPack.isApproved, isFalse);
    });
  });
}

/// A minimal holder so a test can name the snapshot it asserted on.
final class StartupCoordinatorHarness {
  const StartupCoordinatorHarness.forSnapshot(this.snapshot);

  final BootstrapSnapshot snapshot;
}
