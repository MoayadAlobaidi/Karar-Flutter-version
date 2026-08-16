// The change-password screen.
//
// SENSITIVE. Wrapped in `SensitiveScreen`, so the fields are covered rather
// than photographed when the application leaves the foreground.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../shared/shared.dart';
import '../../domain/value_objects/password.dart';
import '../controllers/authentication_controllers.dart';
import '../localization/identity_failure_messages.dart';
import '../localization/identity_strings.dart';
import '../providers/authentication_providers.dart';
import '../widgets/identity_scaffold.dart';
import '../widgets/sensitive_screen.dart';

/// Changes the password of the signed-in account.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  final TextEditingController _confirmation = TextEditingController();

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() => ref.read(changePasswordControllerProvider.notifier).submit(
        currentPassword: _current.text,
        newPassword: _next.text,
        confirmation: _confirmation.text,
      );

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final ChangePasswordViewState state = ref.watch(changePasswordControllerProvider);
    final PasswordPolicy policy = ref.watch(passwordPolicyProvider);

    if (state.isChanged) {
      return IdentityScaffold(
        title: strings.changePasswordTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          KararStateView.empty(
            icon: KararIcons.statusSuccess,
            title: strings.changePasswordSuccessTitle,
            message: strings.changePasswordSuccessMessage,
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
        title: strings.changePasswordTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          if (state.failure != null)
            IdentityFailureNotice(
              message: changePasswordFailureMessage(strings, state.failure!),
            ),
          IdentityBody(strings.changePasswordSubtitle),
          const IdentityGap.large(),
          KararTextField(
            label: strings.changePasswordCurrentLabel,
            controller: _current,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            obscureText: true,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.password],
            errorText: state.currentMissing ? strings.passwordEmpty : null,
          ),
          const IdentityGap(),
          KararTextField(
            label: strings.changePasswordNewLabel,
            controller: _next,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            obscureText: true,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.newPassword],
            helperText: strings.registerPasswordHelp,
            errorText: state.passwordViolation == null
                ? null
                : passwordViolationMessage(
                    strings,
                    state.passwordViolation!,
                    policy: policy,
                  ),
          ),
          const IdentityGap(),
          KararTextField(
            label: strings.registerConfirmPasswordLabel,
            controller: _confirmation,
            isRequired: true,
            isEnabled: !state.isSubmitting,
            obscureText: true,
            textInputAction: TextInputAction.done,
            autofillHints: const <String>[AutofillHints.newPassword],
            errorText:
                state.confirmationMismatch ? strings.confirmPasswordMismatch : null,
            onSubmitted: (_) => _submit(),
          ),
          const IdentityGap.large(),
          KararButton(
            label: strings.changePasswordAction,
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
