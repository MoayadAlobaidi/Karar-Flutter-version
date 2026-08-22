// THE REVIEW SURFACE, AS PARTS BOTH REVIEW LOCATIONS SHARE.
//
// NOTHING HERE RENDERS A VALUE FROM THE FILE, and there is nothing to render:
// the preview boundary carries counts, states and codes, and `RowIssue` has
// three fields with no room for a fourth. A person deciding whether to import
// needs to know how many rows are valid, how many are duplicates, and which
// rows failed and why — none of which requires their statement to be echoed
// back at them into a screenshot, a support ticket or a crash report.
//
// `statementImportNoValuesShown` says this out loud rather than leaving a
// person to wonder why the refused rows are bare. A row number they can look up
// in their own file is more useful than a quoted cell, and infinitely safer.
import 'package:flutter/material.dart';

import '../../../l10n/generated/app_localizations.dart';
import '../../../shared/shared.dart';
import '../domain/import_lifecycle.dart';
import '../domain/row_issue.dart';
import '../domain/statement_import.dart';
import 'statement_import_labels.dart';

/// What the parse counted.
class ImportCountsCard extends StatelessWidget {
  const ImportCountsCard({required this.counts, super.key});

  final ImportCounts counts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(l10n.statementImportCountsTitle, style: context.typography.titleMedium),
          SizedBox(height: context.spacing.sm),
          _CountRow(label: l10n.statementImportCountRows, value: counts.rowCount),
          _CountRow(
            label: l10n.statementImportCountValid,
            value: counts.validRowCount,
          ),
          _CountRow(
            label: l10n.statementImportCountInvalid,
            value: counts.invalidRowCount,
          ),
          _CountRow(
            label: l10n.statementImportCountExactDuplicates,
            value: counts.exactDuplicateCount,
          ),
          _CountRow(
            label: l10n.statementImportCountProbableDuplicates,
            value: counts.probableDuplicateCount,
            // The count is always zero because nothing looks. Saying so keeps
            // "none found" from reading as "none looked for".
            note: l10n.statementImportProbableDuplicatesNote,
          ),
        ],
      ),
    );
  }
}

class _CountRow extends StatelessWidget {
  const _CountRow({required this.label, required this.value, this.note});

  final String label;
  final int value;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final formatted = context.formatter.integer(value);
    final description = note;
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.xs),
      child: Semantics(
        container: true,
        label: '$label: $formatted',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                Expanded(child: Text(label, style: context.typography.bodyMedium)),
                Text(formatted, style: context.typography.numeric),
              ],
            ),
            if (description != null)
              Text(
                description,
                style: context.typography.bodySmall.copyWith(
                  color: context.colors.contentTertiary,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Whether the statement agrees with itself, and what that means for the
/// decision.
class ReconciliationCard extends StatelessWidget {
  const ReconciliationCard({required this.outcome, super.key});

  final ReconciliationOutcome outcome;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final blocks = outcome == ReconciliationOutcome.mismatched;
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            l10n.statementImportReconciliationTitle,
            style: context.typography.titleMedium,
          ),
          SizedBox(height: context.spacing.xs),
          Text(reconciliationMessage(outcome, l10n), style: context.typography.bodyMedium),
          if (blocks) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            KararBanner(
              message: l10n.statementImportReconciliationBlocksCommit,
              tone: KararStatusTone.warning,
            ),
          ],
        ],
      ),
    );
  }
}

/// One typed import refusal, never a generic apology.
class ImportRefusalCard extends StatelessWidget {
  const ImportRefusalCard({required this.refusal, super.key});

  final ImportRefusal refusal;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return KararBanner(
      title: l10n.statementImportRefusedTitle,
      message: importRefusalMessage(refusal, l10n),
      tone: KararStatusTone.danger,
    );
  }
}

/// The refused rows: a line number, a field name, a reason and a remedy.
class RowIssuesSection extends StatelessWidget {
  const RowIssuesSection({required this.preview, super.key});

  final StatementImportPreview preview;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final issues = preview.rowIssues;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(l10n.statementImportRowIssuesTitle, style: context.typography.titleMedium),
        SizedBox(height: context.spacing.xs),
        if (issues.isEmpty)
          Text(l10n.statementImportRowIssuesNone, style: context.typography.bodyMedium)
        else ...<Widget>[
          Text(
            l10n.statementImportNoValuesShown,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentTertiary,
            ),
          ),
          if (preview.isTruncated) ...<Widget>[
            SizedBox(height: context.spacing.xs),
            // The real total travels with the page, so a truncated report can
            // never read as a complete one.
            Text(
              context.formatter.applyNumerals(
                l10n.statementImportIssuesTruncated(
                  preview.reportedErrorCount,
                  preview.totalErrorCount,
                ),
              ),
              style: context.typography.bodySmall,
            ),
          ],
          SizedBox(height: context.spacing.sm),
          for (final issue in issues) RowIssueTile(issue: issue),
        ],
      ],
    );
  }
}

/// One refused row.
class RowIssueTile extends StatelessWidget {
  const RowIssueTile({required this.issue, super.key});

  final RowIssue issue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final rowLabel = context.formatter.applyNumerals(
      l10n.statementImportRowNumber(issue.rowNumber),
    );
    final field = statementFieldLabel(issue.field, l10n);
    final reason = rowReasonMessage(issue.reason, l10n);
    final remedy = rowRemedyMessage(issue.reason.remedy, l10n);
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
      child: Semantics(
        container: true,
        label: '$rowLabel. $field. $reason. $remedy',
        child: KararCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Text(rowLabel, style: context.typography.labelLarge),
                  KararStatusBadge(label: field, tone: KararStatusTone.neutral),
                ],
              ),
              SizedBox(height: context.spacing.xxs),
              Text(reason, style: context.typography.bodyMedium),
              SizedBox(height: context.spacing.xxs),
              Text(
                remedy,
                style: context.typography.bodySmall.copyWith(
                  color: context.colors.contentSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The state an import is in, as a badge a screen reader can read.
class ImportStateBadge extends StatelessWidget {
  const ImportStateBadge({required this.state, super.key});

  final ImportLifecycleState state;

  @override
  Widget build(BuildContext context) {
    final label = importStateLabel(state, context.l10n);
    return KararStatusBadge(label: label, tone: _toneFor(state));
  }

  /// Exhaustive, so a state added to the contract has to be given a tone by a
  /// person rather than defaulting into whichever arm came first.
  static KararStatusTone _toneFor(ImportLifecycleState state) => switch (state) {
        ImportLifecycleState.committed => KararStatusTone.success,
        ImportLifecycleState.failed ||
        ImportLifecycleState.duplicate =>
          KararStatusTone.warning,
        ImportLifecycleState.rejected ||
        ImportLifecycleState.erased =>
          KararStatusTone.neutral,
        ImportLifecycleState.reviewRequired => KararStatusTone.info,
        ImportLifecycleState.draft ||
        ImportLifecycleState.sourceStored ||
        ImportLifecycleState.parsing ||
        ImportLifecycleState.committing ||
        ImportLifecycleState.unrecognised =>
          KararStatusTone.neutral,
      };
}

/// The preview and its typed refusal, if any. Shared by both review locations.
class ImportReviewBody extends StatelessWidget {
  const ImportReviewBody({required this.preview, super.key});

  final StatementImportPreview preview;

  @override
  Widget build(BuildContext context) {
    final snapshot = preview.snapshot;
    final refusal = snapshot.refusal;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ImportStateBadge(state: snapshot.state),
        SizedBox(height: context.spacing.sm),
        if (refusal != null) ...<Widget>[
          ImportRefusalCard(refusal: refusal),
          SizedBox(height: context.spacing.sm),
        ],
        ImportCountsCard(counts: snapshot.counts),
        SizedBox(height: context.spacing.sm),
        ReconciliationCard(outcome: snapshot.reconciliation),
        SizedBox(height: context.spacing.md),
        RowIssuesSection(preview: preview),
      ],
    );
  }
}

/// Re-exported so a test reads the same label function the widgets do.
String importStateLabelFor(ImportLifecycleState state, AppLocalizations l10n) =>
    importStateLabel(state, l10n);
