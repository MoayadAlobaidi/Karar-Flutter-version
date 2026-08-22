// Platform-backed implementation of the non-sensitive preference port.
//
// Reads are synchronous against an in-memory snapshot loaded once at startup,
// so that routing decisions (locale, theme, lock choice) never await I/O.
import 'package:shared_preferences/shared_preferences.dart';

import '../logging/app_logger.dart';
import '../platform/bounded_platform_call.dart';
import 'key_value_store.dart';

/// Namespace applied to every key so the application's preferences are
/// distinguishable from anything a plugin writes.
const String preferenceNamespace = 'karar.';

/// [KeyValueStore] over platform shared preferences.
///
/// This store is unencrypted by design and holds only values whose disclosure
/// is harmless. See [PreferenceKey] for the guard that enforces it.
final class PreferencesKeyValueStore implements KeyValueStore {
  PreferencesKeyValueStore._(this._preferences, this._snapshot, this._logger);

  /// Opens the platform store. On failure the caller receives an in-memory
  /// store instead: a preference is never important enough to fail startup,
  /// and nothing sensitive is kept here.
  ///
  /// THIS FALLBACK IS SAFE ONLY BECAUSE NO SECURITY DECISION LIVES HERE. It
  /// used to hold the application-lock choice, and then the fallback WAS the
  /// vulnerability: an in-memory store holds no choice, the caller read the
  /// missing choice as "off", and a device whose preference storage failed
  /// skipped the lock. `LocalSecurityStateStore` exists so the two cases can
  /// have opposite policies, and it has no fallback at all.
  /// BOUNDED, and it is the FIRST platform call the application makes.
  ///
  /// This one was missed when the two reads named in KAR-RSK-042 were bounded,
  /// and an independent review found it afterwards. It is the worse of the
  /// three: `bootstrapKararApp` awaits it BEFORE the bounded security-state
  /// open and before `runApp`, so a host that accepts `getAll` and never
  /// answers leaves no widget tree at all — not the transient indicator, not
  /// the fail-closed configuration screen this bootstrap promises always to
  /// reach. The mechanism built to stop an indefinite startup sat downstream
  /// of a call that could hold startup indefinitely.
  ///
  /// The bound degrades to the in-memory store, which is the policy this store
  /// already had for every other platform failure and is safe here for the
  /// reason stated above: no security decision lives in it.
  static Future<KeyValueStore> open({required AppLogger logger}) async {
    final log = logger.forCategory('storage');
    try {
      final preferences = SharedPreferencesAsync();
      final snapshot = await boundedPlatformCall<Map<String, Object?>>(
        operation: 'preferences.open',
        timeout: PlatformCallTimeouts.storeOpen,
        run: () => preferences.getAll(allowList: null),
      );
      final namespaced = <String, Object?>{
        for (final entry in snapshot.entries)
          if (entry.key.startsWith(preferenceNamespace)) entry.key: entry.value,
      };
      return PreferencesKeyValueStore._(preferences, namespaced, log);
    } on Object catch (error, stackTrace) {
      log.warning(
        'Preference store unavailable; continuing with in-memory preferences.',
        error: error,
      );
      // The stack trace is attached at error level only, and carries no value.
      log.error(
        'Preference store open failed.',
        error: error,
        stackTrace: stackTrace,
      );
      return InMemoryKeyValueStore();
    }
  }

  final SharedPreferencesAsync _preferences;
  final Map<String, Object?> _snapshot;
  final CategoryLogger _logger;

  String _qualify(PreferenceKey key) => '$preferenceNamespace${key.name}';

  @override
  String? readString(PreferenceKey key) {
    final value = _snapshot[_qualify(key)];
    return value is String ? value : null;
  }

  @override
  Future<void> writeString(PreferenceKey key, String value) async {
    final qualified = _qualify(key);
    _snapshot[qualified] = value;
    await _guard(() => _preferences.setString(qualified, value), 'write');
  }

  @override
  bool? readBool(PreferenceKey key) {
    final value = _snapshot[_qualify(key)];
    return value is bool ? value : null;
  }

  @override
  Future<void> writeBool(PreferenceKey key, {required bool value}) async {
    final qualified = _qualify(key);
    _snapshot[qualified] = value;
    await _guard(() => _preferences.setBool(qualified, value), 'write');
  }

  @override
  Future<void> remove(PreferenceKey key) async {
    final qualified = _qualify(key);
    _snapshot.remove(qualified);
    await _guard(() => _preferences.remove(qualified), 'remove');
  }

  @override
  Future<void> clear() async {
    final keys = _snapshot.keys.toList(growable: false);
    _snapshot.clear();
    for (final key in keys) {
      await _guard(() => _preferences.remove(key), 'clear');
    }
  }

  Future<void> _guard(Future<void> Function() operation, String label) async {
    try {
      await boundedPlatformCall<void>(
        operation: 'preferences.$label',
        timeout: PlatformCallTimeouts.storage,
        run: operation,
      );
    } on Object catch (error) {
      // A failed preference write is logged and swallowed, and a write that
      // TIMED OUT is reported the same way rather than as durability. The
      // in-memory snapshot already reflects the caller's intent for this
      // session; what the platform did with it is unknown, and unknown is not
      // "written". No caller of this port may read a returned Future as proof
      // that anything reached the device.
      _logger.warning(
        'Preference operation failed.',
        fields: <String, Object?>{'operation': label},
        error: error,
      );
    }
  }
}
