// PURE DART ONLY — the transport port.
//
// The GENERATED API client is written against this interface, not against Dio.
// Two consequences the whole team relies on:
//   * regenerating the client cannot disturb the interceptor stack;
//   * a test can drive the generated client with an in-memory transport and no
//     HTTP at all.
import 'package:meta/meta.dart';

import '../errors/failure.dart';
import '../utilities/cancellation.dart';
import 'http_method.dart';
import 'timeouts.dart';

/// A decoded JSON object.
typedef JsonMap = Map<String, Object?>;

/// One outbound request, independent of any HTTP library.
@immutable
final class ApiRequest {
  const ApiRequest({
    required this.method,
    required this.path,
    this.query = const <String, Object?>{},
    this.body,
    this.headers = const <String, String>{},
    this.requiresAuthentication = true,
    this.idempotencyKey,
    this.cancellation,
    this.timeouts = TimeoutProfile.standard,
    this.correlationId,
  });

  final HttpMethod method;

  /// Path relative to the configured API base URL, beginning with `/`.
  final String path;

  /// Query parameters. Null values are omitted rather than sent empty.
  final Map<String, Object?> query;

  /// JSON-encodable request body, or null.
  final Object? body;

  final Map<String, String> headers;

  /// Whether the request carries the session credential. False for the
  /// pre-authentication endpoints and for the refresh call itself.
  final bool requiresAuthentication;

  /// When present, the server deduplicates repeats, which makes an otherwise
  /// unsafe request safe to retry and to replay after a token refresh.
  final String? idempotencyKey;

  final CancellationToken? cancellation;

  final TimeoutProfile timeouts;

  /// Set by the caller only when joining an existing trace; otherwise the
  /// transport generates one.
  final String? correlationId;

  /// Whether this request may be issued a second time by the client.
  ///
  /// An idempotent method always may. A non-idempotent method may only when
  /// the caller supplied an idempotency key, because the client cannot know
  /// whether a request that failed mid-flight took effect.
  bool get isReplayable => method.isIdempotent || idempotencyKey != null;

  ApiRequest copyWith({
    Map<String, String>? headers,
    String? correlationId,
  }) =>
      ApiRequest(
        method: method,
        path: path,
        query: query,
        body: body,
        headers: headers ?? this.headers,
        requiresAuthentication: requiresAuthentication,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
        correlationId: correlationId ?? this.correlationId,
      );

  /// Safe to log: no body, no headers, no query values.
  @override
  String toString() => 'ApiRequest(${method.wireName} $path)';
}

/// A successful (2xx) response.
@immutable
final class ApiResponse {
  const ApiResponse({
    required this.statusCode,
    required this.body,
    this.headers = const <String, String>{},
    this.correlationId,
  });

  final int statusCode;

  /// The decoded JSON body: a [JsonMap], a [List], or null for an empty body.
  final Object? body;

  final Map<String, String> headers;

  final String? correlationId;

  /// The body as a JSON object.
  ///
  /// Throws [ApiException] carrying a [ContractViolationFailure] when the body
  /// is absent or is not an object. Generated code calls this, so a contract
  /// drift surfaces as a typed failure rather than a cast error.
  JsonMap requireObject({String? location}) {
    final value = body;
    if (value is JsonMap) {
      return value;
    }
    throw ApiException(
      ContractViolationFailure(correlationId: correlationId, location: location),
      statusCode: statusCode,
    );
  }

  /// The body as a JSON array.
  List<Object?> requireArray({String? location}) {
    final value = body;
    if (value is List<Object?>) {
      return value;
    }
    throw ApiException(
      ContractViolationFailure(correlationId: correlationId, location: location),
      statusCode: statusCode,
    );
  }

  /// Safe to log: status and correlation id only.
  @override
  String toString() => 'ApiResponse($statusCode, correlationId: $correlationId)';
}

/// The only exception the transport throws.
///
/// Data-layer code catches this and converts it to `Failed(failure)`; nothing
/// above the data layer ever sees it.
@immutable
final class ApiException implements Exception {
  const ApiException(this.failure, {this.statusCode});

  final Failure failure;

  /// The HTTP status, when the failure came from a response rather than from
  /// the transport itself.
  final int? statusCode;

  @override
  String toString() => 'ApiException(${failure.diagnosticLabel}, status: $statusCode)';
}

/// Issues requests and returns decoded responses.
///
/// Implementations MUST throw [ApiException] for every non-2xx response and
/// for every transport error, so that a caller never has to inspect a status
/// code to know whether it succeeded.
abstract interface class ApiTransport {
  Future<ApiResponse> send(ApiRequest request);
}
