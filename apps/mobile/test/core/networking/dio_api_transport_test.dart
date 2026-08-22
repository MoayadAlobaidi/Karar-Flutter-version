// The transport, end to end, against a scripted adapter rather than a socket.
//
// Covers the behaviours that cannot be asserted from the units alone: header
// propagation, the refresh-and-replay decision, idempotency-aware retry, and
// the guarantee that no credential ever reaches a log record.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/dio_api_transport.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/core/networking/network_status.dart';
import 'package:karar_mobile/core/networking/retry_policy.dart';
import 'package:karar_mobile/core/networking/timeouts.dart';
import 'package:karar_mobile/core/networking/token_refresh_coordinator.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/utilities/cancellation.dart';
import 'package:karar_mobile/core/utilities/clock.dart';
import 'package:karar_mobile/core/utilities/correlation_id.dart';

import '../support/fakes.dart';

final DateTime _now = DateTime.utc(2026, 8, 16, 12);

SessionTokens _tokens(String access, {String sessionId = 'session-1'}) => SessionTokens(
      accessToken: access,
      accessTokenExpiresAt: _now.add(const Duration(minutes: 10)),
      refreshToken: 'refresh-$access',
      refreshTokenExpiresAt: _now.add(const Duration(days: 30)),
      sessionId: sessionId,
    );

final class _Harness {
  _Harness({
    required FutureOr<ResponseBody> Function(RequestOptions options, int attempt) handler,
    Future<Result<SessionTokens>> Function(String)? refresh,
    RetryPolicy retryPolicy = const RetryPolicy(
      maxAttempts: 3,
      baseDelay: Duration(milliseconds: 1),
      jitterFraction: 0,
    ),
    bool authenticated = true,
  })  : adapter = ScriptedHttpAdapter(handler),
        secureStore = InMemorySecureStore(),
        logSink = RecordingLogSink() {
    final dio = buildDio(
      baseUrl: Uri.parse('https://api.example.invalid'),
      defaultTimeouts: TimeoutProfile.standard,
    )..httpClientAdapter = adapter;

    final logger = AppLogger(sink: logSink, minimumLevel: LogLevel.trace);
    sessions = SessionManager(store: SecureTokenStore(secureStore), logger: logger);
    coordinator = TokenRefreshCoordinator(
      sessionManager: sessions,
      clock: FixedClock(_now),
      logger: logger,
      refresh: refresh ??
          (String _) async => Success<SessionTokens>(_tokens('renewed')),
    );
    transport = DioApiTransport(
      dio: dio,
      logger: logger,
      correlationIds: ScriptedCorrelationIdGenerator(<String>['corr-1']),
      networkStatus: networkStatus,
      clock: FixedClock(_now),
      sessionManager: authenticated ? sessions : null,
      refreshCoordinator: authenticated ? coordinator : null,
      retryPolicy: retryPolicy,
    );
  }

  final ScriptedHttpAdapter adapter;
  final InMemorySecureStore secureStore;
  final RecordingLogSink logSink;
  final NetworkStatusTracker networkStatus = NetworkStatusTracker();

  late final SessionManager sessions;
  late final TokenRefreshCoordinator coordinator;
  late final DioApiTransport transport;

  Future<void> dispose() async {
    await sessions.dispose();
    await networkStatus.dispose();
  }
}

void main() {
  group('request shaping', () {
    test('propagates a correlation id and the session credential', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) =>
            jsonResponse(200, <String, Object?>{'ok': true}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await harness.transport.send(
        const ApiRequest(method: HttpMethod.get, path: '/users/me'),
      );

      final sent = harness.adapter.requests.single;
      expect(sent.headers[correlationIdHeader], 'corr-1');
      expect(sent.headers['authorization'], 'Bearer live');
    });

    test('sends a raw body under its own media type, unencoded', () async {
      // The statement-import upload declares text/csv. Before a raw body
      // existed, every non-null body was sent as application/json, so the
      // bytes would have been JSON-encoded under a media type the contract
      // does not declare — and refused as unsupported, which reads like a
      // bad file rather than a bad client.
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(202, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      final bytes = Uint8List.fromList(
        utf8.encode('Booking Date,Description,Amount\n2026-08-10,SYNTHETIC,-45.00\n'),
      );

      await harness.transport.send(
        ApiRequest(
          method: HttpMethod.post,
          path: '/financial/statement-imports/x/source',
          rawBody: RawRequestBody(bytes: bytes, mediaType: 'text/csv; charset=utf-8'),
        ),
      );

      final sent = harness.adapter.requests.single;
      expect(sent.contentType, 'text/csv; charset=utf-8');
      // The bytes go out as bytes. Identity, not equality: nothing re-encoded
      // them on the way.
      expect(sent.data, same(bytes));
    });

    test('a JSON body is still JSON, and no body declares no content type', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(200, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await harness.transport.send(
        const ApiRequest(
          method: HttpMethod.post,
          path: '/users/me',
          body: <String, Object?>{'displayName': 'A'},
        ),
      );
      expect(harness.adapter.requests.single.contentType, Headers.jsonContentType);

      await harness.transport.send(
        const ApiRequest(method: HttpMethod.get, path: '/users/me'),
      );
      expect(harness.adapter.requests.last.contentType, isNull);
    });

    test('a raw body never reaches a log record, not even its length', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(202, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      const secret = 'SALARY,ACME CORP,120000.00';
      await harness.transport.send(
        ApiRequest(
          method: HttpMethod.post,
          path: '/financial/statement-imports/x/source',
          rawBody: RawRequestBody(
            bytes: Uint8List.fromList(utf8.encode(secret)),
            mediaType: 'text/csv',
          ),
        ),
      );

      expect(harness.logSink.records, isNotEmpty);
      final logged =
          harness.logSink.records.map((record) => record.toString()).join('\n');
      expect(logged, isNot(contains('SALARY')));
      expect(logged, isNot(contains('ACME')));
      expect(logged, isNot(contains('120000')));
    });

    test('refuses an answer that arrives after the organisation changed', () async {
      // The leak this exists to stop: a read issued under organisation A
      // resolves after the person switched to organisation B, and its body —
      // A's figures — is handed to a controller that writes it into the
      // screen B is looking at. The switch adopts a NEW server-issued
      // session, so the session that asked is no longer the session signed
      // in, and the answer is refused rather than returned.
      late _Harness harness;
      harness = _Harness(
        handler: (RequestOptions options, int _) async {
          // The switch happens while this request is in flight.
          await harness.sessions.adopt(_tokens('b', sessionId: 'session-2'));
          return jsonResponse(200, <String, Object?>{'accounts': <String>['organisation-a']});
        },
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('a'));

      await expectLater(
        harness.transport.send(
          const ApiRequest(method: HttpMethod.get, path: '/financial/accounts'),
        ),
        throwsA(
          isA<ApiException>().having(
            (ApiException error) => error.failure,
            'failure',
            isA<SessionChangedFailure>(),
          ),
        ),
      );
    });

    test('refuses an answer that arrives after the person signed out', () async {
      late _Harness harness;
      harness = _Harness(
        handler: (RequestOptions options, int _) async {
          await harness.sessions.end(SessionEndReason.signedOut);
          return jsonResponse(200, <String, Object?>{'accounts': <String>['organisation-a']});
        },
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('a'));

      await expectLater(
        harness.transport.send(
          const ApiRequest(method: HttpMethod.get, path: '/financial/accounts'),
        ),
        throwsA(
          isA<ApiException>().having(
            (ApiException error) => error.failure,
            'failure',
            isA<SessionChangedFailure>(),
          ),
        ),
      );
    });

    test('a token refresh is NOT a session change, and the answer stands', () async {
      // The distinction the check rests on. Refreshing rotates the access
      // token within the same session; treating that as a switch would refuse
      // every answer that raced a proactive refresh.
      late _Harness harness;
      harness = _Harness(
        handler: (RequestOptions options, int _) async {
          await harness.sessions.adopt(_tokens('rotated'));
          return jsonResponse(200, <String, Object?>{'ok': true});
        },
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('a'));

      final response = await harness.transport.send(
        const ApiRequest(method: HttpMethod.get, path: '/users/me'),
      );
      expect(response.statusCode, 200);
    });

    test('sends an idempotency key when the caller supplies one', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(201, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await harness.transport.send(
        const ApiRequest(
          method: HttpMethod.post,
          path: '/consent/acceptances',
          idempotencyKey: 'key-1',
        ),
      );

      expect(harness.adapter.requests.single.headers[idempotencyKeyHeader], 'key-1');
    });

    test('omits null query parameters rather than sending them empty', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(200, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await harness.transport.send(
        const ApiRequest(
          method: HttpMethod.get,
          path: '/consent/status',
          query: <String, Object?>{'purposeRef': 'marketing', 'jurisdictionRef': null},
        ),
      );

      final sent = harness.adapter.requests.single;
      expect(sent.queryParameters.containsKey('jurisdictionRef'), isFalse);
      expect(sent.queryParameters['purposeRef'], 'marketing');
    });

    test('an unauthenticated request carries no credential', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(200, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await harness.transport.send(
        const ApiRequest(
          method: HttpMethod.post,
          path: '/auth/login',
          requiresAuthentication: false,
        ),
      );

      expect(harness.adapter.requests.single.headers.containsKey('authorization'), isFalse);
    });

    test('an authenticated request with no session is refused before it is sent', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(200, <String, Object?>{}),
      );
      addTearDown(harness.dispose);

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<AuthenticationRequiredFailure>(),
          ),
        ),
      );
      expect(harness.adapter.requests, isEmpty);
    });
  });

  group('failure mapping', () {
    test('decodes a problem document into a typed failure', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          503,
          <String, Object?>{
            'type': 'about:blank',
            'title': 'Unavailable',
            'status': 503,
            'code': 'BOOTSTRAP_UNAVAILABLE',
            'retryable': true,
            'requestId': 'corr-1',
          },
          contentType: 'application/problem+json',
        ),
        retryPolicy: RetryPolicy.none,
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(
          const ApiRequest(method: HttpMethod.get, path: '/platform/bootstrap'),
        ),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<BootstrapUnavailableFailure>()
                .having((BootstrapUnavailableFailure f) => f.retryable, 'retryable', isTrue),
          ),
        ),
      );
    });

    test('an unparseable body is a contract violation, not a crash', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) =>
            ResponseBody.fromString('<html>gateway</html>', 200),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<ContractViolationFailure>(),
          ),
        ),
      );
    });

    test('a connection error is offline, and reachability follows', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        ),
        retryPolicy: RetryPolicy.none,
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<OfflineFailure>(),
          ),
        ),
      );
      expect(harness.networkStatus.isOffline, isTrue);
    });

    test('an invalid certificate is never downgraded', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => throw DioException(
          requestOptions: options,
          type: DioExceptionType.badCertificate,
        ),
        retryPolicy: RetryPolicy.none,
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure.code,
            'code',
            'TLS_VALIDATION_FAILED',
          ),
        ),
      );
    });

    test('a cancelled request reports cancellation, not failure', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(200, <String, Object?>{}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));
      final cancellation = CancellationToken()..cancel('screen_disposed');

      await expectLater(
        harness.transport.send(
          ApiRequest(
            method: HttpMethod.get,
            path: '/users/me',
            cancellation: cancellation,
          ),
        ),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<RequestCancelledFailure>(),
          ),
        ),
      );
      expect(harness.adapter.requests, isEmpty);
    });
  });

  group('refresh and replay', () {
    test('a rejected GET is refreshed and replayed exactly once', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int attempt) => attempt == 1
            ? jsonResponse(
                401,
                <String, Object?>{'status': 401, 'code': 'AUTHENTICATION_REQUIRED'},
                contentType: 'application/problem+json',
              )
            : jsonResponse(200, <String, Object?>{'ok': true}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      final response = await harness.transport.send(
        const ApiRequest(method: HttpMethod.get, path: '/users/me'),
      );

      expect(response.statusCode, 200);
      expect(harness.adapter.requests.length, 2);
      expect(harness.adapter.requests.last.headers['authorization'], 'Bearer renewed');
      expect(harness.coordinator.refreshCallCount, 1);
    });

    test('a rejected POST is NOT replayed; the caller reissues it', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          401,
          <String, Object?>{'status': 401, 'code': 'AUTHENTICATION_REQUIRED'},
          contentType: 'application/problem+json',
        ),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(
          const ApiRequest(method: HttpMethod.post, path: '/consent/acceptances'),
        ),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<UnsafeRequestNotReplayedFailure>(),
          ),
        ),
      );
      expect(harness.adapter.requests.length, 1, reason: 'the unsafe request ran once');
    });

    test('a rejected POST carrying an idempotency key IS replayed', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int attempt) => attempt == 1
            ? jsonResponse(
                401,
                <String, Object?>{'status': 401, 'code': 'AUTHENTICATION_REQUIRED'},
                contentType: 'application/problem+json',
              )
            : jsonResponse(201, <String, Object?>{'ok': true}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      final response = await harness.transport.send(
        const ApiRequest(
          method: HttpMethod.post,
          path: '/consent/acceptances',
          idempotencyKey: 'key-1',
        ),
      );

      expect(response.statusCode, 201);
      expect(harness.adapter.requests.length, 2);
    });

    test('a second 401 after a refresh is authoritative', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          401,
          <String, Object?>{'status': 401, 'code': 'AUTHENTICATION_REQUIRED'},
          contentType: 'application/problem+json',
        ),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(isA<ApiException>()),
      );
      expect(
        harness.adapter.requests.length,
        2,
        reason: 'one replay only — no retry storm on 401',
      );
      expect(harness.coordinator.refreshCallCount, 1);
    });

    test('a failed refresh ends the session and clears the credential', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          401,
          <String, Object?>{'status': 401, 'code': 'AUTHENTICATION_REQUIRED'},
          contentType: 'application/problem+json',
        ),
        refresh: (String _) async =>
            const Failed<SessionTokens>(AuthenticationRequiredFailure()),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(
          isA<ApiException>().having(
            (ApiException exception) => exception.failure,
            'failure',
            isA<SessionExpiredFailure>(),
          ),
        ),
      );
      expect(harness.sessions.hasSession, isFalse);
      expect(harness.secureStore.entries, isEmpty);
    });
  });

  group('retry', () {
    test('retries an idempotent request on a transient failure, bounded', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          503,
          <String, Object?>{'status': 503, 'code': 'DEPENDENCY_UNAVAILABLE'},
          contentType: 'application/problem+json',
        ),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/users/me')),
        throwsA(isA<ApiException>()),
      );

      expect(harness.adapter.requests.length, 3, reason: 'maxAttempts is honoured');
    });

    test('never retries an unsafe request without an idempotency key', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          503,
          <String, Object?>{'status': 503, 'code': 'DEPENDENCY_UNAVAILABLE'},
          contentType: 'application/problem+json',
        ),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(
          const ApiRequest(method: HttpMethod.post, path: '/consent/acceptances'),
        ),
        throwsA(isA<ApiException>()),
      );

      expect(harness.adapter.requests.length, 1);
    });

    test('does not retry a rejected request', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          403,
          <String, Object?>{'status': 403, 'code': 'NOT_AUTHORIZED'},
          contentType: 'application/problem+json',
        ),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      await expectLater(
        harness.transport.send(const ApiRequest(method: HttpMethod.get, path: '/tenancy/members')),
        throwsA(isA<ApiException>()),
      );

      expect(harness.adapter.requests.length, 1);
    });

    test('recovers when a retry succeeds', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int attempt) => attempt == 1
            ? jsonResponse(
                503,
                <String, Object?>{'status': 503, 'code': 'DEPENDENCY_UNAVAILABLE'},
                contentType: 'application/problem+json',
              )
            : jsonResponse(200, <String, Object?>{'ok': true}),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('live'));

      final response = await harness.transport.send(
        const ApiRequest(method: HttpMethod.get, path: '/users/me'),
      );

      expect(response.statusCode, 200);
      expect(harness.adapter.requests.length, 2);
    });
  });

  group('logging', () {
    test('no log record ever contains a credential, a header or a body', () async {
      final harness = _Harness(
        handler: (RequestOptions options, int _) => jsonResponse(
          200,
          <String, Object?>{'displayName': 'Person Name', 'email': 'person@example.invalid'},
        ),
      );
      addTearDown(harness.dispose);
      await harness.sessions.adopt(_tokens('super-secret-access-token'));

      await harness.transport.send(
        const ApiRequest(
          method: HttpMethod.get,
          path: '/consent/status',
          query: <String, Object?>{'purposeRef': 'marketing'},
        ),
      );

      expect(harness.logSink.records, isNotEmpty);
      for (final record in harness.logSink.records) {
        final rendered = record.toString();
        expect(rendered, isNot(contains('super-secret-access-token')));
        expect(rendered, isNot(contains('Bearer')));
        expect(rendered, isNot(contains('person@example.invalid')));
        expect(rendered, isNot(contains('Person Name')));
        expect(record.fields.containsKey('headers'), isFalse);
        expect(record.fields.containsKey('body'), isFalse);
      }
    });
  });
}
