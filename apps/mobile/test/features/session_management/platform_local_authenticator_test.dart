// THE PLATFORM AUTHENTICATOR ADAPTER.
//
// The lock's behaviour is tested elsewhere, against a scripted authenticator.
// What is tested HERE is the one thing that cannot be: the translation of a
// platform plugin's outcomes into the port's typed values. That translation
// decides whether the application unlocks, so every branch of it is asserted,
// including the branches for codes this build has never seen.
//
// The properties held here:
//   * only a completed, successful comparison unlocks. No plugin code, no
//     exception and no Error can produce `LocalAuthSucceeded`;
//   * the adapter NEVER throws. A prompt that blows up is an outcome, not a
//     crash, because the caller is a lock screen with no way to recover;
//   * the outcome carries the verdict and nothing else — no plugin message,
//     no device detail, and nothing derived from a biometric;
//   * unsupported and unenrolled devices land on the states the feature
//     already degrades on.
import 'dart:io' show Platform;

import 'package:flutter/services.dart' show MissingPluginException;
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/session_management/data/platform_local_authenticator.dart';
import 'package:karar_mobile/features/session_management/domain/app_lock.dart';
import 'package:local_auth/local_auth.dart';

/// A plugin that answers as instructed, so the mapping can be exercised on a
/// machine with no authenticator attached.
final class _FakePlugin implements PlatformAuthenticatorPlugin {
  _FakePlugin({
    this.deviceSupported = true,
    this.authenticated = true,
    this.failure,
  });

  bool deviceSupported;
  bool authenticated;

  /// Raised by whichever call is made next, so one fake covers both the
  /// availability check and the prompt.
  Object? failure;

  int promptCount = 0;
  String? lastReason;
  bool? lastBiometricOnly;
  bool? lastPersistAcrossBackgrounding;

  @override
  Future<bool> isDeviceSupported() async {
    _raiseScriptedFailure();
    return deviceSupported;
  }

  @override
  Future<bool> authenticate({
    required String localizedReason,
    required bool biometricOnly,
    required bool persistAcrossBackgrounding,
  }) async {
    promptCount++;
    lastReason = localizedReason;
    lastBiometricOnly = biometricOnly;
    lastPersistAcrossBackgrounding = persistAcrossBackgrounding;
    _raiseScriptedFailure();
    return authenticated;
  }

  void _raiseScriptedFailure() {
    final Object? scripted = failure;
    if (scripted == null) {
      return;
    }
    // Raised through `Error.throwWithStackTrace` so the fake can script a
    // plain Error as readily as an Exception — proving that neither escapes
    // the adapter is the point of two of the tests below.
    Error.throwWithStackTrace(scripted, StackTrace.current);
  }
}

PlatformLocalAuthenticator _adapter(_FakePlugin plugin) =>
    PlatformLocalAuthenticator(plugin: plugin);

Future<LocalAuthOutcome> _outcomeForCode(LocalAuthExceptionCode code) =>
    _adapter(_FakePlugin(failure: LocalAuthException(code: code)))
        .authenticate(reason: 'Unlock Karar');

void main() {
  group('availability', () {
    test('a device that can authenticate its owner is available', () async {
      final _FakePlugin plugin = _FakePlugin();

      expect(
        await _adapter(plugin).availability(),
        LocalAuthAvailability.available,
      );
    });

    test('a device with nothing enrolled and no screen lock is notEnrolled',
        () async {
      // The platform answered, and the answer was no. That is actionable in
      // the platform settings, which is the distinction `notEnrolled` exists
      // to carry: the screen says what to do rather than only that it cannot.
      final _FakePlugin plugin = _FakePlugin(deviceSupported: false);

      expect(
        await _adapter(plugin).availability(),
        LocalAuthAvailability.notEnrolled,
      );
    });

    test('a platform with no implementation registered is unsupported',
        () async {
      final _FakePlugin plugin = _FakePlugin(
        failure: MissingPluginException('no implementation'),
      );

      expect(
        await _adapter(plugin).availability(),
        LocalAuthAvailability.unsupported,
      );
    });

    test('a platform that refuses to answer is unavailable, not available',
        () async {
      // FAIL CLOSED: a check that did not complete is reported distinctly and
      // behaves as unsupported, so the switch is never offered on a guess.
      final _FakePlugin plugin = _FakePlugin(
        failure: const LocalAuthException(
          code: LocalAuthExceptionCode.uiUnavailable,
        ),
      );

      expect(
        await _adapter(plugin).availability(),
        LocalAuthAvailability.unavailable,
      );
    });

    test('an Error raised by the platform does not escape the adapter',
        () async {
      final _FakePlugin plugin = _FakePlugin(
        failure: StateError('the platform channel is in a bad state'),
      );

      expect(
        await _adapter(plugin).availability(),
        LocalAuthAvailability.unavailable,
      );
    });
  });

  group('authenticate', () {
    test('a successful comparison is the only thing that unlocks', () async {
      final _FakePlugin plugin = _FakePlugin();

      expect(
        await _adapter(plugin).authenticate(reason: 'Unlock Karar'),
        isA<LocalAuthSucceeded>(),
      );
      expect(plugin.promptCount, 1);
    });

    test('a credential the device judged and rejected is not recognised',
        () async {
      final _FakePlugin plugin = _FakePlugin(authenticated: false);

      expect(
        await _adapter(plugin).authenticate(reason: 'Unlock Karar'),
        isA<LocalAuthFailed>().having(
          (LocalAuthFailed failure) => failure.reason,
          'reason',
          LocalAuthFailureReason.notRecognised,
        ),
      );
    });

    test('a dismissed or abandoned prompt is cancelled, never a failure',
        () async {
      // Cancellation is not counted against the user, and a prompt taken down
      // before any credential was judged must not be reported as one that was
      // judged and rejected.
      for (final LocalAuthExceptionCode code in <LocalAuthExceptionCode>[
        LocalAuthExceptionCode.userCanceled,
        LocalAuthExceptionCode.userRequestedFallback,
        LocalAuthExceptionCode.systemCanceled,
        LocalAuthExceptionCode.timeout,
      ]) {
        expect(
          await _outcomeForCode(code),
          isA<LocalAuthCancelled>(),
          reason: '$code is a prompt that ended without a verdict',
        );
      }
    });

    test('both lockouts tell the user to sign in with their password',
        () async {
      // A temporary lockout and one that holds until some other authentication
      // succeeds carry the same instruction, and the screen states it.
      for (final LocalAuthExceptionCode code in <LocalAuthExceptionCode>[
        LocalAuthExceptionCode.temporaryLockout,
        LocalAuthExceptionCode.biometricLockout,
      ]) {
        expect(
          await _outcomeForCode(code),
          isA<LocalAuthFailed>().having(
            (LocalAuthFailed failure) => failure.reason,
            'reason',
            LocalAuthFailureReason.lockedOut,
          ),
          reason: '$code must not be reported as a rejected credential',
        );
      }
    });

    test('a device with nothing that can satisfy the prompt is unavailable',
        () async {
      for (final LocalAuthExceptionCode code in <LocalAuthExceptionCode>[
        LocalAuthExceptionCode.noBiometricHardware,
        LocalAuthExceptionCode.noBiometricsEnrolled,
        LocalAuthExceptionCode.noCredentialsSet,
        LocalAuthExceptionCode.biometricHardwareTemporarilyUnavailable,
      ]) {
        expect(
          await _outcomeForCode(code),
          isA<LocalAuthFailed>().having(
            (LocalAuthFailed failure) => failure.reason,
            'reason',
            LocalAuthFailureReason.unavailable,
          ),
          reason: '$code leaves no authenticator this build can use',
        );
      }
    });

    test('an unrecognised plugin failure resolves to unavailable', () async {
      // The plugin's code list is open: adding to it is not a breaking change
      // for the plugin, so the default branch is the one a future release
      // lands on. It must be the fail-closed one.
      for (final LocalAuthExceptionCode code in <LocalAuthExceptionCode>[
        LocalAuthExceptionCode.authInProgress,
        LocalAuthExceptionCode.uiUnavailable,
        LocalAuthExceptionCode.deviceError,
        LocalAuthExceptionCode.unknownError,
      ]) {
        expect(
          await _outcomeForCode(code),
          isA<LocalAuthFailed>().having(
            (LocalAuthFailed failure) => failure.reason,
            'reason',
            LocalAuthFailureReason.unavailable,
          ),
        );
      }
    });

    test('NO plugin failure code is ever reported as an unlock', () async {
      // The property that matters, asserted over every code the installed
      // plugin declares rather than over the ones this file happens to name.
      for (final LocalAuthExceptionCode code
          in LocalAuthExceptionCode.values) {
        expect(
          await _outcomeForCode(code),
          isNot(isA<LocalAuthSucceeded>()),
          reason: '$code must never unlock the application',
        );
      }
    });

    test('a missing plugin implementation is an outcome, not a crash',
        () async {
      final _FakePlugin plugin = _FakePlugin(
        failure: MissingPluginException('no implementation'),
      );

      expect(
        await _adapter(plugin).authenticate(reason: 'Unlock Karar'),
        isA<LocalAuthFailed>().having(
          (LocalAuthFailed failure) => failure.reason,
          'reason',
          LocalAuthFailureReason.unavailable,
        ),
      );
    });

    test('an Error raised by the platform does not escape the adapter',
        () async {
      // The caller is a lock screen. An exception thrown out of here would
      // leave the user looking at a locked application with no outcome to
      // render and no way forward.
      final _FakePlugin plugin = _FakePlugin(
        failure: StateError('the platform channel is in a bad state'),
      );

      expect(
        await _adapter(plugin).authenticate(reason: 'Unlock Karar'),
        isA<LocalAuthFailed>(),
      );
    });

    test('the outcome carries the verdict and nothing the plugin said',
        () async {
      // Anything the platform volunteers about the sensor or the device is
      // dropped at this boundary: the port's outcomes are non-sensitive by
      // construction and the lock screen renders its own localized copy.
      final _FakePlugin plugin = _FakePlugin(
        failure: const LocalAuthException(
          code: LocalAuthExceptionCode.unknownError,
          description: 'sensor 0xDEADBEEF reported subject template 42',
          details: 'enrolment-id-99',
        ),
      );

      final LocalAuthOutcome outcome =
          await _adapter(plugin).authenticate(reason: 'Unlock Karar');

      expect(outcome.toString(), isNot(contains('DEADBEEF')));
      expect(outcome.toString(), isNot(contains('template')));
      expect(outcome.toString(), isNot(contains('enrolment-id-99')));
    });

    test('the prompt carries the localized reason it was given, unchanged',
        () async {
      // The reason is the ONLY string the port accepts, and it carries no
      // account information. The adapter must not decorate it.
      final _FakePlugin plugin = _FakePlugin();

      await _adapter(plugin).authenticate(reason: 'افتح كرار');

      expect(plugin.lastReason, 'افتح كرار');
    });

    test('the prompt accepts the device credential and survives a lifecycle '
        'transition', () async {
      // Both are deliberate, and both are asserted so a later edit to the
      // adapter is a red test rather than a silent behaviour change. The port
      // documents a passcode as a credential the user may present, and the
      // lock is raised exactly when the application is changing lifecycle
      // state, where a non-persistent prompt becomes a spurious cancellation.
      final _FakePlugin plugin = _FakePlugin();

      await _adapter(plugin).authenticate(reason: 'Unlock Karar');

      expect(plugin.lastBiometricOnly, isFalse);
      expect(plugin.lastPersistAcrossBackgrounding, isTrue);
    });
  });

  group('the authenticator chosen for this platform', () {
    test('is the plugin-backed one only where a prompt can actually appear',
        () {
      // On the machine the suite runs on there is no authenticator, so the
      // factory must yield the honest fallback rather than an adapter whose
      // every call would fail.
      expect(
        platformLocalAuthenticator(),
        Platform.isAndroid || Platform.isIOS
            ? isA<PlatformLocalAuthenticator>()
            : isA<UnsupportedLocalAuthenticator>(),
      );
    });

    test('the fallback still reports unsupported and never succeeds', () async {
      const UnsupportedLocalAuthenticator fallback =
          UnsupportedLocalAuthenticator();

      expect(await fallback.availability(), LocalAuthAvailability.unsupported);
      expect(
        await fallback.authenticate(reason: 'Unlock Karar'),
        isNot(isA<LocalAuthSucceeded>()),
      );
    });
  });
}
