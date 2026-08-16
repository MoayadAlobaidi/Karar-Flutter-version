// TOTP enrolment, confirmation, and the one-time recovery codes.
//
// THE MOST SENSITIVE SCREEN IN THE CLIENT. Two payloads pass through it that
// the server will never issue again, so the handling is deliberate:
//
//   * `SensitiveScreen` covers it whenever the application is not in the
//     foreground, keeping the key and the codes out of the task-switcher
//     snapshot;
//   * NO CLIPBOARD. There is no copy action for the setup key or the codes.
//     The system clipboard is readable by other applications, is synchronised
//     across devices on both platforms, and survives long after the screen is
//     gone. The key is rendered in a selectable, grouped form instead, so a
//     user can transcribe it accurately without it leaving the application;
//   * the controller's `clear()` runs from `dispose`, so the values are
//     dropped when the screen is left rather than lingering behind a back
//     stack;
//   * this screen has NO golden baseline, and must never be given one — a
//     golden is a committed image of whatever was on screen.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/shared.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/localization/identity_strings.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import '../../authentication/presentation/widgets/sensitive_screen.dart';
import '../domain/mfa_entities.dart';
import 'mfa_providers.dart';

/// Sets up two-step verification.
class MfaEnrolmentScreen extends ConsumerStatefulWidget {
  const MfaEnrolmentScreen({super.key});

  @override
  ConsumerState<MfaEnrolmentScreen> createState() => _MfaEnrolmentScreenState();
}

class _MfaEnrolmentScreenState extends ConsumerState<MfaEnrolmentScreen> {
  final TextEditingController _code = TextEditingController();

  /// Captured while the widget is alive. A `WidgetRef` may not be read during
  /// `dispose`, and the secrets must be dropped precisely then.
  late final MfaEnrolmentController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ref.read(mfaEnrolmentControllerProvider.notifier);
  }

  @override
  void dispose() {
    _code.dispose();
    // Drops the setup key and the recovery codes from memory. Leaving the
    // screen is the user saying they are done with them. `clear` is a no-op
    // once the provider has disposed, which also drops them.
    _controller.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final MfaEnrolmentViewState state = ref.watch(mfaEnrolmentControllerProvider);

    return SensitiveScreen(
      child: IdentityScaffold(
        title: state.step == MfaEnrolmentStep.codesIssued
            ? strings.mfaRecoveryCodesTitle
            : strings.mfaEnrolTitle,
        // The back affordance is withheld while the codes are on screen and
        // unacknowledged: leaving destroys them, and the user cannot get them
        // back.
        onBack: state.step == MfaEnrolmentStep.codesIssued && !state.isAcknowledged
            ? null
            : () => context.pop(),
        children: <Widget>[
          if (state.failure != null)
            IdentityFailureNotice(
              message: mfaEnrolmentFailureMessage(strings, state.failure!),
            ),
          ...switch (state.step) {
            MfaEnrolmentStep.introduction => _introduction(context, strings, state),
            MfaEnrolmentStep.keyIssued => _keyIssued(context, strings, state),
            MfaEnrolmentStep.codesIssued => _codesIssued(context, strings, state),
          },
        ],
      ),
    );
  }

  List<Widget> _introduction(
    BuildContext context,
    IdentityStrings strings,
    MfaEnrolmentViewState state,
  ) =>
      <Widget>[
        IdentityBody(strings.mfaEnrolIntro),
        const IdentityGap.large(),
        KararButton(
          label: strings.mfaEnrolStartAction,
          isFullWidth: true,
          size: KararButtonSize.large,
          isLoading: state.isSubmitting,
          onPressed: state.isSubmitting
              ? null
              : () => ref.read(mfaEnrolmentControllerProvider.notifier).start(),
        ),
      ];

  List<Widget> _keyIssued(
    BuildContext context,
    IdentityStrings strings,
    MfaEnrolmentViewState state,
  ) {
    final MfaEnrolment? enrolment = state.enrolment;
    if (enrolment == null) {
      return <Widget>[KararStateView.error(message: strings.failureUnexpected)];
    }
    return <Widget>[
      IdentityHeading(strings.mfaEnrolSecretLabel),
      const IdentityGap.small(),
      IdentityBody(strings.mfaEnrolStepScan),
      const IdentityGap(),
      _SecretBlock(secret: enrolment.sharedSecret, label: strings.mfaEnrolSecretLabel),
      const IdentityGap(),
      KararBanner(
        message: strings.mfaEnrolSecretWarning,
        tone: KararStatusTone.warning,
      ),
      const IdentityGap.large(),
      IdentityBody(strings.mfaEnrolStepConfirm),
      const IdentityGap(),
      KararTextField(
        label: strings.mfaCodeLabel,
        controller: _code,
        hint: strings.mfaCodeHint,
        isRequired: true,
        isEnabled: !state.isSubmitting,
        keyboardType: TextInputType.number,
        normalizeArabicDigits: true,
        errorText: state.codeMissing ? strings.codeEmpty : null,
        onSubmitted: (_) =>
            ref.read(mfaEnrolmentControllerProvider.notifier).confirm(code: _code.text),
      ),
      const IdentityGap.large(),
      KararButton(
        label: strings.mfaConfirmAction,
        isFullWidth: true,
        size: KararButtonSize.large,
        isLoading: state.isSubmitting,
        onPressed: state.isSubmitting
            ? null
            : () => ref
                .read(mfaEnrolmentControllerProvider.notifier)
                .confirm(code: _code.text),
      ),
    ];
  }

  List<Widget> _codesIssued(
    BuildContext context,
    IdentityStrings strings,
    MfaEnrolmentViewState state,
  ) {
    final MfaRecoveryCodes? codes = state.recoveryCodes;
    if (codes == null) {
      return <Widget>[KararStateView.error(message: strings.failureUnexpected)];
    }
    return <Widget>[
      KararBanner(
        message: strings.mfaRecoveryCodesWarning,
        tone: KararStatusTone.warning,
      ),
      const IdentityGap.large(),
      for (int index = 0; index < codes.codes.length; index++)
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
          child: _RecoveryCodeRow(
            code: codes.codes[index],
            semanticLabel: strings.recoveryCodePosition(
              position: context.formatter.integer(index + 1),
              total: context.formatter.integer(codes.count),
            ),
          ),
        ),
      const IdentityGap(),
      KararCheckboxTile(
        label: strings.mfaRecoveryCodesAcknowledge,
        value: state.isAcknowledged,
        onChanged: (bool value) => ref
            .read(mfaEnrolmentControllerProvider.notifier)
            .acknowledgeCodes(acknowledged: value),
      ),
      const IdentityGap.large(),
      KararButton(
        label: strings.mfaRecoveryCodesDone,
        isFullWidth: true,
        size: KararButtonSize.large,
        // Disabled until acknowledged: these codes cannot be shown again, and
        // a user who taps past them has lost their way back into the account.
        onPressed: state.isAcknowledged ? () => context.pop() : null,
      ),
    ];
  }
}

/// The setup key, grouped for accurate transcription.
///
/// Selectable so the platform's own text selection can be used; there is no
/// application copy action, and nothing writes to the clipboard.
class _SecretBlock extends StatelessWidget {
  const _SecretBlock({required this.secret, required this.label});

  final String secret;
  final String label;

  @override
  Widget build(BuildContext context) {
    return KararCard(
      child: Semantics(
        label: label,
        child: SelectableText(
          _grouped(secret),
          textAlign: TextAlign.start,
          style: context.typography.bodyLarge.copyWith(
            color: context.colors.contentPrimary,
            fontFamilyFallback: const <String>['monospace'],
            letterSpacing: 1.5,
          ),
        ),
      ),
    );
  }

  /// Four-character groups. A base32 secret read off a screen in one run is
  /// transcribed wrongly often enough to matter.
  static String _grouped(String value) {
    final StringBuffer buffer = StringBuffer();
    for (int index = 0; index < value.length; index++) {
      if (index > 0 && index % 4 == 0) {
        buffer.write(' ');
      }
      buffer.write(value[index]);
    }
    return buffer.toString();
  }
}

/// One recovery code.
class _RecoveryCodeRow extends StatelessWidget {
  const _RecoveryCodeRow({required this.code, required this.semanticLabel});

  final String code;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return KararCard(
      child: Semantics(
        label: semanticLabel,
        child: SelectableText(
          code,
          textAlign: TextAlign.start,
          style: context.typography.bodyLarge.copyWith(
            color: context.colors.contentPrimary,
            fontFamilyFallback: const <String>['monospace'],
            letterSpacing: 1.5,
          ),
        ),
      ),
    );
  }
}
