// PURE DART ONLY.
//
// The state-to-route mapping, as a pure function, so it can be exhaustively
// tested without a widget tree.
//
// NO REDIRECT LOOPS, by construction: [redirect] returns null whenever the
// current location already satisfies the state, and the value it returns
// always satisfies the state it was computed from. A redirect therefore
// converges in exactly one hop, and a test asserts that for every state.
import '../lifecycle/startup_state.dart';
import 'route_paths.dart';

/// Maps startup states onto routes.
final class StartupRouteResolver {
  const StartupRouteResolver();

  /// The single destination for [state].
  ///
  /// The switch is exhaustive over the sealed state hierarchy: adding a
  /// startup state without giving it a route will not compile.
  String routeFor(StartupState state) => switch (state) {
        ConfigLoading() || SessionRestoring() || BootstrapLoading() => RoutePaths.startup,
        ConfigInvalid() => RoutePaths.configurationError,
        LocalSecurityStateUnavailable() => RoutePaths.securityUnavailable,
        SecurityRecoveryBlocked() => RoutePaths.securityRecovery,
        AppLocked() => RoutePaths.lock,
        Unauthenticated() => RoutePaths.signIn,
        SessionExpired() => RoutePaths.sessionExpired,
        MfaChallengeRequired() => RoutePaths.mfaChallenge,
        EmailVerificationRequired() => RoutePaths.verifyEmail,
        TenantSelectionPending() => RoutePaths.tenantSelection,
        BootstrapUnavailable() => RoutePaths.serviceUnavailable,
        Ready() => RoutePaths.home,
      };

  /// The location to redirect to, or null to stay put.
  ///
  /// Two rules, and no others:
  ///   * READY — gate routes bounce to the protected root; anything else is
  ///     the feature routers' business and is left alone.
  ///   * NOT READY — everything funnels to the one route for the state. Its
  ///     own sub-tree is permitted so a gate can have steps (sign-up and
  ///     password recovery beneath sign-in, for instance).
  String? redirect(StartupState state, String location) {
    final target = routeFor(state);
    if (state.isReady) {
      return _isGateRoute(location) ? target : null;
    }
    if (location == target) {
      return null;
    }
    if (target != RoutePaths.home && location.startsWith('$target/')) {
      return null;
    }
    return target;
  }

  bool _isGateRoute(String location) {
    for (final route in RoutePaths.gateRoutes) {
      if (location == route || location.startsWith('$route/')) {
        return true;
      }
    }
    return false;
  }
}
