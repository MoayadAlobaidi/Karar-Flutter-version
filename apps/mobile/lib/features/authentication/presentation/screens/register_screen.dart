// The registration screen.
//
// ENUMERATION RESISTANCE. On success this screen renders
// `registerAcknowledgementMessage` and nothing else. There is no branch on
// whether the address was already registered, because the state it switches on
// — `NeutralReceipt` — carries no such information and the repository never
// read the server's body. A widget test asserts the rendered text is identical
// across two different accepted responses.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/routing/route_paths.dart';
import '../../../../shared/shared.dart';
import '../../domain/value_objects/password.dart';
import '../controllers/authentication_controllers.dart';
import '../localization/identity_failure_messages.dart';
import '../localization/identity_strings.dart';
import '../providers/authentication_providers.dart';
import '../routes/identity_routes.dart';
import '../widgets/identity_scaffold.dart';

/// Creates an account.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirmation = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() => ref.read(registerControllerProvider.notifier).submit(
        email: _email.text,
        password: _password.text,
        confirmation: _confirmation.text,
      );

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final RegisterViewState state = ref.watch(registerControllerProvider);
    final PasswordPolicy policy = ref.watch(passwordPolicyProvider);

    if (state.isAcknowledged) {
      return IdentityScaffold(
        title: strings.registerTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          KararStateView.empty(
            icon: KararIcons.statusSuccess,
            title: strings.registerAcknowledgementTitle,
            message: strings.registerAcknowledgementMessage,
          ),
          const IdentityGap.large(),
          KararButton(
            label: strings.verifyEmailTitle,
            isFullWidth: true,
            size: KararButtonSize.large,
            onPressed: () => context.go(IdentityRoutes.verifyEmailPreAuth),
          ),
          const IdentityGap.small(),
          KararButton(
            label: strings.registerBackToSignIn,
            variant: KararButtonVariant.tertiary,
            isFullWidth: true,
            onPressed: () => context.go(RoutePaths.signIn),
          ),
        ],
      );
    }

    return IdentityScaffold(
      title: strings.registerTitle,
      onBack: () => context.pop(),
      children: <Widget>[
        if (state.failure != null)
          IdentityFailureNotice(
            message: identityFailureMessage(strings, state.failure!),
          ),
        IdentityBody(strings.registerSubtitle),
        const IdentityGap.large(),
        KararTextField(
          label: strings.signInEmailLabel,
          controller: _email,
          isRequired: true,
          isEnabled: !state.isSubmitting,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const <String>[AutofillHints.username],
          errorText: state.emailViolation == null
              ? null
              : emailViolationMessage(strings, state.emailViolation!),
        ),
        const IdentityGap(),
        KararTextField(
          label: strings.signInPasswordLabel,
          controller: _password,
          isRequired: true,
          isEnabled: !state.isSubmitting,
          obscureText: true,
          textInputAction: TextInputAction.next,
          autofillHints: const <String>[AutofillHints.newPassword],
          helperText: strings.registerPasswordHelp,
          errorText: state.passwordViolation == null
              ? null
              : passwordViolationMessage(strings, state.passwordViolation!, policy: policy),
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
          errorText: state.confirmationMismatch ? strings.confirmPasswordMismatch : null,
          onSubmitted: (_) => _submit(),
        ),
        const IdentityGap.large(),
        KararButton(
          label: strings.registerAction,
          onPressed: state.isSubmitting ? null : _submit,
          isLoading: state.isSubmitting,
          isFullWidth: true,
          size: KararButtonSize.large,
        ),
      ],
    );
  }
}
