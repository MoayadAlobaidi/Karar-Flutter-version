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
// BOTH ENDINGS REPORT THE SAME TYPED OUTCOME. `TokenStore.clear` answers with a
// single [SessionAbandonmentOutcome] naming what became of the credential, and
// this class passes it straight through — on the return value, and on the end
// stream, which carries the outcome alongside the reason. A listener that only
// wanted the reason cannot accidentally miss the fact that the erase failed,
// because there is no second value to forget to read.
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
  final StreamController<SessionEnded> _ended =
      StreamController<SessionEnded>.broadcast();

  SessionState _state = const NoSession();

  /// Emits once each time a session ends. Listeners route to the destination
  /// the event's outcome permits; they must not attempt recovery.
  Stream<SessionEnded> get onSessionEnded => _ended.stream;

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
  /// failed refresh and a 401 arriving together cannot double-signal. The
  /// second call answers [CredentialErased], because there is nothing left to
  /// destroy and saying otherwise would invent a failure.
  Future<SessionAbandonmentOutcome> end(SessionEndReason reason) async {
    if (_state is NoSession) {
      return const CredentialErased();
    }
    _state = const NoSession();
    final SessionAbandonmentOutcome cleared = await _store.clear();
    _report(cleared, reason: reason);
    if (!_ended.isClosed) {
      _ended.add(SessionEnded(reason: reason, outcome: cleared));
    }
    return cleared;
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
  /// the same answer. The result is the compound outcome, and anything other
  /// than [CredentialErased] means the caller must not describe this as a
  /// clean removal — the credential may still be persisted, the abandonment
  /// may not be recorded, or both.
  Future<SessionAbandonmentOutcome> abandonPersistedSession() async {
    // In-memory first, unconditionally. A credential that cannot be erased
    // from disk must at least stop being used by this process.
    _state = const NoSession();
    final SessionAbandonmentOutcome cleared = await _store.clear();
    _report(cleared);
    return cleared;
  }

  /// Logs the compound outcome, at the level its consequences deserve.
  ///
  /// THE COMPOUND FAILURE IS THE ONE THAT MATTERS. A failed erase alone is
  /// survivable: the invalidation marker stands, so the next launch refuses to
  /// restore what is still on disk. What is NOT survivable is a failed erase
  /// whose marker also failed to persist — then nothing records that the
  /// credential was given up, the next launch reads it back, and the user is
  /// signed into the session they abandoned.
  ///
  /// Each case gets its own line rather than one line for all of them, because
  /// the consequences differ and a shared message would hide the difference
  /// exactly where somebody reading logs needs to see it. No line carries
  /// credential material: the outcome label and the reason are the whole
  /// payload.
  void _report(SessionAbandonmentOutcome outcome, {SessionEndReason? reason}) {
    final Map<String, Object?> fields = <String, Object?>{
      'outcome': outcome.diagnosticLabel,
      if (reason != null) 'reason': reason.name,
    };
    switch (outcome) {
      case CredentialErased():
        _logger.info('Persisted credential destroyed.', fields: fields);
      case CredentialErasedMarkerRetained():
        _logger.warning(
          'Persisted credential destroyed; the abandonment marker could not be '
          'stood down and will be retried.',
          fields: fields,
        );
      case CredentialPersistedButDurablyInvalidated():
        _logger.error(
          'The secure erase failed and the credential may still be on disk. It '
          'is durably marked abandoned, so a later launch will refuse to '
          'restore it.',
          fields: fields,
        );
      case AbandonmentNotDurable():
      case AbandonmentSecurityStateUnavailable():
        _logger.error(
          'The secure erase failed AND the abandonment could not be recorded '
          'durably. Local recovery is blocked; only server-side revocation can '
          'settle this session.',
          fields: fields,
        );
    }
  }

  Future<void> dispose() => _ended.close();
}

/// One session ending, with what became of the credential behind it.
///
/// The outcome travels WITH the reason so that a listener deciding where to
/// send the user cannot route a compound storage failure to the same ordinary
/// sign-in screen as a clean sign-out. Previously the reason was the whole
/// event and the outcome had to be fetched separately, which meant it usually
/// was not.
final class SessionEnded {
  const SessionEnded({required this.reason, required this.outcome});

  final SessionEndReason reason;

  final SessionAbandonmentOutcome outcome;

  @override
  String toString() => 'SessionEnded(${reason.name}, ${outcome.diagnosticLabel})';
}
