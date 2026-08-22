// The application lock.
//
// The lock is a LOCAL PRIVACY CONTROL, not authentication, and these tests are
// written to hold that line: an unlock grants no session, enabling requires an
// authentication, an unavailable authenticator leaves the lock off, and no
// unlock survives a relaunch.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/security/app_lock.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/features/session_management/data/platform_local_authenticator.dart';
import 'package:karar_mobile/features/session_management/domain/app_lock.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_providers.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../authentication/support/identity_harness.dart';

IdentityHarness _harnessWith(ScriptedLocalAuthenticator authenticator) => IdentityHarness(
  overrides: <Override>[localAuthenticatorProvider.overrideWithValue(authenticator)],
);

/// The English catalogue, for assertions that do not depend on the locale.
final AppLocalizations _english = lookupAppLocalizations(KararLocalization.english);

void main() {
  group('AppLockPolicy', () {
    test('re-locks once the grace period has elapsed', () {
      const AppLockPolicy policy = AppLockPolicy(backgroundGrace: Duration(seconds: 30));
      final DateTime away = DateTime.utc(2026, 1, 1, 12);

      expect(
        policy.shouldRelock(backgroundedAt: away, now: away.add(const Duration(seconds: 29))),
        isFalse,
        reason: 'a share sheet or a password-manager hand-off must not re-lock',
      );
      expect(
        policy.shouldRelock(backgroundedAt: away, now: away.add(const Duration(seconds: 30))),
        isTrue,
      );
    });

    test('re-locks when the device clock appears to move backwards', () {
      // FAIL CLOSED: the user can change the device time, and an interval this
      // client cannot interpret is read as "lock".
      const AppLockPolicy policy = AppLockPolicy();
      final DateTime away = DateTime.utc(2026, 1, 1, 12);

      expect(
        policy.shouldRelock(backgroundedAt: away, now: away.subtract(const Duration(hours: 1))),
        isTrue,
      );
    });
  });

  group('AppLockGate', () {
    test('an unlock lives for one process and never reaches storage', () {
      final IdentityHarness harness = IdentityHarness();
      final AppLockGate gate = harness.container.read(appLockGateProvider);

      gate.markUnlocked();

      // Nothing about the unlock is persisted: only the CHOICE is, and that is
      // a boolean preference.
      expect(harness.preferences.writtenText, isNot(contains('unlocked')));
      expect(harness.secureEntries, isEmpty);
    });
  });

  group('AppLockController', () {
    test('reports an unsupported device and does not offer the switch', () async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(availabilityAnswer: LocalAuthAvailability.unsupported),
      );

      await harness.container.read(appLockControllerProvider.notifier).refresh();

      final AppLockViewState state = harness.container.read(appLockControllerProvider);
      expect(state.availability, LocalAuthAvailability.unsupported);
      expect(state.canEnable, isFalse);
      expect(state.isEnabled, isFalse);
    });

    test('refuses to enable the lock without a session', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container
          .read(appLockControllerProvider.notifier)
          .setEnabled(enabled: true, reason: _english.appLockPromptReason);

      final AppLockViewState state = harness.container.read(appLockControllerProvider);
      expect(state.requiresSession, isTrue);
      expect(state.isEnabled, isFalse);
      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
    });

    test('FAILS CLOSED: a refused prompt does not enable the lock', () async {
      // Otherwise the next launch would present a lock nobody can open.
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(outcomes: const <LocalAuthOutcome>[LocalAuthCancelled()]),
      );
      await harness.signInFixture();
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container
          .read(appLockControllerProvider.notifier)
          .setEnabled(enabled: true, reason: _english.appLockPromptReason);

      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
      expect(
        harness.container.read(appLockControllerProvider).lastOutcome,
        isA<LocalAuthCancelled>(),
      );
    });

    test('enables the lock only after the device has just authenticated', () async {
      final ScriptedLocalAuthenticator authenticator = ScriptedLocalAuthenticator();
      final IdentityHarness harness = _harnessWith(authenticator);
      await harness.signInFixture();
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container
          .read(appLockControllerProvider.notifier)
          .setEnabled(enabled: true, reason: _english.appLockPromptReason);

      expect(authenticator.promptCount, 1);
      expect(harness.container.read(appLockGateProvider).isEnabled, isTrue);
      // The prompt sentence came from the localized catalogue, not a literal.
      expect(authenticator.reasons.single, _english.appLockPromptReason);
    });

    test('stands the choice down when the device can no longer satisfy it', () async {
      final ScriptedLocalAuthenticator authenticator = ScriptedLocalAuthenticator();
      final IdentityHarness harness = _harnessWith(authenticator);
      await harness.signInFixture();
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);

      // The user removed their fingerprint enrolment while away.
      authenticator.availabilityAnswer = LocalAuthAvailability.notEnrolled;
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      // Leaving the preference on would lock them out with no way through.
      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
    });

    test('an unlock releases the gate and grants no session', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      expect(harness.container.read(appLockGateProvider).isLocked, isTrue);

      await harness.container
          .read(appLockControllerProvider.notifier)
          .unlock(reason: _english.appLockPromptReason);

      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
      // Proving presence to the DEVICE grants nothing server-side.
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
      expect(harness.secureEntries, isEmpty);
    });

    test('a failed unlock leaves the gate engaged', () async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          outcomes: const <LocalAuthOutcome>[LocalAuthFailed(LocalAuthFailureReason.notRecognised)],
        ),
      );
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);

      await harness.container
          .read(appLockControllerProvider.notifier)
          .unlock(reason: _english.appLockPromptReason);

      expect(harness.container.read(appLockGateProvider).isLocked, isTrue);
    });

    test('turning the lock off leaves this process open', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.signInFixture();
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container
          .read(appLockControllerProvider.notifier)
          .setEnabled(enabled: false, reason: _english.appLockPromptReason);

      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
    });
  });

  // THE CHOICE IS LOADED, AND A MISSING LOAD IS NOT A MISSING LOCK.
  //
  // The gate used to read the choice inline, synchronously, out of the ordinary
  // preference store, as `readBool(key) ?? false`. That store falls back to
  // memory when the platform will not open it, an in-memory store holds no
  // choice, and `?? false` turned the missing answer into "the user never asked
  // for a lock". A device whose preference storage failed skipped the gate.
  group('AppLockGate loads its choice and fails closed without one', () {
    test('a stored choice is loaded, and both values survive', () async {
      final IdentityHarness harness = IdentityHarness();
      final AppLockGate gate = harness.container.read(appLockGateProvider);

      await harness.enableAppLock();
      expect(
        await gate.load(),
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isTrue),
      );
      expect(gate.isEnabled, isTrue);
      expect(gate.isDurablyDisabled, isFalse);
      expect(gate.isLocked, isTrue);

      await harness.securityState.write(LocalSecurityFlag.appLockEnabled, value: false);
      expect(
        await gate.load(),
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isFalse),
      );
      expect(gate.isDurablyDisabled, isTrue);
      expect(gate.isLocked, isFalse);
    });

    test('an ABSENT choice is a real answer: the lock is opt-in and off', () async {
      final IdentityHarness harness = IdentityHarness();
      final AppLockGate gate = harness.container.read(appLockGateProvider);

      final AppLockChoice choice = await gate.load();

      expect(
        choice,
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isFalse),
        reason:
            'the store was consulted and held nothing. Defaulting to off is '
            'safe HERE and only here, because there was an answer',
      );
      expect(gate.isDurablyDisabled, isTrue);
      expect(gate.isLocked, isFalse);
    });

    test('a READ FAILURE is not "off" — the gate stays closed', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.securityState.unreadableFlags.add(LocalSecurityFlag.appLockEnabled);
      final AppLockGate gate = harness.container.read(appLockGateProvider);

      final AppLockChoice choice = await gate.load();

      expect(choice, isA<AppLockChoiceUnavailable>());
      expect(
        (choice as AppLockChoiceUnavailable).failure,
        isA<LocalSecurityStateUnavailableFailure>(),
      );
      expect(
        gate.isDurablyDisabled,
        isFalse,
        reason:
            'THE ASSERTION THAT FAILS WITHOUT THE FIX. A store that would '
            'not answer used to read as a user who never turned the lock on',
      );
      expect(gate.isLocked, isTrue);
      expect(gate.isChoiceKnown, isFalse);
    });

    test('a CORRUPT choice fails closed as well', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.securityState.corruptFlags.add(LocalSecurityFlag.appLockEnabled);
      final AppLockGate gate = harness.container.read(appLockGateProvider);

      final AppLockChoice choice = await gate.load();

      expect(choice, isA<AppLockChoiceUnavailable>());
      expect((choice as AppLockChoiceUnavailable).failure, isA<LocalSecurityStateCorruptFailure>());
      expect(gate.isLocked, isTrue);
    });

    test('a store that never OPENED cannot disable the lock', () async {
      // The whole-store failure, as the composition root would install it.
      final AppLockGate gate = AppLockGate(
        securityState: const UnavailableLocalSecurityStateStore(),
      );

      final AppLockChoice choice = await gate.load();

      expect(choice, isA<AppLockChoiceUnavailable>());
      expect(gate.isDurablyDisabled, isFalse);
      expect(gate.isLocked, isTrue);
    });

    test('an UNLOADED gate reports locked', () {
      // A gate nobody has evaluated has certainly not been passed. This is what
      // stops a future change that forgets the load step from failing open.
      final AppLockGate gate = AppLockGate(securityState: InMemoryLocalSecurityStateStore());

      expect(gate.choice, isA<AppLockChoiceNotLoaded>());
      expect(gate.isChoiceKnown, isFalse);
      expect(gate.isDurablyDisabled, isFalse);
      expect(gate.isLocked, isTrue);
    });

    test('the ordinary preference store cannot answer for the lock at all', () async {
      // The preference store is where the choice used to live, and its
      // in-memory fallback is why it may not live there again. Nothing the
      // preference store does — including being replaced wholesale by the
      // fallback — can move the gate.
      final IdentityHarness harness = IdentityHarness();
      await harness.enableAppLock();
      await harness.container.read(appLockGateProvider).load();

      await harness.preferences.clear();
      await harness.preferences.writeBool(PreferenceKey('security.app_lock_enabled'), value: false);

      expect(
        harness.container.read(appLockGateProvider).isEnabled,
        isTrue,
        reason:
            'a value in unencrypted preferences must not be able to switch '
            'a security control off',
      );
      expect(
        await harness.container.read(appLockGateProvider).load(),
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isTrue),
      );
    });
  });

  // ENABLING CANNOT SUCCEED ONLY IN MEMORY.
  //
  // `setEnabled` used to write through `KeyValueStore.writeBool`, which catches
  // the platform error, logs it and returns. The switch moved, the screen said
  // the lock was on, and the next cold start had no lock: the state had never
  // left memory.
  group('AppLockGate.setEnabled requires a confirmed durable write', () {
    test('a confirmed enable is applied and re-locks the process', () async {
      final IdentityHarness harness = IdentityHarness();
      final AppLockGate gate = harness.container.read(appLockGateProvider);
      await gate.load();
      gate.markUnlocked();

      final AppLockChange change = await gate.setEnabled(enabled: true);

      expect(change, isA<AppLockChangeApplied>().having((c) => c.enabled, 'enabled', isTrue));
      expect(gate.isEnabled, isTrue);
      expect(gate.isLocked, isTrue, reason: 'turning the lock on locks');
      expect(
        await harness.securityState.read(LocalSecurityFlag.appLockEnabled),
        isA<SecurityStateValue>().having((v) => v.value, 'value', isTrue),
      );
    });

    test('a REFUSED enable leaves the lock off, in memory as well as on disk', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);
      final AppLockGate gate = harness.container.read(appLockGateProvider);
      await gate.load();

      final AppLockChange change = await gate.setEnabled(enabled: true);

      expect(change, isA<AppLockChangeRejected>());
      final AppLockChangeRejected rejected = change as AppLockChangeRejected;
      expect(rejected.requested, isTrue);
      expect(rejected.retainedEnabled, isFalse);
      expect(rejected.failure, isA<LocalSecurityStateUnavailableFailure>());
      expect(
        gate.isEnabled,
        isFalse,
        reason:
            'THE IN-MEMORY-ONLY LOCK. Reporting this as enabled shows a '
            'protection that does not exist and vanishes at the next launch',
      );
      expect(harness.securityState.writes, isEmpty);
    });

    test('a refused enable does not survive a COLD RESTART either', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);
      final AppLockGate gate = harness.container.read(appLockGateProvider);
      await gate.load();
      await gate.setEnabled(enabled: true);

      // A brand-new gate over the same storage: the process restarted and
      // nothing in memory carried over.
      final AppLockGate restarted = AppLockGate(securityState: harness.securityState);

      expect(
        await restarted.load(),
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isFalse),
        reason:
            'nothing was ever written, so there is nothing to load. The '
            'test above and this one are the same defect seen from two sides',
      );
    });

    test('a REFUSED disable retains the safer ENABLED state', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.enableAppLock();
      final AppLockGate gate = harness.container.read(appLockGateProvider);
      await gate.load();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);

      final AppLockChange change = await gate.setEnabled(enabled: false);

      expect(change, isA<AppLockChangeRejected>());
      final AppLockChangeRejected rejected = change as AppLockChangeRejected;
      expect(rejected.requested, isFalse);
      expect(
        rejected.retainedEnabled,
        isTrue,
        reason:
            'of the two states this could settle into, ON is the safer, and '
            'it is recoverable — the setting can be retried and the lock screen '
            'still offers the password fallback',
      );
      expect(gate.isEnabled, isTrue);
      expect(gate.isDurablyDisabled, isFalse);
    });

    test('a refused disable still reads as ENABLED after a cold restart', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.enableAppLock();
      final AppLockGate gate = harness.container.read(appLockGateProvider);
      await gate.load();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);
      await gate.setEnabled(enabled: false);

      final AppLockGate restarted = AppLockGate(securityState: harness.securityState);

      expect(
        await restarted.load(),
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isTrue),
      );
    });

    test('the retry succeeds once the store recovers', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);
      final AppLockGate gate = harness.container.read(appLockGateProvider);
      await gate.load();
      expect(await gate.setEnabled(enabled: true), isA<AppLockChangeRejected>());

      harness.securityState.unwritableFlags.remove(LocalSecurityFlag.appLockEnabled);
      final AppLockChange retried = await gate.setEnabled(enabled: true);

      expect(retried, isA<AppLockChangeApplied>());
      expect(gate.isEnabled, isTrue);
      final AppLockGate restarted = AppLockGate(securityState: harness.securityState);
      expect(
        await restarted.load(),
        isA<AppLockChoiceKnown>().having((c) => c.enabled, 'enabled', isTrue),
      );
    });
  });

  // THE CONTROLLER AND THE SCREEN CONSUME THE RESULT RATHER THAN ASSUMING IT.
  group('the lock setting renders what the durable state actually did', () {
    test('a refused enable leaves the switch off and says why', () async {
      final ScriptedLocalAuthenticator authenticator = ScriptedLocalAuthenticator();
      final IdentityHarness harness = _harnessWith(authenticator);
      await harness.signInFixture();
      await harness.container.read(appLockControllerProvider.notifier).refresh();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);

      await harness.container
          .read(appLockControllerProvider.notifier)
          .setEnabled(enabled: true, reason: _english.appLockPromptReason);

      final AppLockViewState state = harness.container.read(appLockControllerProvider);
      expect(
        state.isEnabled,
        isFalse,
        reason:
            'the controller used to set this true straight after awaiting '
            'a Future<void> that could not fail',
      );
      expect(state.lastChange, isA<AppLockChangeRejected>());
      expect(state.rejectedEnable, isTrue);
      expect(state.changeFailure, isA<LocalSecurityStateUnavailableFailure>());
      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
    });

    test('a refused disable leaves the switch on and says why', () async {
      final ScriptedLocalAuthenticator authenticator = ScriptedLocalAuthenticator();
      final IdentityHarness harness = _harnessWith(authenticator);
      await harness.signInFixture();
      await harness.enableAppLock();
      await harness.container.read(appLockGateProvider).load();
      await harness.container.read(appLockControllerProvider.notifier).refresh();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);

      await harness.container
          .read(appLockControllerProvider.notifier)
          .setEnabled(enabled: false, reason: _english.appLockPromptReason);

      final AppLockViewState state = harness.container.read(appLockControllerProvider);
      expect(state.isEnabled, isTrue);
      expect(state.lastChange, isA<AppLockChangeRejected>());
      expect(state.rejectedEnable, isFalse);
    });

    testWidgets('the screen shows the failure notice for each direction', (
      WidgetTester tester,
    ) async {
      final ScriptedLocalAuthenticator authenticator = ScriptedLocalAuthenticator();
      final IdentityHarness harness = _harnessWith(authenticator);
      await harness.signInFixture();
      harness.securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);

      await pumpIdentity(tester, const AppLockSettingsScreen(), harness: harness);
      await tester.tap(find.text(_english.appLockToggleLabel));
      await tester.pumpAndSettle();

      expect(
        find.text(_english.appLockEnableNotSaved),
        findsOneWidget,
        reason: 'the switch has not moved and the user is owed the reason',
      );
      expect(find.text(_english.appLockDisableNotSaved), findsNothing);
    });
  });

  group('AppLockBackgroundWatcher', () {
    test('re-locks after the grace period and re-runs startup', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      harness.container.read(appLockGateProvider).markUnlocked();
      final AppLockBackgroundWatcher watcher = harness.container.read(
        appLockBackgroundWatcherProvider,
      );

      watcher.didChangeAppLifecycleState(AppLifecycleState.inactive);
      harness.clock.advance(const Duration(minutes: 5));
      watcher.handleResume();

      expect(watcher.relockCount, 1);
      expect(harness.container.read(appLockGateProvider).isLocked, isTrue);
    });

    test('a brief trip to the share sheet does not re-lock', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      harness.container.read(appLockGateProvider).markUnlocked();
      final AppLockBackgroundWatcher watcher = harness.container.read(
        appLockBackgroundWatcherProvider,
      );

      watcher.didChangeAppLifecycleState(AppLifecycleState.inactive);
      harness.clock.advance(const Duration(seconds: 5));
      watcher.handleResume();

      expect(watcher.relockCount, 0);
      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
    });

    test('takes the FIRST departure from the foreground as the timestamp', () async {
      // iOS passes through `inactive` on its way to `paused`; taking the later
      // timestamp would silently shorten every grace period.
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      harness.container.read(appLockGateProvider).markUnlocked();
      final AppLockBackgroundWatcher watcher = harness.container.read(
        appLockBackgroundWatcherProvider,
      );

      watcher.didChangeAppLifecycleState(AppLifecycleState.inactive);
      harness.clock.advance(const Duration(seconds: 20));
      watcher.didChangeAppLifecycleState(AppLifecycleState.paused);
      harness.clock.advance(const Duration(seconds: 20));
      watcher.handleResume();

      expect(watcher.relockCount, 1);
    });

    test('does nothing when the user never asked for a lock', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      // LOADED FIRST, as the startup sequence does. The gate answers "locked"
      // until the store has been consulted, which is the fail-closed default
      // and is exactly why the watcher asks whether the lock is durably OFF
      // rather than whether it is on.
      await harness.container.read(appLockGateProvider).load();
      final AppLockBackgroundWatcher watcher = harness.container.read(
        appLockBackgroundWatcherProvider,
      );

      watcher.didChangeAppLifecycleState(AppLifecycleState.paused);
      harness.clock.advance(const Duration(hours: 1));
      watcher.handleResume();

      expect(watcher.relockCount, 0);
      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
    });

    test('re-locks when the lock choice cannot be read at all', () async {
      // FAIL CLOSED. An unreadable choice is not "the user never asked for a
      // lock" — it is no answer, and the watcher must not treat the two the
      // same. Re-running startup is what turns it into a state the user sees.
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.enableAppLock();
      await harness.container.read(appLockGateProvider).load();
      harness.container.read(appLockGateProvider).markUnlocked();
      harness.securityState.unreadableFlags.add(LocalSecurityFlag.appLockEnabled);
      await harness.container.read(appLockGateProvider).load();
      final AppLockBackgroundWatcher watcher = harness.container.read(
        appLockBackgroundWatcherProvider,
      );

      watcher.didChangeAppLifecycleState(AppLifecycleState.paused);
      harness.clock.advance(const Duration(hours: 1));
      watcher.handleResume();

      expect(watcher.relockCount, 1);
      expect(harness.container.read(appLockGateProvider).isLocked, isTrue);
    });
  });

  group('the fallback adapter', () {
    test('reports unsupported and never reports success', () async {
      // Bound wherever no platform authenticator can be reached — the test
      // host, and any platform this client is not shipped for. The control
      // degrades to unavailable rather than claiming a lock it cannot enforce.
      // The plugin-backed adapter's own mapping is asserted in
      // platform_local_authenticator_test.dart.
      const UnsupportedLocalAuthenticator authenticator = UnsupportedLocalAuthenticator();

      expect(await authenticator.availability(), LocalAuthAvailability.unsupported);
      expect(await authenticator.authenticate(reason: 'x'), isA<LocalAuthFailed>());
    });
  });

  group('lock screen', () {
    testEveryDirectionAndScale('renders the locked state in the locale direction', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(
        tester,
        const AppLockScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.appLockLockedMessage), findsOneWidget);
      expect(identityButton(l10n.appLockUnlockAction), findsOneWidget);
      // The password fallback is always offered: a broken authenticator must
      // not trap the user behind a lock they cannot open.
      expect(identityButton(l10n.appLockSignInInstead), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(AppLockScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a locked-out device tells the user to use their password', (
      WidgetTester tester,
    ) async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          outcomes: const <LocalAuthOutcome>[LocalAuthFailed(LocalAuthFailureReason.lockedOut)],
        ),
      );
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);

      await pumpIdentity(tester, const AppLockScreen(), harness: harness);
      await tester.pumpAndSettle();
      await tapIdentityButton(tester, l10n.appLockUnlockAction);
      await tester.pumpAndSettle();

      expect(find.text(l10n.appLockLockedOut), findsOneWidget);
    });

    testWidgets('the password fallback actually ends the session', (WidgetTester tester) async {
      // THE TEST ABOVE ASSERTS THE BUTTON EXISTS. THAT WAS NOT ENOUGH.
      //
      // It rendered, it was enabled, it responded to a tap — and it did
      // nothing. The handler called `context.go(RoutePaths.signIn)` while the
      // startup state was still AppLocked, and the single router redirect maps
      // AppLocked to /lock and returns any other location to it. A user whose
      // authenticator had stopped working was trapped, which is the precise
      // outcome the screen's comment promises cannot happen. It was found by
      // running the application; every unit test in this file passed
      // throughout, including one asserting `routeFor(AppLocked()) == /lock`,
      // which is correct and was never the problem.
      //
      // So this presses the button and asserts a CONSEQUENCE rather than a
      // destination: the stored session is gone. That is what makes the
      // password a real fallback — the user is signed out and must
      // authenticate again, rather than stepping around the lock.
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.signInFixture();
      expect(
        harness.secureEntries,
        isNotEmpty,
        reason:
            'the fixture must establish a session, or this test proves '
            'nothing by finding none afterwards',
      );

      await pumpIdentity(tester, const AppLockScreen(), harness: harness);
      await tester.pumpAndSettle();
      await tapIdentityButton(tester, _english.appLockSignInInstead);
      await tester.pumpAndSettle();

      expect(
        harness.secureEntries,
        isEmpty,
        reason:
            'pressing the password fallback must end the session, so the '
            'startup state leaves AppLocked and routing reaches sign-in on its '
            'own. Tokens still in the store mean the button did nothing again.',
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('lock setting', () {
    testEveryDirectionAndScale('explains that the lock is device-only', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(
        tester,
        const AppLockSettingsScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await tester.pumpAndSettle();

      // The copy states plainly that this is not authentication and that no
      // biometric data reaches Karar.
      expect(find.text(l10n.appLockSettingsDescription), findsOneWidget);
      expect(find.text(l10n.appLockToggleLabel), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(AppLockSettingsScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testEveryDirectionAndScale('hides the switch on a device that cannot lock', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(availabilityAnswer: LocalAuthAvailability.unsupported),
      );
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(
        tester,
        const AppLockSettingsScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.appLockUnavailableMessage), findsOneWidget);
      expect(find.text(l10n.appLockToggleLabel), findsNothing);
    });

    testWidgets('an unenrolled device says what to do about it', (WidgetTester tester) async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(availabilityAnswer: LocalAuthAvailability.notEnrolled),
      );
      await harness.signInFixture();

      await pumpIdentity(tester, const AppLockSettingsScreen(), harness: harness);
      await tester.pumpAndSettle();

      expect(find.text(_english.appLockNotEnrolledMessage), findsOneWidget);
    });

    testWidgets('every interactive control carries a name', (WidgetTester tester) async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.signInFixture();
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpIdentity(tester, const AppLockSettingsScreen(), harness: harness);
      await tester.pumpAndSettle();

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  });
}
