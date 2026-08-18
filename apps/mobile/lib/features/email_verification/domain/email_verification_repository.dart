// PURE DART ONLY.
//
// This feature imports `features/authentication/domain` — the shared kernel of
// the identity bounded context. The dependency runs one way: satellites depend
// on the kernel, never the reverse. Everything reached across that boundary is
// pure Dart.
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';

/// Consuming and re-sending an e-mail verification code.
abstract interface class EmailVerificationRepository {
  /// Consumes a one-time code.
  ///
  /// Verifying an already-verified account is an idempotent success by
  /// contract, so a user who taps twice is not shown an error.
  Future<Result<void>> verify({
    required EmailAddress email,
    required OpaqueSecret code,
  });

  /// Asks for another code.
  ///
  /// Answers [NeutralReceipt] for unknown, already-verified, disabled and
  /// cooling-down addresses alike. The implementation must not distinguish
  /// them.
  Future<Result<NeutralReceipt>> resend({required EmailAddress email});
}
