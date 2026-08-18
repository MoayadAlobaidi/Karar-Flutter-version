// PRESENTATION — view state and controllers.
//
// VIEW STATE HOLDS NO SECRET. Passwords, codes and tokens live in the
// `TextEditingController` of the field the user is typing into and are read
// once, at submit. They are never copied into a state object, because state
// objects reach `toString`, error dumps and test failure output.
//
// VIEW STATE HOLDS NO LOCALIZED STRING either. It carries the typed violation
// or `Failure`, and the screen resolves the message for the active locale at
// build time. A state holding a resolved string would go stale the moment the
// user changed language.
//
// State is rebuilt, never mutated: each transition is a fresh instance
// produced by a named constructor, so an accidental partial update is not
// expressible.
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/dependency_injection/providers.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/errors/result.dart';
import '../../data/sign_in_email_memo.dart';
import '../../domain/entities/authentication_outcome.dart';
import '../../domain/entities/neutral_receipt.dart';
import '../../domain/value_objects/email_address.dart';
import '../../domain/value_objects/password.dart';
import '../providers/authentication_providers.dart';

/// What the sign-in screen renders.
@immutable
final class SignInViewState {
  const SignInViewState({
    this.isSubmitting = false,
    this.emailViolation,
    this.passwordViolation,
    this.failure,
  });

  const SignInViewState.submitting()
      : isSubmitting = true,
        emailViolation = null,
        passwordViolation = null,
        failure = null;

  const SignInViewState.invalid({this.emailViolation, this.passwordViolation})
      : isSubmitting = false,
        failure = null;

  const SignInViewState.failed(Failure this.failure)
      : isSubmitting = false,
        emailViolation = null,
        passwordViolation = null;

  final bool isSubmitting;
  final EmailViolation? emailViolation;
  final PasswordViolation? passwordViolation;
  final Failure? failure;

  @override
  String toString() => 'SignInViewState(submitting: $isSubmitting)';
}

/// Drives the sign-in screen.
final class SignInController extends Notifier<SignInViewState> {
  @override
  SignInViewState build() => const SignInViewState();

  /// Validates and submits.
  ///
  /// A second call while the first is in flight is ignored: a double-tapped
  /// sign-in would spend two attempts against the platform's per-address
  /// budget for one user intention.
  Future<void> submit({required String email, required String password}) async {
    if (state.isSubmitting) {
      return;
    }
    final EmailCheck emailCheck = EmailAddress.parse(email);
    final PasswordCheck passwordCheck = ref.read(passwordPolicyProvider).parse(password);
    if (emailCheck is EmailRejected || passwordCheck is PasswordRejected) {
      state = SignInViewState.invalid(
        emailViolation: emailCheck is EmailRejected ? emailCheck.violation : null,
        passwordViolation:
            passwordCheck is PasswordRejected ? passwordCheck.violation : null,
      );
      return;
    }
    final EmailAddress address = (emailCheck as EmailAccepted).email;
    ref.read(signInEmailMemoProvider).remember(address);

    state = const SignInViewState.submitting();
    final Result<AuthenticationOutcome> outcome = await ref.read(signInUseCaseProvider)(
      email: address,
      password: (passwordCheck as PasswordAccepted).password,
    );
    if (!ref.mounted) {
      return;
    }
    switch (outcome) {
      case Failed<AuthenticationOutcome>(:final failure):
        state = SignInViewState.failed(failure);
      case Success<AuthenticationOutcome>(:final value):
        state = const SignInViewState();
        // The coordinator decides what comes next. This screen does not
        // navigate, and must not: there is exactly one redirect in the
        // application and it is driven from the startup state.
        switch (value) {
          case SessionEstablished():
            await ref.read(startupCoordinatorProvider).onAuthenticated();
          case MfaChallengeIssued():
            ref.read(startupCoordinatorProvider).onMfaChallengeRequired();
        }
    }
  }
}

final NotifierProvider<SignInController, SignInViewState> signInControllerProvider =
    NotifierProvider.autoDispose<SignInController, SignInViewState>(
  SignInController.new,
);

/// The in-memory address memo. See `data/sign_in_email_memo.dart`.
final Provider<SignInEmailMemo> signInEmailMemoProvider =
    Provider<SignInEmailMemo>((Ref ref) => SignInEmailMemo());

/// What the registration screen renders.
@immutable
final class RegisterViewState {
  const RegisterViewState({
    this.isSubmitting = false,
    this.emailViolation,
    this.passwordViolation,
    this.confirmationMismatch = false,
    this.failure,
    this.receipt,
  });

  const RegisterViewState.submitting()
      : isSubmitting = true,
        emailViolation = null,
        passwordViolation = null,
        confirmationMismatch = false,
        failure = null,
        receipt = null;

  const RegisterViewState.invalid({
    this.emailViolation,
    this.passwordViolation,
    this.confirmationMismatch = false,
  })  : isSubmitting = false,
        failure = null,
        receipt = null;

  const RegisterViewState.failed(Failure this.failure)
      : isSubmitting = false,
        emailViolation = null,
        passwordViolation = null,
        confirmationMismatch = false,
        receipt = null;

  /// The acknowledged state. [receipt] carries nothing, by design: it is the
  /// same value whether or not the address was already registered.
  const RegisterViewState.acknowledged()
      : isSubmitting = false,
        emailViolation = null,
        passwordViolation = null,
        confirmationMismatch = false,
        failure = null,
        receipt = const NeutralReceipt();

  final bool isSubmitting;
  final EmailViolation? emailViolation;
  final PasswordViolation? passwordViolation;
  final bool confirmationMismatch;
  final Failure? failure;
  final NeutralReceipt? receipt;

  bool get isAcknowledged => receipt != null;

  @override
  String toString() => 'RegisterViewState(acknowledged: $isAcknowledged)';
}

/// Drives the registration screen.
final class RegisterController extends Notifier<RegisterViewState> {
  @override
  RegisterViewState build() => const RegisterViewState();

  Future<void> submit({
    required String email,
    required String password,
    required String confirmation,
  }) async {
    if (state.isSubmitting) {
      return;
    }
    final EmailCheck emailCheck = EmailAddress.parse(email);
    final PasswordCheck passwordCheck = ref.read(passwordPolicyProvider).parse(password);
    final bool mismatch = password != confirmation;
    if (emailCheck is EmailRejected || passwordCheck is PasswordRejected || mismatch) {
      state = RegisterViewState.invalid(
        emailViolation: emailCheck is EmailRejected ? emailCheck.violation : null,
        passwordViolation:
            passwordCheck is PasswordRejected ? passwordCheck.violation : null,
        confirmationMismatch: mismatch,
      );
      return;
    }
    final EmailAddress address = (emailCheck as EmailAccepted).email;
    ref.read(signInEmailMemoProvider).remember(address);

    state = const RegisterViewState.submitting();
    final Result<NeutralReceipt> outcome = await ref.read(registerAccountProvider)(
      email: address,
      password: (passwordCheck as PasswordAccepted).password,
    );
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<NeutralReceipt>(:final failure) => RegisterViewState.failed(failure),
      Success<NeutralReceipt>() => const RegisterViewState.acknowledged(),
    };
  }
}

final NotifierProvider<RegisterController, RegisterViewState> registerControllerProvider =
    NotifierProvider.autoDispose<RegisterController, RegisterViewState>(
  RegisterController.new,
);

/// What the change-password screen renders.
@immutable
final class ChangePasswordViewState {
  const ChangePasswordViewState({
    this.isSubmitting = false,
    this.currentMissing = false,
    this.passwordViolation,
    this.confirmationMismatch = false,
    this.failure,
    this.isChanged = false,
  });

  const ChangePasswordViewState.submitting()
      : isSubmitting = true,
        currentMissing = false,
        passwordViolation = null,
        confirmationMismatch = false,
        failure = null,
        isChanged = false;

  const ChangePasswordViewState.invalid({
    this.currentMissing = false,
    this.passwordViolation,
    this.confirmationMismatch = false,
  })  : isSubmitting = false,
        failure = null,
        isChanged = false;

  const ChangePasswordViewState.failed(Failure this.failure)
      : isSubmitting = false,
        currentMissing = false,
        passwordViolation = null,
        confirmationMismatch = false,
        isChanged = false;

  const ChangePasswordViewState.changed()
      : isSubmitting = false,
        currentMissing = false,
        passwordViolation = null,
        confirmationMismatch = false,
        failure = null,
        isChanged = true;

  final bool isSubmitting;
  final bool currentMissing;
  final PasswordViolation? passwordViolation;
  final bool confirmationMismatch;
  final Failure? failure;
  final bool isChanged;

  @override
  String toString() => 'ChangePasswordViewState(changed: $isChanged)';
}

/// Drives the change-password screen.
final class ChangePasswordController extends Notifier<ChangePasswordViewState> {
  @override
  ChangePasswordViewState build() => const ChangePasswordViewState();

  Future<void> submit({
    required String currentPassword,
    required String newPassword,
    required String confirmation,
  }) async {
    if (state.isSubmitting) {
      return;
    }
    // The CURRENT password is not policed. It may predate the present policy,
    // and a client rule stricter than the server's would lock out a user with
    // a legitimate password.
    final OpaqueSecret current = OpaqueSecret(currentPassword);
    final PasswordCheck passwordCheck =
        ref.read(passwordPolicyProvider).parse(newPassword);
    final bool mismatch = newPassword != confirmation;
    if (current.isEmpty || passwordCheck is PasswordRejected || mismatch) {
      state = ChangePasswordViewState.invalid(
        currentMissing: current.isEmpty,
        passwordViolation:
            passwordCheck is PasswordRejected ? passwordCheck.violation : null,
        confirmationMismatch: mismatch,
      );
      return;
    }

    state = const ChangePasswordViewState.submitting();
    final Result<void> outcome = await ref.read(changePasswordUseCaseProvider)(
      currentPassword: current,
      newPassword: (passwordCheck as PasswordAccepted).password,
    );
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<void>(:final failure) => ChangePasswordViewState.failed(failure),
      Success<void>() => const ChangePasswordViewState.changed(),
    };
  }
}

final NotifierProvider<ChangePasswordController, ChangePasswordViewState>
    changePasswordControllerProvider =
    NotifierProvider.autoDispose<ChangePasswordController, ChangePasswordViewState>(
  ChangePasswordController.new,
);

/// What the sign-out action reports.
@immutable
final class SignOutViewState {
  const SignOutViewState({this.isSubmitting = false, this.incompleteFailure});

  const SignOutViewState.submitting()
      : isSubmitting = true,
        incompleteFailure = null;

  /// Signed out locally, but the server was not reached. The user is signed
  /// out on this device either way; the notice tells them the session may
  /// still be live elsewhere.
  const SignOutViewState.incomplete(Failure this.incompleteFailure)
      : isSubmitting = false;

  final bool isSubmitting;
  final Failure? incompleteFailure;

  @override
  String toString() => 'SignOutViewState(submitting: $isSubmitting)';
}

/// Ends the session.
final class SignOutController extends Notifier<SignOutViewState> {
  @override
  SignOutViewState build() => const SignOutViewState();

  /// Signs out. Local credentials are cleared whatever the server said, so
  /// this never leaves the user half-signed-in.
  Future<void> signOut() async {
    if (state.isSubmitting) {
      return;
    }
    state = const SignOutViewState.submitting();
    final Result<void> outcome = await ref.read(signOutUseCaseProvider)();
    ref.read(signInEmailMemoProvider).forget();
    // The lock is re-engaged so a later sign-in on this device starts locked
    // rather than inheriting this session's unlocked process.
    ref.read(appLockGateProvider).relock();
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<void>(:final failure) => SignOutViewState.incomplete(failure),
      Success<void>() => const SignOutViewState(),
    };
  }
}

final NotifierProvider<SignOutController, SignOutViewState> signOutControllerProvider =
    NotifierProvider<SignOutController, SignOutViewState>(SignOutController.new);
