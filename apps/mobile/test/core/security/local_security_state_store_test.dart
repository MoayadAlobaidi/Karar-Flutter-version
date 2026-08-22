// THE PORT THAT REFUSES TO GUESS.
//
// Every test here asserts one of the four rules in
// `core/security/local_security_state_store.dart`, and each rule exists
// because breaking it produced a real fail-open path in the store this one
// replaces:
//
//   1. nothing is swallowed          — a platform error became a return value;
//   2. no in-memory fallback         — an unopenable store became an empty one;
//   3. ABSENT means absent           — "I could not look" became "no value",
//                                      and "no value" became "the lock is off";
//   4. no credential lives here      — the key space is a closed enum.
//
// The two implementations are covered together, because the port's promise is
// worth nothing if only one of them keeps it.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';

void main() {
  group('a working store answers what it holds', () {
    test('an unwritten flag is ABSENT, and absent is a real answer', () async {
      final store = InMemoryLocalSecurityStateStore();

      final read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateAbsent>());
      expect(
        read.isAnswered,
        isTrue,
        reason: 'the store was consulted successfully and held nothing. That '
            'is the ONE case a caller may default, and it is safe precisely '
            'because the store answered',
      );
      expect(read.failureOrNull, isNull);
    });

    test('a written flag round-trips both values', () async {
      final store = InMemoryLocalSecurityStateStore();

      for (final value in <bool>[true, false]) {
        expect(
          await store.write(LocalSecurityFlag.appLockEnabled, value: value),
          isA<SecurityStateWritten>(),
        );
        expect(
          await store.read(LocalSecurityFlag.appLockEnabled),
          isA<SecurityStateValue>().having((v) => v.value, 'value', value),
        );
      }
    });

    test('the two flags do not collide', () async {
      final store = InMemoryLocalSecurityStateStore();

      await store.write(LocalSecurityFlag.appLockEnabled, value: true);

      expect(
        await store.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateAbsent>(),
        reason: 'writing the lock choice must not raise the abandonment marker',
      );
    });

    test('a removal is confirmed and leaves the flag ABSENT', () async {
      final store = InMemoryLocalSecurityStateStore();
      await store.write(LocalSecurityFlag.persistedSessionAbandoned, value: true);

      expect(
        await store.remove(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateRemoved>(),
      );
      expect(
        await store.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateAbsent>(),
      );
    });
  });

  group('a store that cannot answer says so, and never says ABSENT', () {
    test('an unreadable flag is UNAVAILABLE', () async {
      final store = InMemoryLocalSecurityStateStore()
        ..unreadableFlags.add(LocalSecurityFlag.appLockEnabled);

      final read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateUnavailable>());
      expect(
        read,
        isNot(isA<SecurityStateAbsent>()),
        reason: 'ABSENT reads as "the user never turned the lock on". A store '
            'that could not be consulted has not earned that answer',
      );
      expect(read.isAnswered, isFalse);
      expect(read.valueOrNull, isNull);
      expect(read.failureOrNull, isA<LocalSecurityStateUnavailableFailure>());
    });

    test('a damaged value is CORRUPT, which is not ABSENT either', () async {
      final store = InMemoryLocalSecurityStateStore()
        ..corruptFlags.add(LocalSecurityFlag.appLockEnabled);

      final read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateCorrupt>());
      expect(
        read.isAnswered,
        isFalse,
        reason: 'absent is a user who never chose; corrupt is a value that was '
            'written and has since been damaged or tampered with. Only the '
            'first may be defaulted',
      );
      expect(read.failureOrNull, isA<LocalSecurityStateCorruptFailure>());
    });

    test('a refused write is WRITE_FAILED and leaves the stored value alone',
        () async {
      final store = InMemoryLocalSecurityStateStore();
      await store.write(LocalSecurityFlag.appLockEnabled, value: true);
      store.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);

      final written = await store.write(LocalSecurityFlag.appLockEnabled, value: false);

      expect(written, isA<SecurityStateWriteFailed>());
      expect(written.isDurable, isFalse);
      expect(
        await store.read(LocalSecurityFlag.appLockEnabled),
        isA<SecurityStateValue>().having((v) => v.value, 'value', isTrue),
        reason: 'the previous durable value must survive a refusal, or the '
            'caller cannot retain it',
      );
    });

    test('a refused removal is REMOVE_FAILED and the value stands', () async {
      final store = InMemoryLocalSecurityStateStore()
        ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      await store.write(LocalSecurityFlag.persistedSessionAbandoned, value: true);

      final removed = await store.remove(LocalSecurityFlag.persistedSessionAbandoned);

      expect(removed, isA<SecurityStateRemoveFailed>());
      expect(removed.isDurable, isFalse);
      expect(
        await store.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateValue>().having((v) => v.value, 'value', isTrue),
      );
    });
  });

  group('an unopenable store is not an empty store', () {
    // THE FALLBACK THAT WAS THE VULNERABILITY. `PreferencesKeyValueStore.open`
    // returns `InMemoryKeyValueStore` when the platform refuses, and an
    // in-memory store answers "no value" for the application-lock choice — so
    // the caller concluded the lock was off and skipped the gate. This port
    // has no such fallback, and this group is what stops one being added.
    const store = UnavailableLocalSecurityStateStore();

    test('every read is UNAVAILABLE, for every flag', () async {
      for (final flag in LocalSecurityFlag.values) {
        final read = await store.read(flag);
        expect(read, isA<SecurityStateUnavailable>(), reason: flag.name);
        expect(read, isNot(isA<SecurityStateAbsent>()), reason: flag.name);
        expect(read.isAnswered, isFalse, reason: flag.name);
      }
    });

    test('every write and removal reports the store was never opened', () async {
      for (final flag in LocalSecurityFlag.values) {
        final written = await store.write(flag, value: true);
        expect(written, isA<SecurityStateWriteUnavailable>(), reason: flag.name);
        expect(written.isDurable, isFalse, reason: flag.name);
        expect(
          written.failureOrNull,
          isA<LocalSecurityStateUnavailableFailure>().having(
            (f) => f.operation,
            'operation',
            LocalSecurityStateOperation.open,
          ),
          reason: 'an unopened store refuses every write for the life of the '
              'process; a refused write may succeed on retry. The remedies '
              'differ and so do the reports',
        );

        final removed = await store.remove(flag);
        expect(removed, isA<SecurityStateRemoveUnavailable>(), reason: flag.name);
        expect(removed.isDurable, isFalse, reason: flag.name);
      }
    });

    test('nothing written to it is ever readable back', () async {
      // The property that separates an unavailable store from an in-memory
      // one: it does not quietly become a store that forgets at exit.
      await store.write(LocalSecurityFlag.appLockEnabled, value: true);

      expect(
        await store.read(LocalSecurityFlag.appLockEnabled),
        isA<SecurityStateUnavailable>(),
      );
    });
  });

  group('no credential can be stored here, and none can be logged', () {
    test('the key space is a closed set of two non-credential flags', () {
      // There is no string key to misspell and no denylist to keep current: an
      // author cannot write `security.refresh_token` because there is no such
      // constant to write.
      expect(LocalSecurityFlag.values, hasLength(2));
      expect(
        LocalSecurityFlag.values.map((LocalSecurityFlag flag) => flag.storageName),
        <String>['app_lock_enabled', 'persisted_session_abandoned'],
      );
      for (final flag in LocalSecurityFlag.values) {
        for (final marker in <String>[
          'token',
          'password',
          'secret',
          'credential',
          'recovery',
          'totp',
          'mfa',
          'key',
        ]) {
          expect(
            flag.storageName,
            isNot(contains(marker)),
            reason: '${flag.storageName} names something that could satisfy a '
                'gate rather than merely describe one',
          );
        }
      }
    });

    test('the value space is bool, so nothing else can be smuggled in', () async {
      // Asserted through the API rather than by inspection: `write` takes a
      // `bool`, so a String token does not compile. What is checked here is
      // that the recorded write carries only the boolean.
      final store = InMemoryLocalSecurityStateStore();

      await store.write(LocalSecurityFlag.appLockEnabled, value: true);
      await store.write(LocalSecurityFlag.persistedSessionAbandoned, value: false);

      expect(store.writes, <String>[
        'app_lock_enabled=true',
        'persisted_session_abandoned=false',
      ]);
    });

    test('no diagnostic label carries a stored value', () {
      // A log line that prints the lock choice tells a reader of the device's
      // logs whether the lock is on. The flags are intents rather than secrets,
      // and that is still a fact about the user this client need not emit.
      final outcomes = <LocalSecurityStateOutcome>[
        const SecurityStateValue(true),
        const SecurityStateValue(false),
        const SecurityStateAbsent(),
        const SecurityStateUnavailable(),
        const SecurityStateCorrupt(),
        const SecurityStateWritten(),
        const SecurityStateWriteFailed(),
        const SecurityStateWriteUnavailable(),
        const SecurityStateRemoved(),
        const SecurityStateRemoveFailed(),
        const SecurityStateRemoveUnavailable(),
      ];

      for (final outcome in outcomes) {
        for (final rendered in <String>[
          outcome.diagnosticLabel,
          outcome.toString(),
        ]) {
          expect(rendered, isNot(contains('true')), reason: rendered);
          expect(rendered, isNot(contains('false')), reason: rendered);
        }
      }
      expect(
        outcomes.map((LocalSecurityStateOutcome o) => o.diagnosticLabel).toSet(),
        hasLength(10),
        reason: 'SecurityStateValue(true) and SecurityStateValue(false) share a '
            'label on purpose — that is the point — and every OTHER outcome '
            'must still be distinguishable in a log',
      );
    });
  });
}
