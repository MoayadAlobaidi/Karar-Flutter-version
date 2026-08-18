// The active-sessions screen.
//
// SENSITIVE. A list of a person's devices and when each was last used is worth
// covering when the application is backgrounded.
//
// STATUS IS NEVER COLOUR ALONE. The current session carries a badge with a
// label, so the distinction survives greyscale, a colour-vision difference and
// a screen reader. Timestamps go through the locale formatter, so Arabic gets
// Arabic-Indic digits.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure.dart';
import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../authentication/presentation/controllers/authentication_controllers.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/widgets/identity_confirmation.dart';
import '../../authentication/presentation/widgets/identity_scaffold.dart';
import '../../authentication/presentation/widgets/sensitive_screen.dart';
import '../domain/user_session.dart';
import 'session_providers.dart';

/// Lists live sessions and revokes them.
class SessionsScreen extends ConsumerStatefulWidget {
  const SessionsScreen({super.key});

  @override
  ConsumerState<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends ConsumerState<SessionsScreen> {
  @override
  void initState() {
    super.initState();
    // Loaded after the first frame so the screen renders its loading state
    // rather than a blank one.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(ref.read(sessionsControllerProvider.notifier).load());
      }
    });
  }

  Future<void> _confirmRevoke(UserSession session, AppLocalizations l10n) async {
    final bool confirmed = await confirmIdentityAction(
      context: context,
      title: l10n.sessionsRevokeConfirmTitle,
      message: l10n.sessionsRevokeConfirmMessage,
      confirmLabel: l10n.sessionsRevokeAction,
      cancelLabel: context.l10n.actionCancel,
    );
    if (confirmed) {
      await ref.read(sessionsControllerProvider.notifier).revoke(session.sessionId);
    }
  }

  Future<void> _confirmRevokeOthers(AppLocalizations l10n) async {
    final bool confirmed = await confirmIdentityAction(
      context: context,
      title: l10n.sessionsRevokeOthersConfirmTitle,
      message: l10n.sessionsRevokeOthersConfirmMessage,
      confirmLabel: l10n.sessionsRevokeOthersAction,
      cancelLabel: context.l10n.actionCancel,
    );
    if (confirmed) {
      await ref.read(sessionsControllerProvider.notifier).revokeOthers();
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    final SessionsViewState state = ref.watch(sessionsControllerProvider);

    return SensitiveScreen(
      child: IdentityScaffold(
        title: l10n.sessionsTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          ..._notices(context, l10n, state),
          ..._content(context, l10n, state),
        ],
      ),
    );
  }

  List<Widget> _notices(
    BuildContext context,
    AppLocalizations l10n,
    SessionsViewState state,
  ) {
    final Failure? revocationFailure = state.revocationFailure;
    final int? revokedOthers = state.revokedOthersCount;
    return <Widget>[
      if (revocationFailure != null)
        IdentityFailureNotice(
          message: sessionRevocationFailureMessage(l10n, revocationFailure),
        ),
      if (state.revokedOne)
        IdentityFailureNotice(
          message: l10n.sessionsRevokedNotice,
          tone: KararStatusTone.success,
        ),
      if (revokedOthers != null)
        IdentityFailureNotice(
          // The count takes the same digits as the timestamps below it; the
          // generated message formats against the bundle's locale, not the
          // formatter's, so it cannot be trusted to agree on its own.
          message: context.formatter.applyNumerals(
            l10n.sessionsRevokedOthersNotice(revokedOthers),
          ),
          tone: KararStatusTone.success,
        ),
    ];
  }

  List<Widget> _content(
    BuildContext context,
    AppLocalizations l10n,
    SessionsViewState state,
  ) {
    if (state.isLoading) {
      return <Widget>[KararLoadingView(subject: l10n.sessionsTitle)];
    }
    final Failure? failure = state.failure;
    if (failure != null) {
      return <Widget>[
        if (failure is OfflineFailure)
          KararStateView.offline(
            onAction: () => ref.read(sessionsControllerProvider.notifier).load(),
          )
        else
          KararStateView.error(
            message: identityFailureMessage(l10n, failure),
            detail: failure.correlationId == null
                ? null
                : context.l10n.stateErrorReference(failure.correlationId!),
            actionLabel: context.l10n.actionRetry,
            onAction: () => ref.read(sessionsControllerProvider.notifier).load(),
          ),
      ];
    }
    final SessionDirectory? directory = state.directory;
    if (directory == null) {
      return <Widget>[KararLoadingView(subject: l10n.sessionsTitle)];
    }
    if (directory.isEmpty) {
      return <Widget>[
        KararStateView.empty(
          title: l10n.sessionsEmptyTitle,
          message: l10n.sessionsEmptyMessage,
        ),
      ];
    }
    return <Widget>[
      IdentityBody(l10n.sessionsSubtitle),
      const IdentityGap.large(),
      for (final UserSession session in directory.sessions)
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
          child: _SessionCard(
            session: session,
            l10n: l10n,
            isBusy: state.busySessionId == session.sessionId,
            onRevoke: state.isBusy ? null : () => _confirmRevoke(session, l10n),
          ),
        ),
      if (directory.hasOthers) ...<Widget>[
        const IdentityGap(),
        KararButton(
          label: l10n.sessionsRevokeOthersAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: state.isRevokingOthers,
          onPressed: state.isBusy ? null : () => _confirmRevokeOthers(l10n),
        ),
      ],
      const IdentityGap.large(),
      _SignOutAction(l10n: l10n),
    ];
  }
}

/// One session row.
class _SessionCard extends StatelessWidget {
  const _SessionCard({
    required this.session,
    required this.l10n,
    required this.isBusy,
    required this.onRevoke,
  });

  final UserSession session;
  final AppLocalizations l10n;
  final bool isBusy;
  final VoidCallback? onRevoke;

  @override
  Widget build(BuildContext context) {
    final KararFormatter formatter = context.formatter;
    final DateTime? lastSeen = session.lastSeenAt;
    final DateTime? expiresAt = session.absoluteExpiresAt;

    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Wrap rather than Row: at a large text scale the device name and
          // the badge cannot share a line, and a Row would clip.
          Wrap(
            spacing: context.spacing.sm,
            runSpacing: context.spacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              KararBidiText(
                session.userAgentSummary ?? l10n.sessionsUnknownDevice,
                style: context.typography.labelLarge.copyWith(
                  color: context.colors.contentPrimary,
                ),
              ),
              if (session.isCurrent)
                KararStatusBadge(
                  label: l10n.sessionsCurrentBadge,
                  tone: KararStatusTone.success,
                  icon: KararIcons.check,
                ),
            ],
          ),
          SizedBox(height: context.spacing.xs),
          Text(
            l10n.sessionsStartedAt(formatter.dateTime(session.createdAt)),
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          if (lastSeen != null)
            Text(
              l10n.sessionsLastSeenAt(formatter.dateTime(lastSeen)),
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
          if (expiresAt != null)
            Text(
              l10n.sessionsExpiresAt(formatter.dateTime(expiresAt)),
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentTertiary,
              ),
            ),
          if (!session.isCurrent) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            KararButton(
              label: l10n.sessionsRevokeAction,
              variant: KararButtonVariant.secondary,
              isLoading: isBusy,
              onPressed: onRevoke,
              // Several rows carry the same visible label, so each announces
              // which device it acts on.
              semanticLabel:
                  '${l10n.sessionsRevokeAction}. '
                  '${session.userAgentSummary ?? l10n.sessionsUnknownDevice}',
            ),
          ],
        ],
      ),
    );
  }
}

/// Signs out of this device.
class _SignOutAction extends ConsumerWidget {
  const _SignOutAction({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SignOutViewState state = ref.watch(signOutControllerProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (state.incompleteFailure != null)
          IdentityFailureNotice(
            message: l10n.signOutIncompleteNotice,
            tone: KararStatusTone.warning,
          ),
        KararButton(
          label: l10n.signOutAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: state.isSubmitting,
          onPressed: state.isSubmitting
              ? null
              : () async {
                  final bool confirmed = await confirmIdentityAction(
                    context: context,
                    title: l10n.signOutConfirmTitle,
                    message: l10n.signOutConfirmMessage,
                    confirmLabel: l10n.signOutAction,
                    cancelLabel: context.l10n.actionCancel,
                  );
                  if (confirmed) {
                    await ref.read(signOutControllerProvider.notifier).signOut();
                  }
                },
        ),
      ],
    );
  }
}
