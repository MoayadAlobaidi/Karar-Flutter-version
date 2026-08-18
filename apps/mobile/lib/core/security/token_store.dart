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
//   1. An in-process latch is set FIRST, before anything is attempted. It
//      costs nothing and it closes the smallest window: from this instant, no
//      read in this process hands the credential back, whatever the platform
//      does next.
//   2. An invalidation marker is recorded BEFORE the erase is attempted.
//      Recording the intent first is what ORDERS it correctly: a process that
//      dies between a failed delete and a marker written afterwards would
//      leave an abandoned credential sitting there, restorable.
//   3. The erase is attempted whether or not the marker landed. A marker that
//      could not be written is a reason to report the outcome honestly, never
//      a reason to leave the credential in place.
//   4. The marker is stood down only on a CONFIRMED successful erase, or on a
//      CONFIRMED successful write of a replacement credential. A write that
//      did not happen therefore cannot resurrect the credential it was meant
//      to replace.
//   5. While the marker stands, [SecureTokenStore.read] does not return a
//      credential at all. It retries the erase first — the store may have
//      recovered since — and reports an empty store if that now works, or the
//      storage failure if it does not. There is no retry count and no timeout
//      after which the stored credential is handed back: it never is.
//
// THE MARKER IS NOT A TOKEN AND NOT A COPY OF ONE. It is one boolean recording
// that whatever is persisted is no longer permitted to be restored. It can
// authenticate nobody. It lives in LOCAL SECURITY STATE rather than in secure
// storage deliberately: a marker written through the very port that just
// refused a delete would be unavailable at precisely the moment it is needed.
//
// WHY IT IS NO LONGER AN ORDINARY PREFERENCE.
//
// It used to sit in `KeyValueStore` beside the locale, and that store is built
// to swallow: `writeBool` catches the platform error, updates an in-memory
// snapshot and returns, so `raise()` reported success when nothing reached
// disk, `isRaised` answered true from the snapshot for the rest of the
// process, and nothing survived a relaunch. The patch for that was a second
// write method that reported its outcome, plus a boolean on this class saying
// whether the marker had landed — a `Result<void>` and a side channel that a
// caller had to remember to read together. Two callers read the Result and one
// read the boolean, and "erase failed, marker held" was indistinguishable from
// "erase failed, marker lost" everywhere the two were not combined by hand.
//
// Both are gone. The marker lives in `LocalSecurityStateStore`, which swallows
// nothing and has no in-memory fallback, and [TokenStore.clear] returns ONE
// value naming the whole compound outcome. There is nothing left to forget to
// check, and the type system will not let a caller treat a compound failure as
// an ordinary sign-out.
//
// WHAT THIS STILL DOES NOT DO. The credential is physically still in the
// platform keystore until some later erase succeeds. Local security state is
// plain and writable by anyone with filesystem access to an unlocked rooted or
// jailbroken device, so an attacker in that position can clear the marker and
// make the surviving credential restorable again. This is a client-side safety
// net, NOT revocation — the session is still live on the server either way,
// exactly as it is after an ordinary sign-out. Server-side revocation on
// abandonment is the real remedy and does not belong in this layer.
import 'dart:convert';

import '../errors/failure.dart';
import '../errors/result.dart';
import 'local_security_state_store.dart';
import 'secure_store.dart';
import 'session_tokens.dart';

/// What actually became of a credential the caller asked to destroy.
///
/// ONE value, not a `Result` plus a flag. The four failure modes below have
/// genuinely different consequences — one is clean, one is untidy, one is
/// survivable, two are not — and the previous shape let a caller read half the
/// answer and act as though it were the whole one.
sealed class SessionAbandonmentOutcome {
  const SessionAbandonmentOutcome();

  /// True when nothing that could authenticate remains in secure storage.
  bool get credentialIsGone =>
      this is CredentialErased || this is CredentialErasedMarkerRetained;

  /// True when a later launch is guaranteed not to restore the credential —
  /// either because it is gone, or because a durable marker refuses it.
  bool get isDurablyResolved =>
      credentialIsGone || this is CredentialPersistedButDurablyInvalidated;

  /// Short, non-sensitive label. Never carries credential material.
  String get diagnosticLabel;

  @override
  String toString() => diagnosticLabel;
}

/// CREDENTIAL_ERASED. The erase was confirmed and the marker stood down.
/// Nothing survives and nothing needs to.
final class CredentialErased extends SessionAbandonmentOutcome {
  const CredentialErased();

  @override
  String get diagnosticLabel => 'credential_erased';
}

/// The erase was confirmed and the MARKER could not be stood down.
///
/// Safe, and deliberately distinguished from a failed erase, because the
/// consequences are opposite: there is no credential left for the marker to
/// guard, so the marker is merely stale. It is retried on the next read and
/// superseded by the next confirmed credential write, so it cannot trap a user
/// who signs in again.
final class CredentialErasedMarkerRetained extends SessionAbandonmentOutcome {
  const CredentialErasedMarkerRetained();

  @override
  String get diagnosticLabel => 'credential_erased_marker_retained';
}

/// CREDENTIAL_PERSISTED_BUT_DURABLY_INVALIDATED. The erase failed, and the
/// marker recording that it was abandoned IS durable.
///
/// Survivable. The credential is still in the keystore, and the next launch
/// reads the marker, refuses to restore it, and retries the erase. The user
/// must not be told the session was removed, because it was not.
final class CredentialPersistedButDurablyInvalidated extends SessionAbandonmentOutcome {
  const CredentialPersistedButDurablyInvalidated();

  @override
  String get diagnosticLabel => 'credential_persisted_but_durably_invalidated';
}

/// ABANDONMENT_NOT_DURABLE. The erase failed AND the marker did not reach the
/// platform.
///
/// The only combination that can lose a credential the user gave up: nothing
/// on disk records the abandonment, so a later launch can read it back and
/// sign them into the session they walked away from. The in-process latch
/// holds for THIS process; see [SecureTokenStore] for the hard boundary that
/// cannot be held locally beyond it.
final class AbandonmentNotDurable extends SessionAbandonmentOutcome {
  const AbandonmentNotDurable();

  @override
  String get diagnosticLabel => 'abandonment_not_durable';
}

/// SECURITY_STATE_UNAVAILABLE. The local security-state store could not be
/// consulted at all, so no marker was even attempted.
///
/// Treated exactly as severely as [AbandonmentNotDurable] — nothing durable
/// records the abandonment either way — and reported separately because the
/// remedy differs: this one is a store that is not there, not a write that was
/// refused.
final class AbandonmentSecurityStateUnavailable extends SessionAbandonmentOutcome {
  const AbandonmentSecurityStateUnavailable();

  @override
  String get diagnosticLabel => 'abandonment_security_state_unavailable';
}

/// Persistence for the session credential.
abstract interface class TokenStore {
  /// `Success(null)` means no session is stored. `Failed` means the store
  /// could not be consulted — the caller must fail closed and treat the user
  /// as unauthenticated rather than retry into a loop.
  ///
  /// A store whose ABANDONMENT MARKER cannot be consulted also answers
  /// `Failed`. Reading the credential while the one record that could forbid
  /// it is unreadable would be the fail-open path this whole file exists to
  /// close.
  Future<Result<SessionTokens?>> read();

  /// Persists a credential.
  ///
  /// `Failed` when the credential did not reach secure storage, AND when it
  /// did but the abandonment marker guarding the entry it replaced could not
  /// be stood down — because a marker left standing means the next launch
  /// destroys what was just written, and the caller has to know that this
  /// session will not survive a relaunch.
  Future<Result<void>> write(SessionTokens tokens);

  /// Destroys the credential. Used on sign-out, on session expiry, on
  /// refresh-token reuse detection, and when an unopenable application lock is
  /// abandoned.
  ///
  /// Returns the compound outcome. There is no separate success flag to read
  /// alongside it and no way to see half the answer.
  Future<SessionAbandonmentOutcome> clear();
}

/// The outcome of standing the invalidation marker down.
sealed class MarkerClearance {
  const MarkerClearance();

  /// True when the marker provably no longer stands.
  bool get isDurable => this is MarkerRemoved || this is MarkerStoodDown;

  String get diagnosticLabel;

  @override
  String toString() => diagnosticLabel;
}

/// The flag was removed outright.
final class MarkerRemoved extends MarkerClearance {
  const MarkerRemoved();

  @override
  String get diagnosticLabel => 'marker_removed';
}

/// The removal was refused and a confirmed write of `false` stood the marker
/// down instead.
///
/// The fallback is not tidiness, it is the difference between an inconvenience
/// and a trap. A store that refuses REMOVE but accepts WRITE would otherwise
/// leave the marker raised forever: every launch would read it, destroy
/// whatever credential had been written since, and send the user back to
/// sign-in — permanently, for a user who has done nothing wrong. Writing
/// `false` is exactly as durable as writing `true` was, and it is reported
/// separately so the removal failure is still visible.
final class MarkerStoodDown extends MarkerClearance {
  const MarkerStoodDown();

  @override
  String get diagnosticLabel => 'marker_stood_down';
}

/// Neither the removal nor the stand-down was confirmed. The marker still
/// stands as far as any later launch is concerned.
final class MarkerClearanceFailed extends MarkerClearance {
  const MarkerClearanceFailed(this.failure);

  final Failure failure;

  @override
  String get diagnosticLabel => 'marker_clearance_failed';
}

/// A durable record that the persisted credential must not be restored.
///
/// Raised when an erase could not be confirmed, and stood down only when the
/// credential it guards is provably gone or provably replaced. See the file
/// header for why it lives in local security state and what it does not
/// protect against.
final class PersistedSessionInvalidation {
  const PersistedSessionInvalidation(this._securityState);

  final LocalSecurityStateStore _securityState;

  /// Whether a credential that nobody wants may still be on disk.
  ///
  /// Returns the raw read outcome rather than a boolean, because the caller
  /// must be able to tell "no marker" from "I could not look". Collapsing the
  /// second into the first is how a store that stopped answering would silently
  /// re-permit an abandoned credential.
  Future<SecurityStateRead> state() =>
      _securityState.read(LocalSecurityFlag.persistedSessionAbandoned);

  /// Records the intent, and REPORTS whether it reached the platform.
  Future<SecurityStateWrite> raise() =>
      _securityState.write(LocalSecurityFlag.persistedSessionAbandoned, value: true);

  /// Stands the marker down, and REPORTS whether that is durable.
  ///
  /// Removal first, then a confirmed write of `false`. See [MarkerStoodDown]
  /// for why the second attempt exists.
  Future<MarkerClearance> clear() async {
    final SecurityStateRemoval removed =
        await _securityState.remove(LocalSecurityFlag.persistedSessionAbandoned);
    if (removed.isDurable) {
      return const MarkerRemoved();
    }
    final SecurityStateWrite standDown =
        await _securityState.write(LocalSecurityFlag.persistedSessionAbandoned, value: false);
    if (standDown.isDurable) {
      return const MarkerStoodDown();
    }
    return MarkerClearanceFailed(
      removed.failureOrNull ??
          const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.remove,
          ),
    );
  }
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

  /// THE IN-PROCESS LATCH.
  ///
  /// Set the moment [clear] is entered and cleared only when the credential is
  /// provably gone or provably replaced. It is the part of the guarantee that
  /// holds even when local security state refuses every write: within this
  /// process, a credential the user gave up is never handed back.
  ///
  /// THE HARD BOUNDARY IT CANNOT CROSS. It is memory, so it ends with the
  /// process. If the erase failed AND the marker could not be persisted, then
  /// after a restart nothing local records the abandonment and the surviving
  /// credential is readable again. No client-side record survives a storage
  /// layer that refuses to write, so this cannot be fixed here and is not
  /// pretended away: the caller is given [AbandonmentNotDurable], the startup
  /// machine stays BLOCKED rather than presenting an ordinary sign-in, and the
  /// only real remedy — server-side revocation of the abandoned session — is
  /// outside this layer.
  bool _abandonedThisProcess = false;

  @override
  Future<Result<SessionTokens?>> read() async {
    final PersistedSessionInvalidation? invalidation = _invalidation;
    if (invalidation == null) {
      // No marker configured. Unit-test shape only; see the constructor.
      return _readStored();
    }

    final SecurityStateRead marker = await invalidation.state();
    switch (marker) {
      case SecurityStateUnavailable():
        // FAIL CLOSED. The one record that could forbid this credential cannot
        // be consulted, so the credential is not consulted either. Answering
        // "no session" instead would be a lie the caller cannot detect, and
        // answering with the credential would ignore an abandonment that may
        // well be recorded right there.
        return const Failed<SessionTokens?>(
          LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.read,
          ),
        );
      case SecurityStateCorrupt():
        return const Failed<SessionTokens?>(LocalSecurityStateCorruptFailure());
      case SecurityStateValue(value: final raised):
        if (!raised && !_abandonedThisProcess) {
          return _readStored();
        }
      case SecurityStateAbsent():
        if (!_abandonedThisProcess) {
          return _readStored();
        }
    }

    // A credential the user abandoned may still be on disk. Retry the erase,
    // because the store may have recovered since — but hand nothing back
    // either way. Returning the credential "just this once because the delete
    // is still failing" would make the abandonment cosmetic.
    final Result<void> erased = await _store.delete(_key);
    switch (erased) {
      case Failed<void>(:final failure):
        return Failed<SessionTokens?>(failure);
      case Success<void>():
        _abandonedThisProcess = false;
        await invalidation.clear();
        return const Success<SessionTokens?>(null);
    }
  }

  @override
  Future<Result<void>> write(SessionTokens tokens) async {
    final Result<void> written = await _store.write(
      _key,
      jsonEncode(<String, Object?>{
        'accessToken': tokens.accessToken,
        'accessTokenExpiresAt': tokens.accessTokenExpiresAt.toUtc().toIso8601String(),
        'refreshToken': tokens.refreshToken,
        'refreshTokenExpiresAt': tokens.refreshTokenExpiresAt.toUtc().toIso8601String(),
        'sessionId': tokens.sessionId,
      }),
    );
    if (written is! Success<void>) {
      return written;
    }

    // The replacement is confirmed and it occupies THE SAME KEY, so the
    // credential the marker was guarding has been physically overwritten. The
    // in-process latch has nothing left to withhold and is released here —
    // without that, a user who abandoned a session and then signed in again
    // would have the fresh credential destroyed by the very next restore.
    _abandonedThisProcess = false;

    final PersistedSessionInvalidation? invalidation = _invalidation;
    if (invalidation == null) {
      return written;
    }
    final MarkerClearance cleared = await invalidation.clear();
    if (cleared.isDurable) {
      return written;
    }
    // The credential is on disk and a marker forbidding it is on disk too, so
    // the next launch will erase what was just written. That is the correct
    // fail-closed behaviour and it means this session lasts one launch, which
    // the caller has to be told rather than left to discover.
    return Failed<void>(
      switch (cleared) {
        MarkerClearanceFailed(:final failure) => failure,
        MarkerRemoved() || MarkerStoodDown() =>
          const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.remove,
          ),
      },
    );
  }

  @override
  Future<SessionAbandonmentOutcome> clear() async {
    // FIRST, before anything can fail. From here on nothing in this process
    // hands the credential back, whatever the platform does next.
    _abandonedThisProcess = true;

    final PersistedSessionInvalidation? invalidation = _invalidation;
    // Raised BEFORE the delete is attempted. The window between "the delete
    // failed" and "the marker was written" is where a killed process would
    // otherwise lose the fact that this credential is unwanted.
    final SecurityStateWrite? raised = await invalidation?.raise();

    // Attempted whether or not the marker landed. A marker that could not be
    // written is a reason to report honestly, never a reason to leave the
    // credential where it is.
    final Result<void> erased = await _store.delete(_key);
    if (erased is Success<void>) {
      _abandonedThisProcess = false;
      final MarkerClearance? cleared = await invalidation?.clear();
      return cleared == null || cleared.isDurable
          ? const CredentialErased()
          : const CredentialErasedMarkerRetained();
    }

    // The erase failed. Everything now turns on whether the abandonment is
    // recorded somewhere that outlives this process.
    return switch (raised) {
      // No marker configured at all: the unit-test shape. Reported as the
      // worst case, because that is what it is — nothing durable says this
      // credential was given up.
      null => const AbandonmentNotDurable(),
      SecurityStateWritten() => const CredentialPersistedButDurablyInvalidated(),
      SecurityStateWriteFailed() => const AbandonmentNotDurable(),
      SecurityStateWriteUnavailable() => const AbandonmentSecurityStateUnavailable(),
    };
  }

  Future<Result<SessionTokens?>> _readStored() async {
    final Result<String?> stored = await _store.read(_key);
    return switch (stored) {
      Failed<String?>(:final failure) => Failed<SessionTokens?>(failure),
      Success<String?>(:final value) => _decode(value),
    };
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
