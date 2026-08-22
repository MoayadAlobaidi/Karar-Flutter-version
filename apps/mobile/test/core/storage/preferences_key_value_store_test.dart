// THE FIRST PLATFORM CALL THE APPLICATION MAKES, and until now the only one of
// the three on the startup path with no test of any kind.
//
// `bootstrapKararApp` awaits `PreferencesKeyValueStore.open` BEFORE it opens
// the security-state store and before `runApp`. When KAR-RSK-042's two named
// reads were bounded, this one was not, and nothing in the test tree
// constructed the class — the three references to it were all comments. An
// independent review at the closeout found it by reading the call order.
//
// It is the worst of the three to leave unbounded, because a host that accepts
// `getAll` and never answers leaves no widget tree AT ALL: not the transient
// indicator, not the fail-closed configuration screen `app_bootstrap.dart`
// promises the application always reaches. The bound that was supposed to stop
// an indefinite startup sat downstream of a call that could cause one.
//
// The seam is the same one the security-state adapter's tests use:
// `SharedPreferencesAsyncPlatform.instance`, the federated plugin registration
// point, which is the only way a host test can make a real platform misbehave.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/platform/bounded_platform_call.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/storage/preferences_key_value_store.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:shared_preferences_platform_interface/types.dart';

/// A platform that can accept a call and never answer it.
///
/// A fault is a `throw`, which this adapter's `on Object catch` has always
/// handled. The case it could not reach is no return, no throw, no completion
/// — and a `try`/`catch` cannot catch a `Future` that never completes. Only a
/// bound can.
final class _ScriptedPreferencesPlatform
    extends InMemorySharedPreferencesAsync {
  _ScriptedPreferencesPlatform() : super.empty();

  bool hangGetAll = false;
  bool hangWrites = false;
  int getAllCalls = 0;

  static Future<Never> _never() => Completer<Never>().future;

  @override
  Future<Map<String, Object>> getPreferences(
    GetPreferencesParameters parameters,
    SharedPreferencesOptions options,
  ) async {
    getAllCalls += 1;
    if (hangGetAll) {
      return _never();
    }
    return super.getPreferences(parameters, options);
  }

  @override
  Future<bool> setString(
    String key,
    String value,
    SharedPreferencesOptions options,
  ) async {
    if (hangWrites) {
      return _never();
    }
    return super.setString(key, value, options);
  }
}

void main() {
  late _ScriptedPreferencesPlatform platform;
  late AppLogger logger;

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    platform = _ScriptedPreferencesPlatform();
    SharedPreferencesAsyncPlatform.instance = platform;
    logger = AppLogger(sink: NoopLogSink(), minimumLevel: LogLevel.error);
  });

  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });

  test(
    'opens against a platform that answers, and reads its own namespace',
    () async {
      await platform.setString(
        '${preferenceNamespace}locale',
        'ar',
        const SharedPreferencesOptions(),
      );
      await platform.setString(
        'someone.elses.key',
        'x',
        const SharedPreferencesOptions(),
      );

      final store = await PreferencesKeyValueStore.open(logger: logger);

      expect(store.readString(PreferenceKey('locale')), 'ar');
      // The snapshot is namespaced: another plugin's key is not this store's to
      // hold, and reading it would make the namespace decorative.
      expect(store.readString(PreferenceKey('elses.key')), isNull);
    },
  );

  test(
    'a platform that THROWS degrades to memory rather than failing startup',
    () async {
      SharedPreferencesAsyncPlatform.instance = null;

      final store = await PreferencesKeyValueStore.open(logger: logger);

      // A preference is never important enough to fail startup, and nothing
      // sensitive lives here. The security-state store exists precisely so this
      // policy and the opposite one can coexist.
      expect(store, isA<KeyValueStore>());
      expect(store.readString(PreferenceKey('locale')), isNull);
    },
  );

  test('a platform that NEVER ANSWERS is bounded, and startup continues', () async {
    // THE REGRESSION. Without the bound this future never completes, so
    // `bootstrapKararApp` never reaches `runApp` and a person sees no screen at
    // all. Removing the bound makes this test hang rather than fail, which is
    // the honest shape of the defect.
    platform.hangGetAll = true;

    final store = await PreferencesKeyValueStore.open(logger: logger).timeout(
      PlatformCallTimeouts.storeOpen * 2,
      onTimeout: () =>
          fail('open() was not bounded — startup would never reach runApp'),
    );

    expect(platform.getAllCalls, 1);
    expect(store, isA<KeyValueStore>());
    expect(store.readString(PreferenceKey('locale')), isNull);
  });

  test(
    'a WRITE that never answers is bounded and is not reported as durable',
    () async {
      final store = await PreferencesKeyValueStore.open(logger: logger);
      platform.hangWrites = true;

      // The port returns, which is the point: an unbounded write on this path
      // would hold whatever awaited it. What it does NOT do is claim the value
      // reached the device.
      await store
          .writeString(PreferenceKey('locale'), 'en')
          .timeout(
            PlatformCallTimeouts.storage * 2,
            onTimeout: () => fail('writeString() was not bounded'),
          );

      // The in-memory snapshot reflects the caller's intent for this session,
      // which is all this store has ever promised.
      expect(store.readString(PreferenceKey('locale')), 'en');
    },
  );
}
