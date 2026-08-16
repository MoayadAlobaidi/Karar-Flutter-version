// PURE DART ONLY (dart:async is part of the Dart SDK).
//
// The authority on "is there a session, and what is it". Everything else —
// the auth interceptor, the refresh coordinator, the startup coordinator —
// reads it from here rather than keeping its own copy.
//
// Ending a session ALWAYS drops the in-memory credential, even when the
// secure-storage wipe reports a failure. A credential that cannot be erased
// from disk must at least stop being used.
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

  Future<void> dispose() => _ended.close();
}
