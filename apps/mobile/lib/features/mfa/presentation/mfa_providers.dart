// PRESENTATION — composition and controllers for multi-factor authentication.
//
// ONE-TIME SECRETS IN VIEW STATE. The enrolment key and the recovery codes
// have to be rendered, so they do reach view state — the only place in this
// workstream where a secret does. The rules that make that acceptable:
//
//   * the state types redact themselves in `toString`, so they cannot reach a
//     log or a test failure message by interpolation;
//   * `clear()` drops them, and the screens call it from `dispose`, so leaving
//     the screen removes them from memory rather than leaving them behind a
//     back stack;
//   * the controllers are auto-disposed, so nothing outlives the route;
//   * neither value is written to preferences, secure storage, a file, the
//     clipboard, or a golden image.
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../authentication/domain/entities/authentication_outcome.dart';
import '../../authentication/domain/value_objects/password.dart';
import '../../authentication/presentation/providers/authentication_providers.dart';
import '../data/api_mfa_repository.dart';
import '../domain/mfa_entities.dart';
import '../domain/mfa_repository.dart';
import '../domain/mfa_use_cases.dart';

final Provider<MfaRepository> mfaRepositoryProvider = Provider<MfaRepository>(
  (Ref ref) => ApiMfaRepository(
    client: ref.watch(apiClientProvider),
    challenges: ref.watch(pendingMfaChallengeStoreProvider),
    adoption: ref.watch(sessionAdoptionProvider),
    idempotencyKeys: ref.watch(correlationIdGeneratorProvider),
  ),
);

final Provider<StartMfaEnrolment> startMfaEnrolmentUseCaseProvider =
    Provider<StartMfaEnrolment>(
  (Ref ref) => StartMfaEnrolment(ref.watch(mfaRepositoryProvider)),
);

final Provider<ConfirmMfaEnrolment> confirmMfaEnrolmentUseCaseProvider =
    Provider<ConfirmMfaEnrolment>(
  (Ref ref) => ConfirmMfaEnrolment(ref.watch(mfaRepositoryProvider)),
);

final Provider<CompleteMfaChallenge> completeMfaChallengeUseCaseProvider =
    Provider<CompleteMfaChallenge>(
  (Ref ref) => CompleteMfaChallenge(ref.watch(mfaRepositoryProvider)),
);

final Provider<UseRecoveryCode> useRecoveryCodeUseCaseProvider =
    Provider<UseRecoveryCode>(
  (Ref ref) => UseRecoveryCode(ref.watch(mfaRepositoryProvider)),
);

final Provider<DisableMfa> disableMfaUseCaseProvider = Provider<DisableMfa>(
  (Ref ref) => DisableMfa(ref.watch(mfaRepositoryProvider)),
);

final Provider<ReadMfaChallengeStatus> readMfaChallengeStatusProvider =
    Provider<ReadMfaChallengeStatus>(
  (Ref ref) => ReadMfaChallengeStatus(ref.watch(mfaRepositoryProvider)),
);

/// Which step the enrolment flow is on.
enum MfaEnrolmentStep {
  /// Nothing started. The screen explains what two-step verification does.
  introduction,

  /// The key has been issued and is on screen awaiting a code.
  keyIssued,

  /// The recovery codes have been issued and are on screen.
  codesIssued,
}

/// What the enrolment screen renders.
@immutable
final class MfaEnrolmentViewState {
  const MfaEnrolmentViewState({
    this.step = MfaEnrolmentStep.introduction,
    this.isSubmitting = false,
    this.enrolment,
    this.recoveryCodes,
    this.codeMissing = false,
    this.failure,
    this.isAcknowledged = false,
  });

  final MfaEnrolmentStep step;
  final bool isSubmitting;

  /// The shared secret, present only while [step] is `keyIssued`.
  final MfaEnrolment? enrolment;

  /// The recovery codes, present only while [step] is `codesIssued`.
  final MfaRecoveryCodes? recoveryCodes;

  final bool codeMissing;
  final Failure? failure;

  /// Whether the user has confirmed they saved the recovery codes. The screen
  /// will not let them leave until they have.
  final bool isAcknowledged;

  /// Never prints the key or the codes.
  @override
  String toString() => 'MfaEnrolmentViewState(step: ${step.name})';
}

/// Drives TOTP enrolment and confirmation.
final class MfaEnrolmentController extends Notifier<MfaEnrolmentViewState> {
  @override
  MfaEnrolmentViewState build() => const MfaEnrolmentViewState();

  Future<void> start() async {
    if (state.isSubmitting) {
      return;
    }
    state = const MfaEnrolmentViewState(isSubmitting: true);
    final Result<MfaEnrolment> outcome =
        await ref.read(startMfaEnrolmentUseCaseProvider)();
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<MfaEnrolment>(:final failure) => MfaEnrolmentViewState(failure: failure),
      Success<MfaEnrolment>(:final value) => MfaEnrolmentViewState(
          step: MfaEnrolmentStep.keyIssued,
          enrolment: value,
        ),
    };
  }

  Future<void> confirm({required String code}) async {
    if (state.isSubmitting) {
      return;
    }
    final OpaqueSecret secret = OpaqueSecret(code);
    if (secret.isEmpty) {
      state = MfaEnrolmentViewState(
        step: state.step,
        enrolment: state.enrolment,
        codeMissing: true,
      );
      return;
    }
    state = MfaEnrolmentViewState(
      step: state.step,
      enrolment: state.enrolment,
      isSubmitting: true,
    );
    final Result<MfaRecoveryCodes> outcome =
        await ref.read(confirmMfaEnrolmentUseCaseProvider)(code: secret);
    if (!ref.mounted) {
      return;
    }
    switch (outcome) {
      case Failed<MfaRecoveryCodes>(:final failure):
        state = MfaEnrolmentViewState(
          step: state.step,
          enrolment: state.enrolment,
          failure: failure,
        );
      case Success<MfaRecoveryCodes>(:final value):
        // The setup key is dropped the moment it stops being needed. It is
        // never shown again, so keeping it in memory would be pure exposure.
        state = MfaEnrolmentViewState(
          step: MfaEnrolmentStep.codesIssued,
          recoveryCodes: value,
        );
    }
  }

  /// Records that the user says they saved the codes.
  void acknowledgeCodes({required bool acknowledged}) {
    state = MfaEnrolmentViewState(
      step: state.step,
      recoveryCodes: state.recoveryCodes,
      isAcknowledged: acknowledged,
    );
  }

  /// Drops every one-time secret. Called when the screen is left.
  void clear() {
    if (!ref.mounted) {
      return;
    }
    state = const MfaEnrolmentViewState();
  }
}

final NotifierProvider<MfaEnrolmentController, MfaEnrolmentViewState>
    mfaEnrolmentControllerProvider =
    NotifierProvider.autoDispose<MfaEnrolmentController, MfaEnrolmentViewState>(
  MfaEnrolmentController.new,
);

/// Which credential the challenge screen is asking for.
enum MfaChallengeMode { authenticatorCode, recoveryCode }

/// What the challenge screen renders.
@immutable
final class MfaChallengeViewState {
  const MfaChallengeViewState({
    this.mode = MfaChallengeMode.authenticatorCode,
    this.isSubmitting = false,
    this.codeMissing = false,
    this.failure,
    this.isExpired = false,
  });

  final MfaChallengeMode mode;
  final bool isSubmitting;
  final bool codeMissing;
  final Failure? failure;

  /// The challenge is gone: it timed out, was redeemed, or was dropped by a
  /// relaunch. The only action left is to sign in again.
  final bool isExpired;

  @override
  String toString() => 'MfaChallengeViewState(mode: ${mode.name}, expired: $isExpired)';
}

/// Drives the multi-factor challenge screen.
final class MfaChallengeController extends Notifier<MfaChallengeViewState> {
  @override
  MfaChallengeViewState build() =>
      MfaChallengeViewState(isExpired: !_isChallengeRedeemable());

  bool _isChallengeRedeemable() {
    final MfaChallengeStatus status = ref.read(readMfaChallengeStatusProvider)();
    return status.isRedeemableAt(ref.read(clockProvider).nowUtc());
  }

  void useMode(MfaChallengeMode mode) {
    state = MfaChallengeViewState(mode: mode, isExpired: state.isExpired);
  }

  Future<void> submit({required String code}) async {
    if (state.isSubmitting) {
      return;
    }
    final OpaqueSecret secret = OpaqueSecret(code);
    if (secret.isEmpty) {
      state = MfaChallengeViewState(mode: state.mode, codeMissing: true);
      return;
    }
    if (!_isChallengeRedeemable()) {
      state = MfaChallengeViewState(mode: state.mode, isExpired: true);
      return;
    }

    state = MfaChallengeViewState(mode: state.mode, isSubmitting: true);
    final Result<SessionEstablished> outcome = switch (state.mode) {
      MfaChallengeMode.authenticatorCode =>
        await ref.read(completeMfaChallengeUseCaseProvider)(code: secret),
      MfaChallengeMode.recoveryCode =>
        await ref.read(useRecoveryCodeUseCaseProvider)(recoveryCode: secret),
    };
    if (!ref.mounted) {
      return;
    }
    switch (outcome) {
      case Failed<SessionEstablished>(:final failure):
        state = MfaChallengeViewState(mode: state.mode, failure: failure);
      case Success<SessionEstablished>():
        state = MfaChallengeViewState(mode: state.mode);
        await ref.read(startupCoordinatorProvider).onAuthenticated();
    }
  }

  /// The user gave up. The challenge token is discarded rather than left in
  /// memory for the rest of its five minutes.
  void abandon() {
    ref.read(mfaRepositoryProvider).discardChallenge();
    ref.read(startupCoordinatorProvider).onMfaChallengeAbandoned();
  }
}

final NotifierProvider<MfaChallengeController, MfaChallengeViewState>
    mfaChallengeControllerProvider =
    NotifierProvider.autoDispose<MfaChallengeController, MfaChallengeViewState>(
  MfaChallengeController.new,
);

/// What the disable screen renders.
@immutable
final class MfaDisableViewState {
  const MfaDisableViewState({
    this.isSubmitting = false,
    this.codeMissing = false,
    this.failure,
    this.isDisabled = false,
  });

  final bool isSubmitting;
  final bool codeMissing;
  final Failure? failure;
  final bool isDisabled;

  @override
  String toString() => 'MfaDisableViewState(disabled: $isDisabled)';
}

/// Drives turning multi-factor authentication off.
final class MfaDisableController extends Notifier<MfaDisableViewState> {
  @override
  MfaDisableViewState build() => const MfaDisableViewState();

  Future<void> submit({required String code}) async {
    if (state.isSubmitting) {
      return;
    }
    final OpaqueSecret secret = OpaqueSecret(code);
    if (secret.isEmpty) {
      state = const MfaDisableViewState(codeMissing: true);
      return;
    }
    state = const MfaDisableViewState(isSubmitting: true);
    final Result<void> outcome = await ref.read(disableMfaUseCaseProvider)(code: secret);
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<void>(:final failure) => MfaDisableViewState(failure: failure),
      Success<void>() => const MfaDisableViewState(isDisabled: true),
    };
  }
}

final NotifierProvider<MfaDisableController, MfaDisableViewState>
    mfaDisableControllerProvider =
    NotifierProvider.autoDispose<MfaDisableController, MfaDisableViewState>(
  MfaDisableController.new,
);
