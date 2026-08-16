// The APP_LOCKED startup gate, and the setting that turns the lock on.
//
// Neither screen authenticates anybody. The gate asks the DEVICE to confirm
// the person holding it is the person who set the lock, and on success lets
// the startup coordinator carry on with the ordinary session and bootstrap
// checks — which may still end at sign-in, if the session expired while the
// application was away. That is correct, and the copy does not pretend
// otherwise.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routing/route_paths.dart';
import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import '../domain/app_lock.dart';
import 'app_lock_providers.dart';

/// The lock gate.
class AppLockScreen extends ConsumerStatefulWidget {
  const AppLockScreen({super.key});

  @override
  ConsumerState<AppLockScreen> createState() => _AppLockScreenState();
}

class _AppLockScreenState extends ConsumerState<AppLockScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        // Availability is re-read on arrival: an enrolment can be removed
        // while the application is in the background.
        ref.read(appLockControllerProvider.notifier).refresh();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    final AppLockViewState state = ref.watch(appLockControllerProvider);

    return IdentityScaffold(
      title: l10n.appLockTitle,
      children: <Widget>[
        if (state.lastOutcome != null)
          IdentityFailureNotice(
            message: _outcomeMessage(l10n, state.lastOutcome!),
            tone: state.lastOutcome is LocalAuthCancelled
                ? KararStatusTone.info
                : KararStatusTone.warning,
          ),
        KararStateView.empty(
          icon: KararIcons.hidden,
          title: l10n.appLockLockedTitle,
          message: l10n.appLockLockedMessage,
        ),
        const IdentityGap.large(),
        KararButton(
          label: l10n.appLockUnlockAction,
          isFullWidth: true,
          size: KararButtonSize.large,
          isLoading: state.isPrompting,
          onPressed: state.isBusy
              ? null
              : () => ref
                  .read(appLockControllerProvider.notifier)
                  .unlock(reason: l10n.appLockPromptReason),
        ),
        const IdentityGap(),
        // Always available. A user whose device authenticator has stopped
        // working must not be trapped behind a lock they cannot open; the
        // password is the fallback, and it is real authentication.
        KararButton(
          label: l10n.appLockSignInInstead,
          variant: KararButtonVariant.secondary,
          isFullWidth: true,
          onPressed: state.isBusy ? null : () => context.go(RoutePaths.signIn),
        ),
      ],
    );
  }
}

/// The lock setting.
class AppLockSettingsScreen extends ConsumerStatefulWidget {
  const AppLockSettingsScreen({super.key});

  @override
  ConsumerState<AppLockSettingsScreen> createState() => _AppLockSettingsScreenState();
}

class _AppLockSettingsScreenState extends ConsumerState<AppLockSettingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(appLockControllerProvider.notifier).refresh();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    final AppLockViewState state = ref.watch(appLockControllerProvider);

    return IdentityScaffold(
      title: l10n.appLockSettingsTitle,
      onBack: () => context.pop(),
      children: <Widget>[
        if (state.requiresSession)
          IdentityFailureNotice(
            message: l10n.appLockRequiresSession,
            tone: KararStatusTone.warning,
          ),
        if (state.lastOutcome != null && state.lastOutcome is! LocalAuthSucceeded)
          IdentityFailureNotice(
            message: _outcomeMessage(l10n, state.lastOutcome!),
            tone: KararStatusTone.warning,
          ),
        IdentityBody(l10n.appLockSettingsDescription),
        const IdentityGap.large(),
        if (state.isChecking)
          KararLoadingView(subject: l10n.appLockSettingsTitle)
        else if (!state.canEnable)
          KararStateView.empty(
            icon: KararIcons.hidden,
            title: l10n.appLockUnavailableTitle,
            message: state.availability == LocalAuthAvailability.notEnrolled
                ? l10n.appLockNotEnrolledMessage
                : l10n.appLockUnavailableMessage,
          )
        else
          KararCheckboxTile(
            label: l10n.appLockToggleLabel,
            value: state.isEnabled,
            onChanged: state.isBusy
                ? null
                : (bool value) => ref
                    .read(appLockControllerProvider.notifier)
                    .setEnabled(enabled: value, reason: l10n.appLockPromptReason),
          ),
      ],
    );
  }
}

/// The message for a prompt result. Never names the account or the method.
String _outcomeMessage(AppLocalizations l10n, LocalAuthOutcome outcome) =>
    switch (outcome) {
      LocalAuthSucceeded() => l10n.appLockUnlockAction,
      LocalAuthCancelled() => l10n.appLockCancelled,
      LocalAuthFailed(:final reason) => switch (reason) {
          LocalAuthFailureReason.notRecognised => l10n.appLockNotRecognised,
          LocalAuthFailureReason.lockedOut => l10n.appLockLockedOut,
          LocalAuthFailureReason.unavailable => l10n.appLockUnavailableMessage,
        },
    };
