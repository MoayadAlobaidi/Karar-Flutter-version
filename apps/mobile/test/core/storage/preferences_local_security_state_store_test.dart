// THE PLATFORM ADAPTER, WHICH IS WHERE THE FAIL-OPEN LIVED.
//
// `test/core/security/local_security_state_store_test.dart` covers the PORT:
// the outcome types, and the two pure-Dart implementations that answer with
// them. It cannot cover this file, because the thing that has to be proved
// here is the TRANSLATION of a real platform's misbehaviour into those
// outcomes, and the pure implementations never touch a platform.
//
// That gap was not theoretical. A review re-introduced the original
// vulnerability twice, in two lines of
// `lib/core/storage/preferences_local_security_state_store.dart`, and the whole
// mobile suite stayed green:
//
//   1. `open` returning an in-memory store instead of
//      [UnavailableLocalSecurityStateStore] when the platform probe fails. An
//      in-memory store answers ABSENT for the application-lock choice, ABSENT
//      reads as `AppLockChoiceKnown(enabled: false)`, and startup skips the
//      lock gate on a device whose storage just failed.
//   2. `read` returning [SecurityStateAbsent] instead of
//      [SecurityStateUnavailable] on a platform fault. Same ending, one layer
//      down: a fault becomes "the user never turned the lock on".
//
// Both mutations are killed below, and they are killed BEHAVIOURALLY as well
// as by type — a store that answers ABSENT after a fault fails these tests
// whatever class it happens to be an instance of.
//
// The seam is `SharedPreferencesAsyncPlatform.instance`, the federated plugin
// registration point that `SharedPreferencesAsync` reads in its constructor.
// Registering a platform that can be broken on demand is what lets a host test
// exercise the fault paths of an adapter whose real platform is a method
// channel on a device.
import 'dart:async';

import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';
import 'package:karar_mobile/core/storage/preferences_local_security_state_store.dart';
// The federated platform interface is a transitive dependency rather than a
// direct one, because the application legitimately depends on the facade and
// never on the interface. A TEST of the adapter has the opposite need: the
// registration point is the only seam that makes a platform fault reachable
// off-device, so the import is deliberate and stays scoped to this file.
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:shared_preferences_platform_interface/types.dart';

/// A platform that behaves exactly like a working one until a test breaks it.
///
/// It EXTENDS the platform interface's own in-memory implementation rather than
/// reimplementing the accessors. That matters for one case in particular:
/// `getBool` there is a `_data[key] as bool?` cast, so a non-boolean value
/// raises a `TypeError` — the precise fault the adapter maps to CORRUPT. A
/// hand-rolled map would have had to reproduce that by hand, and a mistake in
/// the reproduction would have left the corruption test asserting nothing.
///
/// Faults are raised through `Error.throwWithStackTrace` inside an `async`
/// method, so they surface the way a real platform channel's do: as a future
/// completing with an error rather than a synchronous throw.
final class _ScriptedPreferencesPlatform extends InMemorySharedPreferencesAsync {
  _ScriptedPreferencesPlatform() : super.empty();

  /// Raised by the next read.
  ///
  /// Armed AFTER `open` in every test that uses it, because the open probe is
  /// itself a read: arming it earlier fails the open instead, which is a
  /// different property with its own tests.
  Object? readFault;

  /// Raised by the next write.
  Object? writeFault;

  /// Raised by the next removal. `SharedPreferencesAsync.remove` is implemented
  /// as a `clear` narrowed to one key, so this is where it lands.
  Object? removeFault;

  /// Every key read, in order. Lets a test prove the adapter went to the
  /// platform rather than answering from something it cached at open time.
  final List<String> reads = <String>[];

  /// THE THIRD OUTCOME: the platform accepts the call and never answers.
  ///
  /// A fault is a `throw`, which the adapter's `on Object catch` has always
  /// handled. This is the case it could not reach — no return, no throw, no
  /// completion ever — and the case the client was observed in on a real iOS
  /// runtime, where startup sat on the transient indicator past three minutes
  /// having issued no request at all. A `try`/`catch` cannot catch a `Future`
  /// that does not complete; only a bound can.
  bool hangReads = false;
  bool hangWrites = false;
  bool hangRemovals = false;

  static Future<Never> _never() => Completer<Never>().future;

  @override
  Future<bool?> getBool(String key, SharedPreferencesOptions options) async {
    reads.add(key);
    if (hangReads) {
      return _never();
    }
    _raise(readFault);
    return super.getBool(key, options);
  }

  @override
  Future<bool> setBool(String key, bool value, SharedPreferencesOptions options) async {
    if (hangWrites) {
      return _never();
    }
    _raise(writeFault);
    return super.setBool(key, value, options);
  }

  @override
  Future<bool> clear(
    ClearPreferencesParameters parameters,
    SharedPreferencesOptions options,
  ) async {
    if (hangRemovals) {
      return _never();
    }
    _raise(removeFault);
    return super.clear(parameters, options);
  }

  void _raise(Object? fault) {
    if (fault == null) {
      return;
    }
    // Thrown this way so the fake can script a plain `Error` as readily as an
    // exception; the adapter's `on Object catch` must hold for both, and
    // `only_throw_errors` would reject the direct form for the latter.
    Error.throwWithStackTrace(fault, StackTrace.current);
  }
}

/// A platform channel that has stopped answering. Not a `TypeError`, so the
/// adapter's CORRUPT branch cannot be reached by accident and the UNAVAILABLE
/// branch is genuinely the one under test.
PlatformException _platformFault() =>
    PlatformException(code: 'unavailable', message: 'the platform store refused');

/// The key a flag actually occupies on the device.
String _key(LocalSecurityFlag flag) => '$securityStateNamespace${flag.storageName}';

/// A stored value that is not a boolean, and is recognisable in a log line if
/// it were ever to reach one.
const String _nonBooleanValue = 'a-string-where-a-boolean-belongs';

const SharedPreferencesOptions _options = SharedPreferencesOptions();

void main() {
  late _ScriptedPreferencesPlatform platform;
  late RecordingLogSink sink;
  late AppLogger logger;

  setUp(() {
    platform = _ScriptedPreferencesPlatform();
    SharedPreferencesAsyncPlatform.instance = platform;
    sink = RecordingLogSink();
    // The lowest threshold on purpose: a test that asserts what is NOT logged
    // has to be reading everything the adapter emits, or it passes because the
    // record was filtered rather than because it was never written.
    logger = AppLogger(sink: sink, minimumLevel: LogLevel.trace);
  });

  tearDown(() {
    // The registration point is a static. Left set, it would leak this fake
    // into any test that runs after it in the same isolate.
    SharedPreferencesAsyncPlatform.instance = null;
  });

  Future<LocalSecurityStateStore> openStore() =>
      PreferencesLocalSecurityStateStore.open(logger: logger);

  group('THE THIRD OUTCOME — a platform that accepts and never answers', () {
    // The client was executed on an iOS 26.5 simulator against a live local API
    // answering /readyz 200 and stayed on the transient startup indicator past
    // three minutes across three launches, issuing no HTTP request at all. Both
    // of the platform reads that precede the network were unbounded, and a
    // Future that never completes is neither a value nor a throw — so the
    // fail-closed machinery below could not run, because nothing reached it.
    //
    // Every case here scripts non-completion, not a fault. Remove the bound in
    // `boundedPlatformCall` and these do not fail with a wrong answer: they
    // hang, and the suite times out. That is the shape of the defect.

    test('open on a platform that never answers fails CLOSED, and returns', () async {
      platform.hangReads = true;
      final store = await openStore().timeout(
        const Duration(seconds: 20),
        onTimeout: () => fail('open() never returned — the open probe is unbounded again'),
      );
      // Unavailable, not an in-memory store: an in-memory store answers ABSENT
      // for the lock choice, and ABSENT reads as "the user never turned the
      // lock on".
      expect(store, isA<UnavailableLocalSecurityStateStore>());
      expect(await store.read(LocalSecurityFlag.appLockEnabled), isA<SecurityStateUnavailable>());
    });

    test('a read that never answers is UNAVAILABLE and specifically NOT ABSENT', () async {
      final store = await openStore();
      platform.hangReads = true;
      final read = await store
          .read(LocalSecurityFlag.appLockEnabled)
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => fail('read() never returned — the read is unbounded again'),
          );
      // The distinction this whole file exists for. ABSENT is an answer;
      // "did not answer" is not, and defaulting it unlocks the application by
      // being slow.
      expect(read, isA<SecurityStateUnavailable>());
      expect(read, isNot(isA<SecurityStateAbsent>()));
      expect(read, isNot(isA<SecurityStateValue>()));
    });

    test('a write that never answers reports FAILURE, never durability', () async {
      final store = await openStore();
      platform.hangWrites = true;
      final written = await store
          .write(LocalSecurityFlag.appLockEnabled, value: true)
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => fail('write() never returned — the write is unbounded again'),
          );
      // A call that did not complete has not been shown to have persisted
      // anything, and the caller must be free to re-assert it. Reporting
      // WRITTEN here is worse than reporting failure: it stops the retry.
      expect(written, isA<SecurityStateWriteFailed>());
      expect(written, isNot(isA<SecurityStateWritten>()));
    });

    test('a removal that never answers reports FAILURE, never removal', () async {
      final store = await openStore();
      platform.hangRemovals = true;
      final removed = await store
          .remove(LocalSecurityFlag.appLockEnabled)
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => fail('remove() never returned — the removal is unbounded again'),
          );
      expect(removed, isA<SecurityStateRemoveFailed>());
      expect(removed, isNot(isA<SecurityStateRemoved>()));
    });

    test('the diagnostic names the operation and never the flag value', () async {
      final store = await openStore();
      platform.hangReads = true;
      await store.read(LocalSecurityFlag.appLockEnabled);
      final records = sink.records.map((r) => r.toString()).join(' ');
      // The record says WHAT KIND of failure it was — the sink prints the error
      // by type, not by message, so the bound's own operation string never
      // reaches a log line even though the exception carries it. What a reader
      // gets is the type and the adapter's own fields: the flag's NAME, the
      // operation, and the outcome.
      expect(records, contains('PlatformCallTimedOut'));
      expect(records, contains('app_lock_enabled'));
      expect(records, contains('unavailable'));
      // …and never the value stored under the flag, which would tell a reader
      // of the device's logs whether this person's lock is on.
      expect(records, isNot(contains('value:')));
    });
  });

  group('a store that opened answers from the platform', () {
    test('a flag that was never written is ABSENT, and ABSENT is an answer', () async {
      // THE CONTROL FOR EVERY FAULT TEST BELOW. If this case did not exist,
      // "the fault paths do not answer ABSENT" could be satisfied by an
      // adapter that never answers ABSENT at all — including one that reports
      // a fault for a user who simply never made the choice, which would block
      // startup for everybody.
      final LocalSecurityStateStore store = await openStore();

      final SecurityStateRead read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateAbsent>());
      expect(
        read.isAnswered,
        isTrue,
        reason:
            'the platform was consulted successfully and held nothing. That '
            'is the one case a caller may default',
      );
      expect(read.failureOrNull, isNull);
      expect(read.valueOrNull, isNull);
    });

    test('a written flag round-trips, both values', () async {
      final LocalSecurityStateStore store = await openStore();

      for (final bool value in <bool>[true, false]) {
        expect(
          await store.write(LocalSecurityFlag.appLockEnabled, value: value),
          isA<SecurityStateWritten>(),
        );
        expect(
          await store.read(LocalSecurityFlag.appLockEnabled),
          isA<SecurityStateValue>().having((SecurityStateValue v) => v.value, 'value', value),
        );
      }
    });

    test('the value lands under the security namespace, not the preference one', () async {
      // The namespace is an on-device key. Changing it silently orphans the
      // choice every existing installation already made, so the literal is
      // asserted rather than merely the constant.
      expect(securityStateNamespace, 'karar.security.');

      final LocalSecurityStateStore store = await openStore();
      await store.write(LocalSecurityFlag.appLockEnabled, value: true);

      expect(
        await platform.getBool('karar.security.app_lock_enabled', _options),
        isTrue,
        reason:
            'the write must reach the platform under the documented key, or '
            'the round trip above is proving nothing but that the adapter is '
            'self-consistent',
      );
    });

    test('the two flags do not collide on the platform', () async {
      final LocalSecurityStateStore store = await openStore();

      await store.write(LocalSecurityFlag.appLockEnabled, value: true);

      expect(
        await store.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateAbsent>(),
        reason: 'writing the lock choice must not raise the abandonment marker',
      );
    });

    test('a removal is confirmed and leaves the flag ABSENT', () async {
      final LocalSecurityStateStore store = await openStore();
      await store.write(LocalSecurityFlag.persistedSessionAbandoned, value: true);

      expect(
        await store.remove(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateRemoved>(),
      );
      expect(
        await store.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateAbsent>(),
      );
      expect(
        await platform.getBool(_key(LocalSecurityFlag.persistedSessionAbandoned), _options),
        isNull,
        reason: 'the removal must reach the platform, not merely be reported',
      );
    });

    test('every read goes to the platform, so no snapshot can answer for it', () async {
      // NO SNAPSHOT is a rule of this adapter rather than a detail: the
      // preference store loads once at open time and answers from memory, and
      // a store that does that here goes on cheerfully reporting a lock choice
      // long after the platform stopped responding.
      final LocalSecurityStateStore store = await openStore();
      final int afterOpen = platform.reads.length;

      await store.read(LocalSecurityFlag.appLockEnabled);
      await store.read(LocalSecurityFlag.appLockEnabled);

      expect(
        platform.reads.length - afterOpen,
        2,
        reason: 'two reads must produce two platform consultations',
      );
      expect(platform.reads, everyElement(startsWith(securityStateNamespace)));
    });
  });

  group('open refuses to hand back a store that guesses', () {
    test('a probe that throws yields UNAVAILABLE, never an in-memory store', () async {
      // MUTATION 1. Returning an in-memory store here is the original
      // vulnerability: it answers ABSENT, ABSENT reads as "the lock is off",
      // and the gate is skipped on a device whose storage just failed.
      platform.readFault = _platformFault();

      final LocalSecurityStateStore store = await openStore();

      expect(store, isA<UnavailableLocalSecurityStateStore>());
      expect(
        store,
        isNot(isA<InMemoryLocalSecurityStateStore>()),
        reason:
            'an in-memory store is a legitimate fallback for a theme and a '
            'fail-open disaster for a lock choice',
      );
      expect(
        store,
        isNot(isA<PreferencesLocalSecurityStateStore>()),
        reason:
            'the probe is a read precisely so that an unreachable store is '
            'not handed back to be discovered on first use, after the '
            'coordinator has already decided the gate is evaluable',
      );
    });

    test('the store open hands back reports UNAVAILABLE for every operation', () async {
      // Stated behaviourally, because the type assertion above is only as good
      // as the type: any store that answers ABSENT after a failed open has
      // re-introduced the vulnerability, whatever it is called.
      platform.readFault = _platformFault();
      final LocalSecurityStateStore store = await openStore();

      for (final LocalSecurityFlag flag in LocalSecurityFlag.values) {
        final SecurityStateRead read = await store.read(flag);
        expect(read, isA<SecurityStateUnavailable>(), reason: flag.name);
        expect(
          read,
          isNot(isA<SecurityStateAbsent>()),
          reason:
              '${flag.name}: ABSENT is how "the user never chose" is '
              'spelled, and a store that could not be opened has not earned it',
        );
        expect(read.isAnswered, isFalse, reason: flag.name);
        expect(read.valueOrNull, isNull, reason: flag.name);
        expect(read.failureOrNull, isA<LocalSecurityStateUnavailableFailure>(), reason: flag.name);

        final SecurityStateWrite written = await store.write(flag, value: true);
        expect(written, isA<SecurityStateWriteUnavailable>(), reason: flag.name);
        expect(written.isDurable, isFalse, reason: flag.name);

        final SecurityStateRemoval removed = await store.remove(flag);
        expect(removed, isA<SecurityStateRemoveUnavailable>(), reason: flag.name);
        expect(removed.isDurable, isFalse, reason: flag.name);
      }
    });

    test('nothing written to it is readable back, and nothing reaches the platform', () async {
      // The property that separates the unavailable store from an in-memory
      // one, asserted from both sides: the caller cannot read its own write
      // back, and the platform never saw it either.
      platform.readFault = _platformFault();
      final LocalSecurityStateStore store = await openStore();

      await store.write(LocalSecurityFlag.appLockEnabled, value: true);
      platform.readFault = null;

      expect(
        await store.read(LocalSecurityFlag.appLockEnabled),
        isA<SecurityStateUnavailable>(),
        reason:
            'an in-memory fallback would hand the write straight back and '
            'the caller would believe the lock is on for this process only',
      );
      expect(await platform.getBool(_key(LocalSecurityFlag.appLockEnabled), _options), isNull);
    });

    test('a platform that is not registered at all is also a failed open', () async {
      // The other way the platform is absent: no federated implementation
      // registered, which is what a build with the plugin missing looks like.
      // `SharedPreferencesAsync`'s constructor raises for it, so this exercises
      // a different line of the same fault path.
      SharedPreferencesAsyncPlatform.instance = null;

      final LocalSecurityStateStore store = await openStore();

      expect(store, isA<UnavailableLocalSecurityStateStore>());
      expect(await store.read(LocalSecurityFlag.appLockEnabled), isA<SecurityStateUnavailable>());
    });

    test('a failed open is reported once, at error, naming no value', () async {
      platform.readFault = _platformFault();

      await openStore();

      expect(sink.records, hasLength(1));
      final LogRecord record = sink.records.single;
      expect(record.level, LogLevel.error);
      expect(record.category, 'security');
      expect(
        record.error,
        'PlatformException',
        reason:
            'the type is diagnostic; the platform message is not, because '
            'it is not this client\'s text',
      );
      expect(record.toString(), isNot(contains('true')));
      expect(record.toString(), isNot(contains('false')));
    });
  });

  group('a platform fault is never an answer', () {
    test('a read that throws is UNAVAILABLE, never ABSENT', () async {
      // MUTATION 2. Returning ABSENT here is the same fail-open one layer
      // down: the platform refused, and the caller is told the user never
      // turned the lock on.
      final LocalSecurityStateStore store = await openStore();
      platform.readFault = _platformFault();

      final SecurityStateRead read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateUnavailable>());
      expect(
        read,
        isNot(isA<SecurityStateAbsent>()),
        reason:
            'the store opened and has now stopped answering. ABSENT would '
            'be defaulted to "the lock is off" and the gate would be skipped',
      );
      expect(read.isAnswered, isFalse);
      expect(read.valueOrNull, isNull);
      expect(
        read.failureOrNull,
        isA<LocalSecurityStateUnavailableFailure>().having(
          (LocalSecurityStateUnavailableFailure f) => f.operation,
          'operation',
          LocalSecurityStateOperation.read,
        ),
        reason:
            'a read that faulted is distinct from a store that never '
            'opened; the remedies differ and so must the reports',
      );
    });

    test('a durable value already on the platform does not survive the fault', () async {
      // The strongest form of the rule: even when the platform HELD the value
      // a moment ago, a read that cannot complete reports UNAVAILABLE. There
      // is no last-known-good to fall back on, because a stale "the lock is
      // off" is the answer that opens the door.
      final LocalSecurityStateStore store = await openStore();
      await store.write(LocalSecurityFlag.appLockEnabled, value: true);
      platform.readFault = _platformFault();

      final SecurityStateRead read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateUnavailable>());
      expect(read.valueOrNull, isNull);
    });

    test('both flags report the fault, not only the one the probe read', () async {
      final LocalSecurityStateStore store = await openStore();
      platform.readFault = _platformFault();

      for (final LocalSecurityFlag flag in LocalSecurityFlag.values) {
        final SecurityStateRead read = await store.read(flag);
        expect(read, isA<SecurityStateUnavailable>(), reason: flag.name);
        expect(read, isNot(isA<SecurityStateAbsent>()), reason: flag.name);
      }
    });

    test('a non-boolean stored value is CORRUPT, never ABSENT', () async {
      // Written through the platform directly, because the port's own API
      // cannot produce this state: `write` takes a `bool`. What is on the
      // device is what a damaged file or a tampering hand leaves behind.
      final LocalSecurityStateStore store = await openStore();
      await platform.setString(_key(LocalSecurityFlag.appLockEnabled), _nonBooleanValue, _options);

      final SecurityStateRead read = await store.read(LocalSecurityFlag.appLockEnabled);

      expect(read, isA<SecurityStateCorrupt>());
      expect(
        read,
        isNot(isA<SecurityStateAbsent>()),
        reason:
            'absent is a user who never chose; corrupt is a value that was '
            'written and has since been damaged or tampered with. Only the '
            'first may be defaulted',
      );
      expect(read.isAnswered, isFalse);
      expect(read.valueOrNull, isNull);
      expect(read.failureOrNull, isA<LocalSecurityStateCorruptFailure>());
    });

    test('a refused write is WRITE_FAILED, and the durable value stands', () async {
      final LocalSecurityStateStore store = await openStore();
      await store.write(LocalSecurityFlag.appLockEnabled, value: true);
      platform.writeFault = _platformFault();

      final SecurityStateWrite written = await store.write(
        LocalSecurityFlag.appLockEnabled,
        value: false,
      );

      expect(written, isA<SecurityStateWriteFailed>());
      expect(
        written,
        isNot(isA<SecurityStateWritten>()),
        reason: 'a lock enabled in memory and nowhere else is a lock that is off',
      );
      expect(written.isDurable, isFalse);
      expect(
        written.failureOrNull,
        isA<LocalSecurityStateUnavailableFailure>().having(
          (LocalSecurityStateUnavailableFailure f) => f.operation,
          'operation',
          LocalSecurityStateOperation.write,
        ),
        reason:
            'the store is open and refused this write, which may succeed on '
            'retry. An unopened store reports `open` and never will',
      );

      platform.writeFault = null;
      expect(
        await store.read(LocalSecurityFlag.appLockEnabled),
        isA<SecurityStateValue>().having((SecurityStateValue v) => v.value, 'value', isTrue),
        reason:
            'a platform that rejected the call left the previous value '
            'behind, and the caller has to be able to retain it',
      );
    });

    test('a refused removal is REMOVE_FAILED, and the value stands', () async {
      final LocalSecurityStateStore store = await openStore();
      await store.write(LocalSecurityFlag.persistedSessionAbandoned, value: true);
      platform.removeFault = _platformFault();

      final SecurityStateRemoval removed = await store.remove(
        LocalSecurityFlag.persistedSessionAbandoned,
      );

      expect(removed, isA<SecurityStateRemoveFailed>());
      expect(
        removed,
        isNot(isA<SecurityStateRemoved>()),
        reason:
            'an abandonment marker reported as cleared but still on the '
            'device blocks a restore the user is entitled to; reported as '
            'cleared while it never was is the mirror image and worse',
      );
      expect(removed.isDurable, isFalse);
      expect(
        removed.failureOrNull,
        isA<LocalSecurityStateUnavailableFailure>().having(
          (LocalSecurityStateUnavailableFailure f) => f.operation,
          'operation',
          LocalSecurityStateOperation.remove,
        ),
      );

      platform.removeFault = null;
      expect(
        await store.read(LocalSecurityFlag.persistedSessionAbandoned),
        isA<SecurityStateValue>().having((SecurityStateValue v) => v.value, 'value', isTrue),
      );
    });
  });

  group('diagnostics name the flag and never the value', () {
    test('no fault log line carries the boolean that was read or written', () async {
      // A log line that prints the lock choice tells a reader of the device's
      // logs whether the lock is on. The flags record intent rather than
      // secrets, and that is still a fact about the user this client has no
      // reason to emit.
      final LocalSecurityStateStore store = await openStore();
      await store.write(LocalSecurityFlag.appLockEnabled, value: true);

      platform.writeFault = _platformFault();
      await store.write(LocalSecurityFlag.appLockEnabled, value: false);
      platform.writeFault = null;

      platform.removeFault = _platformFault();
      await store.remove(LocalSecurityFlag.appLockEnabled);
      platform.removeFault = null;

      platform.readFault = _platformFault();
      await store.read(LocalSecurityFlag.appLockEnabled);
      platform.readFault = null;

      await platform.setString(
        _key(LocalSecurityFlag.persistedSessionAbandoned),
        _nonBooleanValue,
        _options,
      );
      await store.read(LocalSecurityFlag.persistedSessionAbandoned);

      expect(
        sink.records,
        hasLength(4),
        reason:
            'one record per fault and none for the successful open or the '
            'successful write: a suite that asserts what is NOT in the log has '
            'to know the log is not empty for the wrong reason',
      );

      for (final LogRecord record in sink.records) {
        final String rendered = record.toString();
        expect(rendered, isNot(contains('true')), reason: rendered);
        expect(rendered, isNot(contains('false')), reason: rendered);
        expect(rendered, isNot(contains(_nonBooleanValue)), reason: rendered);
        expect(
          record.fields['flag'],
          isIn(<String>[
            LocalSecurityFlag.appLockEnabled.storageName,
            LocalSecurityFlag.persistedSessionAbandoned.storageName,
          ]),
          reason:
              'the flag is named so the fault is diagnosable; nothing else '
              'about it is',
        );
        expect(record.fields.keys, containsAll(<String>['flag', 'operation', 'outcome']));
        expect(
          record.fields['value'],
          isNull,
          reason:
              'there is no field for a stored value, and adding one would '
              'defeat the whole arrangement',
        );
      }

      expect(sink.records.map((LogRecord r) => r.fields['operation']).toList(), <String>[
        'write',
        'remove',
        'read',
        'read',
      ]);
      expect(
        sink.records.map((LogRecord r) => r.fields['outcome']).toList(),
        <String>['failed', 'failed', 'unavailable', 'corrupt'],
        reason:
            'CORRUPT and UNAVAILABLE are distinguishable in the log, '
            'because they call for different remedies on the device',
      );
    });

    test('the corrupt value itself is never echoed, in any field', () async {
      final LocalSecurityStateStore store = await openStore();
      await platform.setString(_key(LocalSecurityFlag.appLockEnabled), _nonBooleanValue, _options);

      await store.read(LocalSecurityFlag.appLockEnabled);

      expect(sink.records, hasLength(1));
      final LogRecord record = sink.records.single;
      expect(record.message, isNot(contains(_nonBooleanValue)));
      expect(record.fields.toString(), isNot(contains(_nonBooleanValue)));
      expect(
        record.error,
        isNot(contains(_nonBooleanValue)),
        reason:
            'a TypeError renders the offending value in its message, so only '
            'its runtime type may be recorded',
      );
    });
  });
}
