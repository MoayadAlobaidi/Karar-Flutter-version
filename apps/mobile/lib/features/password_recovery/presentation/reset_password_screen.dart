// The reset-password screen.
//
// SENSITIVE. The reset token is a bearer credential for thirty minutes, so the
// screen is wrapped in `SensitiveScreen` and the token is never copied out of
// its field.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routing/route_paths.dart';
import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../authentication/domain/value_objects/password.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/providers/authentication_providers.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import '../../authentication/presentation/widgets/sensitive_screen.dart';
import 'password_recovery_providers.dart';

/// Consumes a reset token and sets a new password.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({this.initialToken, super.key});

  /// A token carried in the route, when the user arrived from the e-mail.
  final String? initialToken;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final TextEditingController _token = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirmation = TextEditingController();

  @override
  void initState() {
    super.initState();
    final String? token = widget.initialToken;
    if (token != null) {
      _token.text = token;
    }
  }

  @override
  void dispose() {
    // The token and both passwords go with their controllers. None of them
    // was ever copied into view state.
    _token.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() => ref.read(resetPasswordControllerProvider.notifier).submit(
        token: _token.text,
        newPassword: _password.text,
        confirmation: _confirmation.text,
      );

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    final ResetPasswordViewState state = ref.watch(resetPasswordControllerProvider);
    final PasswordPolicy policy = ref.watch(passwordPolicyProvider);

    if (state.isReset) {
      return IdentityScaffold(
        title: l10n.resetPasswordTitle,
        children: <Widget>[
          KararStateView.empty(
            icon: KararIcons.statusSuccess,
            title: l10n.resetPasswordSuccessTitle,
            message: l10n.resetPasswordSuccessMessage,
          ),
          const IdentityGap.large(),
          KararButton(
            label: l10n.signInAction,
            isFullWidth: true,
            size: KararButtonSize.large,
            onPressed: () => context.go(RoutePaths.signIn),
          ),
        ],
      );
    }

    return SensitiveScreen(
      child: IdentityScaffold(
        title: l10n.resetPasswordTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          if (state.failure != null)
            IdentityFailureNotice(
              message: resetTokenFailureMessage(l10n, state.failure!),
            ),
          IdentityBody(l10n.resetPasswordSubtitle),
          const IdentityGap.large(),
          KararTextField(
            label: l10n.resetPasswordTokenLabel,
            controller: _token,
            hint: l10n.resetPasswordTokenHint,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            textInputAction: TextInputAction.next,
            errorText: state.tokenMissing ? l10n.tokenEmpty : null,
          ),
          const IdentityGap(),
          KararTextField(
            label: l10n.resetPasswordNewLabel,
            controller: _password,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            obscureText: true,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.newPassword],
            helperText: l10n.registerPasswordHelp,
            errorText: state.passwordViolation == null
                ? null
                : passwordViolationMessage(
                    l10n,
                    state.passwordViolation!,
                    policy: policy,
                    formatter: context.formatter,
                  ),
          ),
          const IdentityGap(),
          KararTextField(
            label: l10n.registerConfirmPasswordLabel,
            controller: _confirmation,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            obscureText: true,
            textInputAction: TextInputAction.done,
            autofillHints: const <String>[AutofillHints.newPassword],
            errorText:
                state.confirmationMismatch ? l10n.confirmPasswordMismatch : null,
            onSubmitted: (_) => _submit(),
          ),
          const IdentityGap.large(),
          KararButton(
            label: l10n.resetPasswordAction,
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
