// PURE DART ONLY.
//
// Every route the shell knows about. Gate routes are owned by the startup
// coordinator: one per startup state, siblings of each other so that no gate
// route is a prefix of another and prefix matching stays unambiguous.
//
// Feature routes live under [home] and are contributed by feature workstreams;
// see `app/dependency_injection/providers.dart`.
abstract final class RoutePaths {
  /// Transient progress. The destination for every in-flight startup state.
  static const String startup = '/startup';

  /// Build configuration is invalid. Terminal for this launch.
  static const String configurationError = '/configuration-error';

  /// The application lock is engaged.
  static const String lock = '/lock';

  /// Signed out. Sign-up and password recovery live beneath this path.
  static const String signIn = '/sign-in';

  /// The address needs verifying before anything else.
  static const String verifyEmail = '/verify-email';

  /// A multi-factor challenge is outstanding.
  static const String mfaChallenge = '/mfa-challenge';

  /// A tenant must be chosen, or an invitation redeemed.
  static const String tenantSelection = '/tenant-selection';

  /// The bootstrap context could not be resolved.
  static const String serviceUnavailable = '/service-unavailable';

  /// A session ended and the principal must sign in again.
  static const String sessionExpired = '/session-expired';

  /// The protected root. Reachable only in the ready state.
  static const String home = '/';

  /// Routes the startup coordinator controls.
  static const Set<String> gateRoutes = <String>{
    startup,
    configurationError,
    lock,
    signIn,
    verifyEmail,
    mfaChallenge,
    tenantSelection,
    serviceUnavailable,
    sessionExpired,
  };
}
