// PURE DART ONLY.
//
// The in-memory representation of a session credential.
//
// `toString` deliberately omits the token material: a value that ends up in an
// interpolated string, an assertion message, or a framework error dump must
// not carry a bearer token. The same reason drives the absence of `==` on
// token material — comparing credentials is not an operation this type offers.
import 'package:meta/meta.dart';

import '../utilities/clock.dart';

/// Access and refresh credentials for one session.
@immutable
final class SessionTokens {
  const SessionTokens({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    required this.sessionId,
  });

  /// Short-lived bearer credential.
  final String accessToken;

  final DateTime accessTokenExpiresAt;

  /// One-time credential. Presenting a consumed refresh token is treated by
  /// the server as theft and terminates the whole family.
  final String refreshToken;

  final DateTime refreshTokenExpiresAt;

  /// Opaque session identifier. Non-secret; safe to log.
  final String sessionId;

  /// Whether the access token is expired, or close enough to expiry that a
  /// request started now would probably arrive after it.
  bool isAccessTokenExpired(Clock clock, {Duration leeway = const Duration(seconds: 30)}) =>
      !clock.nowUtc().add(leeway).isBefore(accessTokenExpiresAt.toUtc());

  /// Whether the refresh chain itself has aged out. Once true, no refresh can
  /// succeed and the session is over.
  bool isRefreshTokenExpired(Clock clock) =>
      !clock.nowUtc().isBefore(refreshTokenExpiresAt.toUtc());

  SessionTokens copyWith({
    String? accessToken,
    DateTime? accessTokenExpiresAt,
    String? refreshToken,
    DateTime? refreshTokenExpiresAt,
    String? sessionId,
  }) =>
      SessionTokens(
        accessToken: accessToken ?? this.accessToken,
        accessTokenExpiresAt: accessTokenExpiresAt ?? this.accessTokenExpiresAt,
        refreshToken: refreshToken ?? this.refreshToken,
        refreshTokenExpiresAt: refreshTokenExpiresAt ?? this.refreshTokenExpiresAt,
        sessionId: sessionId ?? this.sessionId,
      );

  @override
  String toString() =>
      'SessionTokens(sessionId: $sessionId, accessTokenExpiresAt: '
      '${accessTokenExpiresAt.toIso8601String()})';
}
