// PRESENTATION — composition and controllers for e-mail verification.
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
import '../data/api_email_verification_repository.dart';
import '../domain/email_verification_repository.dart';
import '../domain/email_verification_use_cases.dart';

final Provider<EmailVerificationRepository> emailVerificationRepositoryProvider =
    Provider<EmailVerificationRepository>(
  (Ref ref) => ApiEmailVerificationRepository(ref.watch(apiClientProvider)),
);

final Provider<VerifyEmail> verifyEmailUseCaseProvider = Provider<VerifyEmail>(
  (Ref ref) => VerifyEmail(ref.watch(emailVerificationRepositoryProvider)),
);

final Provider<ResendVerification> resendVerificationUseCaseProvider =
    Provider<ResendVerification>(
  (Ref ref) => ResendVerification(ref.watch(emailVerificationRepositoryProvider)),
);

/// What the verification screen renders.
@immutable
final class VerifyEmailViewState {
  const VerifyEmailViewState({
    this.isSubmitting = false,
    this.isResending = false,
    this.emailViolation,
    this.codeMissing = false,
    this.failure,
    this.isVerified = false,
    this.resendReceipt,
  });

  const VerifyEmailViewState.submitting()
      : isSubmitting = true,
        isResending = false,
        emailViolation = null,
        codeMissing = false,
        failure = null,
        isVerified = false,
        resendReceipt = null;

  const VerifyEmailViewState.resending()
      : isSubmitting = false,
        isResending = true,
        emailViolation = null,
        codeMissing = false,
        failure = null,
        isVerified = false,
        resendReceipt = null;

  const VerifyEmailViewState.invalid({this.emailViolation, this.codeMissing = false})
      : isSubmitting = false,
        isResending = false,
        failure = null,
        isVerified = false,
        resendReceipt = null;

  const VerifyEmailViewState.failed(Failure this.failure)
      : isSubmitting = false,
        isResending = false,
        emailViolation = null,
        codeMissing = false,
        isVerified = false,
        resendReceipt = null;

  const VerifyEmailViewState.verified()
      : isSubmitting = false,
        isResending = false,
        emailViolation = null,
        codeMissing = false,
        failure = null,
        isVerified = true,
        resendReceipt = null;

  /// A resend was accepted. Carries nothing: unknown, already-verified,
  /// disabled and cooling-down addresses are one answer.
  const VerifyEmailViewState.resent()
      : isSubmitting = false,
        isResending = false,
        emailViolation = null,
        codeMissing = false,
        failure = null,
        isVerified = false,
        resendReceipt = const NeutralReceipt();

  final bool isSubmitting;
  final bool isResending;
  final EmailViolation? emailViolation;
  final bool codeMissing;
  final Failure? failure;
  final bool isVerified;
  final NeutralReceipt? resendReceipt;

  bool get isBusy => isSubmitting || isResending;

  bool get hasResendAcknowledgement => resendReceipt != null;

  @override
  String toString() => 'VerifyEmailViewState(verified: $isVerified)';
}

/// Drives the verification screen.
final class VerifyEmailController extends Notifier<VerifyEmailViewState> {
  @override
  VerifyEmailViewState build() => const VerifyEmailViewState();

  /// The address to prefill, when one was entered earlier this launch.
  String get rememberedEmail => ref.read(signInEmailMemoProvider).address?.value ?? '';

  Future<void> submit({required String email, required String code}) async {
    if (state.isBusy) {
      return;
    }
    final EmailCheck emailCheck = EmailAddress.parse(email);
    final OpaqueSecret secret = OpaqueSecret(code);
    if (emailCheck is EmailRejected || secret.isEmpty) {
      state = VerifyEmailViewState.invalid(
        emailViolation: emailCheck is EmailRejected ? emailCheck.violation : null,
        codeMissing: secret.isEmpty,
      );
      return;
    }

    state = const VerifyEmailViewState.submitting();
    final Result<void> outcome = await ref.read(verifyEmailUseCaseProvider)(
      email: (emailCheck as EmailAccepted).email,
      code: secret,
    );
    if (!ref.mounted) {
      return;
    }
    switch (outcome) {
      case Failed<void>(:final failure):
        state = VerifyEmailViewState.failed(failure);
      case Success<void>():
        state = const VerifyEmailViewState.verified();
        // Re-reads the bootstrap context, which is what moves the startup
        // state off the verification gate. Harmless when the user reached
        // this screen unauthenticated: the coordinator finds no session and
        // routes to sign-in, which is where they need to go next anyway.
        await ref.read(startupCoordinatorProvider).onEmailVerified();
    }
  }

  Future<void> resend({required String email}) async {
    if (state.isBusy) {
      return;
    }
    final EmailCheck emailCheck = EmailAddress.parse(email);
    if (emailCheck is EmailRejected) {
      state = VerifyEmailViewState.invalid(emailViolation: emailCheck.violation);
      return;
    }

    state = const VerifyEmailViewState.resending();
    final Result<NeutralReceipt> outcome = await ref.read(
      resendVerificationUseCaseProvider,
    )(email: (emailCheck as EmailAccepted).email);
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<NeutralReceipt>(:final failure) => VerifyEmailViewState.failed(failure),
      Success<NeutralReceipt>() => const VerifyEmailViewState.resent(),
    };
  }
}

final NotifierProvider<VerifyEmailController, VerifyEmailViewState>
    verifyEmailControllerProvider =
    NotifierProvider.autoDispose<VerifyEmailController, VerifyEmailViewState>(
  VerifyEmailController.new,
);
