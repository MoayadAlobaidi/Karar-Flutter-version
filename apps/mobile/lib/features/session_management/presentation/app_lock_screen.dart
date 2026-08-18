// The APP_LOCKED startup gate, and the setting that turns the lock on.
//
// Neither screen authenticates anybody. The gate asks the DEVICE to confirm
// the person holding it is the person who set the lock, and on success lets
// the startup coordinator carry on with the ordinary session and bootstrap
// checks — which may still end at sign-in, if the session expired while the
// application was away. That is correct, and the copy does not pretend
// otherwise.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/security/app_lock.dart';
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
        //
        // THIS DESTROYS THE STORED SESSION RATHER THAN NAVIGATING.
        //
        // `context.go(RoutePaths.signIn)` was the obvious implementation and it
        // did nothing at all: the startup state is still AppLocked, the single
        // router redirect maps AppLocked to /lock, and any location that is not
        // /lock is sent back to it. The button rendered, responded, and
        // returned the user to the screen they pressed it on. It was found by
        // running the app, not by reading it — the unit test asserted
        // `routeFor(AppLocked()) == /lock`, which is correct, and the trap
        // lived in the gap between that and the screen.
        //
        // `signOut()` was the second attempt and was still wrong for the launch
        // that matters. Startup evaluates the lock BEFORE it restores, so on a
        // COLD locked launch the credential is on disk and `SessionManager`
        // holds no session at all; `end` short-circuits on that, wipes nothing,
        // and emits nothing. Only a warm process — locked after backgrounding,
        // session already adopted — had anything for it to end, and that is the
        // process the test happened to model.
        //
        // `abandonLockedSession()` erases what is PERSISTED whether or not a
        // session was ever read into memory, and moves the state to
        // Unauthenticated, which the same redirect then routes to sign-in on
        // its own. That is also the honest behaviour: the lock is not something
        // a user may step around into an authenticated session, so the way past
        // it is to give up the stored session and prove who you are again.
        KararButton(
          label: l10n.appLockSignInInstead,
          variant: KararButtonVariant.secondary,
          isFullWidth: true,
          onPressed: state.isBusy
              ? null
              : () => unawaited(
                    ref.read(startupCoordinatorProvider).abandonLockedSession(),
                  ),
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
        // THE CHANGE THAT DID NOT PERSIST.
        //
        // Rendered from the typed result rather than inferred from the switch,
        // and it says which direction failed, because the consequences are
        // opposite: a refused enable leaves the user unprotected, a refused
        // disable leaves them locked. The switch beneath shows the DURABLE
        // state, so it has not moved — this notice is the only thing that
        // explains why.
        if (state.lastChange case final AppLockChangeRejected _)
          IdentityFailureNotice(
            message: state.rejectedEnable
                ? l10n.appLockEnableNotSaved
                : l10n.appLockDisableNotSaved,
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
