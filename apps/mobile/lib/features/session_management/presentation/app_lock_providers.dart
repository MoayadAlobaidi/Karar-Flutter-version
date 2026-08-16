// PRESENTATION — the application lock.
//
// The lock is a LOCAL PRIVACY CONTROL, not authentication. See
// `features/session_management/domain/app_lock.dart` for the full statement of
// what that means; the controller below enforces the parts that are code:
//
//   * unlocking calls `AppLockGate.markUnlocked`, which is process-scoped, so
//     a relaunch always re-locks and no unlock is ever persisted;
//   * an unlock grants NOTHING server-side. It removes the cover from an
//     already-authenticated session and nothing more. If the session ended
//     while the application was away, the coordinator routes to sign-in after
//     the unlock, not to protected content;
//   * enabling the lock requires an authenticated state, checked here rather
//     than assumed by the screen;
//   * an unavailable or unenrolled authenticator leaves the lock OFF and says
//     so. The switch is never left on while nothing can satisfy it.
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/security/app_lock.dart';
import '../../../core/security/session_manager.dart';
import '../../../core/utilities/clock.dart';
import '../data/platform_local_authenticator.dart';
import '../domain/app_lock.dart';

/// The platform authenticator.
///
/// Overridden in tests, and replaced with the plugin-backed implementation
/// when the dependency lands.
final Provider<LocalAuthenticator> localAuthenticatorProvider =
    Provider<LocalAuthenticator>((Ref ref) => const UnsupportedLocalAuthenticator());

/// How long the application may be backgrounded before it re-locks.
final Provider<AppLockPolicy> appLockPolicyProvider =
    Provider<AppLockPolicy>((Ref ref) => const AppLockPolicy());

/// What the lock screen and the lock setting render.
@immutable
final class AppLockViewState {
  const AppLockViewState({
    this.availability = LocalAuthAvailability.unavailable,
    this.isEnabled = false,
    this.isChecking = false,
    this.isPrompting = false,
    this.lastOutcome,
    this.requiresSession = false,
  });

  /// What the device can do. Read once when the screen appears, because it
  /// can change while the application is backgrounded.
  final LocalAuthAvailability availability;

  /// The user's stored choice.
  final bool isEnabled;

  final bool isChecking;
  final bool isPrompting;

  /// The result of the last prompt, for the message under the button.
  final LocalAuthOutcome? lastOutcome;

  /// Set when the user tried to change the setting with no session.
  final bool requiresSession;

  /// Whether the switch may be offered at all.
  bool get canEnable => availability == LocalAuthAvailability.available;

  bool get isBusy => isChecking || isPrompting;

  @override
  String toString() =>
      'AppLockViewState(availability: ${availability.name}, enabled: $isEnabled)';
}

/// Drives the lock gate and the lock setting.
final class AppLockController extends Notifier<AppLockViewState> {
  @override
  AppLockViewState build() =>
      AppLockViewState(isEnabled: ref.read(appLockGateProvider).isEnabled);

  /// Re-reads what the device can do and what the user chose.
  Future<void> refresh() async {
    if (state.isChecking) {
      return;
    }
    state = AppLockViewState(
      isEnabled: ref.read(appLockGateProvider).isEnabled,
      availability: state.availability,
      isChecking: true,
    );
    final LocalAuthAvailability availability =
        await ref.read(localAuthenticatorProvider).availability();
    if (!ref.mounted) {
      return;
    }
    final bool enabled = ref.read(appLockGateProvider).isEnabled;
    if (enabled && availability != LocalAuthAvailability.available) {
      // The user enabled the lock and the device can no longer satisfy it —
      // an enrolment was removed, or the hardware was disabled. Leaving the
      // preference on would lock them out of their own application with no
      // way through, so the choice is stood down and the screen says why.
      await ref.read(appLockGateProvider).setEnabled(enabled: false);
      ref.read(appLockGateProvider).markUnlocked();
      if (!ref.mounted) {
        return;
      }
      state = AppLockViewState(availability: availability);
      return;
    }
    state = AppLockViewState(availability: availability, isEnabled: enabled);
  }

  /// Prompts the platform, and on success releases the gate.
  ///
  /// Releasing the gate is all this does. It grants no session and refreshes
  /// no token; the coordinator re-runs the ordinary session and bootstrap
  /// checks afterwards, so an expired session still lands on sign-in.
  Future<void> unlock({required String reason}) async {
    if (state.isPrompting) {
      return;
    }
    state = AppLockViewState(
      availability: state.availability,
      isEnabled: state.isEnabled,
      isPrompting: true,
    );
    final LocalAuthOutcome outcome =
        await ref.read(localAuthenticatorProvider).authenticate(reason: reason);
    if (!ref.mounted) {
      return;
    }
    state = AppLockViewState(
      availability: state.availability,
      isEnabled: state.isEnabled,
      lastOutcome: outcome,
    );
    if (outcome is LocalAuthSucceeded) {
      await ref.read(startupCoordinatorProvider).unlock();
    }
  }

  /// Turns the lock on or off.
  ///
  /// Requires an authenticated state: a lock configured by nobody protects
  /// nobody, and the setting is account-scoped in intent even though its
  /// storage is device-scoped.
  Future<void> setEnabled({required bool enabled, required String reason}) async {
    if (state.isBusy) {
      return;
    }
    if (ref.read(sessionManagerProvider).state is! ActiveSession) {
      state = AppLockViewState(
        availability: state.availability,
        isEnabled: state.isEnabled,
        requiresSession: true,
      );
      return;
    }
    if (!enabled) {
      await ref.read(appLockGateProvider).setEnabled(enabled: false);
      // Turning the lock off leaves this process unlocked; otherwise the user
      // would be asked to unlock immediately after switching the lock off.
      ref.read(appLockGateProvider).markUnlocked();
      if (!ref.mounted) {
        return;
      }
      state = AppLockViewState(availability: state.availability);
      return;
    }

    state = AppLockViewState(availability: state.availability, isPrompting: true);
    final LocalAuthOutcome outcome =
        await ref.read(localAuthenticatorProvider).authenticate(reason: reason);
    if (!ref.mounted) {
      return;
    }
    if (outcome is! LocalAuthSucceeded) {
      // FAIL CLOSED: the lock is not enabled unless the device has just
      // proved it can satisfy it. Otherwise the next launch would present a
      // lock nobody can open.
      state = AppLockViewState(availability: state.availability, lastOutcome: outcome);
      return;
    }
    await ref.read(appLockGateProvider).setEnabled(enabled: true);
    // `setEnabled(true)` re-locks the process by design. The user is looking
    // at the setting having just authenticated, so this launch stays open.
    ref.read(appLockGateProvider).markUnlocked();
    if (!ref.mounted) {
      return;
    }
    state = AppLockViewState(availability: state.availability, isEnabled: true);
  }
}

final NotifierProvider<AppLockController, AppLockViewState> appLockControllerProvider =
    NotifierProvider<AppLockController, AppLockViewState>(AppLockController.new);

/// Re-engages the lock when the application has been away long enough.
///
/// INSTALLATION. The watcher has to observe the whole process, not one screen:
/// the application is most often backgrounded from protected content, which
/// belongs to another workstream, so no screen this workstream owns is
/// mounted at the moment that matters. It is therefore installed against the
/// container rather than the widget tree:
///
///     final AppLockBackgroundWatcher watcher =
///         container.read(appLockBackgroundWatcherProvider)..attach();
///
/// [AppLockLifecycleObserver] wraps the same behaviour in a widget, for a
/// shell that would rather compose it into the tree.
///
/// It records when the application left the foreground and, on return, asks
/// [AppLockPolicy] whether the interval was long enough to re-lock. The clock
/// is injected, so the behaviour is testable without waiting.
final class AppLockBackgroundWatcher with WidgetsBindingObserver {
  AppLockBackgroundWatcher({
    required AppLockGate gate,
    required AppLockPolicy policy,
    required Clock clock,
    required Future<void> Function() restart,
  })  : _gate = gate,
        _policy = policy,
        _clock = clock,
        _restart = restart;

  final AppLockGate _gate;
  final AppLockPolicy _policy;
  final Clock _clock;
  final Future<void> Function() _restart;

  DateTime? _leftForegroundAt;

  /// Number of times the lock was re-engaged. Asserted by the lock tests.
  int relockCount = 0;

  void attach() => WidgetsBinding.instance.addObserver(this);

  void detach() => WidgetsBinding.instance.removeObserver(this);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      handleResume();
      return;
    }
    // The FIRST departure from the foreground is the one that counts. iOS
    // passes through `inactive` on its way to `paused`, and taking the later
    // timestamp would silently shorten every grace period.
    _leftForegroundAt ??= _clock.nowUtc();
  }

  /// Exposed so a test can drive the transition without a platform channel.
  void handleResume() {
    final DateTime? leftAt = _leftForegroundAt;
    _leftForegroundAt = null;
    if (leftAt == null || !_gate.isEnabled) {
      return;
    }
    if (!_policy.shouldRelock(backgroundedAt: leftAt, now: _clock.nowUtc())) {
      return;
    }
    _gate.relock();
    relockCount++;
    // Re-running startup is what produces APP_LOCKED, which the application's
    // single redirect then acts on. Nothing here navigates.
    unawaited(_restart());
  }
}

final Provider<AppLockBackgroundWatcher> appLockBackgroundWatcherProvider =
    Provider<AppLockBackgroundWatcher>((Ref ref) {
  final AppLockBackgroundWatcher watcher = AppLockBackgroundWatcher(
    gate: ref.watch(appLockGateProvider),
    policy: ref.watch(appLockPolicyProvider),
    clock: ref.watch(clockProvider),
    restart: () => ref.read(startupCoordinatorProvider).start(),
  );
  ref.onDispose(watcher.detach);
  return watcher;
});

/// The widget form of [AppLockBackgroundWatcher], for a shell that composes
/// the watcher into the tree rather than installing it on the container.
class AppLockLifecycleObserver extends ConsumerStatefulWidget {
  const AppLockLifecycleObserver({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<AppLockLifecycleObserver> createState() =>
      _AppLockLifecycleObserverState();
}

class _AppLockLifecycleObserverState extends ConsumerState<AppLockLifecycleObserver>
    with WidgetsBindingObserver {
  DateTime? _leftForegroundAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _handleResume();
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _leftForegroundAt ??= ref.read(clockProvider).nowUtc();
    }
  }

  void _handleResume() {
    final DateTime? leftAt = _leftForegroundAt;
    _leftForegroundAt = null;
    if (leftAt == null || !ref.read(appLockGateProvider).isEnabled) {
      return;
    }
    final bool relock = ref.read(appLockPolicyProvider).shouldRelock(
          backgroundedAt: leftAt,
          now: ref.read(clockProvider).nowUtc(),
        );
    if (!relock) {
      return;
    }
    ref.read(appLockGateProvider).relock();
    // Re-running startup is what moves the state to APP_LOCKED, which the
    // single redirect then acts on. Nothing here navigates.
    unawaited(ref.read(startupCoordinatorProvider).start());
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
