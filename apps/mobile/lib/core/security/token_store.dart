// PURE DART ONLY (dart:convert is part of the Dart SDK).
//
// The only place session credentials are persisted. Backed by [SecureStore],
// which is platform secure storage and nothing else.
//
// WHEN THE ERASE ITSELF FAILS.
//
// Wiping the credential is the last step of ending or abandoning a session,
// and it can fail: a keystore that will not open, a secure enclave mid
// key-material migration, an Android provider that throws on delete. The
// credential then survives on disk while the user has been told they are
// signed out — and the NEXT COLD LAUNCH reads it back and signs them straight
// in again, which is exactly what they were trying to prevent.
//
// The semantics are therefore FAIL CLOSED, in this order:
//
//   1. An invalidation marker is recorded BEFORE the erase is attempted.
//      Recording the intent first is what makes it crash-safe: a process that
//      dies between a failed delete and a marker written afterwards would
//      leave an abandoned credential sitting there, restorable.
//   2. The marker is lowered only on a CONFIRMED successful erase, or on a
//      CONFIRMED successful write of a replacement credential. A write that
//      did not happen therefore cannot resurrect the credential it was meant
//      to replace.
//   3. While the marker stands, [SecureTokenStore.read] does not return a
//      credential at all. It retries the erase first — the store may have
//      recovered since — and reports an empty store if that now works, or the
//      storage failure if it does not. There is no retry count and no timeout
//      after which the stored credential is handed back: it never is.
//
// THE MARKER IS NOT A TOKEN AND NOT A COPY OF ONE. It is one boolean recording
// that whatever is persisted is no longer permitted to be restored. It can
// authenticate nobody, and it is the same class of non-sensitive preference as
// the app-lock choice it sits beside. It lives in the PREFERENCE store rather
// than in secure storage deliberately: a marker written through the very port
// that just refused a delete would be unavailable at precisely the moment it
// is needed.
//
// WHAT THIS STILL DOES NOT DO. The credential is physically still in the
// platform keystore until some later erase succeeds. Preferences are plain and
// writable by anyone with filesystem access to an unlocked rooted or
// jailbroken device, so an attacker in that position can clear the marker and
// make the surviving credential restorable again. This is a client-side safety
// net, NOT revocation — the session is still live on the server either way,
// exactly as it is after an ordinary sign-out. Server-side revocation on
// abandonment is the real remedy and does not belong in this layer.
import 'dart:convert';

import '../errors/failure.dart';
import '../errors/result.dart';
import '../storage/key_value_store.dart';
import 'secure_store.dart';
import 'session_tokens.dart';

/// Persistence for the session credential.
abstract interface class TokenStore {
  /// `Success(null)` means no session is stored. `Failed` means the store
  /// could not be consulted — the caller must fail closed and treat the user
  /// as unauthenticated rather than retry into a loop.
  Future<Result<SessionTokens?>> read();

  Future<Result<void>> write(SessionTokens tokens);

  /// Removes the credential. Used on sign-out, on session expiry, on
  /// refresh-token reuse detection, and when an unopenable application lock is
  /// abandoned.
  ///
  /// A `Failed` here means the credential MAY STILL BE ON DISK. The caller
  /// must not report a clean removal; see the file header for the fail-closed
  /// behaviour that stops the survivor being restored.
  Future<Result<void>> clear();
}

/// A durable record that the persisted credential must not be restored.
///
/// Raised when an erase could not be confirmed, and lowered only when the
/// credential it guards is provably gone or provably replaced. See the file
/// header for why it lives in ordinary preferences and what it does not
/// protect against.
final class PersistedSessionInvalidation {
  const PersistedSessionInvalidation(this._preferences);

  /// Names an INTENT, never anything that could satisfy one — the standard
  /// every key in the plain preference store is held to.
  static final PreferenceKey _key =
      PreferenceKey('security.persisted_session_abandoned');

  final KeyValueStore _preferences;

  /// True while a credential that nobody wants may still be on disk.
  bool get isRaised => _preferences.readBool(_key) ?? false;

  Future<void> raise() => _preferences.writeBool(_key, value: true);

  Future<void> lower() => _preferences.remove(_key);
}

/// [TokenStore] over platform secure storage.
final class SecureTokenStore implements TokenStore {
  /// [invalidation] is optional so that the many unit tests which only need a
  /// credential round trip stay legible. PRODUCTION MUST SUPPLY IT: without it
  /// a failed erase is forgotten the moment the process exits, and the
  /// abandoned credential is restored on the next launch. The composed
  /// cold-launch suite in `test/app/routing` reads the real
  /// `tokenStoreProvider` and fails if the composition root ever stops
  /// supplying one.
  const SecureTokenStore(this._store, {PersistedSessionInvalidation? invalidation})
      : _invalidation = invalidation;

  static const SecureKey _key = SecureKey('session_tokens.v1');

  final SecureStore _store;
  final PersistedSessionInvalidation? _invalidation;

  @override
  Future<Result<SessionTokens?>> read() async {
    final invalidation = _invalidation;
    if (invalidation != null && invalidation.isRaised) {
      // A credential the user abandoned may still be on disk. Retry the erase,
      // because the store may have recovered since — but hand nothing back
      // either way. Returning the credential "just this once because the
      // delete is still failing" would make the abandonment cosmetic.
      final erased = await _store.delete(_key);
      switch (erased) {
        case Failed<void>(:final failure):
          return Failed<SessionTokens?>(failure);
        case Success<void>():
          await invalidation.lower();
          return const Success<SessionTokens?>(null);
      }
    }
    final stored = await _store.read(_key);
    return switch (stored) {
      Failed<String?>(:final failure) => Failed<SessionTokens?>(failure),
      Success<String?>(:final value) => _decode(value),
    };
  }

  @override
  Future<Result<void>> write(SessionTokens tokens) async {
    final written = await _store.write(
      _key,
      jsonEncode(<String, Object?>{
        'accessToken': tokens.accessToken,
        'accessTokenExpiresAt': tokens.accessTokenExpiresAt.toUtc().toIso8601String(),
        'refreshToken': tokens.refreshToken,
        'refreshTokenExpiresAt': tokens.refreshTokenExpiresAt.toUtc().toIso8601String(),
        'sessionId': tokens.sessionId,
      }),
    );
    if (written is Success<void>) {
      // A replacement is confirmed on disk, so the marker guarding the entry
      // it replaced has nothing left to guard. Lowering it only on a CONFIRMED
      // write is what stops a persist that failed from reopening the door to
      // the credential the user abandoned.
      await _invalidation?.lower();
    }
    return written;
  }

  @override
  Future<Result<void>> clear() async {
    // Raised BEFORE the delete is attempted. The window between "the delete
    // failed" and "the marker was written" is where a killed process would
    // otherwise lose the fact that this credential is unwanted.
    await _invalidation?.raise();
    final erased = await _store.delete(_key);
    if (erased is Success<void>) {
      await _invalidation?.lower();
    }
    return erased;
  }

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
