// The MFA_CHALLENGE_REQUIRED startup gate.
//
// The challenge token is NOT here, and is not reachable from here. Sign-in put
// it in an in-memory store in the data layer; this screen knows only that a
// challenge is outstanding and whether it can still be redeemed.
//
// One generic message covers a wrong code, an expired challenge and an engaged
// recovery lockout, matching the single generic 401 the platform returns.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/shared.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/localization/identity_strings.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import '../../authentication/presentation/widgets/sensitive_screen.dart';
import 'mfa_providers.dart';

/// Completes a multi-factor challenge with a TOTP code or a recovery code.
class MfaChallengeScreen extends ConsumerStatefulWidget {
  const MfaChallengeScreen({super.key});

  @override
  ConsumerState<MfaChallengeScreen> createState() => _MfaChallengeScreenState();
}

class _MfaChallengeScreenState extends ConsumerState<MfaChallengeScreen> {
  final TextEditingController _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() =>
      ref.read(mfaChallengeControllerProvider.notifier).submit(code: _code.text);

  void _switchMode(MfaChallengeMode mode) {
    // The field is cleared on switching: a TOTP code left in the box would be
    // submitted as a recovery code and spend one of the five attempts the
    // recovery budget allows.
    _code.clear();
    ref.read(mfaChallengeControllerProvider.notifier).useMode(mode);
  }

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final MfaChallengeViewState state = ref.watch(mfaChallengeControllerProvider);
    final bool isRecovery = state.mode == MfaChallengeMode.recoveryCode;

    if (state.isExpired) {
      return IdentityScaffold(
        title: strings.mfaChallengeTitle,
        children: <Widget>[
          KararStateView.error(
            title: strings.mfaChallengeTitle,
            message: strings.mfaChallengeExpired,
          ),
          const IdentityGap.large(),
          KararButton(
            label: strings.mfaChallengeAbandon,
            isFullWidth: true,
            size: KararButtonSize.large,
            onPressed: () => ref.read(mfaChallengeControllerProvider.notifier).abandon(),
          ),
        ],
      );
    }

    return SensitiveScreen(
      child: IdentityScaffold(
        title: strings.mfaChallengeTitle,
        children: <Widget>[
          if (state.failure != null)
            IdentityFailureNotice(
              message: mfaChallengeFailureMessage(strings, state.failure!),
            ),
          IdentityBody(
            isRecovery ? strings.mfaRecoveryCodeSubtitle : strings.mfaChallengeSubtitle,
          ),
          const IdentityGap.large(),
          KararTextField(
            // The key forces a fresh field when the mode changes, so the
            // label, hint and keyboard all switch together.
            key: ValueKey<MfaChallengeMode>(state.mode),
            label: isRecovery ? strings.mfaRecoveryCodeLabel : strings.mfaCodeLabel,
            controller: _code,
            hint: isRecovery ? strings.mfaRecoveryCodeHint : strings.mfaCodeHint,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            keyboardType: isRecovery ? TextInputType.text : TextInputType.number,
            normalizeArabicDigits: true,
            errorText: state.codeMissing ? strings.codeEmpty : null,
            onSubmitted: (_) => _submit(),
          ),
          const IdentityGap.large(),
          KararButton(
            label: strings.mfaChallengeAction,
            onPressed: state.isSubmitting ? null : _submit,
            isLoading: state.isSubmitting,
            isFullWidth: true,
            size: KararButtonSize.large,
          ),
          const IdentityGap(),
          KararButton(
            label: isRecovery
                ? strings.mfaChallengeUseTotp
                : strings.mfaChallengeUseRecovery,
            variant: KararButtonVariant.secondary,
            isFullWidth: true,
            onPressed: state.isSubmitting
                ? null
                : () => _switchMode(
                      isRecovery
                          ? MfaChallengeMode.authenticatorCode
                          : MfaChallengeMode.recoveryCode,
                    ),
          ),
          const IdentityGap.small(),
          KararButton(
            label: strings.mfaChallengeAbandon,
            variant: KararButtonVariant.tertiary,
            isFullWidth: true,
            onPressed: state.isSubmitting
                ? null
                : () => ref.read(mfaChallengeControllerProvider.notifier).abandon(),
          ),
        ],
      ),
    );
  }
}
