// The forgot-password screen.
//
// ENUMERATION RESISTANCE: the acknowledgement is one sentence for existing,
// unknown, disabled and cooling-down addresses alike. `ForgotPasswordViewState`
// has a single acknowledged branch carrying `NeutralReceipt`, which holds
// nothing, so there is no second rendering to accidentally introduce.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/routes/identity_routes.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import 'password_recovery_providers.dart';

/// Requests a password reset.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final TextEditingController _email = TextEditingController();

  @override
  void initState() {
    super.initState();
    _email.text = ref.read(forgotPasswordControllerProvider.notifier).rememberedEmail;
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() =>
      ref.read(forgotPasswordControllerProvider.notifier).submit(email: _email.text);

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    final ForgotPasswordViewState state = ref.watch(forgotPasswordControllerProvider);

    if (state.isAcknowledged) {
      return IdentityScaffold(
        title: l10n.forgotPasswordTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          KararStateView.empty(
            icon: KararIcons.statusSuccess,
            title: l10n.forgotPasswordAcknowledgementTitle,
            message: l10n.forgotPasswordAcknowledgementMessage,
          ),
          const IdentityGap.large(),
          KararButton(
            label: l10n.resetPasswordTitle,
            isFullWidth: true,
            size: KararButtonSize.large,
            onPressed: () => context.go(IdentityRoutes.resetPassword),
          ),
        ],
      );
    }

    return IdentityScaffold(
      title: l10n.forgotPasswordTitle,
      onBack: () => context.pop(),
      children: <Widget>[
        if (state.failure != null)
          IdentityFailureNotice(
            message: identityFailureMessage(l10n, state.failure!),
          ),
        IdentityBody(l10n.forgotPasswordSubtitle),
        const IdentityGap.large(),
        KararTextField(
          label: l10n.signInEmailLabel,
          controller: _email,
          isRequired: true,
          isEnabled: !state.isSubmitting,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          errorText: state.emailViolation == null
              ? null
              : emailViolationMessage(l10n, state.emailViolation!),
          onSubmitted: (_) => _submit(),
        ),
        const IdentityGap.large(),
        KararButton(
          label: l10n.forgotPasswordAction,
          onPressed: state.isSubmitting ? null : _submit,
          isLoading: state.isSubmitting,
          isFullWidth: true,
          size: KararButtonSize.large,
        ),
      ],
    );
  }
}
