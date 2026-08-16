// PURE DART ONLY.
//
// Decodes the identity module's session payload.
//
// The contract documents these responses in PROSE rather than with a schema
// (`{status: authenticated, accessToken, accessTokenExpiresAt, refreshToken,
// refreshTokenExpiresAt, sessionId}` for sign-in; the same without `sessionId`
// for refresh, which keeps the session it rotated). The generated client
// therefore returns the decoded object, and this codec is the ONE place that
// knows the shape. When the contract gains a schema, this file is deleted and
// the generated DTO is used instead.
//
// Nothing here logs. A malformed payload yields a typed failure whose message
// names the missing FIELD and never its value.
import '../errors/failure.dart';
import '../errors/result.dart';
import 'session_tokens.dart';

/// Reads the identity session payload.
final class SessionTokenCodec {
  const SessionTokenCodec();

  /// Wire value of `status` for a completed sign-in.
  static const String statusAuthenticated = 'authenticated';

  /// Wire value of `status` when sign-in issued a multi-factor challenge
  /// instead of a session.
  static const String statusMfaRequired = 'mfa_required';

  /// Wire value of `status` for a rotated refresh.
  static const String statusRefreshed = 'refreshed';

  /// Whether [payload] is a multi-factor challenge rather than a session.
  bool isMfaChallenge(Map<String, Object?> payload) => payload['status'] == statusMfaRequired;

  /// Decodes a session payload.
  ///
  /// [fallbackSessionId] supplies the session identifier for the refresh
  /// response, which does not repeat it: a rotation stays inside the session
  /// it rotated.
  Result<SessionTokens> decode(
    Map<String, Object?> payload, {
    String? fallbackSessionId,
  }) {
    final accessToken = payload['accessToken'];
    final refreshToken = payload['refreshToken'];
    final accessExpiry = payload['accessTokenExpiresAt'];
    final refreshExpiry = payload['refreshTokenExpiresAt'];
    final sessionId = payload['sessionId'] ?? fallbackSessionId;

    if (accessToken is! String || accessToken.isEmpty) {
      return const Failed<SessionTokens>(ContractViolationFailure(location: 'accessToken'));
    }
    if (refreshToken is! String || refreshToken.isEmpty) {
      return const Failed<SessionTokens>(ContractViolationFailure(location: 'refreshToken'));
    }
    if (sessionId is! String || sessionId.isEmpty) {
      return const Failed<SessionTokens>(ContractViolationFailure(location: 'sessionId'));
    }
    final accessTokenExpiresAt = _parseInstant(accessExpiry);
    if (accessTokenExpiresAt == null) {
      return const Failed<SessionTokens>(
        ContractViolationFailure(location: 'accessTokenExpiresAt'),
      );
    }
    final refreshTokenExpiresAt = _parseInstant(refreshExpiry);
    if (refreshTokenExpiresAt == null) {
      return const Failed<SessionTokens>(
        ContractViolationFailure(location: 'refreshTokenExpiresAt'),
      );
    }

    return Success<SessionTokens>(
      SessionTokens(
        accessToken: accessToken,
        accessTokenExpiresAt: accessTokenExpiresAt,
        refreshToken: refreshToken,
        refreshTokenExpiresAt: refreshTokenExpiresAt,
        sessionId: sessionId,
      ),
    );
  }

  DateTime? _parseInstant(Object? value) {
    if (value is! String) {
      return null;
    }
    return DateTime.tryParse(value)?.toUtc();
  }
}
