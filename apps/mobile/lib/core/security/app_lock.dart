// The application-lock gate.
//
// The user's biometric-lock CHOICE is a non-sensitive preference and lives in
// the plain preference store. The unlock ITSELF is never persisted: it is held
// in memory for the lifetime of one process, so a relaunch always re-locks.
//
// This file owns the gate only. Presenting a biometric or passcode prompt is a
// feature concern; the foundation exposes [markUnlocked] for a feature to call
// once the platform has actually authenticated the user.
import '../storage/key_value_store.dart';

/// Preference key for the user's lock choice. Non-sensitive: it records that
/// the user wants a lock, never anything that could satisfy one.
final PreferenceKey appLockEnabledKey = PreferenceKey('security.app_lock_enabled');

/// Whether the application must be unlocked before protected surfaces render.
final class AppLockGate {
  AppLockGate({required KeyValueStore preferences}) : _preferences = preferences;

  final KeyValueStore _preferences;
  bool _unlockedThisLaunch = false;

  /// Whether the user has asked for an application lock. Absent means off:
  /// the lock is opt-in and its absence is not a security downgrade, because
  /// the session credential is protected by the platform keystore regardless.
  bool get isEnabled => _preferences.readBool(appLockEnabledKey) ?? false;

  /// True when the lock is on and this process has not yet been unlocked.
  bool get isLocked => isEnabled && !_unlockedThisLaunch;

  /// Records a successful platform authentication for this process only.
  void markUnlocked() => _unlockedThisLaunch = true;

  /// Re-locks immediately — used when the process is resumed after a
  /// background interval, and on sign-out.
  void relock() => _unlockedThisLaunch = false;

  /// Persists the user's choice. Turning the lock on locks immediately.
  Future<void> setEnabled({required bool enabled}) async {
    await _preferences.writeBool(appLockEnabledKey, value: enabled);
    if (enabled) {
      _unlockedThisLaunch = false;
    }
  }
}
