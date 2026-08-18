// PURE DART ONLY.
//
// THE APPLICATION LOCK IS A LOCAL PRIVACY CONTROL. IT IS NOT AUTHENTICATION.
//
// What that means, precisely, and what the types below are shaped to enforce:
//
//   * Unlocking proves presence to the DEVICE. It proves nothing to the
//     platform, grants no session, and never substitutes for signing in. A
//     locked application with an expired session is still signed out after it
//     unlocks.
//   * No biometric data enters Karar. The device compares; this client learns
//     only whether the comparison succeeded. No template, image, or derived
//     representation is received, stored, or transmitted.
//   * No custom biometric cryptography. The platform authenticator is used as
//     the platform provides it; this client does not wrap it in a key
//     ceremony of its own design.
//   * Rooted or jailbroken detection is NOT a security boundary and is not
//     attempted. A device that will not offer an authenticator degrades to
//     the lock being unavailable, which the settings screen states plainly
//     rather than pretending the control is on.
//   * Enabling or disabling the lock requires an authenticated state, because
//     a control that survives sign-out would be a lock on nobody's data.
//
// The user's CHOICE is a non-sensitive preference (`core/security/app_lock`).
// The unlock itself is process-scoped and never persisted, so a relaunch
// always re-locks.
import 'package:meta/meta.dart';

/// Whether the device can perform a local authentication at all.
enum LocalAuthAvailability {
  /// An authenticator exists and the user has enrolled in it.
  available,

  /// The hardware exists but nothing is enrolled. Actionable by the user in
  /// the platform settings, so it is reported separately.
  notEnrolled,

  /// The platform offers no authenticator this build can use. The lock is
  /// hidden rather than offered and then failing.
  unsupported,

  /// The platform refused to answer. Treated as unsupported for behaviour —
  /// the control fails CLOSED and is not offered — but reported distinctly so
  /// the screen can say the check itself did not complete.
  unavailable,
}

/// The result of asking the platform to authenticate the user locally.
@immutable
sealed class LocalAuthOutcome {
  const LocalAuthOutcome();
}

/// The device authenticated the user.
final class LocalAuthSucceeded extends LocalAuthOutcome {
  const LocalAuthSucceeded();
}

/// The user dismissed the prompt. Not a failure, and never counted as one.
final class LocalAuthCancelled extends LocalAuthOutcome {
  const LocalAuthCancelled();
}

/// The device could not authenticate the user.
final class LocalAuthFailed extends LocalAuthOutcome {
  const LocalAuthFailed(this.reason);

  final LocalAuthFailureReason reason;

  @override
  String toString() => 'LocalAuthFailed(${reason.name})';
}

/// Why a local authentication did not succeed. Non-sensitive by construction.
enum LocalAuthFailureReason {
  /// The presented biometric or passcode did not match.
  notRecognised,

  /// The platform locked the authenticator out after repeated attempts. The
  /// user must fall back to signing in again.
  lockedOut,

  /// No authenticator is usable. See [LocalAuthAvailability].
  unavailable,
}

/// The platform authenticator, as a port.
///
/// Implemented in the data layer over a platform plugin. Kept behind a port so
/// the lock state machine is testable without a device, and so no plugin type
/// reaches this layer.
abstract interface class LocalAuthenticator {
  Future<LocalAuthAvailability> availability();

  /// Prompts the user.
  ///
  /// [reason] is a localized sentence supplied by the presentation layer and
  /// shown by the platform. It is the only string this port accepts, and it
  /// carries no account information.
  Future<LocalAuthOutcome> authenticate({required String reason});
}

/// When time away from the application re-engages the lock.
@immutable
final class AppLockPolicy {
  const AppLockPolicy({
    this.backgroundGrace = const Duration(seconds: 30),
  });

  /// How long the application may be backgrounded before it re-locks.
  ///
  /// A grace period exists because without one, every camera permission
  /// prompt, share sheet and password-manager hand-off would re-lock the
  /// application and train users to resent the control. It is deliberately
  /// short.
  final Duration backgroundGrace;

  /// Whether an application backgrounded at [backgroundedAt] and resumed at
  /// [now] must re-lock.
  ///
  /// A clock that appears to have moved BACKWARDS re-locks. The device time
  /// can be changed by the user, and the fail-closed reading of an
  /// uninterpretable interval is to lock.
  bool shouldRelock({required DateTime backgroundedAt, required DateTime now}) {
    final Duration away = now.toUtc().difference(backgroundedAt.toUtc());
    if (away.isNegative) {
      return true;
    }
    return away >= backgroundGrace;
  }
}
