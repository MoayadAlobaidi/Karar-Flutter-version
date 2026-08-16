// HOW THE IDENTITY FEATURES REACH THE SHELL.
//
// `app/routing/*` is not edited, and there is no second redirect. This file
// produces the two values the composition root already exposes as extension
// points, and the bootstrap sequence installs them as provider overrides:
//
//     bootstrapKararApp(overrides: identityOverrides());
//
// GATE SCREENS replace the placeholder for a startup stage. The coordinator
// still decides which stage is current; a gate screen only renders it and
// offers its one recovery action.
//
// FEATURE ROUTES are ordinary routes. The pre-authentication ones sit beneath
// `/sign-in` and `/mfa-challenge` because the startup route resolver permits a
// gate route's own sub-tree while that gate is current — so `/sign-in/register`
// is reachable signed out and `/security/sessions` is not, without this file
// checking anything.
import 'package:flutter/widgets.dart';
// `Override` is exported from the misc library rather than the root one.
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:go_router/go_router.dart';

import '../../../../app/dependency_injection/providers.dart';
import '../../../../app/lifecycle/startup_state.dart';
import '../../../../app/routing/app_router.dart';
import '../../../email_verification/presentation/verify_email_screen.dart';
import '../../../mfa/presentation/mfa_challenge_screen.dart';
import '../../../mfa/presentation/mfa_disable_screen.dart';
import '../../../mfa/presentation/mfa_enrolment_screen.dart';
import '../../../password_recovery/presentation/forgot_password_screen.dart';
import '../../../password_recovery/presentation/reset_password_screen.dart';
import '../../../session_management/presentation/app_lock_screen.dart';
import '../../../session_management/presentation/sessions_screen.dart';
import '../screens/change_password_screen.dart';
import '../screens/register_screen.dart';
import '../screens/session_expired_screen.dart';
import '../screens/sign_in_screen.dart';
import 'identity_routes.dart';

/// The startup stages the identity features supply a real screen for.
///
/// TENANT_SELECTION_REQUIRED, BOOTSTRAP_UNAVAILABLE, CONFIG_INVALID and the
/// transient stages are deliberately absent: they belong to other workstreams
/// and keep the shell's placeholder until those land.
Map<StartupStage, StartupScreenBuilder> identityStartupScreens() =>
    <StartupStage, StartupScreenBuilder>{
      StartupStage.unauthenticated: (BuildContext context, StartupState state) =>
          SignInScreen(startupState: state),
      StartupStage.sessionExpired: (BuildContext context, StartupState state) =>
          SessionExpiredScreen(state: state),
      StartupStage.mfaChallengeRequired: (BuildContext context, StartupState state) =>
          const MfaChallengeScreen(),
      StartupStage.emailVerificationRequired:
          (BuildContext context, StartupState state) => const VerifyEmailScreen(),
      StartupStage.appLocked: (BuildContext context, StartupState state) =>
          const AppLockScreen(),
    };

/// The identity routes.
List<RouteBase> identityRoutes() => <RouteBase>[
      GoRoute(
        path: IdentityRoutes.register,
        builder: (BuildContext context, GoRouterState state) => const RegisterScreen(),
      ),
      GoRoute(
        path: IdentityRoutes.forgotPassword,
        builder: (BuildContext context, GoRouterState state) =>
            const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: IdentityRoutes.resetPassword,
        builder: (BuildContext context, GoRouterState state) => ResetPasswordScreen(
          // A reset token may arrive in the link. It is read straight into the
          // field and never stored; the query string is not logged, because
          // the transport logs no URLs with query values.
          initialToken: state.uri.queryParameters['token'],
        ),
      ),
      GoRoute(
        path: IdentityRoutes.verifyEmailPreAuth,
        builder: (BuildContext context, GoRouterState state) =>
            VerifyEmailScreen(onBack: () => context.pop()),
      ),
      GoRoute(
        path: IdentityRoutes.sessions,
        builder: (BuildContext context, GoRouterState state) => const SessionsScreen(),
      ),
      GoRoute(
        path: IdentityRoutes.changePassword,
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
      GoRoute(
        path: IdentityRoutes.mfa,
        builder: (BuildContext context, GoRouterState state) =>
            const MfaEnrolmentScreen(),
      ),
      GoRoute(
        path: IdentityRoutes.mfaDisable,
        builder: (BuildContext context, GoRouterState state) => const MfaDisableScreen(),
      ),
      GoRoute(
        path: IdentityRoutes.appLock,
        builder: (BuildContext context, GoRouterState state) =>
            const AppLockSettingsScreen(),
      ),
    ];

/// The provider overrides that install the identity features.
///
/// Composed with other workstreams' overrides by the bootstrap caller. A
/// workstream that also contributes routes must merge rather than replace;
/// [mergeIdentityInto] does that for the common case.
List<Override> identityOverrides() => <Override>[
      startupScreenOverridesProvider.overrideWithValue(identityStartupScreens()),
      featureRoutesProvider.overrideWithValue(identityRoutes()),
    ];

/// Merges the identity contributions with another workstream's.
///
/// Later entries win on a stage collision, which makes the precedence explicit
/// at the call site instead of depending on override ordering.
List<Override> mergeIdentityInto({
  Map<StartupStage, StartupScreenBuilder> screens =
      const <StartupStage, StartupScreenBuilder>{},
  List<RouteBase> routes = const <RouteBase>[],
}) =>
    <Override>[
      startupScreenOverridesProvider.overrideWithValue(
        <StartupStage, StartupScreenBuilder>{...identityStartupScreens(), ...screens},
      ),
      featureRoutesProvider.overrideWithValue(<RouteBase>[
        ...identityRoutes(),
        ...routes,
      ]),
    ];
