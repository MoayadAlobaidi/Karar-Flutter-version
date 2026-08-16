// PURE DART ONLY. See value_objects/email_address.dart for the shared-kernel
// note.
import '../../../../core/errors/result.dart';
import '../entities/authentication_outcome.dart';
import '../entities/neutral_receipt.dart';
import '../value_objects/email_address.dart';
import '../value_objects/password.dart';

/// The identity operations that establish or end a session.
///
/// Every method returns a value. Nothing here throws for an expected outcome,
/// and no implementation lets an `ApiException` escape.
abstract interface class AuthenticationRepository {
  /// Registers an account and asks the platform to send a verification code.
  ///
  /// Answers [NeutralReceipt] for a new address AND for one already
  /// registered. The implementation must not distinguish them.
  Future<Result<NeutralReceipt>> register({
    required EmailAddress email,
    required Password password,
  });

  /// Signs in.
  ///
  /// On success the implementation has already adopted the session credential
  /// into secure storage, or retained the multi-factor challenge token in
  /// memory; the returned outcome carries neither.
  Future<Result<AuthenticationOutcome>> signIn({
    required EmailAddress email,
    required Password password,
  });

  /// Revokes the current session server-side and clears local credentials.
  ///
  /// Local state is cleared even when the network call fails: a credential the
  /// user asked to be rid of must stop being used regardless of whether the
  /// server was reachable.
  Future<Result<void>> signOut();

  /// Changes the password.
  ///
  /// The server revokes every OTHER session and bumps the token version; this
  /// session's refresh chain stays valid.
  Future<Result<void>> changePassword({
    required OpaqueSecret currentPassword,
    required Password newPassword,
  });
}
