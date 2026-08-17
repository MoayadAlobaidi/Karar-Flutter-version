// The secure-storage adapter.
//
// The property under test throughout: A FAILED READ IS NOT AN EMPTY STORE.
// Returning `Success(null)` when the keystore refuses to answer would let the
// application decide "signed out" for a reason it cannot distinguish from a
// tampered device, so every failure is returned as a failure.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';

final DateTime _now = DateTime.utc(2026, 8, 16, 12);

SessionTokens _tokens() => SessionTokens(
      accessToken: 'access-token-value',
      accessTokenExpiresAt: _now.add(const Duration(minutes: 10)),
      refreshToken: 'refresh-token-value',
      refreshTokenExpiresAt: _now.add(const Duration(days: 30)),
      sessionId: 'session-1',
    );

void main() {
  group('SecureTokenStore', () {
    test('round-trips a credential', () async {
      final backing = InMemorySecureStore();
      final store = SecureTokenStore(backing);

      await store.write(_tokens());
      final read = await store.read();

      final restored = read.valueOrNull;
      expect(restored, isNotNull);
      expect(restored!.accessToken, 'access-token-value');
      expect(restored.refreshToken, 'refresh-token-value');
      expect(restored.sessionId, 'session-1');
      expect(restored.accessTokenExpiresAt.isUtc, isTrue);
      expect(restored.refreshTokenExpiresAt.isUtc, isTrue);
    });

    test('an absent credential is a success carrying null', () async {
      final store = SecureTokenStore(InMemorySecureStore());

      final read = await store.read();

      expect(read.isSuccess, isTrue);
      expect(read.valueOrNull, isNull);
    });

    test('a read failure is a FAILURE, never an empty store', () async {
      final backing = InMemorySecureStore()..failWith = SecureStorageOperation.read;
      final store = SecureTokenStore(backing);

      final read = await store.read();

      expect(read.isFailure, isTrue);
      final failure = read.failureOrNull;
      expect(failure, isA<SecureStorageUnavailableFailure>());
      expect(
        (failure! as SecureStorageUnavailableFailure).operation,
        SecureStorageOperation.read,
      );
    });

    test('a write failure is reported rather than swallowed', () async {
      final backing = InMemorySecureStore()..failWith = SecureStorageOperation.write;
      final store = SecureTokenStore(backing);

      final written = await store.write(_tokens());

      expect(written.isFailure, isTrue);
      expect(written.failureOrNull, isA<SecureStorageUnavailableFailure>());
    });

    test('a corrupt entry is a contract violation, not an empty store', () async {
      final backing = InMemorySecureStore();
      await backing.write(const SecureKey('session_tokens.v1'), 'not json at all');
      final store = SecureTokenStore(backing);

      final read = await store.read();

      expect(read.isFailure, isTrue);
      expect(read.failureOrNull, isA<ContractViolationFailure>());
    });

    test('an entry missing a required field is a contract violation', () async {
      final backing = InMemorySecureStore();
      await backing.write(
        const SecureKey('session_tokens.v1'),
        '{"accessToken":"a","accessTokenExpiresAt":"2026-08-16T12:00:00Z"}',
      );
      final store = SecureTokenStore(backing);

      final read = await store.read();

      expect(read.failureOrNull, isA<ContractViolationFailure>());
    });

    test('clear removes the credential', () async {
      final backing = InMemorySecureStore();
      final store = SecureTokenStore(backing);
      await store.write(_tokens());

      await store.clear();

      expect(backing.entries, isEmpty);
      expect((await store.read()).valueOrNull, isNull);
    });
  });

  group('SessionManager', () {
    test('restore reports a storage failure and holds no session', () async {
      final backing = InMemorySecureStore()..failWith = SecureStorageOperation.read;
      final manager = SessionManager(
        store: SecureTokenStore(backing),
        logger: AppLogger.silent,
      );
      addTearDown(manager.dispose);

      final restored = await manager.restore();

      expect(restored.isFailure, isTrue);
      expect(manager.hasSession, isFalse);
      expect(manager.tokens, isNull);
      expect(manager.state, isA<NoSession>());
    });

    test('ending a session wipes storage and notifies once', () async {
      final backing = InMemorySecureStore();
      final manager = SessionManager(
        store: SecureTokenStore(backing),
        logger: AppLogger.silent,
      );
      addTearDown(manager.dispose);
      final reasons = <SessionEndReason>[];
      manager.onSessionEnded.listen(reasons.add);
      await manager.adopt(_tokens());

      await manager.end(SessionEndReason.signedOut);
      await manager.end(SessionEndReason.expired);
      await Future<void>.delayed(Duration.zero);

      expect(backing.entries, isEmpty);
      expect(manager.hasSession, isFalse);
      expect(reasons, <SessionEndReason>[SessionEndReason.signedOut]);
    });

    test('the in-memory credential is dropped even when the wipe fails', () async {
      final backing = InMemorySecureStore();
      final manager = SessionManager(
        store: SecureTokenStore(backing),
        logger: AppLogger.silent,
      );
      addTearDown(manager.dispose);
      await manager.adopt(_tokens());
      backing.failWith = SecureStorageOperation.delete;

      await manager.end(SessionEndReason.refreshTokenReuseDetected);

      expect(manager.hasSession, isFalse, reason: 'an unerasable credential must stop being used');
    });

    test('adoption survives a persistence failure for this launch only', () async {
      final backing = InMemorySecureStore()..failWith = SecureStorageOperation.write;
      final manager = SessionManager(
        store: SecureTokenStore(backing),
        logger: AppLogger.silent,
      );
      addTearDown(manager.dispose);

      final adopted = await manager.adopt(_tokens());

      expect(adopted.isFailure, isTrue);
      expect(manager.hasSession, isTrue, reason: 'requests must still carry the credential');
      expect(backing.entries, isEmpty);
    });
  });

  group('SessionTokens', () {
    test('never prints token material', () {
      expect(_tokens().toString(), isNot(contains('access-token-value')));
      expect(_tokens().toString(), isNot(contains('refresh-token-value')));
      expect(_tokens().toString(), contains('session-1'));
    });

    test('expiry is judged against the injected clock, with leeway', () {
      final clock = FixedClock(_now);
      final tokens = SessionTokens(
        accessToken: 'a',
        accessTokenExpiresAt: _now.add(const Duration(seconds: 20)),
        refreshToken: 'r',
        refreshTokenExpiresAt: _now.add(const Duration(days: 1)),
        sessionId: 's',
      );

      expect(tokens.isAccessTokenExpired(clock), isTrue, reason: 'inside the 30s leeway');
      expect(
        tokens.isAccessTokenExpired(clock, leeway: Duration.zero),
        isFalse,
        reason: 'not yet expired without leeway',
      );
      expect(tokens.isRefreshTokenExpired(clock), isFalse);

      clock.advance(const Duration(days: 2));
      expect(tokens.isRefreshTokenExpired(clock), isTrue);
    });
  });

  group('preference storage', () {
    test('refuses a key whose name suggests a credential', () {
      for (final name in <String>[
        'session_token',
        'refreshToken',
        'user.password',
        'mfa.secret',
        'recovery.codes',
        'consent.evidence',
      ]) {
        expect(
          () => PreferenceKey(name),
          throwsArgumentError,
          reason: '$name must not be storable in plain preferences',
        );
      }
    });

    test('accepts ordinary non-sensitive keys', () {
      expect(PreferenceKey('localization.locale').name, 'localization.locale');
      expect(PreferenceKey('security.app_lock_enabled').name, 'security.app_lock_enabled');
    });
  });

  // THE PROPERTY THAT SEPARATES THIS FIX FROM THE OBVIOUS WRONG ONE.
  //
  // `abandonPersistedSession` must erase what is on disk WITHOUT reading it
  // first. The tempting implementation is restore-then-end: read the
  // credential, adopt it, end the session. It reuses machinery that already
  // exists and reaches exactly the right observable outcome — empty store,
  // NoSession — so every cold-launch test passes.
  //
  // It is still wrong. For the duration of that read the process holds the
  // authenticated session the application lock exists to prevent, so a user
  // who could not pass the device authenticator briefly has a live credential
  // in memory. An independent review injected precisely that implementation
  // and found nothing held the property, which is why counting reads is the
  // assertion rather than checking the end state again.
  group('abandonPersistedSession never materialises a session', () {
    test('it does not read the credential it is erasing', () async {
      final counting = _ReadCountingStore(InMemorySecureStore());
      final manager = SessionManager(
        store: SecureTokenStore(counting),
        logger: AppLogger.silent,
      );
      addTearDown(manager.dispose);

      await manager.adopt(_tokens());
      counting.reads = 0;

      await manager.abandonPersistedSession();

      expect(
        counting.reads,
        0,
        reason: 'the store was read ${counting.reads} time(s) while abandoning. '
            'A restore-then-end implementation reaches the same final state '
            'while briefly holding the session the lock exists to prevent.',
      );
      expect(manager.state, isA<NoSession>());
    });

    test('the read counter is live, so a zero above means something', () async {
      // Without this, `reads == 0` could mean the counter is broken rather
      // than that the operation is clean — and the assertion above would pass
      // for the wrong reason forever.
      final counting = _ReadCountingStore(InMemorySecureStore());
      final store = SecureTokenStore(counting);
      await store.write(_tokens());
      counting.reads = 0;

      await store.read();

      expect(
        counting.reads,
        greaterThan(0),
        reason: 'a genuine read must register, or the zero asserted above is '
            'measuring nothing',
      );
    });
  });
}


/// Counts reads of the underlying store, so a test can assert that an
/// operation did NOT consult it.
final class _ReadCountingStore implements SecureStore {
  _ReadCountingStore(this._inner);

  final InMemorySecureStore _inner;
  int reads = 0;

  @override
  Future<Result<String?>> read(SecureKey key) {
    reads += 1;
    return _inner.read(key);
  }

  @override
  Future<Result<void>> write(SecureKey key, String value) => _inner.write(key, value);

  @override
  Future<Result<void>> delete(SecureKey key) => _inner.delete(key);

  @override
  Future<Result<void>> deleteAll() => _inner.deleteAll();
}
