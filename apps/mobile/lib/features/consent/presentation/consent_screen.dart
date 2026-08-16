// THE CONSENT SURFACE.
//
// One card per processing purpose the platform's applicable documents cover.
// Each card states the resolved state, the safe metadata of the document
// version in force, and — only when the platform said an acceptance can be
// recorded — the control that records one.
//
// The rules this screen exists to hold:
//
//   * the acceptance control is rendered ONLY when `canAccept`, which is true
//     only when the server's own prerequisites hold. It is never rendered
//     disabled-but-hopeful, and never rendered while a check is outstanding;
//   * success is the platform's answer. Nothing shows an accepted state before
//     the response arrives, and a failed acceptance leaves the surface exactly
//     as it was;
//   * withdrawal says that the earlier record is preserved, because a person
//     withdrawing consent is entitled to know their earlier decision is still
//     on file;
//   * the unavailable states are explicit and are not dressed up as errors the
//     user caused.
//
// Document WORDING is not rendered here: the contract publishes metadata and a
// storage locator, not text this client may fetch. The localized
// "not available" notice is shown instead, and no substitute wording is
// composed.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../domain/consent_repository.dart';
import '../domain/consent_state.dart';
import '../domain/legal_document.dart';
import 'consent_providers.dart';

/// Consent status per purpose, and the actions over it.
final class ConsentScreen extends ConsumerWidget {
  const ConsentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final surface = ref.watch(consentSurfaceControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.consentScreenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: surface.when(
          loading: () => KararLoadingView(subject: l10n.consentScreenTitle),
          error: (Object error, StackTrace _) => KararStateView.error(
            title: l10n.consentSurfaceUnavailableTitle,
            message: l10n.consentSurfaceUnavailableDescription,
            actionLabel: context.l10n.actionRetry,
            onAction: () => unawaited(
              ref.read(consentSurfaceControllerProvider.notifier).refresh(),
            ),
          ),
          data: (ConsentSurface value) => _SurfaceBody(surface: value, l10n: l10n),
        ),
      ),
    );
  }
}

final class _SurfaceBody extends ConsumerWidget {
  const _SurfaceBody({required this.surface, required this.l10n});

  final ConsentSurface surface;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (surface) {
      case ConsentSurfaceUnavailable(:final failure):
        final reference = failure.correlationId;
        return Center(
          child: SingleChildScrollView(
            padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
            child: KararStateView.error(
              title: l10n.consentSurfaceUnavailableTitle,
              message: l10n.consentSurfaceUnavailableDescription,
              detail:
                  reference == null ? null : context.l10n.stateErrorReference(reference),
              actionLabel: context.l10n.actionRetry,
              onAction: () => unawaited(
                ref.read(consentSurfaceControllerProvider.notifier).refresh(),
              ),
            ),
          ),
        );
      case ConsentSurfaceLoaded(:final purposes):
        if (purposes.isEmpty) {
          return Center(
            child: SingleChildScrollView(
              padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
              child: KararStateView.empty(
                title: l10n.consentNothingToAgreeTitle,
                message: l10n.consentNothingToAgreeDescription,
              ),
            ),
          );
        }
        return ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            Text(
              l10n.consentScreenDescription,
              textAlign: TextAlign.start,
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
            SizedBox(height: context.spacing.lg),
            for (final overview in purposes)
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.sectionGap),
                child: _PurposeCard(overview: overview, l10n: l10n),
              ),
          ],
        );
    }
  }
}

final class _PurposeCard extends ConsumerWidget {
  const _PurposeCard({required this.overview, required this.l10n});

  final ConsentOverview overview;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(consentActionControllerProvider);
    final isSubmitting = action is ConsentActionSubmitting &&
        action.purposeRef == overview.purposeRef;

    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararStatusBadge(
            label: consentStateLabel(overview.state, l10n),
            tone: consentStateTone(overview.state),
          ),
          SizedBox(height: context.spacing.md),
          _Labelled(label: l10n.consentPurposeLabel, value: overview.purposeRef),
          SizedBox(height: context.spacing.sm),
          Text(
            consentStateDescription(overview.state, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          if (overview.noticeRequired && overview.state == ConsentState.active) ...<Widget>[
            SizedBox(height: context.spacing.md),
            KararBanner(message: l10n.consentNoticeRequiredNote, tone: KararStatusTone.info),
          ],
          if (overview.document != null) ...<Widget>[
            SizedBox(height: context.spacing.md),
            _DocumentDetails(document: overview.document!, l10n: l10n),
          ],
          ..._blockers(context),
          ..._actions(context, ref, isSubmitting: isSubmitting),
          ..._outcome(context, action),
        ],
      ),
    );
  }

  List<Widget> _blockers(BuildContext context) {
    final blockers = overview.blockers;
    if (blockers.isEmpty) {
      return const <Widget>[];
    }
    return <Widget>[
      SizedBox(height: context.spacing.md),
      for (final blocker in blockers)
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
          child: KararBanner(
            message: switch (blocker) {
              ConsentBlocker.jurisdictionNotAssigned => l10n.consentBlockerJurisdiction,
              ConsentBlocker.policyPackNotApproved => l10n.consentBlockerPolicy,
              ConsentBlocker.operatingEntityNotAssigned => l10n.consentBlockerEntity,
            },
            tone: KararStatusTone.warning,
          ),
        ),
    ];
  }

  /// The controls, and only the controls the platform said can work.
  List<Widget> _actions(
    BuildContext context,
    WidgetRef ref, {
    required bool isSubmitting,
  }) {
    final versionId = overview.acceptableVersionId;
    if (overview.canAccept && versionId != null) {
      return <Widget>[
        if (overview.state == ConsentState.reconsentRequired) ...<Widget>[
          SizedBox(height: context.spacing.md),
          Text(
            l10n.consentReconsentCreatesNewGrantNote,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
        ],
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.consentAcceptAction,
          isFullWidth: true,
          isLoading: isSubmitting,
          onPressed: () => unawaited(
            ref.read(consentActionControllerProvider.notifier).accept(
                  purposeRef: overview.purposeRef,
                  legalDocumentVersionId: versionId,
                ),
          ),
        ),
      ];
    }
    final grant = overview.grant;
    if (overview.canWithdraw && grant != null) {
      return <Widget>[
        SizedBox(height: context.spacing.md),
        _Labelled(label: l10n.consentGrantReferenceLabel, value: grant.grantId),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.consentWithdrawAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: isSubmitting,
          onPressed: () => unawaited(
            ref.read(consentActionControllerProvider.notifier).withdraw(
                  purposeRef: overview.purposeRef,
                  grantId: grant.grantId,
                ),
          ),
        ),
      ];
    }
    return const <Widget>[];
  }

  List<Widget> _outcome(BuildContext context, ConsentActionState action) {
    switch (action) {
      case ConsentActionIdle():
      case ConsentActionSubmitting():
        return const <Widget>[];
      case ConsentAccepted(:final purposeRef):
        if (purposeRef != overview.purposeRef) {
          return const <Widget>[];
        }
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            message: l10n.consentAcceptedConfirmation,
            tone: KararStatusTone.success,
          ),
        ];
      case ConsentWithdrawn(:final purposeRef):
        if (purposeRef != overview.purposeRef) {
          return const <Widget>[];
        }
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: l10n.consentWithdrawnConfirmation,
            message: l10n.consentHistoryPreservedNote,
            tone: KararStatusTone.info,
          ),
        ];
      case ConsentActionFailed(:final purposeRef, :final failure):
        if (purposeRef != overview.purposeRef) {
          return const <Widget>[];
        }
        final reference = failure.correlationId;
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: l10n.consentActionFailedTitle,
            message: reference == null
                ? l10n.consentActionFailedDescription
                : '${l10n.consentActionFailedDescription} '
                    '${context.l10n.stateErrorReference(reference)}',
            tone: KararStatusTone.danger,
          ),
        ];
    }
  }
}

/// The safe metadata of a document version, and nothing beyond it.
final class _DocumentDetails extends StatelessWidget {
  const _DocumentDetails({required this.document, required this.l10n});

  final LegalDocument document;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final version = document.effectiveVersion;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _Labelled(label: l10n.consentDocumentLabel, value: document.kind),
        SizedBox(height: context.spacing.sm),
        _Labelled(label: l10n.consentPublishedByLabel, value: document.entityId),
        SizedBox(height: context.spacing.sm),
        _Labelled(label: l10n.consentRegimeLabel, value: document.jurisdictionRef),
        if (version != null) ...<Widget>[
          SizedBox(height: context.spacing.sm),
          _Labelled(label: l10n.consentVersionLabel, value: version.version),
          if (version.effectiveAt != null) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            _Labelled(
              label: l10n.consentEffectiveFromLabel,
              value: context.formatter.date(version.effectiveAt!),
            ),
          ],
          SizedBox(height: context.spacing.sm),
          _Labelled(
            label: l10n.consentRequiredActionLabel,
            value: switch (version.action) {
              LegalDocumentAction.reacceptanceRequired => l10n.consentActionReacceptance,
              LegalDocumentAction.noticeRequired => l10n.consentActionNotice,
              LegalDocumentAction.noUserActionRequired => l10n.consentActionNone,
              LegalDocumentAction.unstated => l10n.consentActionUnstated,
            },
          ),
        ],
        SizedBox(height: context.spacing.md),
        // The contract publishes no document text and no language for it, so
        // the client says the document is unavailable rather than presenting
        // wording it composed.
        KararBanner(
          message: context.l10n.legalDocumentUnavailable,
          tone: KararStatusTone.neutral,
        ),
      ],
    );
  }
}

final class _Labelled extends StatelessWidget {
  const _Labelled({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.l10n.a11yTitleWithSubtitle(label, value),
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          KararBidiText(
            value,
            style: context.typography.bodyMedium.copyWith(
              color: context.colors.contentPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

/// The label for a consent state.
String consentStateLabel(ConsentState state, AppLocalizations l10n) => switch (state) {
      ConsentState.notRequired => l10n.consentStateNotRequired,
      ConsentState.consentRequired => l10n.consentStateRequired,
      ConsentState.reconsentRequired => l10n.consentStateReconsentRequired,
      ConsentState.active => l10n.consentStateActive,
      ConsentState.withdrawn => l10n.consentStateWithdrawn,
      ConsentState.unavailable => l10n.consentStateUnavailable,
      ConsentState.legalDocumentUnavailable => l10n.consentStateDocumentUnavailable,
      ConsentState.policyNotApproved => l10n.consentStatePolicyNotApproved,
    };

/// The explanation for a consent state.
String consentStateDescription(ConsentState state, AppLocalizations l10n) =>
    switch (state) {
      ConsentState.notRequired => l10n.consentDescribeNotRequired,
      ConsentState.consentRequired => l10n.consentDescribeRequired,
      ConsentState.reconsentRequired => l10n.consentDescribeReconsentRequired,
      ConsentState.active => l10n.consentDescribeActive,
      ConsentState.withdrawn => l10n.consentDescribeWithdrawn,
      ConsentState.unavailable => l10n.consentDescribeUnavailable,
      ConsentState.legalDocumentUnavailable => l10n.consentDescribeDocumentUnavailable,
      ConsentState.policyNotApproved => l10n.consentDescribePolicyNotApproved,
    };

/// The tone for a consent state. Colour never carries the meaning on its own;
/// the label above always names the state.
KararStatusTone consentStateTone(ConsentState state) => switch (state) {
      ConsentState.active => KararStatusTone.success,
      ConsentState.notRequired => KararStatusTone.neutral,
      ConsentState.consentRequired ||
      ConsentState.reconsentRequired =>
        KararStatusTone.info,
      ConsentState.withdrawn => KararStatusTone.neutral,
      ConsentState.unavailable ||
      ConsentState.legalDocumentUnavailable ||
      ConsentState.policyNotApproved =>
        KararStatusTone.warning,
    };
