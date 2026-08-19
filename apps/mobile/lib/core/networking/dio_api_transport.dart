// The HTTP transport.
//
// Everything policy-bearing happens here, in one readable path, rather than in
// a stack of interceptors whose ordering is the real specification:
//   * typed timeouts and cancellation, per request;
//   * correlation-id propagation on every request;
//   * RFC 7807 decoding and typed failure mapping;
//   * proactive refresh before an expired token is used, and a single
//     reactive refresh when the server rejects one anyway;
//   * replay only of requests that are safe to replay;
//   * idempotency-aware, bounded retries;
//   * reachability tracking;
//   * platform TLS validation, with an explicit refusal of invalid
//     certificates.
//
// LOGGING: method, redacted URI, status, duration and correlation id. Never a
// header, never a body, never a token — in any build.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

import '../errors/failure.dart';
import '../errors/result.dart';
import '../logging/app_logger.dart';
import '../logging/redaction.dart';
import '../security/session_manager.dart';
import '../security/session_tokens.dart';
import '../utilities/cancellation.dart';
import '../utilities/clock.dart';
import '../utilities/correlation_id.dart';
import 'api_transport.dart';
import 'network_status.dart';
import 'problem_details.dart';
import 'problem_failure_mapper.dart';
import 'retry_policy.dart';
import 'timeouts.dart';
import 'token_refresh_port.dart';

/// Header carrying the client-generated correlation identifier.
const String correlationIdHeader = 'x-correlation-id';

/// Header carrying an idempotency key for unsafe operations.
const String idempotencyKeyHeader = 'idempotency-key';

/// Builds the shared [Dio] instance.
///
/// TLS is validated by the PLATFORM trust store — no certificate is pinned
/// here and, more importantly, no callback accepts an invalid one. The
/// `badCertificateCallback` returning false is redundant with the default and
/// deliberate: it makes the decision greppable, so a future "just for local
/// testing" override is a visible change rather than an absent line.
Dio buildDio({required Uri baseUrl, required TimeoutProfile defaultTimeouts}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl.toString(),
      connectTimeout: defaultTimeouts.connect,
      sendTimeout: defaultTimeouts.send,
      receiveTimeout: defaultTimeouts.receive,
      // Bodies are decoded by this client, not by Dio, so that
      // `application/problem+json` and empty bodies are handled uniformly.
      responseType: ResponseType.plain,
      // Every status reaches the transport; the transport decides what is a
      // failure. Dio must not throw on our behalf.
      validateStatus: (int? status) => status != null,
      headers: <String, Object?>{
        'accept': 'application/json, application/problem+json',
      },
    ),
  );
  dio.httpClientAdapter = IOHttpClientAdapter(
    createHttpClient: () {
      final client = HttpClient()
        ..badCertificateCallback = (X509Certificate cert, String host, int port) => false;
      return client;
    },
  );
  return dio;
}

/// [ApiTransport] over Dio.
final class DioApiTransport implements ApiTransport {
  DioApiTransport({
    required Dio dio,
    required AppLogger logger,
    required CorrelationIdGenerator correlationIds,
    required NetworkStatusTracker networkStatus,
    required Clock clock,
    this.sessionManager,
    this.refreshCoordinator,
    this.retryPolicy = const RetryPolicy(),
    ProblemFailureMapper failureMapper = const ProblemFailureMapper(),
    Redactor redactor = const Redactor(),
  })  : _dio = dio,
        _logger = logger.forCategory('networking'),
        _correlationIds = correlationIds,
        _networkStatus = networkStatus,
        _clock = clock,
        _failureMapper = failureMapper,
        _redactor = redactor;

  final Dio _dio;
  final CategoryLogger _logger;
  final CorrelationIdGenerator _correlationIds;
  final NetworkStatusTracker _networkStatus;
  final Clock _clock;
  final ProblemFailureMapper _failureMapper;
  final Redactor _redactor;

  /// Null for the raw transport used by the refresh call itself, which must
  /// never attach a credential or re-enter the refresh coordinator.
  final SessionManager? sessionManager;

  /// Null for the raw transport. See [sessionManager].
  final TokenRefreshPort? refreshCoordinator;

  final RetryPolicy retryPolicy;

  @override
  Future<ApiResponse> send(ApiRequest request) async {
    var attempt = 1;
    while (true) {
      _throwIfCancelled(request);
      try {
        return await _attempt(request, allowReactiveRefresh: true);
      } on ApiException catch (exception) {
        final canRetry = attempt < retryPolicy.maxAttempts &&
            request.isReplayable &&
            retryPolicy.isRetryableFailure(exception.failure);
        if (!canRetry) {
          rethrow;
        }
        final serverRequested = switch (exception.failure) {
          RateLimitedFailure(:final retryAfter) => retryAfter,
          _ => null,
        };
        attempt++;
        final delay = retryPolicy.delayBefore(attempt, serverRequested: serverRequested);
        _logger.debug(
          'Retrying an idempotent request.',
          fields: <String, Object?>{
            'method': request.method.wireName,
            'attempt': attempt,
            'delayMs': delay.inMilliseconds,
            'failure': exception.failure.diagnosticLabel,
          },
          correlationId: exception.failure.correlationId,
        );
        await Future<void>.delayed(delay);
      }
    }
  }

  Future<ApiResponse> _attempt(ApiRequest request, {required bool allowReactiveRefresh}) async {
    final correlationId = request.correlationId ?? _correlationIds.next();
    SessionTokens? credential;

    if (request.requiresAuthentication) {
      credential = await _resolveCredential(correlationId);
    }

    final headers = <String, String>{
      ...request.headers,
      correlationIdHeader: correlationId,
      if (request.idempotencyKey != null) idempotencyKeyHeader: request.idempotencyKey!,
      if (credential != null) 'authorization': 'Bearer ${credential.accessToken}',
    };

    final cancelToken = _bindCancellation(request.cancellation);
    final startedAt = _clock.nowUtc();

    Response<String> response;
    try {
      response = await _dio.request<String>(
        request.path,
        data: request.rawBody?.bytes ?? request.body,
        queryParameters: <String, Object?>{
          for (final entry in request.query.entries)
            if (entry.value != null) entry.key: entry.value,
        },
        cancelToken: cancelToken,
        options: Options(
          method: request.method.wireName,
          headers: headers,
          sendTimeout: request.timeouts.send,
          receiveTimeout: request.timeouts.receive,
          // A raw body states its own media type; a JSON body is always
          // JSON; a request with no body declares no content type at all.
          contentType: request.rawBody?.mediaType ??
              (request.body == null ? null : Headers.jsonContentType),
        ),
      );
    } on DioException catch (error) {
      final failure = _mapDioException(error, correlationId: correlationId);
      if (failure is OfflineFailure) {
        _networkStatus.recordUnreachable();
      }
      _logRequest(request, correlationId, status: null, startedAt: startedAt, failure: failure);
      throw ApiException(failure);
    }

    _networkStatus.recordReachable();

    // THE SESSION THAT ASKED MUST STILL BE THE SESSION THAT IS SIGNED IN.
    //
    // The credential is captured before the request goes out; between then
    // and now the person may have switched organisation or signed out, and
    // this answer describes the organisation they LEFT. Returning it lets
    // every caller write one organisation's figures into another's screen.
    // Checked here rather than in each controller because a check that lives
    // in many places is a check that is missing from one of them.
    if (credential != null && _sessionChangedSince(credential)) {
      final failure = SessionChangedFailure(correlationId: correlationId);
      _logRequest(request, correlationId, status: null, startedAt: startedAt, failure: failure);
      throw ApiException(failure);
    }

    final status = response.statusCode ?? 0;
    final serverCorrelationId = _headerValue(response.headers, correlationIdHeader) ?? correlationId;
    _logRequest(request, serverCorrelationId, status: status, startedAt: startedAt, failure: null);

    if (status >= 200 && status < 300) {
      return ApiResponse(
        statusCode: status,
        body: _decodeBody(response.data, correlationId: serverCorrelationId, status: status),
        headers: _flattenHeaders(response.headers),
        correlationId: serverCorrelationId,
      );
    }

    if (status == 401 && request.requiresAuthentication && allowReactiveRefresh) {
      final replayed = await _refreshAndReplay(request, credential, serverCorrelationId);
      if (replayed != null) {
        return replayed;
      }
    }

    throw ApiException(
      _failureFromResponse(response, status: status, correlationId: serverCorrelationId),
      statusCode: status,
    );
  }

  /// Whether the session has been replaced or ended since [issued] was read.
  ///
  /// Compares the session identifier, not the access token: a proactive or
  /// reactive refresh rotates the token within the SAME session and must not
  /// be mistaken for a switch. A transport with no session manager cannot
  /// answer the question and does not pretend to.
  bool _sessionChangedSince(SessionTokens issued) {
    final manager = sessionManager;
    if (manager == null) return false;
    final current = manager.tokens;
    // No session at all: signed out while the request was in flight.
    if (current == null) return true;
    return current.sessionId != issued.sessionId;
  }

  /// Resolves the credential to attach, refreshing proactively when the local
  /// clock says the access token is spent. Fails closed: no credential means
  /// the request is not sent.
  Future<SessionTokens> _resolveCredential(String correlationId) async {
    final sessions = sessionManager;
    if (sessions == null) {
      throw ApiException(AuthenticationRequiredFailure(correlationId: correlationId));
    }
    final current = sessions.tokens;
    if (current == null) {
      throw ApiException(AuthenticationRequiredFailure(correlationId: correlationId));
    }
    final coordinator = refreshCoordinator;
    if (coordinator == null) {
      return current;
    }
    final resolved = await coordinator.ensureUsable(current);
    return switch (resolved) {
      Success<SessionTokens>(:final value) => value,
      Failed<SessionTokens>(:final failure) => throw ApiException(failure),
    };
  }

  /// Handles a 401 on an authenticated request.
  ///
  /// Returns the replayed response, or null when the caller should map the
  /// original 401. Throws when the session ended or when the request is not
  /// safe to replay.
  Future<ApiResponse?> _refreshAndReplay(
    ApiRequest request,
    SessionTokens? rejected,
    String correlationId,
  ) async {
    final coordinator = refreshCoordinator;
    if (coordinator == null || rejected == null) {
      return null;
    }
    final refreshed = await coordinator.refreshAfterRejection(rejected);
    switch (refreshed) {
      case Failed<SessionTokens>(:final failure):
        throw ApiException(failure, statusCode: 401);
      case Success<SessionTokens>():
        if (!request.isReplayable) {
          // The session is healthy again but this request must not be sent
          // twice. The caller reissues it deliberately.
          _logger.info(
            'Refreshed mid-flight; an unsafe request was not replayed.',
            fields: <String, Object?>{'method': request.method.wireName},
            correlationId: correlationId,
          );
          throw ApiException(
            UnsafeRequestNotReplayedFailure(correlationId: correlationId),
            statusCode: 401,
          );
        }
        // One replay only. A second 401 is authoritative.
        return _attempt(request, allowReactiveRefresh: false);
    }
  }

  Failure _failureFromResponse(
    Response<String> response, {
    required int status,
    required String correlationId,
  }) {
    final decoded = _tryDecode(response.data);
    final problem = ProblemDetails.tryParse(decoded, statusCode: status)
        ?.withRetryAfter(_retryAfter(response.headers));
    return _failureMapper.map(
      statusCode: status,
      problem: problem ?? _problemFromHeadersOnly(response.headers, status),
      correlationId: correlationId,
    );
  }

  ProblemDetails? _problemFromHeadersOnly(Headers headers, int status) {
    final retryAfter = _retryAfter(headers);
    if (retryAfter == null) {
      return null;
    }
    return ProblemDetails(status: status, retryAfter: retryAfter);
  }

  Object? _decodeBody(String? raw, {required String correlationId, required int status}) {
    if (raw == null || raw.isEmpty) {
      return null;
    }
    try {
      return jsonDecode(raw);
    } on FormatException {
      throw ApiException(
        ContractViolationFailure(correlationId: correlationId, location: 'response_body'),
        statusCode: status,
      );
    }
  }

  Object? _tryDecode(String? raw) {
    if (raw == null || raw.isEmpty) {
      return null;
    }
    try {
      return jsonDecode(raw);
    } on FormatException {
      return null;
    }
  }

  Failure _mapDioException(DioException error, {required String correlationId}) =>
      switch (error.type) {
        DioExceptionType.connectionTimeout =>
          TimeoutFailure(correlationId: correlationId, phase: TimeoutPhase.connect),
        DioExceptionType.sendTimeout =>
          TimeoutFailure(correlationId: correlationId, phase: TimeoutPhase.send),
        DioExceptionType.receiveTimeout || DioExceptionType.transformTimeout =>
          TimeoutFailure(correlationId: correlationId, phase: TimeoutPhase.receive),
        DioExceptionType.cancel => RequestCancelledFailure(correlationId: correlationId),
        DioExceptionType.connectionError => OfflineFailure(correlationId: correlationId),
        // An invalid certificate is never retried and never downgraded. It is
        // reported as a dependency failure so no screen offers "continue
        // anyway".
        DioExceptionType.badCertificate =>
          DependencyUnavailableFailure(correlationId: correlationId, code: 'TLS_VALIDATION_FAILED'),
        DioExceptionType.badResponse => UnexpectedFailure(correlationId: correlationId),
        DioExceptionType.unknown => error.error is SocketException
            ? OfflineFailure(correlationId: correlationId)
            : UnexpectedFailure(correlationId: correlationId),
      };

  CancelToken? _bindCancellation(CancellationToken? token) {
    if (token == null) {
      return null;
    }
    final cancelToken = CancelToken();
    if (token.isCancelled) {
      cancelToken.cancel(token.reason);
      return cancelToken;
    }
    unawaited(
      token.whenCancelled.then((_) {
        if (!cancelToken.isCancelled) {
          cancelToken.cancel(token.reason);
        }
      }),
    );
    return cancelToken;
  }

  void _throwIfCancelled(ApiRequest request) {
    if (request.cancellation?.isCancelled ?? false) {
      throw const ApiException(RequestCancelledFailure());
    }
  }

  void _logRequest(
    ApiRequest request,
    String correlationId, {
    required int? status,
    required DateTime startedAt,
    required Failure? failure,
  }) {
    final elapsed = _clock.nowUtc().difference(startedAt);
    _logger.debug(
      'API request completed.',
      fields: <String, Object?>{
        'method': request.method.wireName,
        // Path only, with query VALUES removed. No headers and no body.
        'path': _redactor.redactUri(Uri.parse(request.path)),
        'status': status,
        'durationMs': elapsed.inMilliseconds,
        'authenticated': request.requiresAuthentication,
        if (failure != null) 'failure': failure.diagnosticLabel,
      },
      correlationId: correlationId,
    );
  }

  Duration? _retryAfter(Headers headers) {
    final raw = _headerValue(headers, 'retry-after');
    if (raw == null) {
      return null;
    }
    final seconds = int.tryParse(raw.trim());
    if (seconds != null) {
      return Duration(seconds: seconds < 0 ? 0 : seconds);
    }
    try {
      final date = HttpDate.parse(raw);
      final delta = date.toUtc().difference(_clock.nowUtc());
      return delta.isNegative ? Duration.zero : delta;
    } on HttpException {
      return null;
    } on FormatException {
      return null;
    }
  }

  String? _headerValue(Headers headers, String name) => headers.value(name);

  Map<String, String> _flattenHeaders(Headers headers) {
    final result = <String, String>{};
    headers.forEach((String name, List<String> values) {
      if (values.isNotEmpty) {
        result[name] = values.first;
      }
    });
    return result;
  }
}

