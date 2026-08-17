// DATA LAYER.
//
// THE ONE PLACE A SESSION CREDENTIAL IS ADOPTED, AND THE ONE PLACE IT IS
// WIPED.
//
// Three endpoints answer with the same session payload — `/auth/login`,
// `/auth/mfa/challenge` and `/auth/mfa/recovery` — and two features consume
// them. Concentrating the handling here means the fail-closed rule, the
// refresh-coordinator reset and the challenge discard are written once and
// cannot drift apart between the login path and the multi-factor path.
//
// The token material does not leave this file. Callers receive
// `SessionEstablished`, which carries the non-secret session identifier only.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/logging/app_logger.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/token_refresh_coordinator.dart';
import '../../../core/security/secure_store.dart';
import '../../../core/security/session_manager.dart';
import '../../../core/security/session_token_codec.dart';
import '../../../core/security/session_tokens.dart';
import '../domain/entities/authentication_outcome.dart';
import 'pending_mfa_challenge_store.dart';

/// Adopts session payloads and clears local credentials.
final class SessionAdoption {
  SessionAdoption({
    required SessionManager sessions,
    required SessionTokenCodec codec,
    required TokenRefreshCoordinator refreshCoordinator,
    required PendingMfaChallengeStore challenges,
    required SecureStore secureStore,
    required AppLogger logger,
  })  : _sessions = sessions,
        _codec = codec,
        _refreshCoordinator = refreshCoordinator,
        _challenges = challenges,
        _secureStore = secureStore,
        _logger = logger.forCategory('authentication');

  final SessionManager _sessions;
  final SessionTokenCodec _codec;
  final TokenRefreshCoordinator _refreshCoordinator;
  final PendingMfaChallengeStore _challenges;
  final SecureStore _secureStore;
  final CategoryLogger _logger;

  /// Whether [payload] is a multi-factor challenge rather than a session.
  bool isMfaChallenge(JsonMap payload) => _codec.isMfaChallenge(payload);

  /// Decodes and adopts a session payload.
  ///
  /// A secure-storage write failure FAILS CLOSED: the in-memory credential is
  /// dropped and the caller is told storage is unavailable. Continuing would
  /// leave the user signed in on a device that cannot protect the credential,
  /// and signed out again without explanation at the next launch.
  Future<Result<SessionEstablished>> adopt(
    JsonMap payload, {
    required String location,
  }) async {
    final Result<SessionTokens> decoded = _codec.decode(payload);
    switch (decoded) {
      case Failed<SessionTokens>(:final failure):
        return Failed<SessionEstablished>(failure);
      case Success<SessionTokens>(:final value):
        // A fresh sign-in clears the terminal latch a previously rejected
        // refresh may have set on the coordinator.
        _refreshCoordinator.reset();
        _challenges.discard();
        final Result<void> adopted = await _sessions.adopt(value);
        if (adopted is Failed<void>) {
          await _sessions.end(SessionEndReason.signedOut);
          _logger.error(
            'Sign-in abandoned: the credential could not be committed to secure storage.',
            fields: <String, Object?>{'location': location},
          );
          return const Failed<SessionEstablished>(
            SecureStorageUnavailableFailure(operation: SecureStorageOperation.write),
          );
        }
        _logger.info(
          'Session established.',
          fields: <String, Object?>{'sessionId': value.sessionId},
        );
        return Success<SessionEstablished>(SessionEstablished(value.sessionId));
    }
  }

  /// Records a multi-factor challenge issued instead of a session.
  DateTime retainChallenge({required String token, required DateTime expiresAt}) {
    _challenges.remember(token: token, expiresAt: expiresAt);
    _logger.info('Sign-in issued a multi-factor challenge.');
    return expiresAt;
  }

  /// Wipes every local credential and ends the session.
  ///
  /// THIS RUNS WHEN THERE MAY BE NO SESSION IN MEMORY, WHICH IS WHY IT DOES
  /// NOT RELY ON `end`.
  ///
  /// Its main caller is password reset, which is designed to be usable from a
  /// signed-out device — and a cold launch whose restore failed leaves
  /// `SessionManager` in `NoSession` with the credential still on disk. `end`
  /// short-circuits on `NoSession`, correctly for its own purpose, so on that
  /// path it wipes nothing. `abandonPersistedSession` is the operation that
  /// does not care whether a session was ever read into memory.
  ///
  /// Going through it also raises the durable invalidation marker, which a
  /// bare `deleteAll` does not: `deleteAll` addresses the platform store
  /// directly and bypasses `TokenStore` entirely, so a failed wipe left NO
  /// record that the credential had been given up. On the password-reset path
  /// that is the dangerous case — the server has already revoked the session,
  /// and a credential that survives locally is presented on the next refresh,
  /// which the platform treats as token theft.
  ///
  /// `deleteAll` still runs afterwards, because it covers every other entry
  /// this application owns in the keystore rather than only the session
  /// credential. A failure in either step is logged and does not stop the
  /// other: a credential that cannot be erased must at least stop being used,
  /// and the marker is what makes that stick across a relaunch.
  Future<void> clearLocalCredentials(SessionEndReason reason) async {
    _challenges.discard();

    final Result<void> abandoned = await _sessions.abandonPersistedSession();
    if (abandoned is Failed<void>) {
      _logger.error(
        'The persisted session could not be erased; it is marked abandoned so '
        'a later launch will not restore it.',
        fields: <String, Object?>{'reason': reason.name},
      );
    }

    final Result<void> wiped = await _secureStore.deleteAll();
    if (wiped is Failed<void>) {
      _logger.error(
        'Secure storage wipe failed; the in-memory credential was dropped regardless.',
        fields: <String, Object?>{'reason': reason.name},
      );
    }
  }
}
