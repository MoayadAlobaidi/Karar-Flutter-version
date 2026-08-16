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

import '../../../shared/shared.dart';
import '../domain/consent_repository.dart';
import '../domain/consent_state.dart';
import '../domain/legal_document.dart';
import 'consent_providers.dart';
import 'consent_strings.dart';

/// Consent status per purpose, and the actions over it.
final class ConsentScreen extends ConsumerWidget {
  const ConsentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = ConsentStrings.of(context);
    final surface = ref.watch(consentSurfaceControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: strings.screenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: surface.when(
          loading: () => KararLoadingView(subject: strings.screenTitle),
          error: (Object error, StackTrace _) => KararStateView.error(
            title: strings.surfaceUnavailableTitle,
            message: strings.surfaceUnavailableDescription,
            actionLabel: context.l10n.actionRetry,
            onAction: () => unawaited(
              ref.read(consentSurfaceControllerProvider.notifier).refresh(),
            ),
          ),
          data: (ConsentSurface value) => _SurfaceBody(surface: value, strings: strings),
        ),
      ),
    );
  }
}

final class _SurfaceBody extends ConsumerWidget {
  const _SurfaceBody({required this.surface, required this.strings});

  final ConsentSurface surface;
  final ConsentStrings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (surface) {
      case ConsentSurfaceUnavailable(:final failure):
        final reference = failure.correlationId;
        return Center(
          child: SingleChildScrollView(
            padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
            child: KararStateView.error(
              title: strings.surfaceUnavailableTitle,
              message: strings.surfaceUnavailableDescription,
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
                title: strings.nothingToAgreeTitle,
                message: strings.nothingToAgreeDescription,
              ),
            ),
          );
        }
        return ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            Text(
              strings.screenDescription,
              textAlign: TextAlign.start,
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
            SizedBox(height: context.spacing.lg),
            for (final overview in purposes)
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.sectionGap),
                child: _PurposeCard(overview: overview, strings: strings),
              ),
          ],
        );
    }
  }
}

final class _PurposeCard extends ConsumerWidget {
  const _PurposeCard({required this.overview, required this.strings});

  final ConsentOverview overview;
  final ConsentStrings strings;

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
            label: consentStateLabel(overview.state, strings),
            tone: consentStateTone(overview.state),
          ),
          SizedBox(height: context.spacing.md),
          _Labelled(label: strings.purposeLabel, value: overview.purposeRef),
          SizedBox(height: context.spacing.sm),
          Text(
            consentStateDescription(overview.state, strings),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          if (overview.noticeRequired && overview.state == ConsentState.active) ...<Widget>[
            SizedBox(height: context.spacing.md),
            KararBanner(message: strings.noticeRequiredNote, tone: KararStatusTone.info),
          ],
          if (overview.document != null) ...<Widget>[
            SizedBox(height: context.spacing.md),
            _DocumentDetails(document: overview.document!, strings: strings),
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
              ConsentBlocker.jurisdictionNotAssigned => strings.blockerJurisdiction,
              ConsentBlocker.policyPackNotApproved => strings.blockerPolicy,
              ConsentBlocker.operatingEntityNotAssigned => strings.blockerEntity,
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
            strings.reconsentCreatesNewGrantNote,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
        ],
        SizedBox(height: context.spacing.md),
        KararButton(
          label: strings.acceptAction,
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
        _Labelled(label: strings.grantReferenceLabel, value: grant.grantId),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: strings.withdrawAction,
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
            message: strings.acceptedConfirmation,
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
            title: strings.withdrawnConfirmation,
            message: strings.historyPreservedNote,
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
            title: strings.actionFailedTitle,
            message: reference == null
                ? strings.actionFailedDescription
                : '${strings.actionFailedDescription} '
                    '${context.l10n.stateErrorReference(reference)}',
            tone: KararStatusTone.danger,
          ),
        ];
    }
  }
}

/// The safe metadata of a document version, and nothing beyond it.
final class _DocumentDetails extends StatelessWidget {
  const _DocumentDetails({required this.document, required this.strings});

  final LegalDocument document;
  final ConsentStrings strings;

  @override
  Widget build(BuildContext context) {
    final version = document.effectiveVersion;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _Labelled(label: strings.documentLabel, value: document.kind),
        SizedBox(height: context.spacing.sm),
        _Labelled(label: strings.publishedByLabel, value: document.entityId),
        SizedBox(height: context.spacing.sm),
        _Labelled(label: strings.regimeLabel, value: document.jurisdictionRef),
        if (version != null) ...<Widget>[
          SizedBox(height: context.spacing.sm),
          _Labelled(label: strings.versionLabel, value: version.version),
          if (version.effectiveAt != null) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            _Labelled(
              label: strings.effectiveFromLabel,
              value: context.formatter.date(version.effectiveAt!),
            ),
          ],
          SizedBox(height: context.spacing.sm),
          _Labelled(
            label: strings.requiredActionLabel,
            value: switch (version.action) {
              LegalDocumentAction.reacceptanceRequired => strings.actionReacceptance,
              LegalDocumentAction.noticeRequired => strings.actionNotice,
              LegalDocumentAction.noUserActionRequired => strings.actionNone,
              LegalDocumentAction.unstated => strings.actionUnstated,
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
String consentStateLabel(ConsentState state, ConsentStrings strings) => switch (state) {
      ConsentState.notRequired => strings.stateNotRequired,
      ConsentState.consentRequired => strings.stateRequired,
      ConsentState.reconsentRequired => strings.stateReconsentRequired,
      ConsentState.active => strings.stateActive,
      ConsentState.withdrawn => strings.stateWithdrawn,
      ConsentState.unavailable => strings.stateUnavailable,
      ConsentState.legalDocumentUnavailable => strings.stateDocumentUnavailable,
      ConsentState.policyNotApproved => strings.statePolicyNotApproved,
    };

/// The explanation for a consent state.
String consentStateDescription(ConsentState state, ConsentStrings strings) =>
    switch (state) {
      ConsentState.notRequired => strings.describeNotRequired,
      ConsentState.consentRequired => strings.describeRequired,
      ConsentState.reconsentRequired => strings.describeReconsentRequired,
      ConsentState.active => strings.describeActive,
      ConsentState.withdrawn => strings.describeWithdrawn,
      ConsentState.unavailable => strings.describeUnavailable,
      ConsentState.legalDocumentUnavailable => strings.describeDocumentUnavailable,
      ConsentState.policyNotApproved => strings.describePolicyNotApproved,
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
