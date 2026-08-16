// Turning two-step verification off.
//
// The contract requires a current TOTP or an unused recovery code, so removal
// cannot be performed by someone holding only a signed-in device. The screen
// states what is destroyed before asking for the code, rather than after.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/shared.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/localization/identity_strings.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import '../../authentication/presentation/widgets/sensitive_screen.dart';
import 'mfa_providers.dart';

/// Disables two-step verification.
class MfaDisableScreen extends ConsumerStatefulWidget {
  const MfaDisableScreen({super.key});

  @override
  ConsumerState<MfaDisableScreen> createState() => _MfaDisableScreenState();
}

class _MfaDisableScreenState extends ConsumerState<MfaDisableScreen> {
  final TextEditingController _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() =>
      ref.read(mfaDisableControllerProvider.notifier).submit(code: _code.text);

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final MfaDisableViewState state = ref.watch(mfaDisableControllerProvider);

    if (state.isDisabled) {
      return IdentityScaffold(
        title: strings.mfaDisableTitle,
        children: <Widget>[
          KararStateView.empty(
            icon: KararIcons.statusSuccess,
            title: strings.mfaDisableTitle,
            message: strings.mfaDisableSuccess,
          ),
          const IdentityGap.large(),
          KararButton(
            label: strings.mfaRecoveryCodesDone,
            isFullWidth: true,
            size: KararButtonSize.large,
            onPressed: () => context.pop(),
          ),
        ],
      );
    }

    return SensitiveScreen(
      child: IdentityScaffold(
        title: strings.mfaDisableTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          if (state.failure != null)
            IdentityFailureNotice(
              message: mfaDisableFailureMessage(strings, state.failure!),
            ),
          KararBanner(
            message: strings.mfaDisableWarning,
            tone: KararStatusTone.warning,
          ),
          const IdentityGap.large(),
          KararTextField(
            label: strings.mfaCodeLabel,
            controller: _code,
            hint: strings.mfaCodeHint,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            normalizeArabicDigits: true,
            errorText: state.codeMissing ? strings.codeEmpty : null,
            onSubmitted: (_) => _submit(),
          ),
          const IdentityGap.large(),
          KararButton(
            label: strings.mfaDisableAction,
            variant: KararButtonVariant.destructive,
            onPressed: state.isSubmitting ? null : _submit,
            isLoading: state.isSubmitting,
            isFullWidth: true,
            size: KararButtonSize.large,
          ),
        ],
      ),
    );
  }
}
