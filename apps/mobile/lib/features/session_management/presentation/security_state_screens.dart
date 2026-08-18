// The two SECURITY-STATE startup gates.
//
// Both exist because the client discovered it cannot make a claim, and both
// refuse to make it anyway. That is the whole shape of these screens:
//
//   LOCAL_SECURITY_STATE_UNAVAILABLE — the device would not say whether the
//     application lock is on. Not "the lock is off": the store did not answer,
//     and the previous code read that silence as a definite no and let the
//     session through. There is nothing here to unlock and nothing to sign in
//     to, because neither would be honest until the store answers.
//
//   SECURITY_RECOVERY_BLOCKED — a stored credential was given up, could not be
//     erased, and the abandonment could not be recorded either. Offering the
//     ordinary sign-in screen would present the abandonment as complete when
//     the client cannot show that it is, so it is not offered.
//
// NEITHER SCREEN ROUTES ONWARD. Each has one action, and the action is to
// retry the thing that failed. Neither one can reach `/lock` or `/sign-in`,
// which is what keeps the single router redirect from oscillating between a
// blocked state and a gate that would immediately bounce back.
//
// NOTHING HERE NAMES A VALUE. No stored flag, no credential, no keystore
// entry, no diagnostic label. The copy says what could not be established and
// what the user can do about it.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/startup_state.dart';
import '../../../app/routing/app_router.dart';
import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';

/// The LOCAL_SECURITY_STATE_UNAVAILABLE gate.
final class LocalSecurityUnavailableScreen extends ConsumerWidget {
  const LocalSecurityUnavailableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = context.l10n;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
            child: KararStateView.error(
              title: l10n.securityStateUnavailableTitle,
              message: l10n.securityStateUnavailableMessage,
              actionLabel: l10n.actionRetry,
              // Re-runs the whole sequence, which re-reads the store. A store
              // that has recovered continues to the lock or to the session; one
              // that has not returns here, which is the correct answer and not
              // a loop.
              onAction: () =>
                  unawaited(ref.read(startupCoordinatorProvider).start()),
            ),
          ),
        ),
      ),
    );
  }
}

/// The SECURITY_RECOVERY_BLOCKED gate.
final class SecurityRecoveryScreen extends ConsumerWidget {
  const SecurityRecoveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = context.l10n;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
            child: KararStateView.error(
              title: l10n.securityRecoveryBlockedTitle,
              message: l10n.securityRecoveryBlockedMessage,
              actionLabel: l10n.actionRetry,
              // Repeats the destruction rather than doing something weaker. The
              // only thing that resolves this state is the erase or the marker
              // finally succeeding.
              onAction: () => unawaited(
                ref.read(startupCoordinatorProvider).retrySecurityRecovery(),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The startup gates this workstream supplies.
///
/// Merged into the shell by `app/composition/feature_surface.dart`, alongside
/// the identity and platform contributions. Registering them there rather than
/// in either of those files keeps the security-state surfaces owned by the
/// workstream that owns the states behind them.
Map<StartupStage, StartupScreenBuilder> securityStateStartupScreens() =>
    <StartupStage, StartupScreenBuilder>{
      StartupStage.localSecurityStateUnavailable:
          (BuildContext context, StartupState state) =>
              const LocalSecurityUnavailableScreen(),
      StartupStage.securityRecoveryBlocked:
          (BuildContext context, StartupState state) => const SecurityRecoveryScreen(),
    };
