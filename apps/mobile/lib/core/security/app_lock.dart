// PURE DART ONLY.
//
// The application-lock gate.
//
// The user's biometric-lock CHOICE is durable local SECURITY STATE and lives
// in `LocalSecurityStateStore`. The unlock ITSELF is never persisted: it is
// held in memory for the lifetime of one process, so a relaunch always
// re-locks.
//
// WHY THE CHOICE MOVED OUT OF THE PREFERENCE STORE.
//
// It used to be an ordinary preference, read as `readBool(key) ?? false`. Every
// part of that sentence failed open:
//
//   * `PreferencesKeyValueStore.open` falls back to an in-memory store when
//     the platform refuses, and an in-memory store holds no lock choice, so
//     `readBool` returned null;
//   * `?? false` turned null into "the user never asked for a lock";
//   * `StartupCoordinator` asked `isLocked`, got false, and skipped the gate.
//
// A user who had turned the lock on reached their session with no lock at all,
// because their preference storage had a bad day. Nothing threw, nothing was
// reported, and the next cold start looked identical.
//
// `setEnabled` failed open from the other direction: it wrote through
// `writeBool`, which catches the platform error, logs it, and returns. The
// switch moved, the screen said the lock was on, and the next cold start had
// no lock — the state had never left memory.
//
// THE SHAPE THAT FIXES BOTH. The choice is now LOADED, once, as an explicit
// startup step, and the load reports what happened:
//
//   * a value           — the lock is on or off, durably, and the gate applies it;
//   * genuinely absent  — the user never chose. Off is the correct default,
//                         and it is safe BECAUSE THE STORE ANSWERED;
//   * unavailable or
//     corrupt           — there is no answer. The gate reports LOCKED and the
//                         coordinator blocks on a state that says so, rather
//                         than defaulting to off and opening the door.
//
// and `setEnabled` changes nothing in memory until the platform has CONFIRMED
// the write. There is no in-memory-only enabled state to lose, and a failed
// disable retains the safer enabled one.
import 'package:meta/meta.dart';

import '../errors/failure.dart';
import 'local_security_state_store.dart';

/// What the gate knows about the user's durable lock choice.
///
/// Sealed so that "unknown" cannot be collapsed into "off" by an `??`. The
/// three cases are genuinely different and only one of them permits skipping
/// the gate.
@immutable
sealed class AppLockChoice {
  const AppLockChoice();

  /// Short, non-sensitive label. Never renders the choice itself.
  String get diagnosticLabel;

  @override
  String toString() => diagnosticLabel;
}

/// The store answered. [enabled] is the user's durable choice; a store that
/// held nothing yields `enabled: false`, which is the lock's opt-in default and
/// is safe precisely because the store was successfully consulted.
final class AppLockChoiceKnown extends AppLockChoice {
  const AppLockChoiceKnown({required this.enabled});

  final bool enabled;

  @override
  String get diagnosticLabel => 'app_lock_choice_known';
}

/// The store could not be consulted, or holds something that is not a choice.
///
/// NOT the same as "off". The gate fails closed on this and the coordinator
/// blocks; see `app/lifecycle/startup_state.dart`.
final class AppLockChoiceUnavailable extends AppLockChoice {
  const AppLockChoiceUnavailable(this.failure);

  final Failure failure;

  @override
  String get diagnosticLabel => 'app_lock_choice_unavailable';
}

/// [AppLockGate.load] has not run yet.
///
/// Present so that "nobody has asked the store" is a state rather than a
/// silence. It fails closed exactly like [AppLockChoiceUnavailable]: a gate
/// that has not been evaluated has certainly not been passed.
final class AppLockChoiceNotLoaded extends AppLockChoice {
  const AppLockChoiceNotLoaded();

  @override
  String get diagnosticLabel => 'app_lock_choice_not_loaded';
}

/// The outcome of asking to turn the lock on or off.
@immutable
sealed class AppLockChange {
  const AppLockChange();

  String get diagnosticLabel;

  @override
  String toString() => diagnosticLabel;
}

/// The platform confirmed the write and the gate now holds [enabled].
final class AppLockChangeApplied extends AppLockChange {
  const AppLockChangeApplied({required this.enabled});

  final bool enabled;

  @override
  String get diagnosticLabel => 'app_lock_change_applied';
}

/// The write was not confirmed, so NOTHING changed.
///
/// [retainedEnabled] is what the lock still is, and it is what the caller must
/// render — a switch that stays where the user put it while the durable state
/// disagrees is the in-memory-only lock this design exists to prevent.
final class AppLockChangeRejected extends AppLockChange {
  const AppLockChangeRejected({
    required this.requested,
    required this.retainedEnabled,
    required this.failure,
  });

  /// What the user asked for. Useful for the message, never for the state.
  final bool requested;

  /// The lock's actual state after the refusal.
  final bool retainedEnabled;

  final Failure failure;

  @override
  String get diagnosticLabel => 'app_lock_change_rejected';
}

/// Whether the application must be unlocked before protected surfaces render.
final class AppLockGate {
  AppLockGate({required LocalSecurityStateStore securityState})
      : _securityState = securityState;

  final LocalSecurityStateStore _securityState;

  AppLockChoice _choice = const AppLockChoiceNotLoaded();
  bool _unlockedThisLaunch = false;

  /// The last loaded choice, or [AppLockChoiceNotLoaded] before [load] runs.
  AppLockChoice get choice => _choice;

  /// Reads the durable choice from local security state.
  ///
  /// THIS IS A STARTUP STEP AND IT RUNS BEFORE THE CREDENTIAL IS RESTORED. The
  /// order is not an optimisation: a locked device must not have its keystore
  /// opened, and a device whose lock state cannot be established must not have
  /// it opened either. See `app/lifecycle/startup_coordinator.dart`.
  Future<AppLockChoice> load() async {
    final SecurityStateRead read =
        await _securityState.read(LocalSecurityFlag.appLockEnabled);
    _choice = switch (read) {
      SecurityStateValue(:final value) => AppLockChoiceKnown(enabled: value),
      // The store was consulted and held nothing. The lock is opt-in, so this
      // is a user who never turned it on — a real answer, not a fallback.
      SecurityStateAbsent() => const AppLockChoiceKnown(enabled: false),
      SecurityStateUnavailable() => const AppLockChoiceUnavailable(
          LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.read,
          ),
        ),
      SecurityStateCorrupt() =>
        const AppLockChoiceUnavailable(LocalSecurityStateCorruptFailure()),
    };
    return _choice;
  }

  /// The user's stored choice, as the SETTING screen renders it.
  ///
  /// This is not the gate. It answers false whenever the choice is not durably
  /// known, which is right for a switch — showing a lock as ON when nothing
  /// could confirm it is the overstatement that started all this — and wrong
  /// for a decision about whether to let content through. Gate on [isLocked].
  bool get isEnabled => switch (_choice) {
        AppLockChoiceKnown(:final enabled) => enabled,
        AppLockChoiceUnavailable() || AppLockChoiceNotLoaded() => false,
      };

  /// True only when the store gave a definite NO.
  ///
  /// The ONE condition under which the lock may be skipped, and the only thing
  /// any caller should test before deciding not to lock. `!isEnabled` is not
  /// the same question: it is also true when the store never answered.
  bool get isDurablyDisabled => switch (_choice) {
        AppLockChoiceKnown(:final enabled) => !enabled,
        AppLockChoiceUnavailable() || AppLockChoiceNotLoaded() => false,
      };

  /// Whether the choice has a durable answer at all.
  bool get isChoiceKnown => _choice is AppLockChoiceKnown;

  /// True when this process has not been unlocked and the lock is not durably
  /// off.
  ///
  /// FAIL CLOSED: an unloaded or unavailable choice reports LOCKED. The
  /// coordinator does not route such a launch to the lock screen — it has no
  /// business asking for a device unlock it cannot justify — but every other
  /// caller that asks "may I show this" gets the safe answer.
  bool get isLocked => !_unlockedThisLaunch && !isDurablyDisabled;

  /// Records a successful platform authentication for this process only.
  void markUnlocked() => _unlockedThisLaunch = true;

  /// Re-locks immediately — used when the process is resumed after a
  /// background interval, and on sign-out.
  void relock() => _unlockedThisLaunch = false;

  /// Persists the user's choice, and reports whether it reached the platform.
  ///
  /// The in-memory state moves ONLY on a confirmed write. Both directions fail
  /// closed, for different reasons:
  ///
  ///   * a failed ENABLE leaves the lock off. Reporting success would show a
  ///     lock that does not exist, and the user would find out on the cold
  ///     launch that did not ask for it;
  ///   * a failed DISABLE leaves the lock ON. That is the safer of the two
  ///     states, and it is recoverable — the setting can be retried, and a
  ///     user who cannot satisfy the lock still has the password fallback on
  ///     the lock screen.
  Future<AppLockChange> setEnabled({required bool enabled}) async {
    final SecurityStateWrite written =
        await _securityState.write(LocalSecurityFlag.appLockEnabled, value: enabled);
    if (!written.isDurable) {
      // Nothing is assigned to `_choice`. The previous durable state stands,
      // which is what makes an in-memory-only enabled lock unrepresentable.
      return AppLockChangeRejected(
        requested: enabled,
        // Not `isEnabled`: when the choice was never loaded the honest answer
        // is that the lock may well be on, and the caller must not be told it
        // is off on the strength of a read nobody performed.
        retainedEnabled: !isDurablyDisabled,
        failure: written.failureOrNull ??
            const LocalSecurityStateUnavailableFailure(
              operation: LocalSecurityStateOperation.write,
            ),
      );
    }
    _choice = AppLockChoiceKnown(enabled: enabled);
    if (enabled) {
      // Turning the lock on locks immediately. The caller that has just
      // authenticated the user re-opens this launch deliberately.
      _unlockedThisLaunch = false;
    }
    return AppLockChangeApplied(enabled: enabled);
  }
}
