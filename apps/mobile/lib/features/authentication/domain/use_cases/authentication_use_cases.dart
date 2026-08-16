// PURE DART ONLY. See value_objects/email_address.dart for the shared-kernel
// note.
//
// A use case takes a repository port and returns `Future<Result<T>>`. It never
// sees a status code, a DTO, a `BuildContext` or a `Ref`.
import '../../../../core/errors/result.dart';
import '../entities/authentication_outcome.dart';
import '../entities/neutral_receipt.dart';
import '../repositories/authentication_repository.dart';
import '../value_objects/email_address.dart';
import '../value_objects/password.dart';

/// Registers an account.
final class RegisterAccount {
  const RegisterAccount(this._repository);

  final AuthenticationRepository _repository;

  Future<Result<NeutralReceipt>> call({
    required EmailAddress email,
    required Password password,
  }) =>
      _repository.register(email: email, password: password);
}

/// Signs in with a password.
final class SignIn {
  const SignIn(this._repository);

  final AuthenticationRepository _repository;

  Future<Result<AuthenticationOutcome>> call({
    required EmailAddress email,
    required Password password,
  }) =>
      _repository.signIn(email: email, password: password);
}

/// Ends the current session.
final class SignOut {
  const SignOut(this._repository);

  final AuthenticationRepository _repository;

  Future<Result<void>> call() => _repository.signOut();
}

/// Changes the password of the signed-in account.
final class ChangePassword {
  const ChangePassword(this._repository);

  final AuthenticationRepository _repository;

  Future<Result<void>> call({
    required OpaqueSecret currentPassword,
    required Password newPassword,
  }) =>
      _repository.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
}
