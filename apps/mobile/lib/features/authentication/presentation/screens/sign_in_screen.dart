// The sign-in screen. Replaces the UNAUTHENTICATED startup gate.
//
// It does not navigate on success. The startup coordinator moves the state and
// the application's single redirect acts on it; a second navigation here would
// reintroduce exactly the race the coordinator exists to prevent.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/lifecycle/startup_state.dart';
import '../../../../shared/shared.dart';
import '../../domain/value_objects/password.dart';
import '../controllers/authentication_controllers.dart';
import '../localization/identity_failure_messages.dart';
import '../localization/identity_strings.dart';
import '../providers/authentication_providers.dart';
import '../routes/identity_routes.dart';
import '../widgets/identity_scaffold.dart';

/// Signs the user in.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({this.startupState, super.key});

  /// The startup state that produced this screen, when it was reached as a
  /// gate. Used only to explain a secure-storage failure; the behaviour is
  /// identical either way, which is the fail-closed part.
  final StartupState? startupState;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final FocusNode _passwordFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    final String remembered = ref.read(signInEmailMemoProvider).address?.value ?? '';
    _email.text = remembered;
  }

  @override
  void dispose() {
    // The password text is dropped with the controller. It was never copied
    // into view state, so this is the only place it existed.
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() => ref.read(signInControllerProvider.notifier).submit(
        email: _email.text,
        password: _password.text,
      );

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final SignInViewState state = ref.watch(signInControllerProvider);
    final PasswordPolicy policy = ref.watch(passwordPolicyProvider);
    final bool secureStorageUnavailable = switch (widget.startupState) {
      Unauthenticated(:final secureStorageUnavailable) => secureStorageUnavailable,
      _ => false,
    };

    return IdentityScaffold(
      title: strings.signInTitle,
      children: <Widget>[
        if (secureStorageUnavailable)
          IdentityFailureNotice(
            message: strings.signInSecureStorageNotice,
            tone: KararStatusTone.warning,
          ),
        if (state.failure != null)
          IdentityFailureNotice(
            message: signInFailureMessage(strings, state.failure!),
          ),
        IdentityBody(strings.signInSubtitle),
        const IdentityGap.large(),
        KararTextField(
          label: strings.signInEmailLabel,
          controller: _email,
          isRequired: true,
          isEnabled: !state.isSubmitting,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const <String>[AutofillHints.username],
          prefixIcon: KararIcons.document,
          errorText: state.emailViolation == null
              ? null
              : emailViolationMessage(strings, state.emailViolation!),
          onSubmitted: (_) => _passwordFocus.requestFocus(),
        ),
        const IdentityGap(),
        KararTextField(
          label: strings.signInPasswordLabel,
          controller: _password,
          focusNode: _passwordFocus,
          isRequired: true,
          isEnabled: !state.isSubmitting,
          obscureText: true,
          textInputAction: TextInputAction.done,
          autofillHints: const <String>[AutofillHints.password],
          errorText: state.passwordViolation == null
              ? null
              : passwordViolationMessage(
                  strings,
                  state.passwordViolation!,
                  policy: policy,
                ),
          onSubmitted: (_) => _submit(),
        ),
        const IdentityGap.large(),
        KararButton(
          label: strings.signInAction,
          onPressed: state.isSubmitting ? null : _submit,
          isLoading: state.isSubmitting,
          isFullWidth: true,
          size: KararButtonSize.large,
        ),
        const IdentityGap(),
        KararButton(
          label: strings.signInForgotPassword,
          variant: KararButtonVariant.tertiary,
          isFullWidth: true,
          onPressed: state.isSubmitting
              ? null
              : () => context.push(IdentityRoutes.forgotPassword),
        ),
        const IdentityGap.small(),
        KararButton(
          label: strings.signInCreateAccount,
          variant: KararButtonVariant.secondary,
          isFullWidth: true,
          onPressed:
              state.isSubmitting ? null : () => context.push(IdentityRoutes.register),
        ),
      ],
    );
  }
}
