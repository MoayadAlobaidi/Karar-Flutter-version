// PURE DART ONLY. See password_recovery_repository.dart for the shared-kernel
// note.
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';
import 'password_recovery_repository.dart';

/// Requests a password-reset token.
final class RequestPasswordReset {
  const RequestPasswordReset(this._repository);

  final PasswordRecoveryRepository _repository;

  Future<Result<NeutralReceipt>> call({required EmailAddress email}) =>
      _repository.requestReset(email: email);
}

/// Consumes a reset token and sets a new password.
final class ResetPassword {
  const ResetPassword(this._repository);

  final PasswordRecoveryRepository _repository;

  Future<Result<void>> call({
    required OpaqueSecret token,
    required Password newPassword,
  }) =>
      _repository.resetPassword(token: token, newPassword: newPassword);
}
