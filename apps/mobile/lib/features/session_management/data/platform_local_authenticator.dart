// DATA LAYER — the platform authenticator adapter.
//
// This file is the ONLY place in the client that talks to the biometric
// plugin. The domain port it implements is pure Dart and stays that way; the
// plugin's types stop here.
//
// What this adapter is written to hold:
//   * no biometric template, image or derived representation is received,
//     stored or transmitted. The device compares; this file learns only which
//     of the port's typed outcomes occurred;
//   * no custom biometric cryptography. The platform authenticator is used as
//     the platform provides it, and the platform's own precautions are left at
//     their defaults rather than relaxed;
//   * an unlock proves presence to the DEVICE. It grants no session, refreshes
//     no token, and never substitutes for signing in. Nothing in this file
//     reaches for a credential store or a transport;
//   * rooted or jailbroken detection is NOT a security boundary and is not
//     attempted;
//   * FAIL CLOSED. Nothing thrown by the plugin, the platform channel or the
//     framework escapes this adapter. Every error, every plugin code this
//     build does not recognise, and every refusal to answer resolves to "not
//     authenticated" and to an availability the feature already degrades on.
//
// THE DEVICE CREDENTIAL IS ACCEPTED, AND THAT IS THE PORT'S DECISION, NOT THIS
// FILE'S. `LocalAuthFailureReason.notRecognised` is documented as "the
// presented biometric OR PASSCODE did not match", the foundation gate says
// "presenting a biometric or passcode prompt is a feature concern", and the
// user-facing copy asks for a "device unlock" and tells an unenrolled user to
// "set up a screen lock, fingerprint or face unlock". The port therefore
// expects the platform's own screen-lock fallback, so `biometricOnly` is
// false. Widening or narrowing that belongs in the port, not here.
import 'dart:io' show Platform;

import 'package:flutter/services.dart' show MissingPluginException;
import 'package:local_auth/local_auth.dart';

import '../domain/app_lock.dart';

/// The authenticator for the platform this process is running on.
///
/// Android and iOS get the plugin-backed adapter. Every other host — including
/// the machine the test suite runs on — gets [UnsupportedLocalAuthenticator],
/// because there is no prompt to raise there and claiming otherwise would be a
/// lock that cannot be opened.
LocalAuthenticator platformLocalAuthenticator() {
  if (Platform.isAndroid || Platform.isIOS) {
    return PlatformLocalAuthenticator();
  }
  return const UnsupportedLocalAuthenticator();
}

/// The plugin calls [PlatformLocalAuthenticator] makes.
///
/// Declared here so the mapping from plugin outcomes onto the port's typed
/// values — the part that decides whether the application unlocks — is
/// exercised by tests on a host with no authenticator attached. The production
/// implementation is private and does nothing but forward.
abstract interface class PlatformAuthenticatorPlugin {
  /// Whether the device can authenticate its owner at all, by an enrolled
  /// biometric or by the device credential.
  Future<bool> isDeviceSupported();

  /// Raises the platform prompt.
  ///
  /// Returns whether the user was authenticated. Every other outcome arrives
  /// as a [LocalAuthException].
  Future<bool> authenticate({
    required String localizedReason,
    required bool biometricOnly,
    required bool persistAcrossBackgrounding,
  });
}

/// The platform authenticator, over `local_auth`.
final class PlatformLocalAuthenticator implements LocalAuthenticator {
  PlatformLocalAuthenticator({PlatformAuthenticatorPlugin? plugin})
      : _plugin = plugin ?? _LocalAuthPlugin();

  final PlatformAuthenticatorPlugin _plugin;

  @override
  Future<LocalAuthAvailability> availability() async {
    try {
      if (await _plugin.isDeviceSupported()) {
        return LocalAuthAvailability.available;
      }
      // The platform answered, and the answer was no: nothing is enrolled and
      // no screen lock is set. That is a trip to the platform settings, which
      // is what `notEnrolled` tells the screen to offer.
      return LocalAuthAvailability.notEnrolled;
    } on MissingPluginException {
      // No implementation is registered for this platform, so there is no
      // authenticator this build can use.
      return LocalAuthAvailability.unsupported;
    } on Object {
      // The check itself did not complete. Reported distinctly so the screen
      // can say so, and behaves as unsupported: the lock is not offered.
      return LocalAuthAvailability.unavailable;
    }
  }

  @override
  Future<LocalAuthOutcome> authenticate({required String reason}) async {
    try {
      final bool authenticated = await _plugin.authenticate(
        localizedReason: reason,
        // See the file header: the port expects the platform's own screen-lock
        // fallback, so biometrics are not required exclusively.
        biometricOnly: false,
        // The lock is raised at the moment the application returns to the
        // foreground, which is when the lifecycle is noisiest. Without this, an
        // ordinary system transition during the prompt becomes a spurious
        // cancellation. It grants nothing: the platform still requires the
        // credential before it answers.
        persistAcrossBackgrounding: true,
      );
      return authenticated
          ? const LocalAuthSucceeded()
          // The platform judged the credential and rejected it. Only the
          // Darwin implementation reports this by returning false rather than
          // by throwing.
          : const LocalAuthFailed(LocalAuthFailureReason.notRecognised);
    } on LocalAuthException catch (error) {
      return _outcomeFor(error.code);
    } on Object {
      // Includes a missing plugin implementation, a platform-channel failure
      // and anything the framework raises. None of them authenticated anyone.
      return const LocalAuthFailed(LocalAuthFailureReason.unavailable);
    }
  }
}

/// Maps a plugin failure onto the port's typed outcomes.
///
/// The plugin's code list is explicitly OPEN — adding to it is not a breaking
/// change for the plugin — so this switch keeps a default, and the default is
/// the fail-closed one.
LocalAuthOutcome _outcomeFor(LocalAuthExceptionCode code) => switch (code) {
      // The user dismissed the prompt, or asked for another route. Not a
      // failure: the lock screen already offers the password instead.
      LocalAuthExceptionCode.userCanceled ||
      LocalAuthExceptionCode.userRequestedFallback =>
        const LocalAuthCancelled(),
      // The prompt was taken down before any credential was judged. Reporting
      // this as "not recognised" would blame a credential nobody presented.
      LocalAuthExceptionCode.systemCanceled ||
      LocalAuthExceptionCode.timeout =>
        const LocalAuthCancelled(),
      // Too many attempts. A temporary lockout and a lockout that holds until
      // some other authentication succeeds carry the same instruction to the
      // user, which the screen states: sign in with your password.
      LocalAuthExceptionCode.temporaryLockout ||
      LocalAuthExceptionCode.biometricLockout =>
        const LocalAuthFailed(LocalAuthFailureReason.lockedOut),
      // Nothing on this device can satisfy the prompt: no hardware, no
      // enrolment, no device credential, or hardware currently held elsewhere.
      LocalAuthExceptionCode.noBiometricHardware ||
      LocalAuthExceptionCode.noBiometricsEnrolled ||
      LocalAuthExceptionCode.noCredentialsSet ||
      LocalAuthExceptionCode.biometricHardwareTemporarilyUnavailable =>
        const LocalAuthFailed(LocalAuthFailureReason.unavailable),
      // Device errors, unknown errors, an authentication already in progress,
      // UI that could not be shown, and any code added to the plugin after
      // this build. None of them is an authentication.
      _ => const LocalAuthFailed(LocalAuthFailureReason.unavailable),
    };

/// Forwards to `local_auth` and does nothing else.
final class _LocalAuthPlugin implements PlatformAuthenticatorPlugin {
  _LocalAuthPlugin() : _plugin = LocalAuthentication();

  final LocalAuthentication _plugin;

  @override
  Future<bool> isDeviceSupported() => _plugin.isDeviceSupported();

  @override
  Future<bool> authenticate({
    required String localizedReason,
    required bool biometricOnly,
    required bool persistAcrossBackgrounding,
  }) =>
      _plugin.authenticate(
        localizedReason: localizedReason,
        biometricOnly: biometricOnly,
        persistAcrossBackgrounding: persistAcrossBackgrounding,
        // `sensitiveTransaction` is left at the plugin default. It is the
        // platform's own precaution against a face unlock the user did not
        // intend, and this adapter does not relax platform precautions.
      );
}

/// The adapter used where no platform authenticator can be reached.
///
/// Not a stub: "unsupported" is a state the whole feature handles as a
/// first-class case, because a device with no enrolled biometric reaches it
/// too. The settings screen explains that the lock is unavailable and does not
/// offer the switch, so the lock stays off and the session credential remains
/// protected by the platform keystore exactly as before.
///
/// Fails CLOSED in the sense that matters here: it never reports success, so
/// no code path can treat an absent authenticator as a satisfied one.
final class UnsupportedLocalAuthenticator implements LocalAuthenticator {
  const UnsupportedLocalAuthenticator();

  @override
  Future<LocalAuthAvailability> availability() async =>
      LocalAuthAvailability.unsupported;

  @override
  Future<LocalAuthOutcome> authenticate({required String reason}) async =>
      const LocalAuthFailed(LocalAuthFailureReason.unavailable);
}

/// A scripted authenticator for tests and for driving the lock state machine
/// without a device.
final class ScriptedLocalAuthenticator implements LocalAuthenticator {
  ScriptedLocalAuthenticator({
    this.availabilityAnswer = LocalAuthAvailability.available,
    List<LocalAuthOutcome> outcomes = const <LocalAuthOutcome>[
      LocalAuthSucceeded(),
    ],
  }) : _outcomes = List<LocalAuthOutcome>.of(outcomes);

  LocalAuthAvailability availabilityAnswer;

  final List<LocalAuthOutcome> _outcomes;

  /// Number of prompts raised. Asserted by the lock tests.
  int promptCount = 0;

  /// The prompt sentences the feature passed in, so a test can prove the
  /// reason string was localized rather than hardcoded.
  final List<String> reasons = <String>[];

  @override
  Future<LocalAuthAvailability> availability() async => availabilityAnswer;

  @override
  Future<LocalAuthOutcome> authenticate({required String reason}) async {
    reasons.add(reason);
    final int index = promptCount < _outcomes.length ? promptCount : _outcomes.length - 1;
    promptCount++;
    return _outcomes.isEmpty ? const LocalAuthSucceeded() : _outcomes[index];
  }
}
