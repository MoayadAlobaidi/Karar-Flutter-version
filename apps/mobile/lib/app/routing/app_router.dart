// The router.
//
// Route SELECTION is not made here. `StartupRouteResolver` decides, from the
// coordinator's state, and this file only wires that decision into GoRouter.
// The single `redirect` below is the only redirect in the application; a
// feature that adds another reintroduces exactly the class of bug the startup
// coordinator exists to prevent.
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../lifecycle/startup_coordinator.dart';
import '../lifecycle/startup_listenable.dart';
import '../lifecycle/startup_state.dart';
import 'route_paths.dart';
import 'startup_gate_screens.dart';
import 'startup_route_resolver.dart';

/// Builder for a gate screen, supplied by a feature workstream.
typedef StartupScreenBuilder = Widget Function(BuildContext context, StartupState state);

/// Builds the application router.
GoRouter buildAppRouter({
  required StartupListenable startup,
  required StartupCoordinator coordinator,
  StartupRouteResolver resolver = const StartupRouteResolver(),
  Map<StartupStage, StartupScreenBuilder> screenOverrides =
      const <StartupStage, StartupScreenBuilder>{},
  List<RouteBase> featureRoutes = const <RouteBase>[],
  StartupScreenBuilder? homeBuilder,
}) {
  Widget buildGate(BuildContext context, StartupStage stage) {
    final state = startup.state;
    final override = screenOverrides[stage];
    if (override != null) {
      return override(context, state);
    }
    return StartupGateScreen(
      state: state,
      onRecover: _recoveryAction(coordinator, state),
    );
  }

  GoRoute gateRoute(String path, StartupStage stage) => GoRoute(
        path: path,
        builder: (BuildContext context, GoRouterState _) => buildGate(context, stage),
      );

  return GoRouter(
    initialLocation: RoutePaths.startup,
    refreshListenable: startup,
    redirect: (BuildContext context, GoRouterState state) =>
        resolver.redirect(startup.state, state.matchedLocation),
    routes: <RouteBase>[
      gateRoute(RoutePaths.startup, StartupStage.configLoading),
      gateRoute(RoutePaths.configurationError, StartupStage.configInvalid),
      gateRoute(
        RoutePaths.securityUnavailable,
        StartupStage.localSecurityStateUnavailable,
      ),
      gateRoute(RoutePaths.securityRecovery, StartupStage.securityRecoveryBlocked),
      gateRoute(RoutePaths.lock, StartupStage.appLocked),
      gateRoute(RoutePaths.signIn, StartupStage.unauthenticated),
      gateRoute(RoutePaths.verifyEmail, StartupStage.emailVerificationRequired),
      gateRoute(RoutePaths.mfaChallenge, StartupStage.mfaChallengeRequired),
      gateRoute(RoutePaths.tenantSelection, StartupStage.tenantSelectionRequired),
      gateRoute(RoutePaths.serviceUnavailable, StartupStage.bootstrapUnavailable),
      gateRoute(RoutePaths.sessionExpired, StartupStage.sessionExpired),
      GoRoute(
        path: RoutePaths.home,
        builder: (BuildContext context, GoRouterState _) =>
            homeBuilder?.call(context, startup.state) ?? const ReadyPlaceholderScreen(),
      ),
      ...featureRoutes,
    ],
    // An unknown location resolves to whatever the startup state permits,
    // rather than to a dead end.
    errorBuilder: (BuildContext context, GoRouterState _) =>
        buildGate(context, startup.state.stage),
  );
}

/// The one action a gate screen offers, wired to the coordinator.
///
/// Three cases yield no action, each for its own reason:
///   * `correctBuildConfiguration` — not recoverable at runtime. Offering a
///     retry button would be a lie; the configuration is compiled in.
///   * `waitForCoordinator` / `none` — nothing for the user to do.
///   * `authenticate`, `completeVerification`, `completeChallenge`,
///     `selectTenant` — these belong to a feature. The placeholder cannot
///     perform them; the screen that replaces it supplies the real action.
VoidCallback? _recoveryAction(StartupCoordinator coordinator, StartupState state) =>
    switch (state.recovery) {
      StartupRecovery.restart => () => unawaited(coordinator.start()),
      StartupRecovery.unlockApplication => () => unawaited(coordinator.unlock()),
      StartupRecovery.retryBootstrap => () => unawaited(coordinator.retryBootstrap()),
      // Both security recoveries are real actions the coordinator can perform
      // with no feature involved, so the placeholder gate screen offers them
      // even before a product screen exists. A blocked security state with no
      // button would be a dead end, which is the one thing the state machine
      // does not permit.
      StartupRecovery.retrySecurityState => () => unawaited(coordinator.start()),
      StartupRecovery.retrySecurityRecovery => () =>
          unawaited(coordinator.retrySecurityRecovery()),
      StartupRecovery.correctBuildConfiguration ||
      StartupRecovery.authenticate ||
      StartupRecovery.completeVerification ||
      StartupRecovery.completeChallenge ||
      StartupRecovery.selectTenant ||
      StartupRecovery.waitForCoordinator ||
      StartupRecovery.none =>
        null,
    };
