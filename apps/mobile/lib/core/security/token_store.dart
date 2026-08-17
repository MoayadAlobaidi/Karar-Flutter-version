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
//      Recording the intent first is what ORDERS it correctly: a process that
//      dies between a failed delete and a marker written afterwards would
//      leave an abandoned credential sitting there, restorable. See the
//      durability limit below — the ordering is right, the write is not
//      guaranteed.
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
// THE MARKER WRITE CAN FAIL, AND THE FAILURE IS NOW VISIBLE.
//
// `KeyValueStore.writeBool` updates an in-memory snapshot and swallows any
// platform failure, which is right for an ordinary preference and wrong for
// this one: `raise()` returned normally when nothing reached disk, `isRaised`
// answered true from the snapshot for the rest of the process, and nothing
// survived a relaunch. An independent review demonstrated it. The header used
// to call the write-first ordering "crash-safe"; the ordering was right and
// the claim was not.
//
// `writeBoolChecked` reports what the platform did, so `clear()` now knows
// whether the marker landed and exposes it as [TokenStore.abandonmentIsRecorded].
// A caller can therefore distinguish the two failed-erase outcomes:
//
//   erase failed, marker held      — survivable. The credential is still on
//                                    disk and the next launch refuses it.
//   erase failed, marker also lost — NOT survivable on its own. Nothing
//                                    records the abandonment, and a later
//                                    launch can restore the credential.
//
// The second is logged distinctly rather than folded into the first, because
// the consequences differ and one log line for both would hide it. What this
// does NOT do is make the marker durable — no client-side record survives a
// platform store that refuses to write. It makes the failure honest, which is
// the most this layer can offer; server-side revocation on abandonment is the
// only real remedy and belongs elsewhere.
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

  /// Whether a failed [clear] is durably recorded as abandoned.
  ///
  /// Only meaningful after a `Failed` clear. `true` means the next launch will
  /// refuse to restore whatever survived; `false` means the erase failed AND
  /// the record of that failure did not persist, which is the one combination
  /// under which an abandoned credential can come back.
  bool get abandonmentIsRecorded;
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

  /// Records the intent, and REPORTS whether it reached the platform.
  ///
  /// The reporting form is used deliberately. `writeBool` swallows a platform
  /// failure and returns normally, so a marker that never reached disk was
  /// indistinguishable from one that did: `isRaised` reads the in-memory
  /// snapshot and answers true for the rest of the process, and nothing
  /// survives a relaunch. The caller that needs this marker needs to know when
  /// it does not exist.
  Future<Result<void>> raise() =>
      _preferences.writeBoolChecked(_key, value: true);

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
  SecureTokenStore(this._store, {PersistedSessionInvalidation? invalidation})
      : _invalidation = invalidation;

  static const SecureKey _key = SecureKey('session_tokens.v1');

  final SecureStore _store;
  final PersistedSessionInvalidation? _invalidation;

  /// Set by [clear]; see [abandonmentIsRecorded].
  bool _abandonmentRecorded = true;

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
    //
    // The RESULT of raising is kept, because a marker that did not reach the
    // platform protects nothing while reporting success. `writeBoolChecked`
    // exists so this line can tell the difference.
    final raised = await _invalidation?.raise();
    _abandonmentRecorded = _invalidation == null || raised is Success<void>;

    final erased = await _store.delete(_key);
    if (erased is Success<void>) {
      await _invalidation?.lower();
      _abandonmentRecorded = true;
    }
    return erased;
  }

  @override
  bool get abandonmentIsRecorded => _abandonmentRecorded;

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
