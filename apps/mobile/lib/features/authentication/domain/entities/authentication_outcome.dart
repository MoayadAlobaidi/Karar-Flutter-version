// PURE DART ONLY. See value_objects/email_address.dart for the shared-kernel
// note.
//
// NO TOKEN MATERIAL CROSSES THIS TYPE.
//
// Sign-in answers with either a session or a multi-factor challenge, and both
// answers carry a credential on the wire. Neither credential appears here: the
// repository implementation hands the session to `SessionManager` and the
// challenge token to the in-memory challenge store, both of which live in the
// data layer, and returns only the non-secret facts the UI needs. A token
// therefore cannot reach view state, a log, a screenshot, or an error dump,
// because it never exists above the data layer at all.
import 'package:meta/meta.dart';

/// What a sign-in produced.
@immutable
sealed class AuthenticationOutcome {
  const AuthenticationOutcome();
}

/// A session was established and adopted.
final class SessionEstablished extends AuthenticationOutcome {
  const SessionEstablished(this.sessionId);

  /// Opaque session identifier. Non-secret by contract; safe to log.
  final String sessionId;

  @override
  String toString() => 'SessionEstablished($sessionId)';
}

/// The account has confirmed multi-factor authentication, so the server issued
/// a short-lived challenge instead of a session.
final class MfaChallengeIssued extends AuthenticationOutcome {
  const MfaChallengeIssued({required this.expiresAt});

  /// When the challenge stops being redeemable. The contract states five
  /// minutes; the value is read from the response rather than assumed.
  final DateTime expiresAt;

  @override
  String toString() => 'MfaChallengeIssued(expiresAt: ${expiresAt.toIso8601String()})';
}
