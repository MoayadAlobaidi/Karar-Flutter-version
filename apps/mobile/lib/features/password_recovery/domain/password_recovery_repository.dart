// PURE DART ONLY.
//
// This feature imports `features/authentication/domain` — the shared kernel of
// the identity bounded context. See
// features/email_verification/domain/email_verification_repository.dart.
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';

/// Requesting and completing a password reset.
abstract interface class PasswordRecoveryRepository {
  /// Asks the platform to send a reset token.
  ///
  /// Answers [NeutralReceipt] for existing, unknown, disabled and cooling-down
  /// addresses alike. The implementation must not distinguish them.
  Future<Result<NeutralReceipt>> requestReset({required EmailAddress email});

  /// Consumes a reset token and sets a new password.
  ///
  /// Completing a reset revokes EVERY session, including this client's, so the
  /// caller must clear local credentials afterwards rather than assume the one
  /// it holds survived.
  Future<Result<void>> resetPassword({
    required OpaqueSecret token,
    required Password newPassword,
  });
}
