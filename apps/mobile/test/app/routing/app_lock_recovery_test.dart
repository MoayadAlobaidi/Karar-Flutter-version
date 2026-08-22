// RECOVERING FROM A LOCK YOU CANNOT OPEN, THROUGH THE REAL ROUTER.
//
// The application lock is a local privacy control, and a user whose device
// authenticator has stopped working — no enrolment, failed hardware, a
// biometric lockout that outlives their patience — must still be able to reach
// their account with a password. The lock screen offers exactly that.
//
// It did not work, and no test noticed, because every test that touched it
// asserted at the wrong level. The handler called `context.go(RoutePaths.
// signIn)` while the startup state was still `AppLocked`; the single router
// redirect maps `AppLocked` to `/lock` and returns any other location to it,
// so the button rendered, enabled, responded to a tap, and put the user back
// on the screen they pressed it on. The widget test asserted the button
// EXISTED. The resolver test asserted `routeFor(AppLocked()) == /lock`, which
// is correct and was never the defect. The defect lived in the gap between
// them, and only a composed router shows it.
//
// So this file composes the REAL router — the real redirect, over the real
// startup coordinator, reached through the real feature surface — and asserts
// where a user actually ends up. Every other test here can pass while the
// application traps its users; this one cannot.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/composition/feature_surface.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/app/routing/route_paths.dart';
import 'package:karar_mobile/features/session_management/data/platform_local_authenticator.dart';
import 'package:karar_mobile/features/session_management/domain/app_lock.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../../features/authentication/support/identity_harness.dart';

final AppLocalizations _english = lookupAppLocalizations(KararLocalization.english);

/// The location the router is actually showing.
String _locationOf(GoRouter router) => router.routerDelegate.currentConfiguration.uri.path;

void main() {
  group('a locked launch can still reach sign-in', () {
    late IdentityHarness harness;
    late GoRouter router;

    /// Brings the application up exactly as a locked launch does: a stored
    /// session, the lock preference on, and the coordinator started.
    Future<void> launchLocked(WidgetTester tester) async {
      harness = IdentityHarness(
        overrides: <Override>[
          ...featureSurfaceOverrides(),
          localAuthenticatorProvider.overrideWithValue(
            // Never answers, which is the situation under test: an
            // authenticator that cannot be satisfied.
            ScriptedLocalAuthenticator(
              outcomes: const <LocalAuthOutcome>[
                LocalAuthFailed(LocalAuthFailureReason.unavailable),
              ],
            ),
          ),
        ],
      );

      await harness.enableAppLock();
      await harness.signInFixture();

      // No tear-down here: `routerProvider` registers its own `onDispose`, and
      // the harness disposes the container. Disposing it again from the test
      // throws after the body has already passed.
      router = harness.container.read(routerProvider);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: harness.container,
          child: MaterialApp.router(
            routerConfig: router,
            locale: KararLocalization.english,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: KararLocalization.supportedLocales,
          ),
        ),
      );

      await harness.container.read(startupCoordinatorProvider).start();
      await tester.pumpAndSettle();
    }

    testWidgets('the lock gate is reached before anything protected', (WidgetTester tester) async {
      await launchLocked(tester);

      expect(
        harness.container.read(startupCoordinatorProvider).state,
        isA<AppLocked>(),
        reason:
            'the fixture must actually lock, or the test below proves '
            'nothing by escaping a lock that was never applied',
      );
      expect(_locationOf(router), RoutePaths.lock);
    });

    testWidgets('pressing the password fallback lands on sign-in', (WidgetTester tester) async {
      await launchLocked(tester);
      expect(_locationOf(router), RoutePaths.lock);

      await tester.tap(find.text(_english.appLockSignInInstead));
      await tester.pumpAndSettle();

      // THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT.
      //
      // With the broken handler this is still `/lock`: the redirect returns
      // the user immediately and the tap looks like it did nothing.
      expect(
        _locationOf(router),
        RoutePaths.signIn,
        reason:
            'the password fallback must reach sign-in. Still being on '
            '${RoutePaths.lock} means the redirect returned the user to the '
            'lock, which is the trap this test exists for.',
      );
      expect(
        harness.container.read(startupCoordinatorProvider).state,
        isA<Unauthenticated>(),
        reason:
            'reaching sign-in by navigation alone would be a screen the '
            'redirect happens not to have bounced yet; the state itself must '
            'have left AppLocked',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('the escape clears the session rather than stepping around it', (
      WidgetTester tester,
    ) async {
      await launchLocked(tester);
      expect(
        harness.secureEntries,
        isNotEmpty,
        reason: 'the fixture must establish stored session material',
      );

      await tester.tap(find.text(_english.appLockSignInInstead));
      await tester.pumpAndSettle();

      // The lock must not be a thing a user can step past into an
      // authenticated session. The way out is to stop being signed in.
      expect(
        harness.secureEntries,
        isEmpty,
        reason:
            'tokens left in the store would mean the lock was bypassed '
            'rather than abandoned',
      );
    });

    testWidgets('protected content is not reachable after the escape', (WidgetTester tester) async {
      await launchLocked(tester);
      await tester.tap(find.text(_english.appLockSignInInstead));
      await tester.pumpAndSettle();

      // Ask the router directly for the protected root. The redirect must
      // refuse it, because the state is Unauthenticated rather than Ready.
      router.go(RoutePaths.home);
      await tester.pumpAndSettle();

      expect(
        _locationOf(router),
        RoutePaths.signIn,
        reason: 'an unauthenticated caller reached the protected root',
      );
    });
  });
}
