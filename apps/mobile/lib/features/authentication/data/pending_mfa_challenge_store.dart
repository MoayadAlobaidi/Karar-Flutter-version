// DATA LAYER.
//
// THE MULTI-FACTOR CHALLENGE TOKEN LIVES HERE AND NOWHERE ELSE.
//
// Sign-in against an account with confirmed MFA returns a challenge token
// instead of a session. It is a bearer credential with a five-minute life, so:
//
//   * it is held in memory only — never secure storage, never preferences,
//     never a file, never a log, never the clipboard. It is not a session
//     credential, and persisting it would create a second thing to protect
//     across a relaunch for no benefit: a relaunch mid-challenge should send
//     the user back to sign-in, which is what dropping it achieves;
//   * it never reaches the domain, the presentation layer, or view state.
//     Screens learn only that a challenge is outstanding and when it expires,
//     via `MfaChallengeStatus`;
//   * `toString` reports presence, never material.
//
// The store is process-scoped and owned by the composition root, so the
// sign-in repository that writes it and the MFA repository that reads it are
// looking at the same instance.
import '../../mfa/domain/mfa_entities.dart';

/// Holds an outstanding multi-factor challenge for the minutes it lives.
final class PendingMfaChallengeStore {
  PendingMfaChallengeStore();

  String? _token;
  DateTime? _expiresAt;

  /// Records a challenge issued by sign-in, replacing any earlier one.
  void remember({required String token, required DateTime expiresAt}) {
    _token = token;
    _expiresAt = expiresAt.toUtc();
  }

  /// The challenge token, or null when none is outstanding.
  ///
  /// Deliberately package-visible in practice: only the MFA repository calls
  /// it, and it is the single point where the material is read.
  String? get token => _token;

  /// What a screen is allowed to know.
  MfaChallengeStatus get status {
    final DateTime? expiry = _expiresAt;
    if (_token == null || expiry == null) {
      return const MfaChallengeStatus.none();
    }
    return MfaChallengeStatus.outstanding(expiresAt: expiry);
  }

  /// Drops the challenge. Called when it is redeemed, when it expires, and
  /// when the user abandons the flow.
  void discard() {
    _token = null;
    _expiresAt = null;
  }

  @override
  String toString() => 'PendingMfaChallengeStore(outstanding: ${_token != null})';
}
