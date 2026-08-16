// DATA LAYER — the platform authenticator adapter.
//
// PLUGIN NOT YET AVAILABLE. Presenting a biometric or device-passcode prompt
// requires a platform-channel plugin (`local_auth`), and `pubspec.yaml` is
// owned by another workstream, so this build declares none. Rather than ship a
// control that claims to lock the application and does not, the adapter below
// reports the authenticator as UNSUPPORTED.
//
// That is not a stub with a TODO attached: "unsupported" is a state the whole
// feature already handles as a first-class case, because a device with no
// enrolled biometric reaches it too. The settings screen explains that the
// lock is unavailable and does not offer the switch; the lock therefore stays
// off, and the session credential remains protected by the platform keystore
// exactly as before. When the dependency lands, only this file changes.
//
// What must NOT change when it does:
//   * no biometric template, image or derived representation is received,
//     stored or transmitted — the device compares and answers yes or no;
//   * no custom biometric cryptography. The platform authenticator is used as
//     the platform provides it;
//   * an unlock proves presence to the DEVICE. It grants no session and never
//     substitutes for signing in.
import '../domain/app_lock.dart';

/// The adapter used when no platform authenticator is wired in.
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
