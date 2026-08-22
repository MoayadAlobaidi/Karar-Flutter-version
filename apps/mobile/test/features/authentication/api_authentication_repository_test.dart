// Payload -> domain mapping, typed failure mapping, and token handling for the
// authentication repository.
//
// The composition root is real: `SessionManager`, `SecureTokenStore`,
// `SessionTokenCodec` and `TokenRefreshCoordinator` are the production
// objects, so "the token reached secure storage and nothing else" is an
// assertion about production behaviour.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/domain/entities/authentication_outcome.dart';
import 'package:karar_mobile/features/authentication/domain/entities/neutral_receipt.dart';
import 'package:karar_mobile/features/authentication/domain/repositories/authentication_repository.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/email_address.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';
import 'package:karar_mobile/features/authentication/presentation/providers/authentication_providers.dart';

import 'support/identity_harness.dart';

EmailAddress _email([String value = 'person@example.test']) =>
    (EmailAddress.parse(value) as EmailAccepted).email;

Password _password([String value = 'correct-horse-battery']) =>
    (const PasswordPolicy().parse(value) as PasswordAccepted).password;

void main() {
  late IdentityHarness harness;
  late AuthenticationRepository repository;

  setUp(() {
    harness = IdentityHarness();
    repository = harness.container.read(authenticationRepositoryProvider);
  });

  group('register', () {
    test('maps an accepted registration to a neutral receipt', () async {
      harness.transport.onPost('/auth/register', <String, Object?>{
        'status': 'accepted',
        'detail': 'Verification sent.',
      }, statusCode: 202);

      final Result<NeutralReceipt> outcome = await repository.register(
        email: _email(),
        password: _password(),
      );

      expect(outcome, isA<Success<NeutralReceipt>>());
    });

    test('a new address and an already-registered address produce the same value', () async {
      // The platform answers 202 for both. If the client ever distinguished
      // them it would hand the difference back to an attacker, so the two
      // outcomes must be indistinguishable at the domain boundary — not
      // merely rendered alike further up.
      harness.transport.onPost('/auth/register', <String, Object?>{
        'status': 'accepted',
        'detail': 'A brand new account.',
      }, statusCode: 202);
      final Result<NeutralReceipt> fresh = await repository.register(
        email: _email(),
        password: _password(),
      );

      final IdentityHarness second = IdentityHarness();
      second.transport.onPost('/auth/register', <String, Object?>{
        'status': 'accepted',
        'detail': 'This address is already registered.',
        'alreadyRegistered': true,
      }, statusCode: 202);
      final Result<NeutralReceipt> existing = await second.container
          .read(authenticationRepositoryProvider)
          .register(email: _email(), password: _password());

      expect(fresh, equals(existing));
      expect(fresh.valueOrNull, equals(existing.valueOrNull));
      expect(fresh.valueOrNull.toString(), equals(existing.valueOrNull.toString()));
    });

    test('maps a rejected registration to its typed failure', () async {
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/register',
        const RateLimitedFailure(retryAfter: Duration(minutes: 1)),
        statusCode: 429,
      );

      final Result<NeutralReceipt> outcome = await repository.register(
        email: _email(),
        password: _password(),
      );

      expect(outcome.failureOrNull, isA<RateLimitedFailure>());
    });

    test('a body of the wrong shape degrades to a contract violation', () async {
      harness.transport.on(
        HttpMethod.post,
        '/auth/register',
        (_) async => throw const FormatException('unexpected union branch'),
      );

      final Result<NeutralReceipt> outcome = await repository.register(
        email: _email(),
        password: _password(),
      );

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
    });
  });

  group('signIn', () {
    test('adopts the session and returns only the session id', () async {
      harness.transport.onPost('/auth/login', sessionPayload(now: harness.clock.nowUtc()));

      final Result<AuthenticationOutcome> outcome = await repository.signIn(
        email: _email(),
        password: _password(),
      );

      final AuthenticationOutcome value = outcome.valueOrNull!;
      expect(value, isA<SessionEstablished>());
      expect((value as SessionEstablished).sessionId, '9f1d0f6a-0000-4000-8000-000000000001');
      expect(harness.container.read(sessionManagerProvider).hasSession, isTrue);
    });

    test('the credential reaches secure storage and nothing else', () async {
      harness.transport.onPost('/auth/login', sessionPayload(now: harness.clock.nowUtc()));

      await repository.signIn(email: _email(), password: _password());

      final String secureContents = harness.secureEntries.values.join();
      expect(secureContents, contains('access-token-fixture'));
      expect(secureContents, contains('refresh-token-fixture'));

      // Preferences are plain and readable on a rooted device, so NOTHING
      // resembling the credential may reach them.
      expect(harness.preferences.writtenText, isNot(contains('access-token-fixture')));
      expect(harness.preferences.writtenText, isNot(contains('refresh-token-fixture')));
      expect(harness.preferences.writtenText, isNot(contains('correct-horse-battery')));
    });

    test('no token, password or address is written to any log', () async {
      harness.transport.onPost('/auth/login', sessionPayload(now: harness.clock.nowUtc()));

      await repository.signIn(
        email: _email('person@example.test'),
        password: _password('correct-horse-battery'),
      );

      final String logged = harness.loggedText;
      expect(logged, isNot(contains('access-token-fixture')));
      expect(logged, isNot(contains('refresh-token-fixture')));
      expect(logged, isNot(contains('correct-horse-battery')));
      expect(logged, isNot(contains('person@example.test')));
      // The non-secret session id is expected, and is what makes support
      // possible without logging anything sensitive.
      expect(logged, contains('9f1d0f6a-0000-4000-8000-000000000001'));
    });

    test('an MFA challenge is retained without reaching the caller', () async {
      harness.transport.onPost('/auth/login', mfaChallengePayload(now: harness.clock.nowUtc()));

      final Result<AuthenticationOutcome> outcome = await repository.signIn(
        email: _email(),
        password: _password(),
      );

      final AuthenticationOutcome value = outcome.valueOrNull!;
      expect(value, isA<MfaChallengeIssued>());
      expect(value.toString(), isNot(contains('challenge-token-fixture')));
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
      // The token is held for the challenge screen, in memory only.
      expect(
        harness.container.read(pendingMfaChallengeStoreProvider).token,
        'challenge-token-fixture',
      );
      expect(harness.secureEntries.values.join(), isEmpty);
      expect(harness.loggedText, isNot(contains('challenge-token-fixture')));
    });

    test('a generic 401 maps to the authentication-required failure', () async {
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/login',
        const AuthenticationRequiredFailure(),
        statusCode: 401,
      );

      final Result<AuthenticationOutcome> outcome = await repository.signIn(
        email: _email(),
        password: _password(),
      );

      expect(outcome.failureOrNull, isA<AuthenticationRequiredFailure>());
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
    });

    test('a session payload missing a field is a contract violation', () async {
      harness.transport.onPost('/auth/login', <String, Object?>{
        'status': 'authenticated',
        'accessToken': 'a',
        // refreshToken absent
        'accessTokenExpiresAt': DateTime.utc(2026, 1, 1, 1).toIso8601String(),
        'refreshTokenExpiresAt': DateTime.utc(2026, 2, 1).toIso8601String(),
        'sessionId': 's',
      });

      final Result<AuthenticationOutcome> outcome = await repository.signIn(
        email: _email(),
        password: _password(),
      );

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
    });

    test('a challenge payload missing its expiry is a contract violation', () async {
      harness.transport.onPost('/auth/login', <String, Object?>{
        'status': 'mfa_required',
        'challengeToken': 'challenge-token-fixture',
      });

      final Result<AuthenticationOutcome> outcome = await repository.signIn(
        email: _email(),
        password: _password(),
      );

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
      expect(
        harness.container.read(pendingMfaChallengeStoreProvider).token,
        isNull,
        reason: 'a challenge that could not be understood must not be retained',
      );
    });

    test('FAILS CLOSED when secure storage will not accept the credential', () async {
      harness.transport.onPost('/auth/login', sessionPayload(now: harness.clock.nowUtc()));
      harness.secureStore.failWith = SecureStorageOperation.write;

      final Result<AuthenticationOutcome> outcome = await repository.signIn(
        email: _email(),
        password: _password(),
      );

      expect(outcome.failureOrNull, isA<SecureStorageUnavailableFailure>());
      expect(
        harness.container.read(sessionManagerProvider).hasSession,
        isFalse,
        reason: 'a credential that cannot be protected must not be kept in memory either',
      );
    });
  });

  group('signOut', () {
    test('clears local credentials and reports success', () async {
      await harness.signInFixture();
      harness.transport.onPost('/auth/logout', <String, Object?>{'status': 'logged_out'});

      final Result<void> outcome = await repository.signOut();

      expect(outcome, isA<Success<void>>());
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
      expect(harness.secureEntries, isEmpty);
      expect(harness.secureStore.deleteAllCount, greaterThan(0));
    });

    test('clears local credentials even when the server cannot be reached', () async {
      await harness.signInFixture();
      harness.transport.failWith(HttpMethod.post, '/auth/logout', const OfflineFailure());

      final Result<void> outcome = await repository.signOut();

      // Reported, so the caller can say the session may still be live
      // elsewhere — but the local wipe happened regardless.
      expect(outcome.failureOrNull, isA<OfflineFailure>());
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
      expect(harness.secureEntries, isEmpty);
    });

    test('carries an idempotency key so a mid-flight refresh can replay it', () async {
      await harness.signInFixture();
      harness.transport.onPost('/auth/logout', <String, Object?>{'status': 'logged_out'});

      await repository.signOut();

      expect(harness.transport.requests.single.idempotencyKey, isNotNull);
      expect(harness.transport.requests.single.isReplayable, isTrue);
    });
  });

  group('changePassword', () {
    test('rotates the access token once the password has changed', () async {
      await harness.signInFixture(accessTokenLife: const Duration(minutes: 10));
      harness.transport.onPost('/auth/change-password', <String, Object?>{'status': 'changed'});
      harness.refreshTransport.onPost('/auth/refresh', refreshPayload(now: harness.clock.nowUtc()));

      final Result<void> outcome = await repository.changePassword(
        currentPassword: const OpaqueSecret('old-password'),
        newPassword: _password('brand-new-password'),
      );

      expect(outcome, isA<Success<void>>());
      // The server bumped the token version, so the held access token was
      // stale even though it had not expired locally.
      expect(harness.refreshTransport.callsTo('/auth/refresh'), 1);
      expect(
        harness.container.read(sessionManagerProvider).tokens!.accessToken,
        'access-token-rotated',
      );
    });

    test('never sends or logs either password beyond the request body', () async {
      await harness.signInFixture();
      harness.transport.onPost('/auth/change-password', <String, Object?>{'status': 'changed'});
      harness.refreshTransport.onPost('/auth/refresh', refreshPayload(now: harness.clock.nowUtc()));

      await repository.changePassword(
        currentPassword: const OpaqueSecret('old-password'),
        newPassword: _password('brand-new-password'),
      );

      expect(harness.loggedText, isNot(contains('old-password')));
      expect(harness.loggedText, isNot(contains('brand-new-password')));
      expect(harness.secureEntries.values.join(), isNot(contains('brand-new-password')));
    });

    test('an incorrect current password maps to the typed failure', () async {
      await harness.signInFixture();
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/change-password',
        const AuthenticationRequiredFailure(),
        statusCode: 401,
      );

      final Result<void> outcome = await repository.changePassword(
        currentPassword: const OpaqueSecret('wrong'),
        newPassword: _password(),
      );

      expect(outcome.failureOrNull, isA<AuthenticationRequiredFailure>());
      expect(
        harness.refreshTransport.callsTo('/auth/refresh'),
        0,
        reason: 'a change that did not happen must not rotate the session',
      );
    });

    test('reports a rotation that could not complete rather than a false success', () async {
      await harness.signInFixture();
      harness.transport.onPost('/auth/change-password', <String, Object?>{'status': 'changed'});
      harness.refreshTransport.failWith(HttpMethod.post, '/auth/refresh', const OfflineFailure());

      final Result<void> outcome = await repository.changePassword(
        currentPassword: const OpaqueSecret('old-password'),
        newPassword: _password('brand-new-password'),
      );

      expect(outcome.failureOrNull, isA<OfflineFailure>());
    });
  });
}
