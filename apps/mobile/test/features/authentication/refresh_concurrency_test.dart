// Identity flows under an in-flight token refresh.
//
// The refresh coordinator is Agent C's, and it is the REAL one here — this
// workstream builds no second one. What these tests prove is that the identity
// flows behave correctly around it: they join a refresh already running rather
// than starting another, they do not lose a result to a rotation, and they do
// not tear down a session that is merely being renewed.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/core/networking/token_refresh_coordinator.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/features/authentication/domain/repositories/authentication_repository.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/email_address.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';
import 'package:karar_mobile/features/authentication/presentation/providers/authentication_providers.dart';

import 'support/identity_harness.dart';

EmailAddress _email() => (EmailAddress.parse('person@example.test') as EmailAccepted).email;

Password _password() =>
    (const PasswordPolicy().parse('correct-horse-battery') as PasswordAccepted).password;

void main() {
  late IdentityHarness harness;
  late AuthenticationRepository repository;
  late TokenRefreshCoordinator coordinator;

  setUp(() {
    harness = IdentityHarness();
    repository = harness.container.read(authenticationRepositoryProvider);
    coordinator = harness.container.read(tokenRefreshCoordinatorProvider);
  });

  test('a change-password rotation joins a refresh already in flight', () async {
    final SessionTokens tokens = await harness.signInFixture();
    final Completer<void> releaseRefresh = Completer<void>();
    harness.refreshTransport.on(HttpMethod.post, '/auth/refresh', (_) async {
      await releaseRefresh.future;
      return ApiResponse(statusCode: 200, body: refreshPayload(now: harness.clock.nowUtc()));
    });
    harness.transport.onPost('/auth/change-password', <String, Object?>{'status': 'changed'});

    // A refresh is already running when the change completes.
    final Future<Result<SessionTokens>> firstRefresh = coordinator.refreshAfterRejection(tokens);
    final Future<Result<void>> change = repository.changePassword(
      currentPassword: const OpaqueSecret('old-password'),
      newPassword: _password(),
    );
    await pumpEventQueue();
    releaseRefresh.complete();

    expect(await firstRefresh, isA<Success<SessionTokens>>());
    expect(await change, isA<Success<void>>());
    expect(
      harness.refreshTransport.callsTo('/auth/refresh'),
      1,
      reason: 'the rotation must join the running refresh, not start a second',
    );
    expect(coordinator.refreshCallCount, 1);
  });

  test('concurrent rotations still issue exactly one refresh', () async {
    final SessionTokens tokens = await harness.signInFixture();
    final Completer<void> releaseRefresh = Completer<void>();
    harness.refreshTransport.on(HttpMethod.post, '/auth/refresh', (_) async {
      await releaseRefresh.future;
      return ApiResponse(statusCode: 200, body: refreshPayload(now: harness.clock.nowUtc()));
    });

    final List<Future<Result<SessionTokens>>> attempts = <Future<Result<SessionTokens>>>[
      coordinator.refreshAfterRejection(tokens),
      coordinator.refreshAfterRejection(tokens),
      coordinator.refreshAfterRejection(tokens),
    ];
    await pumpEventQueue();
    releaseRefresh.complete();

    for (final Result<SessionTokens> outcome in await Future.wait(attempts)) {
      expect(outcome, isA<Success<SessionTokens>>());
    }
    expect(coordinator.refreshCallCount, 1);
  });

  test('a terminal refresh ends the session and clears the credential', () async {
    final SessionTokens tokens = await harness.signInFixture();
    harness.refreshTransport.failWith(
      HttpMethod.post,
      '/auth/refresh',
      // Expiry and refresh-token REUSE are one generic 401 by contract, so the
      // client wipes for both.
      const AuthenticationRequiredFailure(),
      statusCode: 401,
    );

    final Result<SessionTokens> outcome = await coordinator.refreshAfterRejection(tokens);

    expect(outcome.failureOrNull, isA<SessionExpiredFailure>());
    expect(
      (outcome.failureOrNull! as SessionExpiredFailure).reason,
      SessionEndReason.refreshTokenReuseDetected,
    );
    expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
    expect(coordinator.isTerminated, isTrue);
  });

  test('a transient refresh failure leaves the session intact for a retry', () async {
    final SessionTokens tokens = await harness.signInFixture();
    harness.refreshTransport.failWith(HttpMethod.post, '/auth/refresh', const OfflineFailure());

    final Result<SessionTokens> outcome = await coordinator.refreshAfterRejection(tokens);

    expect(outcome.failureOrNull, isA<OfflineFailure>());
    expect(
      harness.container.read(sessionManagerProvider).hasSession,
      isTrue,
      reason: 'being offline is not a reason to sign the user out',
    );
    expect(coordinator.isTerminated, isFalse);
  });

  test('a fresh sign-in clears the terminal latch a dead refresh chain set', () async {
    final SessionTokens tokens = await harness.signInFixture();
    harness.refreshTransport.failWith(
      HttpMethod.post,
      '/auth/refresh',
      const AuthenticationRequiredFailure(),
      statusCode: 401,
    );
    await coordinator.refreshAfterRejection(tokens);
    expect(coordinator.isTerminated, isTrue);

    harness.transport.onPost(
      '/auth/login',
      sessionPayload(
        accessToken: 'access-token-second',
        refreshToken: 'refresh-token-second',
        now: harness.clock.nowUtc(),
      ),
    );
    final Result<Object?> signedIn = await repository.signIn(
      email: _email(),
      password: _password(),
    );

    expect(signedIn, isA<Success<Object?>>());
    expect(
      coordinator.isTerminated,
      isFalse,
      reason:
          'a new session must not inherit the previous chain'
          's verdict',
    );
    expect(
      harness.container.read(sessionManagerProvider).tokens!.accessToken,
      'access-token-second',
    );
  });

  test('an unsafe request refused a replay is reported without ending the session', () async {
    await harness.signInFixture();
    // The transport raises this when a refresh completes mid-flight and the
    // request carried no idempotency key. It is recoverable: the session is
    // healthy and the caller reissues.
    harness.transport.failWith(
      HttpMethod.post,
      '/auth/change-password',
      const UnsafeRequestNotReplayedFailure(),
      statusCode: 401,
    );

    final Result<void> outcome = await repository.changePassword(
      currentPassword: const OpaqueSecret('old-password'),
      newPassword: _password(),
    );

    expect(outcome.failureOrNull, isA<UnsafeRequestNotReplayedFailure>());
    expect(harness.container.read(sessionManagerProvider).hasSession, isTrue);
  });

  test('every authenticated unsafe identity request carries an idempotency key', () async {
    await harness.signInFixture();
    harness.transport.onPost('/auth/logout', <String, Object?>{'status': 'logged_out'});
    harness.transport.onPost('/auth/change-password', <String, Object?>{'status': 'changed'});
    harness.refreshTransport.onPost('/auth/refresh', refreshPayload(now: harness.clock.nowUtc()));

    await repository.changePassword(
      currentPassword: const OpaqueSecret('old-password'),
      newPassword: _password(),
    );
    await repository.signOut();

    // Without a key, a refresh completing mid-flight makes the request
    // unreplayable and the user sees a spurious error.
    for (final ApiRequest request in harness.transport.requests) {
      if (request.method == HttpMethod.post && request.requiresAuthentication) {
        expect(
          request.isReplayable,
          isTrue,
          reason: '${request.path} must be replayable after a refresh',
        );
      }
    }
  });
}
