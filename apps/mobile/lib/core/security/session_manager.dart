// PURE DART ONLY (dart:async is part of the Dart SDK).
//
// The authority on "is there a session, and what is it". Everything else —
// the auth interceptor, the refresh coordinator, the startup coordinator —
// reads it from here rather than keeping its own copy.
//
// Ending a session ALWAYS drops the in-memory credential, even when the
// secure-storage wipe reports a failure. A credential that cannot be erased
// from disk must at least stop being used.
//
// There are TWO ways a session stops, and they are not the same operation:
//
//   * [SessionManager.end] — a session that was LIVE has stopped. It
//     short-circuits when nothing is held, so it cannot double-signal.
//   * [SessionManager.abandonPersistedSession] — the credential ON DISK is
//     given up, whether or not one was ever read into memory. Startup checks
//     the application lock before it restores, so on a cold locked launch
//     there is a credential to destroy and no session to end; `end` is a
//     no-op there and would leave the tokens exactly where they were.
import 'dart:async';

import '../errors/failure.dart';
import '../errors/result.dart';
import '../logging/app_logger.dart';
import 'session_tokens.dart';
import 'token_store.dart';

/// What the client knows about the current session.
sealed class SessionState {
  const SessionState();
}

/// No credential is held.
final class NoSession extends SessionState {
  const NoSession();
}

/// A credential is held. It may still be rejected by the server.
final class ActiveSession extends SessionState {
  const ActiveSession(this.tokens);

  final SessionTokens tokens;
}

/// Owns the session credential for the process.
final class SessionManager {
  SessionManager({required TokenStore store, required AppLogger logger})
      : _store = store,
        _logger = logger.forCategory('security');

  final TokenStore _store;
  final CategoryLogger _logger;
  final StreamController<SessionEndReason> _ended =
      StreamController<SessionEndReason>.broadcast();

  SessionState _state = const NoSession();

  /// Emits once each time a session ends. Listeners route to the sign-in
  /// destination; they must not attempt recovery.
  Stream<SessionEndReason> get onSessionEnded => _ended.stream;

  SessionState get state => _state;

  /// The current credential, or null.
  SessionTokens? get tokens => switch (_state) {
        NoSession() => null,
        ActiveSession(:final tokens) => tokens,
      };

  bool get hasSession => _state is ActiveSession;

  /// Loads any persisted credential.
  ///
  /// A storage failure is returned, NOT converted to "no session": the caller
  /// must be able to tell "the user is signed out" from "the keystore would
  /// not answer", because only the first is recoverable by signing in.
  Future<Result<SessionTokens?>> restore() async {
    final stored = await _store.read();
    switch (stored) {
      case Failed<SessionTokens?>(:final failure):
        _state = const NoSession();
        _logger.warning(
          'Session restore failed; continuing with no session.',
          fields: <String, Object?>{'failure': failure.diagnosticLabel},
        );
        return Failed<SessionTokens?>(failure);
      case Success<SessionTokens?>(:final value):
        _state = value == null ? const NoSession() : ActiveSession(value);
        return Success<SessionTokens?>(value);
    }
  }

  /// Adopts a credential and persists it.
  ///
  /// The in-memory state is updated FIRST so that a persistence failure
  /// degrades to a session that survives only this launch, rather than to a
  /// signed-in user whose requests carry no token.
  Future<Result<void>> adopt(SessionTokens tokens) async {
    _state = ActiveSession(tokens);
    final written = await _store.write(tokens);
    if (written is Failed<void>) {
      _logger.warning(
        'Session credential could not be persisted; it will not survive a relaunch.',
        fields: <String, Object?>{'sessionId': tokens.sessionId},
      );
    }
    return written;
  }

  /// Ends the session: wipes the credential and notifies listeners.
  ///
  /// Idempotent — calling it for an already-ended session emits nothing, so a
  /// failed refresh and a 401 arriving together cannot double-signal.
  Future<void> end(SessionEndReason reason) async {
    if (_state is NoSession) {
      return;
    }
    _state = const NoSession();
    final cleared = await _store.clear();
    if (cleared is Failed<void>) {
      _logger.error(
        'Secure credential wipe failed; the in-memory credential was dropped regardless.',
        fields: <String, Object?>{'reason': reason.name},
      );
    }
    if (!_ended.isClosed) {
      _ended.add(reason);
    }
  }

  /// Destroys the PERSISTED credential whether or not one was ever adopted.
  ///
  /// [end] cannot do this job. It short-circuits on `NoSession`, which is
  /// correct for its own purpose — a failed refresh and a 401 arriving
  /// together must not double-signal — but it makes [end] a no-op on a COLD
  /// LAUNCH, where the credential is on disk and nothing has been read into
  /// memory yet. Startup evaluates the application lock BEFORE it restores, so
  /// a user staring at a lock they cannot open is in exactly that state: the
  /// tokens exist, `_state` is `NoSession`, and asking to sign out instead
  /// does nothing at all.
  ///
  /// It deliberately does NOT read the store first. "Restore, then end" would
  /// have worked and is wrong: it materialises, for a few microseconds, the
  /// authenticated session the lock exists to keep out of memory, and it turns
  /// a keystore read failure into a reason not to erase.
  ///
  /// It does NOT emit on [onSessionEnded] either. Nothing ended — there was
  /// possibly never a live session — and the caller that asked for this owns
  /// the state that follows. Routing it through the end stream as well would
  /// produce two transitions for one press.
  ///
  /// Idempotent: a second call re-clears an already-empty store and reports
  /// the same answer. The result is the erase outcome, and a `Failed` means
  /// the credential MAY STILL BE PERSISTED — the caller must not tell the user
  /// otherwise.
  Future<Result<void>> abandonPersistedSession() async {
    // In-memory first, unconditionally. A credential that cannot be erased
    // from disk must at least stop being used by this process.
    _state = const NoSession();
    final cleared = await _store.clear();
    if (cleared is Failed<void>) {
      _logger.error(
        'Persisted session abandoned; the secure erase failed and the '
        'credential may still be on disk. The in-memory one was dropped.',
        fields: <String, Object?>{'outcome': 'erase_failed'},
      );
    } else {
      _logger.info(
        'Persisted session abandoned at the application lock.',
        fields: <String, Object?>{'outcome': 'erased'},
      );
    }
    return cleared;
  }

  Future<void> dispose() => _ended.close();
}
