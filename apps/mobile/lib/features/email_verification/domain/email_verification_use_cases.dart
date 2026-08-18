// PURE DART ONLY. See email_verification_repository.dart for the shared-kernel
// note.
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';
import 'email_verification_repository.dart';

/// Consumes a verification code.
final class VerifyEmail {
  const VerifyEmail(this._repository);

  final EmailVerificationRepository _repository;

  Future<Result<void>> call({
    required EmailAddress email,
    required OpaqueSecret code,
  }) =>
      _repository.verify(email: email, code: code);
}

/// Requests another verification code.
final class ResendVerification {
  const ResendVerification(this._repository);

  final EmailVerificationRepository _repository;

  Future<Result<NeutralReceipt>> call({required EmailAddress email}) =>
      _repository.resend(email: email);
}
