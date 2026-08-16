// The e-mail verification screen.
//
// It serves two entry points with one implementation: the
// EMAIL_VERIFICATION_REQUIRED startup gate (signed in, bootstrap says the
// address is unverified) and `/sign-in/verify-email` (signed out, straight
// after registration). The endpoint is unauthenticated and takes the address
// plus the code, so the same form works for both.
//
// ENUMERATION RESISTANCE: the resend acknowledgement is one sentence for every
// outcome — unknown, already verified, disabled, cooling down. The state it
// renders carries nothing from the server.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/shared.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/localization/identity_strings.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import 'email_verification_providers.dart';

/// Verifies an e-mail address with a one-time code.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({this.onBack, super.key});

  /// Supplied when the screen was pushed rather than reached as a gate.
  final VoidCallback? onBack;

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _code = TextEditingController();

  @override
  void initState() {
    super.initState();
    _email.text = ref.read(verifyEmailControllerProvider.notifier).rememberedEmail;
  }

  @override
  void dispose() {
    // The verification code is dropped with its controller. It was never
    // copied into view state and is never persisted.
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() => ref.read(verifyEmailControllerProvider.notifier).submit(
        email: _email.text,
        code: _code.text,
      );

  Future<void> _resend() =>
      ref.read(verifyEmailControllerProvider.notifier).resend(email: _email.text);

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final VerifyEmailViewState state = ref.watch(verifyEmailControllerProvider);

    return IdentityScaffold(
      title: strings.verifyEmailTitle,
      onBack: widget.onBack,
      children: <Widget>[
        if (state.isVerified)
          IdentityFailureNotice(
            message: strings.verifyEmailSuccess,
            tone: KararStatusTone.success,
          ),
        if (state.hasResendAcknowledgement)
          IdentityFailureNotice(
            message: strings.verifyEmailResendAcknowledgement,
            tone: KararStatusTone.info,
          ),
        if (state.failure != null)
          IdentityFailureNotice(
            message: verificationFailureMessage(strings, state.failure!),
          ),
        IdentityBody(strings.verifyEmailSubtitle),
        const IdentityGap.large(),
        KararTextField(
          label: strings.signInEmailLabel,
          controller: _email,
          isRequired: true,
          isEnabled: !state.isBusy,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          errorText: state.emailViolation == null
              ? null
              : emailViolationMessage(strings, state.emailViolation!),
        ),
        const IdentityGap(),
        KararTextField(
          label: strings.verifyEmailCodeLabel,
          controller: _code,
          hint: strings.verifyEmailCodeHint,
          isRequired: true,
          isEnabled: !state.isBusy,
          textInputAction: TextInputAction.done,
          // The code is issued in ASCII; a keypad set to Arabic-Indic digits
          // would otherwise submit characters the server cannot match.
          normalizeArabicDigits: true,
          errorText: state.codeMissing ? strings.codeEmpty : null,
          onSubmitted: (_) => _submit(),
        ),
        const IdentityGap.large(),
        KararButton(
          label: strings.verifyEmailAction,
          onPressed: state.isBusy ? null : _submit,
          isLoading: state.isSubmitting,
          isFullWidth: true,
          size: KararButtonSize.large,
        ),
        const IdentityGap(),
        KararButton(
          label: strings.verifyEmailResendAction,
          variant: KararButtonVariant.secondary,
          onPressed: state.isBusy ? null : _resend,
          isLoading: state.isResending,
          isFullWidth: true,
        ),
      ],
    );
  }
}
