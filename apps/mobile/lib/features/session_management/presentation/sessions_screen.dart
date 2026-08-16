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
import '../../../shared/shared.dart';
import '../../authentication/presentation/controllers/authentication_controllers.dart';
import '../../authentication/presentation/localization/identity_failure_messages.dart';
import '../../authentication/presentation/localization/identity_strings.dart';
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

  Future<void> _confirmRevoke(UserSession session, IdentityStrings strings) async {
    final bool confirmed = await confirmIdentityAction(
      context: context,
      title: strings.sessionsRevokeConfirmTitle,
      message: strings.sessionsRevokeConfirmMessage,
      confirmLabel: strings.sessionsRevokeAction,
      cancelLabel: context.l10n.actionCancel,
    );
    if (confirmed) {
      await ref.read(sessionsControllerProvider.notifier).revoke(session.sessionId);
    }
  }

  Future<void> _confirmRevokeOthers(IdentityStrings strings) async {
    final bool confirmed = await confirmIdentityAction(
      context: context,
      title: strings.sessionsRevokeOthersConfirmTitle,
      message: strings.sessionsRevokeOthersConfirmMessage,
      confirmLabel: strings.sessionsRevokeOthersAction,
      cancelLabel: context.l10n.actionCancel,
    );
    if (confirmed) {
      await ref.read(sessionsControllerProvider.notifier).revokeOthers();
    }
  }

  @override
  Widget build(BuildContext context) {
    final IdentityStrings strings = IdentityStrings.of(context);
    final SessionsViewState state = ref.watch(sessionsControllerProvider);

    return SensitiveScreen(
      child: IdentityScaffold(
        title: strings.sessionsTitle,
        onBack: () => context.pop(),
        children: <Widget>[
          ..._notices(strings, state),
          ..._content(context, strings, state),
        ],
      ),
    );
  }

  List<Widget> _notices(IdentityStrings strings, SessionsViewState state) {
    final Failure? revocationFailure = state.revocationFailure;
    final int? revokedOthers = state.revokedOthersCount;
    return <Widget>[
      if (revocationFailure != null)
        IdentityFailureNotice(
          message: sessionRevocationFailureMessage(strings, revocationFailure),
        ),
      if (state.revokedOne)
        IdentityFailureNotice(
          message: strings.sessionsRevokedNotice,
          tone: KararStatusTone.success,
        ),
      if (revokedOthers != null)
        IdentityFailureNotice(
          message: strings.revokedOthersNotice(context.formatter.integer(revokedOthers)),
          tone: KararStatusTone.success,
        ),
    ];
  }

  List<Widget> _content(
    BuildContext context,
    IdentityStrings strings,
    SessionsViewState state,
  ) {
    if (state.isLoading) {
      return <Widget>[KararLoadingView(subject: strings.sessionsTitle)];
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
            message: identityFailureMessage(strings, failure),
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
      return <Widget>[KararLoadingView(subject: strings.sessionsTitle)];
    }
    if (directory.isEmpty) {
      return <Widget>[
        KararStateView.empty(
          title: strings.sessionsEmptyTitle,
          message: strings.sessionsEmptyMessage,
        ),
      ];
    }
    return <Widget>[
      IdentityBody(strings.sessionsSubtitle),
      const IdentityGap.large(),
      for (final UserSession session in directory.sessions)
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
          child: _SessionCard(
            session: session,
            strings: strings,
            isBusy: state.busySessionId == session.sessionId,
            onRevoke: state.isBusy ? null : () => _confirmRevoke(session, strings),
          ),
        ),
      if (directory.hasOthers) ...<Widget>[
        const IdentityGap(),
        KararButton(
          label: strings.sessionsRevokeOthersAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: state.isRevokingOthers,
          onPressed: state.isBusy ? null : () => _confirmRevokeOthers(strings),
        ),
      ],
      const IdentityGap.large(),
      _SignOutAction(strings: strings),
    ];
  }
}

/// One session row.
class _SessionCard extends StatelessWidget {
  const _SessionCard({
    required this.session,
    required this.strings,
    required this.isBusy,
    required this.onRevoke,
  });

  final UserSession session;
  final IdentityStrings strings;
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
                session.userAgentSummary ?? strings.sessionsUnknownDevice,
                style: context.typography.labelLarge.copyWith(
                  color: context.colors.contentPrimary,
                ),
              ),
              if (session.isCurrent)
                KararStatusBadge(
                  label: strings.sessionsCurrentBadge,
                  tone: KararStatusTone.success,
                  icon: KararIcons.check,
                ),
            ],
          ),
          SizedBox(height: context.spacing.xs),
          Text(
            strings.sessionStartedAt(formatter.dateTime(session.createdAt)),
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          if (lastSeen != null)
            Text(
              strings.sessionLastSeenAt(formatter.dateTime(lastSeen)),
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
          if (expiresAt != null)
            Text(
              strings.sessionExpiresAt(formatter.dateTime(expiresAt)),
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentTertiary,
              ),
            ),
          if (!session.isCurrent) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            KararButton(
              label: strings.sessionsRevokeAction,
              variant: KararButtonVariant.secondary,
              isLoading: isBusy,
              onPressed: onRevoke,
              // Several rows carry the same visible label, so each announces
              // which device it acts on.
              semanticLabel:
                  '${strings.sessionsRevokeAction}. '
                  '${session.userAgentSummary ?? strings.sessionsUnknownDevice}',
            ),
          ],
        ],
      ),
    );
  }
}

/// Signs out of this device.
class _SignOutAction extends ConsumerWidget {
  const _SignOutAction({required this.strings});

  final IdentityStrings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SignOutViewState state = ref.watch(signOutControllerProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (state.incompleteFailure != null)
          IdentityFailureNotice(
            message: strings.signOutIncompleteNotice,
            tone: KararStatusTone.warning,
          ),
        KararButton(
          label: strings.signOutAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: state.isSubmitting,
          onPressed: state.isSubmitting
              ? null
              : () async {
                  final bool confirmed = await confirmIdentityAction(
                    context: context,
                    title: strings.signOutConfirmTitle,
                    message: strings.signOutConfirmMessage,
                    confirmLabel: strings.signOutAction,
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
