// How the identity features attach to the shell, and the guarantees that
// attachment has to preserve.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/app/routing/app_router.dart';
import 'package:karar_mobile/app/routing/route_paths.dart';
import 'package:karar_mobile/app/routing/startup_route_resolver.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/features/authentication/presentation/localization/identity_strings.dart';
import 'package:karar_mobile/features/authentication/presentation/routes/identity_module.dart';
import 'package:karar_mobile/features/authentication/presentation/routes/identity_routes.dart';
import 'package:karar_mobile/features/authentication/presentation/widgets/sensitive_screen.dart';

import 'support/identity_harness.dart';

void main() {
  group('gate screens', () {
    test('supplies a real screen for every identity startup stage', () {
      final Map<StartupStage, StartupScreenBuilder> screens = identityStartupScreens();

      expect(
        screens.keys,
        containsAll(<StartupStage>[
          StartupStage.unauthenticated,
          StartupStage.sessionExpired,
          StartupStage.mfaChallengeRequired,
          StartupStage.emailVerificationRequired,
          StartupStage.appLocked,
        ]),
      );
    });

    test('claims no stage that belongs to another workstream', () {
      final Map<StartupStage, StartupScreenBuilder> screens = identityStartupScreens();

      // Tenant selection, bootstrap failure and configuration are not this
      // workstream's to answer; overriding them would silently displace the
      // screens that own them.
      expect(screens.containsKey(StartupStage.tenantSelectionRequired), isFalse);
      expect(screens.containsKey(StartupStage.bootstrapUnavailable), isFalse);
      expect(screens.containsKey(StartupStage.configInvalid), isFalse);
      expect(screens.containsKey(StartupStage.ready), isFalse);
    });
  });

  group('routes', () {
    test('registers each identity route exactly once', () {
      final List<String> paths = identityRoutes()
          .whereType<GoRoute>()
          .map((GoRoute route) => route.path)
          .toList();

      expect(paths.toSet(), hasLength(paths.length));
      expect(
        paths,
        containsAll(<String>[
          IdentityRoutes.register,
          IdentityRoutes.forgotPassword,
          IdentityRoutes.resetPassword,
          IdentityRoutes.verifyEmailPreAuth,
          IdentityRoutes.sessions,
          IdentityRoutes.changePassword,
          IdentityRoutes.mfa,
          IdentityRoutes.mfaDisable,
          IdentityRoutes.appLock,
        ]),
      );
    });

    test('the pre-authentication routes are reachable while signed out', () {
      // The shell's resolver permits a gate route's own sub-tree, which is why
      // these live beneath /sign-in rather than at the top level.
      const StartupRouteResolver resolver = StartupRouteResolver();
      const Unauthenticated state = Unauthenticated();

      for (final String path in <String>[
        IdentityRoutes.register,
        IdentityRoutes.forgotPassword,
        IdentityRoutes.resetPassword,
        IdentityRoutes.verifyEmailPreAuth,
      ]) {
        expect(
          resolver.redirect(state, path),
          isNull,
          reason: '$path must be reachable while unauthenticated',
        );
      }
    });

    test('the protected routes are refused while signed out', () {
      const StartupRouteResolver resolver = StartupRouteResolver();
      const Unauthenticated state = Unauthenticated();

      for (final String path in <String>[
        IdentityRoutes.sessions,
        IdentityRoutes.changePassword,
        IdentityRoutes.mfa,
        IdentityRoutes.mfaDisable,
        IdentityRoutes.appLock,
      ]) {
        expect(
          resolver.redirect(state, path),
          RoutePaths.signIn,
          reason: '$path must not render without a session',
        );
      }
    });

    test('the protected routes render in READY and nowhere else', () {
      const StartupRouteResolver resolver = StartupRouteResolver();

      for (final StartupState blocked in <StartupState>[
        const SessionExpired(SessionEndReason.expired),
        const MfaChallengeRequired(),
        const EmailVerificationRequired(),
        const AppLocked(),
      ]) {
        expect(
          resolver.redirect(blocked, IdentityRoutes.sessions),
          isNotNull,
          reason: 'sessions must not render in ${blocked.stage.name}',
        );
      }
    });

    test('merging keeps both workstreams contributions', () {
      final List<Object?> merged = mergeIdentityInto(
        screens: <StartupStage, StartupScreenBuilder>{
          StartupStage.tenantSelectionRequired:
              (BuildContext context, StartupState state) => const SizedBox.shrink(),
        },
        routes: <RouteBase>[
          GoRoute(
            path: '/elsewhere',
            builder: (BuildContext context, GoRouterState state) =>
                const SizedBox.shrink(),
          ),
        ],
      );

      expect(merged, hasLength(2));
    });
  });

  group('sensitive content', () {
    testWidgets('covers its subtree the moment the application leaves the foreground',
        (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();

      await pumpIdentity(
        tester,
        const SensitiveScreen(child: Center(child: _SecretText())),
        harness: harness,
      );
      expect(find.byType(_SecretText), findsOneWidget);
      expect(find.byKey(SensitiveScreen.coverKey), findsNothing);
      expect(_coverExcludesSemantics(tester), isFalse);

      // iOS photographs the frame at `inactive`, not at `paused`, which is why
      // the cover engages there.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();

      expect(find.byKey(SensitiveScreen.coverKey), findsOneWidget);
      expect(
        _coverExcludesSemantics(tester),
        isTrue,
        reason: 'the covered content must also leave the semantics tree',
      );
      expect(
        find.text(IdentityStrings.english.a11ySensitiveScreen, skipOffstage: false),
        findsNothing,
        reason: 'the cover announces itself by label, not by rendered text',
      );

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();

      expect(find.byKey(SensitiveScreen.coverKey), findsNothing);
      expect(_coverExcludesSemantics(tester), isFalse);
    });
  });

  group('screenshot artifacts', () {
    test('no identity test commits a golden baseline', () {
      // A golden is a committed image of whatever was on screen. The MFA setup
      // key, the recovery codes and the session list must never be captured
      // into one, so the guarantee is enforced here rather than remembered.
      final Directory tests = Directory('test/features');
      expect(tests.existsSync(), isTrue);

      final List<String> offenders = <String>[];
      for (final FileSystemEntity entity in tests.listSync(recursive: true)) {
        if (entity is File && entity.path.endsWith('.dart')) {
          // This file names the matcher in order to forbid it, so it is the
          // one file the scan skips.
          if (entity.path.endsWith('identity_module_test.dart')) {
            continue;
          }
          final String source = entity.readAsStringSync();
          if (source.contains('matchesGoldenFile')) {
            offenders.add(entity.path);
          }
        }
        if (entity is Directory && entity.path.endsWith('goldens')) {
          offenders.add(entity.path);
        }
      }

      expect(offenders, isEmpty);
    });
  });
}

/// Whether the sensitive subtree is currently hidden from assistive
/// technology. Scoped to the widget under test so an unrelated
/// `ExcludeSemantics` elsewhere in the shell cannot answer for it.
bool _coverExcludesSemantics(WidgetTester tester) => tester
    .widget<ExcludeSemantics>(
      find.descendant(
        of: find.byType(SensitiveScreen),
        matching: find.byType(ExcludeSemantics),
      ).first,
    )
    .excluding;

class _SecretText extends StatelessWidget {
  const _SecretText();

  @override
  Widget build(BuildContext context) => const Text('JBSWY3DPEHPK3PXP');
}
