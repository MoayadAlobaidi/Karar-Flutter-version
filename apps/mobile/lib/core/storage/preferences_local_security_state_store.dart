// Platform-backed implementation of the local security-state port.
//
// It sits on the same platform mechanism as `PreferencesKeyValueStore` and
// behaves nothing like it, which is the entire reason it is a separate type
// rather than a couple of extra keys in the existing store:
//
//   * NO SNAPSHOT. `PreferencesKeyValueStore` loads everything once at open
//     time and answers reads synchronously from memory, so a routing decision
//     never awaits I/O. That is right for a locale and wrong here: after the
//     platform stops responding, the snapshot goes on cheerfully answering,
//     and a write that was refused still reads back as though it landed. Every
//     read below goes to the platform.
//   * NO FALLBACK. `open` returns [UnavailableLocalSecurityStateStore] when
//     the platform store cannot be opened. It never returns something that
//     answers ABSENT, because ABSENT is how "the user never turned the lock
//     on" is spelled and an unopenable store has not earned that answer.
//   * NOTHING IS SWALLOWED. There is no `_guard`. Every platform error becomes
//     the matching typed fault.
//
// The values here are still not secrets — they are two booleans recording
// intent — so this is still ordinary, unencrypted platform storage. What
// changed is the HONESTY of the answers, not their confidentiality. An
// attacker with filesystem access to an unlocked rooted or jailbroken device
// can clear either flag, exactly as before; see `core/security/token_store.dart`
// for the plain statement of what that arrangement does and does not protect.
import 'package:shared_preferences/shared_preferences.dart';

import '../logging/app_logger.dart';
import '../security/local_security_state_store.dart';

/// Namespace applied to every security flag.
///
/// Distinct from `preferenceNamespace` so the two stores cannot collide, and
/// so a reader of the on-device store can tell at a glance which values are
/// ordinary preferences and which are security state.
const String securityStateNamespace = 'karar.security.';

/// [LocalSecurityStateStore] over platform shared preferences.
final class PreferencesLocalSecurityStateStore implements LocalSecurityStateStore {
  PreferencesLocalSecurityStateStore._(this._preferences, this._logger);

  /// Opens the platform store.
  ///
  /// ON FAILURE THE CALLER RECEIVES [UnavailableLocalSecurityStateStore], not
  /// an in-memory store. The difference is the whole fix: an in-memory store
  /// answers ABSENT for the application-lock choice, ABSENT reads as "off",
  /// and startup skips the lock gate on a device whose storage just failed.
  /// The unavailable store answers UNAVAILABLE, which the coordinator turns
  /// into a blocked startup state with a retry.
  ///
  /// The probe is deliberately a READ rather than a construction. Constructing
  /// `SharedPreferencesAsync` does no platform work, so a store that is
  /// unreachable would open "successfully" and fail on first use — after the
  /// coordinator had already decided the gate was evaluable.
  static Future<LocalSecurityStateStore> open({required AppLogger logger}) async {
    final CategoryLogger log = logger.forCategory('security');
    try {
      final SharedPreferencesAsync preferences = SharedPreferencesAsync();
      await preferences.getBool(
        '$securityStateNamespace${LocalSecurityFlag.appLockEnabled.storageName}',
      );
      return PreferencesLocalSecurityStateStore._(preferences, log);
    } on Object catch (error, stackTrace) {
      log.error(
        'Local security state is unavailable; security gates cannot be evaluated.',
        error: error,
        stackTrace: stackTrace,
      );
      return const UnavailableLocalSecurityStateStore();
    }
  }

  final SharedPreferencesAsync _preferences;
  final CategoryLogger _logger;

  String _qualify(LocalSecurityFlag flag) => '$securityStateNamespace${flag.storageName}';

  @override
  Future<SecurityStateRead> read(LocalSecurityFlag flag) async {
    try {
      final bool? value = await _preferences.getBool(_qualify(flag));
      return value == null ? const SecurityStateAbsent() : SecurityStateValue(value);
    } on TypeError catch (error) {
      // Something is stored under this key and it is not a boolean. Reported as
      // CORRUPT rather than ABSENT: absent is a user who never chose, corrupt
      // is a value that was written and has since been damaged or tampered
      // with, and only the first may be defaulted.
      _report(flag, 'read', 'corrupt', error);
      return const SecurityStateCorrupt();
    } on Object catch (error) {
      _report(flag, 'read', 'unavailable', error);
      return const SecurityStateUnavailable();
    }
  }

  @override
  Future<SecurityStateWrite> write(LocalSecurityFlag flag, {required bool value}) async {
    try {
      await _preferences.setBool(_qualify(flag), value);
      return const SecurityStateWritten();
    } on Object catch (error) {
      _report(flag, 'write', 'failed', error);
      return const SecurityStateWriteFailed();
    }
  }

  @override
  Future<SecurityStateRemoval> remove(LocalSecurityFlag flag) async {
    try {
      await _preferences.remove(_qualify(flag));
      return const SecurityStateRemoved();
    } on Object catch (error) {
      _report(flag, 'remove', 'failed', error);
      return const SecurityStateRemoveFailed();
    }
  }

  /// Logs a fault. The FLAG is named and its value never is — a log line that
  /// prints the lock choice tells a reader of the device's logs whether the
  /// lock is on, which is a fact about the user this client has no reason to
  /// emit.
  void _report(LocalSecurityFlag flag, String operation, String outcome, Object error) {
    _logger.warning(
      'Local security state operation did not complete.',
      fields: <String, Object?>{
        'flag': flag.storageName,
        'operation': operation,
        'outcome': outcome,
      },
      error: error,
    );
  }
}
