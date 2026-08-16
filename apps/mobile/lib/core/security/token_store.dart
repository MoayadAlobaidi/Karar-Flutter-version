// PURE DART ONLY (dart:convert is part of the Dart SDK).
//
// The only place session credentials are persisted. Backed by [SecureStore],
// which is platform secure storage and nothing else.
import 'dart:convert';

import '../errors/failure.dart';
import '../errors/result.dart';
import 'secure_store.dart';
import 'session_tokens.dart';

/// Persistence for the session credential.
abstract interface class TokenStore {
  /// `Success(null)` means no session is stored. `Failed` means the store
  /// could not be consulted — the caller must fail closed and treat the user
  /// as unauthenticated rather than retry into a loop.
  Future<Result<SessionTokens?>> read();

  Future<Result<void>> write(SessionTokens tokens);

  /// Removes the credential. Used on sign-out, on session expiry, and on
  /// refresh-token reuse detection.
  Future<Result<void>> clear();
}

/// [TokenStore] over platform secure storage.
final class SecureTokenStore implements TokenStore {
  const SecureTokenStore(this._store);

  static const SecureKey _key = SecureKey('session_tokens.v1');

  final SecureStore _store;

  @override
  Future<Result<SessionTokens?>> read() async {
    final stored = await _store.read(_key);
    return switch (stored) {
      Failed<String?>(:final failure) => Failed<SessionTokens?>(failure),
      Success<String?>(:final value) => _decode(value),
    };
  }

  @override
  Future<Result<void>> write(SessionTokens tokens) => _store.write(
        _key,
        jsonEncode(<String, Object?>{
          'accessToken': tokens.accessToken,
          'accessTokenExpiresAt': tokens.accessTokenExpiresAt.toUtc().toIso8601String(),
          'refreshToken': tokens.refreshToken,
          'refreshTokenExpiresAt': tokens.refreshTokenExpiresAt.toUtc().toIso8601String(),
          'sessionId': tokens.sessionId,
        }),
      );

  @override
  Future<Result<void>> clear() => _store.delete(_key);

  Result<SessionTokens?> _decode(String? raw) {
    if (raw == null) {
      return const Success<SessionTokens?>(null);
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, Object?>) {
        return const Failed<SessionTokens?>(
          ContractViolationFailure(location: 'session_tokens'),
        );
      }
      final accessToken = decoded['accessToken'];
      final refreshToken = decoded['refreshToken'];
      final sessionId = decoded['sessionId'];
      final accessExpiry = decoded['accessTokenExpiresAt'];
      final refreshExpiry = decoded['refreshTokenExpiresAt'];
      if (accessToken is! String ||
          refreshToken is! String ||
          sessionId is! String ||
          accessExpiry is! String ||
          refreshExpiry is! String) {
        return const Failed<SessionTokens?>(
          ContractViolationFailure(location: 'session_tokens'),
        );
      }
      return Success<SessionTokens?>(
        SessionTokens(
          accessToken: accessToken,
          accessTokenExpiresAt: DateTime.parse(accessExpiry).toUtc(),
          refreshToken: refreshToken,
          refreshTokenExpiresAt: DateTime.parse(refreshExpiry).toUtc(),
          sessionId: sessionId,
        ),
      );
    } on FormatException {
      // An unparseable entry is a corrupt credential, not an empty store. It
      // is reported so the caller can wipe and re-authenticate; the raw value
      // is never surfaced.
      return const Failed<SessionTokens?>(
        ContractViolationFailure(location: 'session_tokens'),
      );
    }
  }
}
