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
import 'package:karar_mobile/core/security/local_security_state_store.dart';
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
      expect((failure! as SecureStorageUnavailableFailure).operation, SecureStorageOperation.read);
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
      final manager = SessionManager(store: SecureTokenStore(backing), logger: AppLogger.silent);
      addTearDown(manager.dispose);

      final restored = await manager.restore();

      expect(restored.isFailure, isTrue);
      expect(manager.hasSession, isFalse);
      expect(manager.tokens, isNull);
      expect(manager.state, isA<NoSession>());
    });

    test('ending a session wipes storage and notifies once', () async {
      final backing = InMemorySecureStore();
      final manager = SessionManager(store: SecureTokenStore(backing), logger: AppLogger.silent);
      addTearDown(manager.dispose);
      final reasons = <SessionEndReason>[];
      manager.onSessionEnded.listen((SessionEnded ended) => reasons.add(ended.reason));
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
      final manager = SessionManager(store: SecureTokenStore(backing), logger: AppLogger.silent);
      addTearDown(manager.dispose);
      await manager.adopt(_tokens());
      backing.failWith = SecureStorageOperation.delete;

      await manager.end(SessionEndReason.refreshTokenReuseDetected);

      expect(manager.hasSession, isFalse, reason: 'an unerasable credential must stop being used');
    });

    test('adoption survives a persistence failure for this launch only', () async {
      final backing = InMemorySecureStore()..failWith = SecureStorageOperation.write;
      final manager = SessionManager(store: SecureTokenStore(backing), logger: AppLogger.silent);
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
      final manager = SessionManager(store: SecureTokenStore(counting), logger: AppLogger.silent);
      addTearDown(manager.dispose);

      await manager.adopt(_tokens());
      counting.reads = 0;

      await manager.abandonPersistedSession();

      expect(
        counting.reads,
        0,
        reason:
            'the store was read ${counting.reads} time(s) while abandoning. '
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
        reason:
            'a genuine read must register, or the zero asserted above is '
            'measuring nothing',
      );
    });
  });

  // WHAT BECAME OF THE CREDENTIAL, AS ONE VALUE.
  //
  // `clear` used to answer with a `Result<void>` describing only the ERASE,
  // plus a `abandonmentIsRecorded` boolean on the store describing only the
  // MARKER. A caller had to read both and combine them by hand, and where it
  // did not, "erase failed, marker held" was indistinguishable from "erase
  // failed, marker lost" — which are the survivable and the unsurvivable case
  // respectively. The side channel is gone; every case below is now one value
  // the type system forces a caller to switch over.
  group('clear reports the whole compound outcome', () {
    test('a clean erase is CREDENTIAL_ERASED', () async {
      final securityState = InMemoryLocalSecurityStateStore();
      final store = SecureTokenStore(
        InMemorySecureStore(),
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());

      final cleared = await store.clear();

      expect(cleared, isA<CredentialErased>());
      expect(cleared.credentialIsGone, isTrue);
      expect(cleared.isDurablyResolved, isTrue);
    });

    test('erase confirmed, marker unremovable: CREDENTIAL_ERASED_MARKER_RETAINED', () async {
      final securityState = InMemoryLocalSecurityStateStore()
        ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned)
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final store = SecureTokenStore(
        InMemorySecureStore(),
        invalidation: PersistedSessionInvalidation(securityState),
      );

      final cleared = await store.clear();

      expect(
        cleared,
        isA<CredentialErasedMarkerRetained>(),
        reason:
            'the credential is gone, so this is safe — but it is not the '
            'same event as a clean erase and must not be reported as one',
      );
      expect(cleared.credentialIsGone, isTrue);
    });

    test('erase failed, marker durable: CREDENTIAL_PERSISTED_BUT_DURABLY_INVALIDATED', () async {
      final backing = InMemorySecureStore()..failingOperations.add(SecureStorageOperation.delete);
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(InMemoryLocalSecurityStateStore()),
      );

      final cleared = await store.clear();

      expect(cleared, isA<CredentialPersistedButDurablyInvalidated>());
      expect(
        cleared.credentialIsGone,
        isFalse,
        reason:
            'the credential is still in the keystore and the caller must '
            'not tell the user it was removed',
      );
      expect(
        cleared.isDurablyResolved,
        isTrue,
        reason: 'the marker landed, so a later launch refuses to restore it',
      );
    });

    test('erase failed, marker write refused: ABANDONMENT_NOT_DURABLE', () async {
      final backing = InMemorySecureStore()..failingOperations.add(SecureStorageOperation.delete);
      final securityState = InMemoryLocalSecurityStateStore()
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );

      final cleared = await store.clear();

      expect(
        cleared,
        isA<AbandonmentNotDurable>(),
        reason:
            'the erase failed AND the marker did not reach the platform. '
            'Reporting that as recorded is the exact overstatement that made '
            'this mechanism look stronger than it was.',
      );
      expect(cleared.isDurablyResolved, isFalse);
    });

    test('erase failed, whole store unavailable: SECURITY_STATE_UNAVAILABLE', () async {
      final backing = InMemorySecureStore()..failingOperations.add(SecureStorageOperation.delete);
      final store = SecureTokenStore(
        backing,
        invalidation: const PersistedSessionInvalidation(UnavailableLocalSecurityStateStore()),
      );

      final cleared = await store.clear();

      expect(
        cleared,
        isA<AbandonmentSecurityStateUnavailable>(),
        reason:
            'no marker was even attempted; the remedy differs from a '
            'refused write and the two are reported apart',
      );
      expect(cleared.isDurablyResolved, isFalse);
    });

    test('a successful erase is clean whatever the marker write did', () async {
      final securityState = InMemoryLocalSecurityStateStore()
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final store = SecureTokenStore(
        InMemorySecureStore(),
        invalidation: PersistedSessionInvalidation(securityState),
      );

      final cleared = await store.clear();

      expect(
        cleared,
        isA<CredentialErased>(),
        reason:
            'nothing survived the erase, so there is nothing for a marker '
            'to guard and a failed marker write is irrelevant',
      );
    });

    test('the marker is raised BEFORE the erase is attempted', () async {
      // The ordering is what makes a killed process safe. A marker written
      // after a failed delete would be lost by a process that died in between,
      // leaving an abandoned credential sitting there, restorable.
      final order = <String>[];
      final securityState = _OrderingSecurityState(order);
      final backing = _OrderingSecureStore(order);
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );

      await store.clear();

      expect(order.first, 'write:persistedSessionAbandoned');
      expect(
        order.indexOf('write:persistedSessionAbandoned'),
        lessThan(order.indexOf('delete')),
        reason:
            'the intent must reach storage before the operation it '
            'describes is attempted',
      );
    });

    test('the erase is attempted even when the marker could not be written', () async {
      // A marker that would not persist is a reason to report honestly, never
      // a reason to leave the credential where it is.
      final securityState = InMemoryLocalSecurityStateStore()
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final backing = InMemorySecureStore();
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());

      await store.clear();

      expect(backing.entries, isEmpty);
    });
  });

  // THE MARKER IS THE ONLY THING BETWEEN A FAILED ERASE AND A RESTORED SESSION.
  group('a raised marker refuses to hand back a credential', () {
    test('a surviving credential is never returned while the marker stands', () async {
      final backing = InMemorySecureStore();
      final securityState = InMemoryLocalSecurityStateStore();
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());
      backing.failingOperations.add(SecureStorageOperation.delete);
      await store.clear();
      expect(backing.entries, isNotEmpty, reason: 'the fixture must fail the erase');

      // A FRESH store over the same storage: the process restarted, the
      // in-memory latch is gone, and only the durable marker is left.
      final restarted = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      final read = await restarted.read();

      expect(
        read.isFailure,
        isTrue,
        reason:
            'the delete still fails, so the store reports the storage '
            'failure. It must never hand the survivor back "just this once"',
      );
      expect(read.valueOrNull, isNull);
    });

    test('the erase completes and the marker clears as soon as storage recovers', () async {
      final backing = InMemorySecureStore();
      final securityState = InMemoryLocalSecurityStateStore();
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());
      backing.failingOperations.add(SecureStorageOperation.delete);
      await store.clear();

      backing.failingOperations.remove(SecureStorageOperation.delete);
      final restarted = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      final read = await restarted.read();

      expect(read.isSuccess, isTrue);
      expect(read.valueOrNull, isNull);
      expect(backing.entries, isEmpty, reason: 'the retry lives in the read path');
      expect(
        await securityState.read(LocalSecurityFlag.persistedSessionAbandoned),
        isNot(isA<SecurityStateValue>().having((v) => v.value, 'value', isTrue)),
        reason:
            'a marker left standing over nothing would destroy the next '
            'credential written',
      );
    });

    test('the IN-PROCESS latch holds even when nothing durable could be written', () async {
      // The marker write is refused and the delete is refused, so nothing on
      // disk records the abandonment. Within this process the latch still must.
      final backing = InMemorySecureStore();
      final securityState = InMemoryLocalSecurityStateStore()
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());
      backing.failingOperations.add(SecureStorageOperation.delete);

      final cleared = await store.clear();
      final read = await store.read();

      expect(cleared, isA<AbandonmentNotDurable>());
      expect(
        read.valueOrNull,
        isNull,
        reason:
            'the credential the user gave up was handed back by the very '
            'object that failed to destroy it',
      );
      expect(read.isFailure, isTrue);
    });

    test('a marker that cannot be CONSULTED fails closed, not open', () async {
      final backing = InMemorySecureStore();
      final securityState = InMemoryLocalSecurityStateStore();
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());

      securityState.unreadableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final read = await store.read();

      expect(
        read.isFailure,
        isTrue,
        reason:
            'the one record that could forbid this credential cannot be '
            'read, so the credential is not read either',
      );
      expect(read.failureOrNull, isA<LocalSecurityStateUnavailableFailure>());
      expect(read.valueOrNull, isNull);
    });

    test('a CORRUPT marker fails closed too', () async {
      final backing = InMemorySecureStore();
      final securityState = InMemoryLocalSecurityStateStore()
        ..corruptFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());

      final read = await store.read();

      expect(read.failureOrNull, isA<LocalSecurityStateCorruptFailure>());
      expect(read.valueOrNull, isNull);
    });
  });

  // A FAIL-CLOSED MARKER MUST NOT BECOME A PERMANENT LOCKOUT.
  group('a confirmed replacement supersedes the marker', () {
    test('signing in again clears the marker and the credential survives a restart', () async {
      final backing = InMemorySecureStore();
      final securityState = InMemoryLocalSecurityStateStore();
      final store = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      await store.write(_tokens());
      backing.failingOperations.add(SecureStorageOperation.delete);
      await store.clear();

      // Writes still work — only deletes were failing — so a fresh sign-in
      // overwrites the entry the marker was guarding.
      final written = await store.write(_tokens());
      expect(written.isSuccess, isTrue);

      final restarted = SecureTokenStore(
        backing,
        invalidation: PersistedSessionInvalidation(securityState),
      );
      final read = await restarted.read();

      expect(
        read.valueOrNull,
        isNotNull,
        reason:
            'a marker that survives a successful sign-in is an endless '
            'sign-in loop for a user who has done nothing wrong',
      );
    });

    test('a marker that could not be stood down makes the WRITE report failure', () async {
      // The credential is on disk and a marker forbidding it is on disk too, so
      // the next launch will destroy what was just written. That is correct and
      // the caller has to be told, rather than left to discover it.
      final securityState = InMemoryLocalSecurityStateStore()
        ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned)
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final store = SecureTokenStore(
        InMemorySecureStore(),
        invalidation: PersistedSessionInvalidation(securityState),
      );

      final written = await store.write(_tokens());

      expect(written.isFailure, isTrue);
      expect(written.failureOrNull, isA<LocalSecurityStateUnavailableFailure>());
    });

    test('a refused REMOVE falls back to a confirmed write of false', () async {
      // Otherwise a store that refuses removals but accepts writes would leave
      // the marker raised forever, and every launch would destroy the
      // credential written since.
      final securityState = InMemoryLocalSecurityStateStore()
        ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final invalidation = PersistedSessionInvalidation(securityState);
      await invalidation.raise();

      final cleared = await invalidation.clear();

      expect(cleared, isA<MarkerStoodDown>());
      expect(cleared.isDurable, isTrue);
      expect(
        await securityState.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateValue>().having((v) => v.value, 'value', isFalse),
      );
    });

    test('a removal that is refused with no fallback is reported as failed', () async {
      final securityState = InMemoryLocalSecurityStateStore()
        ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned)
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      final invalidation = PersistedSessionInvalidation(securityState);

      final cleared = await invalidation.clear();

      expect(cleared, isA<MarkerClearanceFailed>());
      expect(cleared.isDurable, isFalse);
    });
  });

  group('no credential material reaches local security state or a rendering', () {
    test('every value written is a boolean flag, never anything else', () async {
      final securityState = InMemoryLocalSecurityStateStore();
      final store = SecureTokenStore(
        InMemorySecureStore(),
        invalidation: PersistedSessionInvalidation(securityState),
      );

      await store.write(_tokens());
      await store.clear();

      expect(securityState.writes, isNotEmpty);
      for (final written in securityState.writes) {
        expect(
          written,
          anyOf(endsWith('=true'), endsWith('=false')),
          reason:
              'local security state carries decisions, never material: '
              'found "$written"',
        );
        expect(written, isNot(contains('access-token-value')));
        expect(written, isNot(contains('refresh-token-value')));
      }
    });

    test('an outcome never renders a stored value', () {
      for (final outcome in <Object>[
        const CredentialErased(),
        const CredentialErasedMarkerRetained(),
        const CredentialPersistedButDurablyInvalidated(),
        const AbandonmentNotDurable(),
        const AbandonmentSecurityStateUnavailable(),
        const SecurityStateValue(true),
        const SecurityStateValue(false),
        const MarkerRemoved(),
        const MarkerStoodDown(),
      ]) {
        final rendered = outcome.toString();
        expect(rendered, isNot(contains('true')), reason: rendered);
        expect(rendered, isNot(contains('false')), reason: rendered);
      }
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

/// A security-state store that records the order of its operations.
final class _OrderingSecurityState implements LocalSecurityStateStore {
  _OrderingSecurityState(this._order);

  final List<String> _order;
  final InMemoryLocalSecurityStateStore _inner = InMemoryLocalSecurityStateStore();

  @override
  Future<SecurityStateRead> read(LocalSecurityFlag flag) {
    _order.add('read:${flag.name}');
    return _inner.read(flag);
  }

  @override
  Future<SecurityStateWrite> write(LocalSecurityFlag flag, {required bool value}) {
    _order.add('write:${flag.name}');
    return _inner.write(flag, value: value);
  }

  @override
  Future<SecurityStateRemoval> remove(LocalSecurityFlag flag) {
    _order.add('remove:${flag.name}');
    return _inner.remove(flag);
  }
}

/// A secure store that records the order of its operations.
final class _OrderingSecureStore implements SecureStore {
  _OrderingSecureStore(this._order);

  final List<String> _order;
  final InMemorySecureStore _inner = InMemorySecureStore();

  @override
  Future<Result<String?>> read(SecureKey key) {
    _order.add('read');
    return _inner.read(key);
  }

  @override
  Future<Result<void>> write(SecureKey key, String value) {
    _order.add('write');
    return _inner.write(key, value);
  }

  @override
  Future<Result<void>> delete(SecureKey key) {
    _order.add('delete');
    return _inner.delete(key);
  }

  @override
  Future<Result<void>> deleteAll() {
    _order.add('deleteAll');
    return _inner.deleteAll();
  }
}
