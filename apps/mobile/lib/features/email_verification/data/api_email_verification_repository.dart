// DATA LAYER. See
// `features/authentication/data/api_authentication_repository.dart` for the
// mapping contract this file follows.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../../core/networking/timeouts.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';
import '../domain/email_verification_repository.dart';

/// [EmailVerificationRepository] over the generated client.
final class ApiEmailVerificationRepository implements EmailVerificationRepository {
  const ApiEmailVerificationRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<void>> verify({
    required EmailAddress email,
    required OpaqueSecret code,
  }) async {
    try {
      await _client.identityVerifyEmail(
        body: IdentityVerifyEmailRequestDto(
          email: email.value,
          code: code.trimmed,
        ),
        timeouts: TimeoutProfile.interactive,
      );
      // The body states `{status: verified}` and carries nothing else worth
      // reading. Verifying an already-verified account is an idempotent
      // success by contract, so a second tap is not an error.
      return const Success<void>(null);
    } on ApiException catch (exception) {
      return Failed<void>(exception.failure);
    } on FormatException {
      return const Failed<void>(ContractViolationFailure(location: 'auth.verifyEmail'));
    } on TypeError {
      return const Failed<void>(ContractViolationFailure(location: 'auth.verifyEmail'));
    }
  }

  @override
  Future<Result<NeutralReceipt>> resend({required EmailAddress email}) async {
    try {
      // As with registration, the response body is read by nobody: unknown,
      // already-verified, disabled and cooling-down addresses are one answer
      // and this client keeps them that way.
      await _client.identityResendVerification(
        body: IdentityResendVerificationRequestDto(email: email.value),
        timeouts: TimeoutProfile.interactive,
      );
      return const Success<NeutralReceipt>(NeutralReceipt());
    } on ApiException catch (exception) {
      return Failed<NeutralReceipt>(exception.failure);
    } on FormatException {
      return const Failed<NeutralReceipt>(
        ContractViolationFailure(location: 'auth.resendVerification'),
      );
    } on TypeError {
      return const Failed<NeutralReceipt>(
        ContractViolationFailure(location: 'auth.resendVerification'),
      );
    }
  }
}
