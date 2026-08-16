// PURE DART ONLY. See mfa_entities.dart for the shared-kernel note.
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/authentication_outcome.dart';
import '../../authentication/domain/value_objects/password.dart';
import 'mfa_entities.dart';

/// Multi-factor enrolment, challenge and removal.
abstract interface class MfaRepository {
  /// Whether a login-issued challenge is outstanding, and until when.
  ///
  /// Synchronous and local: the answer is held in memory by the data layer,
  /// never fetched and never persisted.
  MfaChallengeStatus challengeStatus();

  /// Starts TOTP enrolment. The returned secret is issued exactly once.
  Future<Result<MfaEnrolment>> startEnrolment();

  /// Proves possession of the secret and activates multi-factor
  /// authentication. The returned recovery codes are issued exactly once.
  Future<Result<MfaRecoveryCodes>> confirmEnrolment({required OpaqueSecret code});

  /// Completes an outstanding challenge with a current TOTP code.
  ///
  /// On success the implementation has adopted the session credential; the
  /// returned outcome carries no token.
  Future<Result<SessionEstablished>> completeChallengeWithTotp({
    required OpaqueSecret code,
  });

  /// Completes an outstanding challenge with a one-time recovery code.
  Future<Result<SessionEstablished>> completeChallengeWithRecoveryCode({
    required OpaqueSecret recoveryCode,
  });

  /// Disables multi-factor authentication, destroying the recovery-code set.
  Future<Result<void>> disable({required OpaqueSecret code});

  /// Forgets an outstanding challenge, for a user who abandons the flow.
  void discardChallenge();
}
