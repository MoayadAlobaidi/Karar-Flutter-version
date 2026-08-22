// THE REAL KEYCHAIN ADAPTER, WHICH HAD NO TEST AT ALL.
//
// `secure_token_store_test.dart` covers the token store over FAKE `SecureStore`
// implementations. It cannot cover this file, because what has to be proved
// here is the translation of a real platform's misbehaviour into
// `Result`/`Failure` — and a fake `SecureStore` never touches a platform.
//
// The gap mattered. The Phase 5 closeout ran the client on an iOS 26.5
// simulator against a live local API answering `/readyz` 200 and watched it sit
// on the transient startup indicator past three minutes across three launches,
// issuing no HTTP request. `SessionManager.restore()` awaits this adapter
// before the network exists, and this adapter awaited the keychain with no
// bound. A `Future` that never completes is neither a value nor a throw, so the
// `on Object catch` below it could not run — there was nothing to catch.
//
// The seam is `FlutterSecureStoragePlatform.instance`, the federated
// registration point `FlutterSecureStorage` delegates to.
import 'dart:async';

import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/security/flutter_secure_store.dart';
import 'package:karar_mobile/core/security/secure_store.dart';

/// A keychain that can be told to fault or to stop answering.
final class _ScriptedSecureStoragePlatform extends FlutterSecureStoragePlatform {
  final Map<String, String> _entries = <String, String>{};

  Object? fault;

  /// THE THIRD OUTCOME: the platform accepts the call and never answers.
  bool hang = false;

  static Future<Never> _never() => Completer<Never>().future;

  Future<T> _guard<T>(T Function() value) async {
    if (hang) {
      return _never();
    }
    final Object? raised = fault;
    if (raised != null) {
      Error.throwWithStackTrace(raised, StackTrace.current);
    }
    return value();
  }

  @override
  Future<void> write({
    required String key,
    required String value,
    required Map<String, String> options,
  }) => _guard<void>(() => _entries[key] = value);

  @override
  Future<String?> read({required String key, required Map<String, String> options}) =>
      _guard<String?>(() => _entries[key]);

  @override
  Future<bool> containsKey({required String key, required Map<String, String> options}) =>
      _guard<bool>(() => _entries.containsKey(key));

  @override
  Future<void> delete({required String key, required Map<String, String> options}) =>
      _guard<void>(() => _entries.remove(key));

  @override
  Future<Map<String, String>> readAll({required Map<String, String> options}) =>
      _guard<Map<String, String>>(() => Map<String, String>.from(_entries));

  @override
  Future<void> deleteAll({required Map<String, String> options}) => _guard<void>(_entries.clear);
}

PlatformException _keychainFault() =>
    PlatformException(code: 'Unexpected security result code', message: 'the keychain refused');

void main() {
  late _ScriptedSecureStoragePlatform platform;
  late RecordingLogSink sink;
  late FlutterSecureStore store;
  const SecureKey key = SecureKey('refresh_token');

  setUp(() {
    platform = _ScriptedSecureStoragePlatform();
    FlutterSecureStoragePlatform.instance = platform;
    sink = RecordingLogSink();
    store = FlutterSecureStore(
      logger: AppLogger(sink: sink, minimumLevel: LogLevel.trace),
      storage: const FlutterSecureStorage(),
    );
  });

  group('the ordinary two outcomes still hold', () {
    test('a written entry reads back', () async {
      expect(await store.write(key, 'value'), isA<Success<void>>());
      final read = await store.read(key);
      expect(read, isA<Success<String?>>());
      expect((read as Success<String?>).value, 'value');
    });

    test('an absent entry is a SUCCESSFUL null, not a failure', () async {
      // The distinction the session manager depends on: "there is no
      // credential" is an answer, and it means the person signs in.
      final read = await store.read(key);
      expect(read, isA<Success<String?>>());
      expect((read as Success<String?>).value, isNull);
    });

    test('a platform fault is UNAVAILABLE, never an absent credential', () async {
      platform.fault = _keychainFault();
      final read = await store.read(key);
      expect(read, isA<Failed<String?>>());
      expect((read as Failed<String?>).failure, isA<SecureStorageUnavailableFailure>());
    });
  });

  group('THE THIRD OUTCOME — a keychain that accepts and never answers', () {
    // Remove the bound in `boundedPlatformCall` and none of these fails with a
    // wrong answer: they hang, and the suite times out. That is the shape of
    // the defect the closeout reproduced on a real runtime.

    test('a read that never answers is UNAVAILABLE and specifically NOT absent', () async {
      platform.hang = true;
      final read = await store
          .read(key)
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => fail('read() never returned — the keychain read is unbounded again'),
          );
      expect(read, isA<Failed<String?>>());
      expect((read as Failed<String?>).failure, isA<SecureStorageUnavailableFailure>());
      // The one thing that must never happen: a non-answer becoming an absent
      // credential, which the session manager reads as "not signed in" and the
      // token store as an absent abandonment marker.
      expect(read, isNot(isA<Success<String?>>()));
    });

    test('a write that never answers reports FAILURE, never durability', () async {
      platform.hang = true;
      final written = await store
          .write(key, 'value')
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () => fail('write() never returned — the keychain write is unbounded again'),
          );
      expect(written, isA<Failed<void>>());
      expect(written, isNot(isA<Success<void>>()));
    });

    test('a delete that never answers reports FAILURE, so the caller escalates', () async {
      platform.hang = true;
      final deleted = await store
          .delete(key)
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () =>
                fail('delete() never returned — the keychain delete is unbounded again'),
          );
      expect(deleted, isA<Failed<void>>());
    });

    test('deleteAll is bounded PER ENTRY, not by the sum of them', () async {
      // A wipe is what runs when a session ends, which is the one moment a
      // person must never be left waiting on a store that is not answering.
      for (var i = 0; i < 5; i += 1) {
        await store.write(SecureKey('entry_$i'), 'value');
      }
      platform.hang = true;
      final wiped = await store.deleteAll().timeout(
        const Duration(seconds: 20),
        onTimeout: () => fail('deleteAll() never returned — the wipe is unbounded again'),
      );
      expect(wiped, isA<Failed<void>>());
    });

    test('the diagnostic carries the operation and the entry NAME, never a value', () async {
      platform.hang = true;
      await store.write(key, 'a-real-refresh-token-value');
      final records = sink.records.map((r) => r.toString()).join(' ');
      expect(records, contains('PlatformCallTimedOut'));
      expect(records, contains('refresh_token'));
      expect(records, isNot(contains('a-real-refresh-token-value')));
    });
  });
}
