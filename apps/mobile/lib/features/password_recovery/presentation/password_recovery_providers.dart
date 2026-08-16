// PRESENTATION — composition and controllers for password recovery.
//
// See `features/authentication/presentation/controllers/authentication_controllers.dart`
// for the view-state rules these controllers follow.
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/neutral_receipt.dart';
import '../../authentication/domain/value_objects/email_address.dart';
import '../../authentication/domain/value_objects/password.dart';
import '../../authentication/presentation/controllers/authentication_controllers.dart';
import '../../authentication/presentation/providers/authentication_providers.dart';
import '../data/api_password_recovery_repository.dart';
import '../domain/password_recovery_repository.dart';
import '../domain/password_recovery_use_cases.dart';

final Provider<PasswordRecoveryRepository> passwordRecoveryRepositoryProvider =
    Provider<PasswordRecoveryRepository>(
  (Ref ref) => ApiPasswordRecoveryRepository(
    client: ref.watch(apiClientProvider),
    adoption: ref.watch(sessionAdoptionProvider),
  ),
);

final Provider<RequestPasswordReset> requestPasswordResetUseCaseProvider =
    Provider<RequestPasswordReset>(
  (Ref ref) => RequestPasswordReset(ref.watch(passwordRecoveryRepositoryProvider)),
);

final Provider<ResetPassword> resetPasswordUseCaseProvider = Provider<ResetPassword>(
  (Ref ref) => ResetPassword(ref.watch(passwordRecoveryRepositoryProvider)),
);

/// What the forgot-password screen renders.
@immutable
final class ForgotPasswordViewState {
  const ForgotPasswordViewState({
    this.isSubmitting = false,
    this.emailViolation,
    this.failure,
    this.receipt,
  });

  const ForgotPasswordViewState.submitting()
      : isSubmitting = true,
        emailViolation = null,
        failure = null,
        receipt = null;

  const ForgotPasswordViewState.invalid(EmailViolation this.emailViolation)
      : isSubmitting = false,
        failure = null,
        receipt = null;

  const ForgotPasswordViewState.failed(Failure this.failure)
      : isSubmitting = false,
        emailViolation = null,
        receipt = null;

  /// Accepted. Carries nothing: existing, unknown, disabled and cooling-down
  /// addresses are one answer and this client keeps them that way.
  const ForgotPasswordViewState.acknowledged()
      : isSubmitting = false,
        emailViolation = null,
        failure = null,
        receipt = const NeutralReceipt();

  final bool isSubmitting;
  final EmailViolation? emailViolation;
  final Failure? failure;
  final NeutralReceipt? receipt;

  bool get isAcknowledged => receipt != null;

  @override
  String toString() => 'ForgotPasswordViewState(acknowledged: $isAcknowledged)';
}

/// Drives the forgot-password screen.
final class ForgotPasswordController extends Notifier<ForgotPasswordViewState> {
  @override
  ForgotPasswordViewState build() => const ForgotPasswordViewState();

  String get rememberedEmail => ref.read(signInEmailMemoProvider).address?.value ?? '';

  Future<void> submit({required String email}) async {
    if (state.isSubmitting) {
      return;
    }
    final EmailCheck emailCheck = EmailAddress.parse(email);
    if (emailCheck is EmailRejected) {
      state = ForgotPasswordViewState.invalid(emailCheck.violation);
      return;
    }
    final EmailAddress address = (emailCheck as EmailAccepted).email;
    ref.read(signInEmailMemoProvider).remember(address);

    state = const ForgotPasswordViewState.submitting();
    final Result<NeutralReceipt> outcome =
        await ref.read(requestPasswordResetUseCaseProvider)(email: address);
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<NeutralReceipt>(:final failure) => ForgotPasswordViewState.failed(failure),
      Success<NeutralReceipt>() => const ForgotPasswordViewState.acknowledged(),
    };
  }
}

final NotifierProvider<ForgotPasswordController, ForgotPasswordViewState>
    forgotPasswordControllerProvider =
    NotifierProvider.autoDispose<ForgotPasswordController, ForgotPasswordViewState>(
  ForgotPasswordController.new,
);

/// What the reset-password screen renders.
@immutable
final class ResetPasswordViewState {
  const ResetPasswordViewState({
    this.isSubmitting = false,
    this.tokenMissing = false,
    this.passwordViolation,
    this.confirmationMismatch = false,
    this.failure,
    this.isReset = false,
  });

  const ResetPasswordViewState.submitting()
      : isSubmitting = true,
        tokenMissing = false,
        passwordViolation = null,
        confirmationMismatch = false,
        failure = null,
        isReset = false;

  const ResetPasswordViewState.invalid({
    this.tokenMissing = false,
    this.passwordViolation,
    this.confirmationMismatch = false,
  })  : isSubmitting = false,
        failure = null,
        isReset = false;

  const ResetPasswordViewState.failed(Failure this.failure)
      : isSubmitting = false,
        tokenMissing = false,
        passwordViolation = null,
        confirmationMismatch = false,
        isReset = false;

  const ResetPasswordViewState.reset()
      : isSubmitting = false,
        tokenMissing = false,
        passwordViolation = null,
        confirmationMismatch = false,
        failure = null,
        isReset = true;

  final bool isSubmitting;
  final bool tokenMissing;
  final PasswordViolation? passwordViolation;
  final bool confirmationMismatch;
  final Failure? failure;
  final bool isReset;

  @override
  String toString() => 'ResetPasswordViewState(reset: $isReset)';
}

/// Drives the reset-password screen.
final class ResetPasswordController extends Notifier<ResetPasswordViewState> {
  @override
  ResetPasswordViewState build() => const ResetPasswordViewState();

  Future<void> submit({
    required String token,
    required String newPassword,
    required String confirmation,
  }) async {
    if (state.isSubmitting) {
      return;
    }
    final OpaqueSecret resetToken = OpaqueSecret(token);
    final PasswordCheck passwordCheck =
        ref.read(passwordPolicyProvider).parse(newPassword);
    final bool mismatch = newPassword != confirmation;
    if (resetToken.isEmpty || passwordCheck is PasswordRejected || mismatch) {
      state = ResetPasswordViewState.invalid(
        tokenMissing: resetToken.isEmpty,
        passwordViolation:
            passwordCheck is PasswordRejected ? passwordCheck.violation : null,
        confirmationMismatch: mismatch,
      );
      return;
    }

    state = const ResetPasswordViewState.submitting();
    final Result<void> outcome = await ref.read(resetPasswordUseCaseProvider)(
      token: resetToken,
      newPassword: (passwordCheck as PasswordAccepted).password,
    );
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<void>(:final failure) => ResetPasswordViewState.failed(failure),
      Success<void>() => const ResetPasswordViewState.reset(),
    };
  }
}

final NotifierProvider<ResetPasswordController, ResetPasswordViewState>
    resetPasswordControllerProvider =
    NotifierProvider.autoDispose<ResetPasswordController, ResetPasswordViewState>(
  ResetPasswordController.new,
);
