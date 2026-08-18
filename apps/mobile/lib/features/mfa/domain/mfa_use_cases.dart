// PURE DART ONLY. See mfa_entities.dart for the shared-kernel note.
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/authentication_outcome.dart';
import '../../authentication/domain/value_objects/password.dart';
import 'mfa_entities.dart';
import 'mfa_repository.dart';

/// Starts TOTP enrolment.
final class StartMfaEnrolment {
  const StartMfaEnrolment(this._repository);

  final MfaRepository _repository;

  Future<Result<MfaEnrolment>> call() => _repository.startEnrolment();
}

/// Confirms enrolment and receives the recovery codes.
final class ConfirmMfaEnrolment {
  const ConfirmMfaEnrolment(this._repository);

  final MfaRepository _repository;

  Future<Result<MfaRecoveryCodes>> call({required OpaqueSecret code}) =>
      _repository.confirmEnrolment(code: code);
}

/// Completes a login challenge with a TOTP code.
final class CompleteMfaChallenge {
  const CompleteMfaChallenge(this._repository);

  final MfaRepository _repository;

  Future<Result<SessionEstablished>> call({required OpaqueSecret code}) =>
      _repository.completeChallengeWithTotp(code: code);
}

/// Completes a login challenge with a one-time recovery code.
final class UseRecoveryCode {
  const UseRecoveryCode(this._repository);

  final MfaRepository _repository;

  Future<Result<SessionEstablished>> call({required OpaqueSecret recoveryCode}) =>
      _repository.completeChallengeWithRecoveryCode(recoveryCode: recoveryCode);
}

/// Disables multi-factor authentication.
final class DisableMfa {
  const DisableMfa(this._repository);

  final MfaRepository _repository;

  Future<Result<void>> call({required OpaqueSecret code}) =>
      _repository.disable(code: code);
}

/// Reads whether a challenge is outstanding.
final class ReadMfaChallengeStatus {
  const ReadMfaChallengeStatus(this._repository);

  final MfaRepository _repository;

  MfaChallengeStatus call() => _repository.challengeStatus();
}
