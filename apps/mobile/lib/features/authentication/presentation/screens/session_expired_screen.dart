// The SESSION_EXPIRED startup gate.
//
// THE SECURITY-GUIDANCE STATE. Every route into this screen has already
// cleared the local credential — `SessionManager.end` drops the in-memory copy
// and wipes the store, and `TokenRefreshCoordinator` terminates before it
// emits. This screen therefore never has to clean up; it explains, and offers
// the one action that helps.
//
// The message differs by reason and the ACTION does not. Refresh-token reuse
// is the case worth naming: the platform treats a token presented twice as
// theft, revokes the family and its session, and notifies the account. A user
// who sees that message needs to be told to change their password, not just
// that "something went wrong".
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/dependency_injection/providers.dart';
import '../../../../app/lifecycle/startup_state.dart';
import '../../../../core/errors/failure.dart';
import '../../../../l10n/karar_localization.dart';
import '../../../../shared/shared.dart';
import '../widgets/identity_scaffold.dart';

/// Explains why a session ended and routes back to sign-in.
class SessionExpiredScreen extends ConsumerWidget {
  const SessionExpiredScreen({required this.state, super.key});

  final StartupState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = context.l10n;
    final SessionEndReason reason = switch (state) {
      SessionExpired(:final reason) => reason,
      _ => SessionEndReason.expired,
    };
    final String message = switch (reason) {
      SessionEndReason.expired => l10n.sessionEndedExpired,
      SessionEndReason.revoked => l10n.sessionEndedRevoked,
      SessionEndReason.refreshTokenReuseDetected => l10n.sessionEndedReuseDetected,
      SessionEndReason.refreshRejected => l10n.sessionEndedRefreshRejected,
      SessionEndReason.signedOut => l10n.sessionEndedSignedOut,
    };
    // Reuse detection is the one reason that warrants the stronger tone: it is
    // the only one that may mean someone else has the credential.
    final KararStatusTone tone = reason == SessionEndReason.refreshTokenReuseDetected
        ? KararStatusTone.danger
        : KararStatusTone.warning;

    return IdentityScaffold(
      title: l10n.sessionEndedTitle,
      children: <Widget>[
        IdentityFailureNotice(message: message, tone: tone),
        const IdentityGap(),
        IdentityBody(l10n.signInSubtitle),
        const IdentityGap.large(),
        KararButton(
          label: l10n.sessionEndedAction,
          isFullWidth: true,
          size: KararButtonSize.large,
          // The coordinator owns the transition. Re-running the sequence finds
          // no credential — it was already wiped — and lands on
          // UNAUTHENTICATED, which the single redirect turns into the sign-in
          // screen. This screen never navigates itself.
          onPressed: () => unawaited(ref.read(startupCoordinatorProvider).start()),
        ),
      ],
    );
  }
}
