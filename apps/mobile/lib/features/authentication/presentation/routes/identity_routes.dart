// The identity route table.
//
// `app/routing/*` is NOT edited. Routes reach the router through
// `featureRoutesProvider`, and gate screens through
// `startupScreenOverridesProvider`; both are declared in
// `app/dependency_injection/providers.dart` as the extension points for
// exactly this.
//
// WHY THE PRE-AUTH ROUTES SIT UNDER `/sign-in`: the startup route resolver
// funnels every non-ready state to the one route for that state, and permits
// that route's own sub-tree. `/sign-in/register` is therefore reachable while
// UNAUTHENTICATED, and `/security/sessions` is not — which is the intended
// behaviour, and it is enforced by the resolver rather than by this file
// remembering to check.
abstract final class IdentityRoutes {
  /// Registration. Beneath the sign-in gate, so it is reachable signed out.
  static const String register = '/sign-in/register';

  /// Requesting a password reset.
  static const String forgotPassword = '/sign-in/forgot-password';

  /// Consuming a reset token. Reached from the e-mail, or by pasting.
  static const String resetPassword = '/sign-in/reset-password';

  /// Verifying an address before signing in, straight after registration.
  static const String verifyEmailPreAuth = '/sign-in/verify-email';

  /// Completing a multi-factor challenge with a recovery code. Beneath the
  /// challenge gate.
  static const String mfaRecovery = '/mfa-challenge/recovery';

  /// The protected security surfaces. Reachable only in READY.
  static const String security = '/security';
  static const String sessions = '/security/sessions';
  static const String changePassword = '/security/password';
  static const String mfa = '/security/two-step';
  static const String mfaDisable = '/security/two-step/turn-off';
  static const String appLock = '/security/app-lock';
}
