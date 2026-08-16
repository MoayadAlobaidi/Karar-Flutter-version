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
import 'package:karar_mobile/core/security/app_lock.dart';
import 'package:karar_mobile/features/authentication/presentation/localization/identity_strings.dart';
import 'package:karar_mobile/features/session_management/data/platform_local_authenticator.dart';
import 'package:karar_mobile/features/session_management/domain/app_lock.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_providers.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_screen.dart';

import '../authentication/support/identity_harness.dart';

IdentityHarness _harnessWith(ScriptedLocalAuthenticator authenticator) =>
    IdentityHarness(
      overrides: <Override>[
        localAuthenticatorProvider.overrideWithValue(authenticator),
      ],
    );

void main() {
  group('AppLockPolicy', () {
    test('re-locks once the grace period has elapsed', () {
      const AppLockPolicy policy = AppLockPolicy(backgroundGrace: Duration(seconds: 30));
      final DateTime away = DateTime.utc(2026, 1, 1, 12);

      expect(
        policy.shouldRelock(
          backgroundedAt: away,
          now: away.add(const Duration(seconds: 29)),
        ),
        isFalse,
        reason: 'a share sheet or a password-manager hand-off must not re-lock',
      );
      expect(
        policy.shouldRelock(
          backgroundedAt: away,
          now: away.add(const Duration(seconds: 30)),
        ),
        isTrue,
      );
    });

    test('re-locks when the device clock appears to move backwards', () {
      // FAIL CLOSED: the user can change the device time, and an interval this
      // client cannot interpret is read as "lock".
      const AppLockPolicy policy = AppLockPolicy();
      final DateTime away = DateTime.utc(2026, 1, 1, 12);

      expect(
        policy.shouldRelock(
          backgroundedAt: away,
          now: away.subtract(const Duration(hours: 1)),
        ),
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
        ScriptedLocalAuthenticator(
          availabilityAnswer: LocalAuthAvailability.unsupported,
        ),
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

      await harness.container.read(appLockControllerProvider.notifier).setEnabled(
            enabled: true,
            reason: IdentityStrings.english.appLockPromptReason,
          );

      final AppLockViewState state = harness.container.read(appLockControllerProvider);
      expect(state.requiresSession, isTrue);
      expect(state.isEnabled, isFalse);
      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
    });

    test('FAILS CLOSED: a refused prompt does not enable the lock', () async {
      // Otherwise the next launch would present a lock nobody can open.
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          outcomes: const <LocalAuthOutcome>[LocalAuthCancelled()],
        ),
      );
      await harness.signInFixture();
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container.read(appLockControllerProvider.notifier).setEnabled(
            enabled: true,
            reason: IdentityStrings.english.appLockPromptReason,
          );

      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
      expect(
        harness.container.read(appLockControllerProvider).lastOutcome,
        isA<LocalAuthCancelled>(),
      );
    });

    test('enables the lock only after the device has just authenticated',
        () async {
      final ScriptedLocalAuthenticator authenticator = ScriptedLocalAuthenticator();
      final IdentityHarness harness = _harnessWith(authenticator);
      await harness.signInFixture();
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container.read(appLockControllerProvider.notifier).setEnabled(
            enabled: true,
            reason: IdentityStrings.english.appLockPromptReason,
          );

      expect(authenticator.promptCount, 1);
      expect(harness.container.read(appLockGateProvider).isEnabled, isTrue);
      // The prompt sentence came from the localized catalogue, not a literal.
      expect(authenticator.reasons.single, IdentityStrings.english.appLockPromptReason);
    });

    test('stands the choice down when the device can no longer satisfy it',
        () async {
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

      await harness.container.read(appLockControllerProvider.notifier).unlock(
            reason: IdentityStrings.english.appLockPromptReason,
          );

      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
      // Proving presence to the DEVICE grants nothing server-side.
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
      expect(harness.secureEntries, isEmpty);
    });

    test('a failed unlock leaves the gate engaged', () async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          outcomes: const <LocalAuthOutcome>[
            LocalAuthFailed(LocalAuthFailureReason.notRecognised),
          ],
        ),
      );
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);

      await harness.container.read(appLockControllerProvider.notifier).unlock(
            reason: IdentityStrings.english.appLockPromptReason,
          );

      expect(harness.container.read(appLockGateProvider).isLocked, isTrue);
    });

    test('turning the lock off leaves this process open', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.signInFixture();
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      await harness.container.read(appLockControllerProvider.notifier).refresh();

      await harness.container.read(appLockControllerProvider.notifier).setEnabled(
            enabled: false,
            reason: IdentityStrings.english.appLockPromptReason,
          );

      expect(harness.container.read(appLockGateProvider).isEnabled, isFalse);
      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
    });
  });

  group('AppLockBackgroundWatcher', () {
    test('re-locks after the grace period and re-runs startup', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.container.read(appLockGateProvider).setEnabled(enabled: true);
      harness.container.read(appLockGateProvider).markUnlocked();
      final AppLockBackgroundWatcher watcher =
          harness.container.read(appLockBackgroundWatcherProvider);

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
      final AppLockBackgroundWatcher watcher =
          harness.container.read(appLockBackgroundWatcherProvider);

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
      final AppLockBackgroundWatcher watcher =
          harness.container.read(appLockBackgroundWatcherProvider);

      watcher.didChangeAppLifecycleState(AppLifecycleState.inactive);
      harness.clock.advance(const Duration(seconds: 20));
      watcher.didChangeAppLifecycleState(AppLifecycleState.paused);
      harness.clock.advance(const Duration(seconds: 20));
      watcher.handleResume();

      expect(watcher.relockCount, 1);
    });

    test('does nothing when the user never asked for a lock', () async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      final AppLockBackgroundWatcher watcher =
          harness.container.read(appLockBackgroundWatcherProvider);

      watcher.didChangeAppLifecycleState(AppLifecycleState.paused);
      harness.clock.advance(const Duration(hours: 1));
      watcher.handleResume();

      expect(watcher.relockCount, 0);
      expect(harness.container.read(appLockGateProvider).isLocked, isFalse);
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
      expect(
        await authenticator.authenticate(reason: 'x'),
        isA<LocalAuthFailed>(),
      );
    });
  });

  group('lock screen', () {
    testEveryDirectionAndScale('renders the locked state in the locale direction',
        (WidgetTester tester, Locale locale, double textScale) async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      final IdentityStrings strings = locale.languageCode == 'ar'
          ? IdentityStrings.arabic
          : IdentityStrings.english;

      await pumpIdentity(tester, const AppLockScreen(),
          harness: harness, locale: locale, textScale: textScale);
      await tester.pumpAndSettle();

      expect(find.text(strings.appLockLockedMessage), findsOneWidget);
      expect(identityButton(strings.appLockUnlockAction), findsOneWidget);
      // The password fallback is always offered: a broken authenticator must
      // not trap the user behind a lock they cannot open.
      expect(identityButton(strings.appLockSignInInstead), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(AppLockScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a locked-out device tells the user to use their password',
        (WidgetTester tester) async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          outcomes: const <LocalAuthOutcome>[
            LocalAuthFailed(LocalAuthFailureReason.lockedOut),
          ],
        ),
      );
      const IdentityStrings strings = IdentityStrings.english;

      await pumpIdentity(tester, const AppLockScreen(), harness: harness);
      await tester.pumpAndSettle();
      await tapIdentityButton(tester, strings.appLockUnlockAction);
      await tester.pumpAndSettle();

      expect(find.text(strings.appLockLockedOut), findsOneWidget);
    });
  });

  group('lock setting', () {
    testEveryDirectionAndScale('explains that the lock is device-only',
        (WidgetTester tester, Locale locale, double textScale) async {
      final IdentityHarness harness = _harnessWith(ScriptedLocalAuthenticator());
      await harness.signInFixture();
      final IdentityStrings strings = locale.languageCode == 'ar'
          ? IdentityStrings.arabic
          : IdentityStrings.english;

      await pumpIdentity(tester, const AppLockSettingsScreen(),
          harness: harness, locale: locale, textScale: textScale);
      await tester.pumpAndSettle();

      // The copy states plainly that this is not authentication and that no
      // biometric data reaches Karar.
      expect(find.text(strings.appLockSettingsDescription), findsOneWidget);
      expect(find.text(strings.appLockToggleLabel), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(AppLockSettingsScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testEveryDirectionAndScale('hides the switch on a device that cannot lock',
        (WidgetTester tester, Locale locale, double textScale) async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          availabilityAnswer: LocalAuthAvailability.unsupported,
        ),
      );
      await harness.signInFixture();
      final IdentityStrings strings = locale.languageCode == 'ar'
          ? IdentityStrings.arabic
          : IdentityStrings.english;

      await pumpIdentity(tester, const AppLockSettingsScreen(),
          harness: harness, locale: locale, textScale: textScale);
      await tester.pumpAndSettle();

      expect(find.text(strings.appLockUnavailableMessage), findsOneWidget);
      expect(find.text(strings.appLockToggleLabel), findsNothing);
    });

    testWidgets('an unenrolled device says what to do about it',
        (WidgetTester tester) async {
      final IdentityHarness harness = _harnessWith(
        ScriptedLocalAuthenticator(
          availabilityAnswer: LocalAuthAvailability.notEnrolled,
        ),
      );
      await harness.signInFixture();

      await pumpIdentity(tester, const AppLockSettingsScreen(), harness: harness);
      await tester.pumpAndSettle();

      expect(
        find.text(IdentityStrings.english.appLockNotEnrolledMessage),
        findsOneWidget,
      );
    });

    testWidgets('every interactive control carries a name',
        (WidgetTester tester) async {
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
