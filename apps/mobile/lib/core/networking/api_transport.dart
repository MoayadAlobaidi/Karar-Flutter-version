// PURE DART ONLY — the transport port.
//
// The GENERATED API client is written against this interface, not against Dio.
// Two consequences the whole team relies on:
//   * regenerating the client cannot disturb the interceptor stack;
//   * a test can drive the generated client with an in-memory transport and no
//     HTTP at all.
import 'dart:typed_data';

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
    this.rawBody,
    this.headers = const <String, String>{},
    this.requiresAuthentication = true,
    this.idempotencyKey,
    this.cancellation,
    this.timeouts = TimeoutProfile.standard,
    this.correlationId,
  }) : assert(
          body == null || rawBody == null,
          'a request carries a JSON body or a raw body, never both — the two '
          'are encoded differently and sent under different media types',
        );

  final HttpMethod method;

  /// Path relative to the configured API base URL, beginning with `/`.
  final String path;

  /// Query parameters. Null values are omitted rather than sent empty.
  final Map<String, Object?> query;

  /// JSON-encodable request body, or null.
  ///
  /// For a body that is NOT JSON — an uploaded statement file, say — use
  /// [rawBody] instead. This field is always sent as `application/json`.
  final Object? body;

  /// Raw bytes under a declared media type, or null.
  ///
  /// Kept separate from [body] rather than widening it. Every non-null [body]
  /// is sent as `application/json`, which is right for 61 of the contract's
  /// operations and wrong for the statement-import upload, whose contract
  /// declares `text/csv`. Sending bytes through [body] would have encoded
  /// them as a JSON string under the wrong media type, and the server would
  /// have refused it as unsupported — a failure that looks like a bad file
  /// rather than a bad client.
  final RawRequestBody? rawBody;

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
        rawBody: rawBody,
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

/// A request body that is raw bytes rather than JSON, with its media type.
///
/// The bytes are carried, never inspected. An uploaded statement is content
/// written by someone other than the person uploading it (ADR-0029): the
/// client's job is to deliver it unaltered and let the platform parse it.
@immutable
final class RawRequestBody {
  const RawRequestBody({required this.bytes, required this.mediaType});

  final Uint8List bytes;

  /// The media type to send, e.g. `text/csv; charset=utf-8`. Required rather
  /// than defaulted: a body whose type nobody stated is a body the server
  /// guesses at.
  final String mediaType;

  int get byteLength => bytes.length;

  /// Safe to log: the media type and the SIZE, never the content. A statement
  /// file is the most sensitive thing this client ever sends.
  @override
  String toString() => 'RawRequestBody($mediaType, $byteLength bytes)';
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
