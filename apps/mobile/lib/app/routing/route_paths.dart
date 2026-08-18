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

  /// Local security state could not be established, so no security gate can
  /// be evaluated.
  ///
  /// A sibling of [lock] and [signIn] rather than a path beneath either. The
  /// state exists precisely because the client cannot tell whether the lock
  /// applies, so nesting it under the lock would assert the thing it cannot
  /// assert — and prefix matching in the single redirect would let a launch
  /// oscillate between the two.
  static const String securityUnavailable = '/security-unavailable';

  /// A credential was given up and neither its destruction nor its
  /// abandonment could be confirmed.
  ///
  /// Kept apart from [signIn] on purpose: signing in here would be the client
  /// claiming the old session was safely abandoned, which is the one thing
  /// this state means it cannot claim.
  static const String securityRecovery = '/security-recovery';

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
    securityUnavailable,
    securityRecovery,
    lock,
    signIn,
    verifyEmail,
    mfaChallenge,
    tenantSelection,
    serviceUnavailable,
    sessionExpired,
  };
}
