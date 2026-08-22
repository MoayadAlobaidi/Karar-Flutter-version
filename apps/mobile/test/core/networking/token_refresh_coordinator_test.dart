// SINGLE-FLIGHT TOKEN REFRESH.
//
// The load-bearing test in this file is the concurrency one: many requests
// observing the same expired access token must produce EXACTLY ONE refresh
// call. The rest assert that a refresh cannot loop, cannot storm, and cannot
// leave a dead credential in the keystore.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/token_refresh_coordinator.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';

final DateTime _now = DateTime.utc(2026, 8, 16, 12);

SessionTokens _tokens({
  required String access,
  Duration accessLifetime = const Duration(minutes: 10),
  Duration refreshLifetime = const Duration(days: 30),
}) => SessionTokens(
  accessToken: access,
  accessTokenExpiresAt: _now.add(accessLifetime),
  refreshToken: 'refresh-for-$access',
  refreshTokenExpiresAt: _now.add(refreshLifetime),
  sessionId: 'session-1',
);

final class _Harness {
  _Harness({required Future<Result<SessionTokens>> Function(String) refresh})
    : clock = FixedClock(_now),
      secureStore = InMemorySecureStore() {
    sessions = SessionManager(store: SecureTokenStore(secureStore), logger: AppLogger.silent);
    coordinator = TokenRefreshCoordinator(
      sessionManager: sessions,
      refresh: refresh,
      clock: clock,
      logger: AppLogger.silent,
    );
    sessions.onSessionEnded.listen((SessionEnded ended) => endReasons.add(ended.reason));
  }

  final FixedClock clock;
  final InMemorySecureStore secureStore;
  final List<SessionEndReason> endReasons = <SessionEndReason>[];

  late final SessionManager sessions;
  late final TokenRefreshCoordinator coordinator;

  Future<void> dispose() => sessions.dispose();
}

void main() {
  group('concurrency', () {
    test('many callers observing one expired token produce exactly one refresh', () async {
      var calls = 0;
      final gate = Completer<void>();
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          await gate.future;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);

      final inFlight = <Future<Result<SessionTokens>>>[
        for (var index = 0; index < 12; index++) harness.coordinator.ensureUsable(expired),
      ];
      // Let every caller reach the coordinator before the refresh completes.
      await Future<void>.delayed(Duration.zero);
      gate.complete();
      final outcomes = await Future.wait<Result<SessionTokens>>(inFlight);

      expect(calls, 1, reason: 'exactly one refresh may be issued');
      expect(harness.coordinator.refreshCallCount, 1);
      for (final outcome in outcomes) {
        expect(outcome.isSuccess, isTrue);
        expect(outcome.valueOrNull?.accessToken, 'renewed');
      }
    });

    test('a caller holding an already-replaced token refreshes nothing', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final stale = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(_tokens(access: 'already-renewed'));

      final outcome = await harness.coordinator.ensureUsable(stale);

      expect(calls, 0, reason: 'someone else already replaced the credential');
      expect(outcome.valueOrNull?.accessToken, 'already-renewed');
    });

    test('a still-valid token is returned without a call', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final live = _tokens(access: 'live');
      await harness.sessions.adopt(live);

      final outcome = await harness.coordinator.ensureUsable(live);

      expect(calls, 0);
      expect(outcome.valueOrNull?.accessToken, 'live');
    });

    test('the expiry leeway refreshes before the token actually lapses', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final nearlyExpired = _tokens(access: 'nearly', accessLifetime: const Duration(seconds: 5));
      await harness.sessions.adopt(nearlyExpired);

      await harness.coordinator.ensureUsable(nearlyExpired);

      expect(calls, 1, reason: 'a token that expires mid-flight is refreshed first');
    });
  });

  group('terminal failure', () {
    test('a rejected refresh ends the session and clears local credentials', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return const Failed<SessionTokens>(AuthenticationRequiredFailure());
        },
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);
      expect(harness.secureStore.entries, isNotEmpty);

      final outcome = await harness.coordinator.ensureUsable(expired);

      expect(outcome.failureOrNull, isA<SessionExpiredFailure>());
      expect(harness.sessions.hasSession, isFalse);
      expect(harness.secureStore.entries, isEmpty, reason: 'the credential is wiped');
      expect(harness.coordinator.isTerminated, isTrue);
      await Future<void>.delayed(Duration.zero);
      expect(harness.endReasons, <SessionEndReason>[SessionEndReason.refreshTokenReuseDetected]);
      expect(calls, 1);
    });

    test('after a terminal failure no further refresh is attempted', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return const Failed<SessionTokens>(AuthenticationRequiredFailure());
        },
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);

      await harness.coordinator.ensureUsable(expired);
      final second = await harness.coordinator.ensureUsable(expired);
      final third = await harness.coordinator.refreshAfterRejection(expired);

      expect(calls, 1, reason: 'no refresh loop');
      expect(second.failureOrNull, isA<SessionExpiredFailure>());
      expect(third.failureOrNull, isA<SessionExpiredFailure>());
    });

    test('an aged-out refresh chain terminates without any network call', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final dead = _tokens(
        access: 'stale',
        accessLifetime: const Duration(seconds: -1),
        refreshLifetime: const Duration(seconds: -1),
      );
      await harness.sessions.adopt(dead);

      final outcome = await harness.coordinator.ensureUsable(dead);

      expect(calls, 0);
      expect(outcome.failureOrNull, isA<SessionExpiredFailure>());
      expect(harness.secureStore.entries, isEmpty);
    });

    test('reset clears the terminal latch for a fresh sign-in', () async {
      var calls = 0;
      var reject = true;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          if (reject) {
            return const Failed<SessionTokens>(AuthenticationRequiredFailure());
          }
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);
      await harness.coordinator.ensureUsable(expired);
      expect(harness.coordinator.isTerminated, isTrue);

      reject = false;
      harness.coordinator.reset();
      final fresh = _tokens(access: 'fresh', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(fresh);
      final outcome = await harness.coordinator.ensureUsable(fresh);

      expect(outcome.isSuccess, isTrue);
      expect(calls, 2);
    });
  });

  group('transient failure', () {
    test('offline leaves the session intact and does not terminate', () async {
      final harness = _Harness(
        refresh: (String _) async => const Failed<SessionTokens>(OfflineFailure()),
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);

      final outcome = await harness.coordinator.ensureUsable(expired);

      expect(outcome.failureOrNull, isA<OfflineFailure>());
      expect(harness.sessions.hasSession, isTrue, reason: 'the credential may still be good');
      expect(harness.coordinator.isTerminated, isFalse);
      expect(harness.secureStore.entries, isNotEmpty);
    });

    test('rate limiting does not terminate the session', () async {
      final harness = _Harness(
        refresh: (String _) async => const Failed<SessionTokens>(RateLimitedFailure()),
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);

      final outcome = await harness.coordinator.ensureUsable(expired);

      expect(outcome.failureOrNull, isA<RateLimitedFailure>());
      expect(harness.coordinator.isTerminated, isFalse);
    });

    test('a transient failure can be retried by the caller', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          if (calls == 1) {
            return const Failed<SessionTokens>(OfflineFailure());
          }
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);

      expect((await harness.coordinator.ensureUsable(expired)).isFailure, isTrue);
      expect((await harness.coordinator.ensureUsable(expired)).isSuccess, isTrue);
      expect(calls, 2);
    });
  });

  group('reactive refresh', () {
    test('refreshes a token the server rejected even though it looked valid', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final live = _tokens(access: 'live');
      await harness.sessions.adopt(live);

      final outcome = await harness.coordinator.refreshAfterRejection(live);

      expect(calls, 1);
      expect(outcome.valueOrNull?.accessToken, 'renewed');
    });

    test('joins a refresh already running rather than starting a second', () async {
      var calls = 0;
      final gate = Completer<void>();
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          await gate.future;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      final expired = _tokens(access: 'stale', accessLifetime: const Duration(seconds: -1));
      await harness.sessions.adopt(expired);

      final proactive = harness.coordinator.ensureUsable(expired);
      final reactive = harness.coordinator.refreshAfterRejection(expired);
      await Future<void>.delayed(Duration.zero);
      gate.complete();
      await Future.wait<Result<SessionTokens>>(<Future<Result<SessionTokens>>>[
        proactive,
        reactive,
      ]);

      expect(calls, 1);
    });

    test('a rejection of an already-replaced token takes the new credential', () async {
      var calls = 0;
      final harness = _Harness(
        refresh: (String _) async {
          calls++;
          return Success<SessionTokens>(_tokens(access: 'renewed'));
        },
      );
      addTearDown(harness.dispose);

      await harness.sessions.adopt(_tokens(access: 'already-renewed'));

      final outcome = await harness.coordinator.refreshAfterRejection(_tokens(access: 'rejected'));

      expect(calls, 0);
      expect(outcome.valueOrNull?.accessToken, 'already-renewed');
    });
  });

  test('with no session at all the caller is told to authenticate', () async {
    final harness = _Harness(
      refresh: (String _) async => Success<SessionTokens>(_tokens(access: 'renewed')),
    );
    addTearDown(harness.dispose);

    final outcome = await harness.coordinator.ensureUsable(_tokens(access: 'orphan'));

    expect(outcome.failureOrNull, isA<AuthenticationRequiredFailure>());
  });
}
