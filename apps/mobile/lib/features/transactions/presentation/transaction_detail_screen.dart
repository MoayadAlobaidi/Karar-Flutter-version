// ONE TRANSACTION, WITH ITS HISTORY AND ITS PROVENANCE.
//
// Three things this screen is careful about:
//
//   * a CORRECTION APPENDS. The history is shown in full, oldest first, and
//     `divergesFromSource` is the PLATFORM'S statement that a person changed
//     something the source supplied — it is not worked out here by comparing
//     revisions, because that would be the client inventing a claim about what
//     a source said;
//   * an ORIGINAL AMOUNT in another currency is shown BESIDE the booked one,
//     never instead of it and never converted. There is no rate on this
//     surface;
//   * a DELETE reports what it actually did. The platform's delete spans two
//     modules and can be partially applied, so a partial outcome is rendered
//     as one rather than rounded up to "deleted".
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/presentation/financial_formatting.dart';
import '../../financial_accounts/presentation/financial_labels.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/transaction.dart';
import '../domain/transaction_detail.dart';
import 'transaction_labels.dart';
import 'transaction_row.dart';
import 'transactions_providers.dart';

/// One transaction.
final class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({required this.transactionId, super.key});

  final String transactionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final detail = ref.watch(transactionDetailProvider(transactionId));

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.transactionDetailTitle,
        onBack: () => context.go(FinancialRoutes.transactions),
      ),
      body: SafeArea(
        top: false,
        child: detail.when(
          loading: () => KararLoadingView(subject: l10n.transactionDetailTitle),
          error: (Object error, StackTrace _) => Center(
            child: SingleChildScrollView(
              padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
              child: KararStateView.error(
                title: l10n.transactionDetailUnavailableTitle,
                message: l10n.transactionDetailUnavailableDescription,
                actionLabel: l10n.actionRetry,
                onAction: () =>
                    ref.invalidate(transactionDetailProvider(transactionId)),
              ),
            ),
          ),
          // Null is the DISCARDED state; see `accountDetailProvider`. The
          // transaction read under the previous organisation has been emptied,
          // so there is nothing to render.
          data: (TransactionDetail? value) => value == null
              ? KararLoadingView(subject: l10n.transactionDetailTitle)
              : _Body(detail: value, l10n: l10n),
        ),
      ),
    );
  }
}

final class _Body extends ConsumerWidget {
  const _Body({required this.detail, required this.l10n});

  final TransactionDetail detail;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transaction = detail.transaction;
    final write = ref.watch(transactionWriteControllerProvider);

    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        if (detail.divergesFromSource)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: KararBanner(
              message: l10n.transactionDivergesFromSource,
              tone: KararStatusTone.info,
            ),
          ),
        _WriteOutcome(state: write, l10n: l10n),
        FinancialSection(
          heading: l10n.transactionDetailTitle,
          child: KararCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                LabelledValue(
                  label: l10n.transactionDescriptionLabel,
                  value: transaction.description,
                  emphasis: true,
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.transactionAmountLabel,
                  value: formatMoney(context, transaction.amount),
                  emphasis: true,
                ),
                SizedBox(height: context.spacing.sm),
                Wrap(
                  spacing: context.spacing.xs,
                  runSpacing: context.spacing.xs,
                  children: <Widget>[
                    KararStatusBadge(
                      label: moneyDirectionLabel(transaction.direction, l10n),
                      tone: directionTone(transaction.direction),
                    ),
                    KararStatusBadge(
                      label: transactionStatusLabel(transaction.status, l10n),
                      tone: switch (transaction.status) {
                        TransactionStatus.posted => KararStatusTone.success,
                        TransactionStatus.voided => KararStatusTone.danger,
                        TransactionStatus.unrecognised => KararStatusTone.neutral,
                      },
                    ),
                  ],
                ),
                if (transaction.originalAmount != null) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.transactionOriginalAmountLabel,
                    value: formatMoney(context, transaction.originalAmount!),
                  ),
                  SizedBox(height: context.spacing.xxs),
                  Text(
                    l10n.transactionOriginalAmountNotice,
                    textAlign: TextAlign.start,
                    style: context.typography.bodySmall
                        .copyWith(color: context.colors.contentTertiary),
                  ),
                ],
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.transactionBookedOnLabel,
                  value: formatCalendarDay(context, transaction.bookingDate),
                ),
                if (transaction.valueDate != null) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.transactionValueDateLabel,
                    value: formatCalendarDay(context, transaction.valueDate!),
                  ),
                ],
                if (transaction.eventOccurredAt != null) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.transactionEventOccurredLabel,
                    value: formatInstant(context, transaction.eventOccurredAt!),
                  ),
                ],
                if (transaction.sourceTimezone != null) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.transactionSourceTimezoneLabel,
                    value: transaction.sourceTimezone!,
                  ),
                ],
                if (transaction.merchant != null) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.transactionMerchantLabel,
                    value: transaction.merchant!,
                  ),
                ],
                if (transaction.note != null) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.transactionNoteLabel,
                    value: transaction.note!,
                  ),
                ],
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountSourceFieldLabel,
                  value: sourceKindLabel(
                    transaction.sourceKind,
                    transaction.availability,
                    l10n,
                  ),
                ),
              ],
            ),
          ),
        ),
        _Category(detail: detail, l10n: l10n),
        _Revisions(revisions: detail.revisions, l10n: l10n),
        _Provenance(transactionId: transaction.transactionId, l10n: l10n),
        KararButton(
          label: l10n.transactionCorrectAction,
          variant: KararButtonVariant.secondary,
          isFullWidth: true,
          onPressed: () => context.go(
            FinancialRoutes.transactionCorrectPath(transaction.transactionId),
          ),
        ),
        SizedBox(height: context.spacing.sm),
        // Offered because the platform exposes the operation. There is no
        // equivalent control for an ACCOUNT anywhere in this client, because
        // the platform deliberately exposes no account deletion.
        KararButton(
          label: l10n.transactionDeleteAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: write is TransactionWriteSubmitting,
          onPressed: () => unawaited(_confirmDelete(context, ref, transaction)),
        ),
      ],
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Transaction transaction,
  ) async {
    final confirmed = await showKararDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => KararDialog(
        title: l10n.transactionDeleteConfirmTitle,
        message: l10n.transactionDeleteConfirmMessage,
        confirmLabel: l10n.transactionDeleteAction,
        cancelLabel: l10n.actionCancel,
        isDestructive: true,
        onConfirm: () => Navigator.of(dialogContext).pop(true),
        onCancel: () => Navigator.of(dialogContext).pop(false),
      ),
    );
    if (confirmed != true) {
      return;
    }
    await ref.read(transactionWriteControllerProvider.notifier).delete(
          transaction.transactionId,
          accountId: transaction.accountId,
        );
  }
}

/// The active category and the control that changes it.
final class _Category extends StatelessWidget {
  const _Category({required this.detail, required this.l10n});

  final TransactionDetail detail;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final assignment = detail.activeCategory;
    return FinancialSection(
      heading: l10n.transactionCategoryLabel,
      child: KararCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            LabelledValue(
              label: l10n.transactionCategoryLabel,
              value: assignment?.categoryCode ?? l10n.transactionCategoryNone,
            ),
            if (assignment != null) ...<Widget>[
              SizedBox(height: context.spacing.sm),
              LabelledValue(
                label: l10n.accountSourceFieldLabel,
                value: assignmentSourceLabel(assignment.assignmentSource, l10n),
              ),
              if (assignment.ruleVersion != null) ...<Widget>[
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.transactionCategoryRuleVersionLabel,
                  value: assignment.ruleVersion!,
                ),
              ],
            ],
            SizedBox(height: context.spacing.md),
            KararButton(
              label: l10n.transactionCategoryChangeAction,
              variant: KararButtonVariant.secondary,
              onPressed: () => context.go(
                FinancialRoutes.transactionCategoryPath(
                  detail.transaction.transactionId,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The append-only history, oldest first.
final class _Revisions extends StatelessWidget {
  const _Revisions({required this.revisions, required this.l10n});

  final List<TransactionRevision> revisions;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return FinancialSection(
      heading: l10n.transactionRevisionsTitle,
      child: KararCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            for (final revision in revisions)
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      context.formatter.applyNumerals(
                        l10n.transactionRevisionNumber(revision.revisionNumber),
                      ),
                      textAlign: TextAlign.start,
                      style: context.typography.labelLarge
                          .copyWith(color: context.colors.contentPrimary),
                    ),
                    SizedBox(height: context.spacing.xxs),
                    Text(
                      revisionAttributionLabel(revision.attribution, l10n),
                      textAlign: TextAlign.start,
                      style: context.typography.bodySmall
                          .copyWith(color: context.colors.contentSecondary),
                    ),
                    SizedBox(height: context.spacing.xxs),
                    Text(
                      revision.changedFields.isEmpty
                          ? l10n.transactionRevisionNoChangedFields
                          : l10n.transactionRevisionChangedFields(
                              <String>[
                                for (final field in revision.changedFields)
                                  revisableFieldLabel(field, l10n),
                              ].join(', '),
                            ),
                      textAlign: TextAlign.start,
                      style: context.typography.bodySmall
                          .copyWith(color: context.colors.contentSecondary),
                    ),
                    SizedBox(height: context.spacing.xs),
                    LabelledValue(
                      label: l10n.transactionAmountLabel,
                      value: formatMoney(context, revision.values.amount),
                    ),
                    SizedBox(height: context.spacing.xs),
                    LabelledValue(
                      label: l10n.transactionBookedOnLabel,
                      value: formatCalendarDay(context, revision.values.bookingDate),
                    ),
                    SizedBox(height: context.spacing.xs),
                    LabelledValue(
                      label: l10n.accountUpdatedLabel,
                      value: formatInstant(context, revision.recordedAt),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The safe provenance of every revision.
final class _Provenance extends ConsumerWidget {
  const _Provenance({required this.transactionId, required this.l10n});

  final String transactionId;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provenance = ref.watch(transactionProvenanceProvider(transactionId));
    return FinancialSection(
      heading: l10n.transactionProvenanceTitle,
      child: KararCard(
        child: provenance.when(
          loading: () => const KararLoadingIndicator.inline(),
          error: (Object error, StackTrace _) => Text(
            l10n.transactionProvenanceUnavailable,
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          data: (List<TransactionProvenance> rows) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (final row in rows)
                Padding(
                  padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        context.formatter.applyNumerals(
                          l10n.transactionRevisionNumber(row.revisionNumber),
                        ),
                        textAlign: TextAlign.start,
                        style: context.typography.labelLarge
                            .copyWith(color: context.colors.contentPrimary),
                      ),
                      SizedBox(height: context.spacing.xs),
                      LabelledValue(
                        label: l10n.accountSourceFieldLabel,
                        value: sourceKindLabel(row.sourceKind, row.availability, l10n),
                      ),
                      SizedBox(height: context.spacing.xs),
                      LabelledValue(
                        label: l10n.transactionProvenanceTitle,
                        value: row.importedFromStatement
                            ? l10n.provenanceImportedFromStatement
                            : l10n.provenanceNotImportedFromStatement,
                      ),
                      SizedBox(height: context.spacing.xs),
                      LabelledValue(
                        label: l10n.provenanceSourceDirectionLabel,
                        value: sourceDirectionLabel(row.sourceDirection, l10n),
                      ),
                      SizedBox(height: context.spacing.xs),
                      LabelledValue(
                        label: l10n.provenanceDirectionMappingLabel,
                        value: directionMappingLabel(row.directionMapping, l10n),
                      ),
                      SizedBox(height: context.spacing.xs),
                      LabelledValue(
                        label: l10n.transactionCategoryLabel,
                        value: categoryAssignmentOriginLabel(
                          row.categoryAssignmentSource,
                          l10n,
                        ),
                      ),
                      SizedBox(height: context.spacing.xs),
                      Text(
                        l10n.provenanceVersionsLabel,
                        textAlign: TextAlign.start,
                        style: context.typography.labelMedium
                            .copyWith(color: context.colors.contentSecondary),
                      ),
                      LabelledValue(
                        label: l10n.provenanceParserVersionLabel,
                        value: row.versions.parserVersion,
                      ),
                      LabelledValue(
                        label: l10n.provenanceMappingVersionLabel,
                        value: row.versions.mappingVersion,
                      ),
                      LabelledValue(
                        label: l10n.provenanceNormalizationVersionLabel,
                        value: row.versions.normalizationVersion,
                      ),
                      // The ALGORITHM version. Never the fingerprint itself,
                      // which is a dedup handle and is absent from this
                      // projection by construction.
                      LabelledValue(
                        label: l10n.provenanceFingerprintVersionLabel,
                        value: row.versions.fingerprintVersion,
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The outcome of the last write, including a delete that only partly applied.
final class _WriteOutcome extends StatelessWidget {
  const _WriteOutcome({required this.state, required this.l10n});

  final TransactionWriteState state;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = switch (state) {
      TransactionWriteIdle() || TransactionWriteSubmitting() => null,
      TransactionWriteSaved() => KararBanner(
          message: l10n.transactionCorrectionSaved,
          tone: KararStatusTone.success,
        ),
      TransactionCategorySaved() => KararBanner(
          message: l10n.categoryAssigned,
          tone: KararStatusTone.success,
        ),
      TransactionDeleteSettled(:final outcome) => outcome.applied
          ? KararBanner(message: l10n.transactionDeleted, tone: KararStatusTone.success)
          : KararBanner(
              message: l10n.transactionDeletePartial,
              tone: KararStatusTone.warning,
            ),
      TransactionWriteRejected(:final isVersionConflict, :final isNoChange) =>
        KararBanner(
          message: isVersionConflict
              ? l10n.transactionVersionConflict
              : isNoChange
                  ? l10n.transactionNoChange
                  : l10n.transactionRejected,
          tone: KararStatusTone.danger,
        ),
    };
    if (banner == null) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      child: banner,
    );
  }
}
