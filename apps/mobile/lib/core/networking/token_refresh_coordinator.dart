// PURE DART ONLY.
//
// SINGLE-FLIGHT TOKEN REFRESH.
//
// The guarantees this type provides, each of which has a test:
//   1. Concurrency — however many requests observe the same expired access
//      token, EXACTLY ONE refresh call is issued. The rest await its result.
//   2. Staleness — a caller that observed a token which has already been
//      replaced does not trigger a refresh at all; it receives the current
//      credential immediately.
//   3. Terminal failure ends the session. A rejected refresh means the chain
//      is dead: local credentials are cleared and the session is terminated.
//      Refresh-token REUSE is indistinguishable from expiry by design (the
//      server answers both with the same generic 401), so both are handled
//      the same way — wipe, then re-authenticate.
//   4. No refresh loop. Once terminal, further calls short-circuit without
//      touching the network until a new session is adopted. The refresh call
//      itself is issued unauthenticated, so it can never re-enter this
//      coordinator.
//   5. Transient failures do NOT end the session. Offline, timeout, rate
//      limit and dependency-unavailable leave the credential in place; the
//      caller surfaces the failure and the user may retry.
import 'dart:async';

import '../errors/failure.dart';
import '../errors/result.dart';
import '../logging/app_logger.dart';
import '../security/session_manager.dart';
import '../security/session_tokens.dart';
import '../utilities/clock.dart';
import 'token_refresh_port.dart';

/// Performs the network half of a refresh. Supplied by composition so this
/// coordinator depends on no transport and no generated code.
///
/// MUST issue an unauthenticated request, and MUST throw a typed failure
/// (via `ApiException`) or return the new credential.
typedef RefreshTokenCall = Future<Result<SessionTokens>> Function(String refreshToken);

/// Serialises refreshes across the whole process.
final class TokenRefreshCoordinator implements TokenRefreshPort {
  TokenRefreshCoordinator({
    required SessionManager sessionManager,
    required RefreshTokenCall refresh,
    required Clock clock,
    required AppLogger logger,
    Duration expiryLeeway = const Duration(seconds: 30),
  })  : _sessions = sessionManager,
        _refresh = refresh,
        _clock = clock,
        _logger = logger.forCategory('networking'),
        _expiryLeeway = expiryLeeway;

  final SessionManager _sessions;
  final RefreshTokenCall _refresh;
  final Clock _clock;
  final CategoryLogger _logger;
  final Duration _expiryLeeway;

  Future<Result<SessionTokens>>? _inFlight;
  bool _terminated = false;

  /// Number of refresh calls actually issued. Asserted by the concurrency
  /// test; carries no credential material.
  int get refreshCallCount => _refreshCallCount;
  int _refreshCallCount = 0;

  /// Whether the coordinator has given up on this session.
  bool get isTerminated => _terminated;

  /// Clears the terminal latch. Called when a fresh sign-in adopts a session.
  void reset() {
    _terminated = false;
    _inFlight = null;
  }

  /// Returns a usable credential, refreshing at most once across all callers.
  ///
  /// [observed] is the credential the caller was about to use. Passing it is
  /// what makes guarantee 2 possible: if the manager now holds a different
  /// access token, someone else already refreshed and the caller simply takes
  /// the new one.
  @override
  Future<Result<SessionTokens>> ensureUsable(SessionTokens observed) {
    if (_terminated) {
      return Future<Result<SessionTokens>>.value(
        const Failed<SessionTokens>(
          SessionExpiredFailure(reason: SessionEndReason.refreshRejected),
        ),
      );
    }

    final current = _sessions.tokens;
    if (current == null) {
      return Future<Result<SessionTokens>>.value(
        const Failed<SessionTokens>(AuthenticationRequiredFailure()),
      );
    }

    // Guarantee 2: someone already replaced the credential the caller saw.
    if (!identical(current, observed) && current.accessToken != observed.accessToken) {
      return Future<Result<SessionTokens>>.value(Success<SessionTokens>(current));
    }

    if (!current.isAccessTokenExpired(_clock, leeway: _expiryLeeway)) {
      return Future<Result<SessionTokens>>.value(Success<SessionTokens>(current));
    }

    // The refresh chain itself has aged out: no call can succeed.
    if (current.isRefreshTokenExpired(_clock)) {
      return _terminate(SessionEndReason.expired);
    }

    // Guarantee 1: join the refresh already running.
    final running = _inFlight;
    if (running != null) {
      return running;
    }

    final started = _performRefresh(current.refreshToken);
    _inFlight = started;
    return started;
  }

  /// Forces a refresh regardless of local expiry, used when the server
  /// rejected an access token the client still believed was valid.
  @override
  Future<Result<SessionTokens>> refreshAfterRejection(SessionTokens observed) {
    if (_terminated) {
      return Future<Result<SessionTokens>>.value(
        const Failed<SessionTokens>(
          SessionExpiredFailure(reason: SessionEndReason.refreshRejected),
        ),
      );
    }
    final current = _sessions.tokens;
    if (current == null) {
      return Future<Result<SessionTokens>>.value(
        const Failed<SessionTokens>(AuthenticationRequiredFailure()),
      );
    }
    if (current.accessToken != observed.accessToken) {
      // Another caller already replaced the rejected token.
      return Future<Result<SessionTokens>>.value(Success<SessionTokens>(current));
    }
    final running = _inFlight;
    if (running != null) {
      return running;
    }
    final started = _performRefresh(current.refreshToken);
    _inFlight = started;
    return started;
  }

  Future<Result<SessionTokens>> _performRefresh(String refreshToken) async {
    _refreshCallCount++;
    try {
      final outcome = await _refresh(refreshToken);
      switch (outcome) {
        case Success<SessionTokens>(:final value):
          await _sessions.adopt(value);
          _logger.info('Session credential refreshed.',
              fields: <String, Object?>{'sessionId': value.sessionId});
          return Success<SessionTokens>(value);
        case Failed<SessionTokens>(:final failure):
          if (_isTerminal(failure)) {
            // The server rejected the chain. Expiry and reuse are one answer
            // by contract, so the client wipes in both cases.
            return await _terminate(SessionEndReason.refreshTokenReuseDetected);
          }
          _logger.warning(
            'Refresh did not complete; the session is left intact for a retry.',
            fields: <String, Object?>{'failure': failure.diagnosticLabel},
          );
          return Failed<SessionTokens>(failure);
      }
    } finally {
      _inFlight = null;
    }
  }

  bool _isTerminal(Failure failure) => switch (failure) {
        AuthenticationRequiredFailure() ||
        SessionExpiredFailure() ||
        NotAuthorizedFailure() ||
        ContractViolationFailure() =>
          true,
        _ => false,
      };

  Future<Result<SessionTokens>> _terminate(SessionEndReason reason) async {
    _terminated = true;
    await _sessions.end(reason);
    _logger.warning(
      'Session terminated; local credentials cleared.',
      fields: <String, Object?>{'reason': reason.name},
    );
    return Failed<SessionTokens>(SessionExpiredFailure(reason: reason));
  }
}
