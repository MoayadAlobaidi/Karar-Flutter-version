// DATA LAYER. See
// `features/authentication/data/api_authentication_repository.dart` for the
// mapping contract this file follows.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../../core/networking/timeouts.dart';
import '../../authentication/data/session_adoption.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';
import '../domain/password_recovery_repository.dart';

/// [PasswordRecoveryRepository] over the generated client.
final class ApiPasswordRecoveryRepository implements PasswordRecoveryRepository {
  const ApiPasswordRecoveryRepository({
    required KararApiClient client,
    required SessionAdoption adoption,
  })  : _client = client,
        _adoption = adoption;

  final KararApiClient _client;
  final SessionAdoption _adoption;

  @override
  Future<Result<NeutralReceipt>> requestReset({required EmailAddress email}) async {
    try {
      // The response body is read by nobody. Existing, unknown, disabled and
      // cooling-down addresses answer identically and this client keeps them
      // that way.
      await _client.identityForgotPassword(
        body: IdentityForgotPasswordRequestDto(email: email.value),
        timeouts: TimeoutProfile.interactive,
      );
      return const Success<NeutralReceipt>(NeutralReceipt());
    } on ApiException catch (exception) {
      return Failed<NeutralReceipt>(exception.failure);
    } on FormatException {
      return const Failed<NeutralReceipt>(
        ContractViolationFailure(location: 'auth.forgotPassword'),
      );
    } on TypeError {
      return const Failed<NeutralReceipt>(
        ContractViolationFailure(location: 'auth.forgotPassword'),
      );
    }
  }

  @override
  Future<Result<void>> resetPassword({
    required OpaqueSecret token,
    required Password newPassword,
  }) async {
    try {
      await _client.identityResetPassword(
        body: IdentityResetPasswordRequestDto(
          token: token.trimmed,
          newPassword: newPassword.value,
        ),
        timeouts: TimeoutProfile.interactive,
      );
    } on ApiException catch (exception) {
      return Failed<void>(exception.failure);
    } on FormatException {
      return const Failed<void>(ContractViolationFailure(location: 'auth.resetPassword'));
    } on TypeError {
      return const Failed<void>(ContractViolationFailure(location: 'auth.resetPassword'));
    }

    // A completed reset revokes EVERY session and refresh-token family,
    // including any this device is holding. Wiping locally is not tidying up:
    // a credential the server has already killed must not be presented again,
    // and presenting a superseded refresh token is what the platform treats
    // as theft.
    await _adoption.clearLocalCredentials(SessionEndReason.revoked);
    return const Success<void>(null);
  }
}
