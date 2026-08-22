// Shared test doubles.
//
// Hand-written rather than generated: a mocking framework would let a test
// assert on a call that the production path does not actually make, and these
// fakes are small enough that the behaviour under test stays legible.
//
// Nothing here fabricates financial data. The fixtures below carry identity,
// tenancy, jurisdiction, operating-entity and capability state only.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_coordinator.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';

/// A [BootstrapGateway] that answers with whatever the test scripted.
final class FakeBootstrapGateway implements BootstrapGateway {
  FakeBootstrapGateway(this._answers);

  /// Answers one per call; the last answer repeats once exhausted.
  final List<Result<BootstrapSnapshot>> _answers;

  int callCount = 0;

  @override
  Future<Result<BootstrapSnapshot>> load() async {
    final index = callCount < _answers.length ? callCount : _answers.length - 1;
    callCount++;
    return _answers[index];
  }
}

/// An [ApiTransport] that returns scripted responses without any HTTP.
final class FakeApiTransport implements ApiTransport {
  FakeApiTransport(this._responder);

  final Future<ApiResponse> Function(ApiRequest request) _responder;

  final List<ApiRequest> requests = <ApiRequest>[];

  @override
  Future<ApiResponse> send(ApiRequest request) {
    requests.add(request);
    return _responder(request);
  }
}

/// A Dio adapter driven by a script, so transport behaviour is testable
/// without a socket.
final class ScriptedHttpAdapter implements HttpClientAdapter {
  ScriptedHttpAdapter(this._handler);

  final FutureOr<ResponseBody> Function(RequestOptions options, int attempt) _handler;

  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return _handler(options, requests.length);
  }

  @override
  void close({bool force = false}) {}
}

/// Builds a JSON response body for [ScriptedHttpAdapter].
ResponseBody jsonResponse(
  int statusCode,
  Object? body, {
  String contentType = 'application/json',
  Map<String, List<String>> headers = const <String, List<String>>{},
}) => ResponseBody.fromString(
  body == null ? '' : jsonEncode(body),
  statusCode,
  headers: <String, List<String>>{
    Headers.contentTypeHeader: <String>[contentType],
    ...headers,
  },
);

/// A bootstrap snapshot in the fully resolved state.
BootstrapSnapshot readySnapshot({
  bool emailVerified = true,
  TenantBinding? binding,
  OperatingEntityState operatingEntityState = OperatingEntityState.assigned,
  CapabilityResolutionState capabilityState = CapabilityResolutionState.resolved,
}) => BootstrapSnapshot(
  userId: '11111111-1111-4111-8111-111111111111',
  emailVerified: emailVerified,
  sessionId: '22222222-2222-4222-8222-222222222222',
  binding:
      binding ??
      const TenantBound(
        TenantOption(
          tenantId: '33333333-3333-4333-8333-333333333333',
          name: 'Test Tenant',
          roleHint: 'MEMBER',
        ),
      ),
  jurisdictionState: JurisdictionState.verified,
  jurisdictionId: 'jurisdiction-a',
  operatingEntityState: operatingEntityState,
  operatingEntity: operatingEntityState == OperatingEntityState.assigned
      ? const OperatingEntitySummary(
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Test Operating Entity',
          jurisdictionRef: 'jurisdiction-a',
          contactReference: 'privacy@example.invalid',
        )
      : null,
  policyPackVersion: '1.0.0',
  policyPackStatus: 'ACTIVE',
  capabilityState: capabilityState,
  capabilities: const <CapabilityView>[],
);

/// A failure that is neither authentication nor session expiry, for the
/// bootstrap-unavailable paths.
const Failure bootstrapDependencyFailure = DependencyUnavailableFailure(
  code: 'DEPENDENCY_UNAVAILABLE',
);
