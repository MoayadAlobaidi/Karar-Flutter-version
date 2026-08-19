// THE IMPORT, END TO END: CHOOSE, UPLOAD, MAP, READ, DECIDE.
//
// One screen driven by one controller, because the steps share a file and a
// version and splitting them across locations would mean either putting a
// statement in a route or reloading it at every hop.
//
// ## What this screen refuses to do
//
//   * it never shows a spinner without saying what is happening. Every in-
//     flight step names itself, so a screen reader announces "uploading your
//     file" rather than an unlabelled progress indicator;
//   * it never reports a refusal as a generic failure. A typed code gets its
//     own sentence, and a code this build does not know says exactly that;
//   * it never asks for a banking credential, and says so up front. There is no
//     password field, no PIN field, no one-time-code field and no institution
//     login anywhere in this feature, because the only rail is a file the
//     person uploads themselves.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/failure.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/financial_account.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../domain/statement_import.dart';
import '../domain/statement_source.dart';
import 'column_mapping_form.dart';
import 'statement_import_labels.dart';
import 'statement_import_review_widgets.dart';
import 'statement_imports_providers.dart';

/// The statement-import flow.
class StatementImportScreen extends ConsumerStatefulWidget {
  const StatementImportScreen({super.key});

  @override
  ConsumerState<StatementImportScreen> createState() => _StatementImportScreenState();
}

class _StatementImportScreenState extends ConsumerState<StatementImportScreen> {
  String? _accountId;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(statementImportFlowProvider);
    return Scaffold(
      appBar: KararAppBar(title: l10n.statementImportTitle),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsetsDirectional.all(context.spacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Said before anything else, and on every step of the flow.
              KararBanner(
                message: l10n.statementImportRailExplanation,
                tone: KararStatusTone.info,
              ),
              SizedBox(height: context.spacing.md),
              _Step(state: state, accountId: _accountId, onAccountChosen: _chooseAccount),
            ],
          ),
        ),
      ),
    );
  }

  void _chooseAccount(String accountId) => setState(() => _accountId = accountId);
}

class _Step extends ConsumerWidget {
  const _Step({
    required this.state,
    required this.accountId,
    required this.onAccountChosen,
  });

  final StatementImportFlowState state;
  final String? accountId;
  final void Function(String accountId) onAccountChosen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return switch (state) {
      ImportFlowIdle() => _ChooseSource(
          accountId: accountId,
          onAccountChosen: onAccountChosen,
          message: null,
        ),
      ImportFlowPickerUnavailable() => _ChooseSource(
          accountId: accountId,
          onAccountChosen: onAccountChosen,
          title: l10n.statementImportPickerUnavailableTitle,
          message: l10n.statementImportPickerUnavailableDetail,
          // A retry cannot succeed, so none is offered.
          canRetryPick: false,
        ),
      ImportFlowPickerUnreadable() => _ChooseSource(
          accountId: accountId,
          onAccountChosen: onAccountChosen,
          message: l10n.statementImportPickerUnreadable,
        ),
      final ImportFlowSourceRefused refused => _ChooseSource(
          accountId: accountId,
          onAccountChosen: onAccountChosen,
          message: _refusedMessage(refused, l10n),
        ),
      final ImportFlowSourceReady ready => _ReadyToUpload(
          accountId: accountId,
          onAccountChosen: onAccountChosen,
          source: ready.source,
        ),
      final ImportFlowMapping mapping => _MappingStep(mapping: mapping),
      final ImportFlowWorking working => _Working(step: working.step),
      final ImportFlowAwaitingReview review => _ReviewStep(snapshot: review.snapshot),
      final ImportFlowRefused refused => _RefusedStep(snapshot: refused.snapshot),
      final ImportFlowCommitted committed => _CommittedStep(receipt: committed.receipt),
      ImportFlowDiscarded() => _DiscardedStep(),
      final ImportFlowFailed failed => _FailedStep(failure: failed.failure),
    };
  }

  static String _refusedMessage(ImportFlowSourceRefused refused, AppLocalizations l10n) {
    final source = refused.source;
    if (source != null) {
      return sourceProblemMessage(source, l10n, l10n.statementImportSourceTooLarge);
    }
    final sample = refused.sample;
    return sample == null
        ? l10n.statementImportSourceEmpty
        : sampleProblemMessage(sample, l10n);
  }
}

/// Choose an account, then a file.
class _ChooseSource extends ConsumerWidget {
  const _ChooseSource({
    required this.accountId,
    required this.onAccountChosen,
    required this.message,
    this.title,
    this.canRetryPick = true,
  });

  final String? accountId;
  final void Function(String accountId) onAccountChosen;
  final String? message;
  final String? title;
  final bool canRetryPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final note = message;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _AccountChooser(accountId: accountId, onChosen: onAccountChosen),
        SizedBox(height: context.spacing.md),
        if (note != null) ...<Widget>[
          KararBanner(
            title: title,
            message: note,
            tone: KararStatusTone.warning,
          ),
          SizedBox(height: context.spacing.md),
        ],
        Text(
          context.formatter.applyNumerals(
            l10n.statementImportFileRules(maxSourceBytes ~/ (1024 * 1024)),
          ),
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentTertiary,
          ),
        ),
        SizedBox(height: context.spacing.sm),
        if (canRetryPick)
          KararButton(
            label: l10n.statementImportChooseFile,
            semanticLabel: l10n.statementImportChooseFileSemantics,
            onPressed: () => ref.read(statementImportFlowProvider.notifier).chooseSource(),
            isFullWidth: true,
          ),
      ],
    );
  }
}

/// The person picks which of their accounts the file belongs to, before it is
/// read. A file cannot redirect itself.
class _AccountChooser extends ConsumerWidget {
  const _AccountChooser({required this.accountId, required this.onChosen});

  final String? accountId;
  final void Function(String accountId) onChosen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final accounts = ref.watch(ownAccountsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(l10n.statementImportAccountLabel, style: context.typography.labelLarge),
        Text(
          l10n.statementImportAccountHelper,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentTertiary,
          ),
        ),
        SizedBox(height: context.spacing.xs),
        accounts.when(
          loading: () => KararLoadingView(subject: l10n.statementImportAccountLabel),
          error: (Object error, StackTrace _) =>
              Text(l10n.statementImportNoAccounts, style: context.typography.bodyMedium),
          data: (AccountsView view) => switch (view) {
            AccountsUnavailable() => Text(
                l10n.statementImportNoAccounts,
                style: context.typography.bodyMedium,
              ),
            AccountsLoaded(:final accounts) => accounts.isEmpty
                ? Text(
                    l10n.statementImportNoAccounts,
                    style: context.typography.bodyMedium,
                  )
                : Semantics(
                    label: l10n.statementImportAccountLabel,
                    child: DropdownButton<String>(
                      value: accountId,
                      isExpanded: true,
                      hint: Text(l10n.statementImportAccountLabel),
                      onChanged: (String? value) {
                        if (value != null) {
                          onChosen(value);
                        }
                      },
                      items: <DropdownMenuItem<String>>[
                        for (final account in accounts)
                          DropdownMenuItem<String>(
                            value: account.accountId,
                            child: Text(
                              account.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                    ),
                  ),
          },
        ),
      ],
    );
  }
}

/// A file is chosen and readable.
class _ReadyToUpload extends ConsumerWidget {
  const _ReadyToUpload({
    required this.accountId,
    required this.onAccountChosen,
    required this.source,
  });

  final String? accountId;
  final void Function(String accountId) onAccountChosen;
  final SelectedStatementSource source;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final chosen = accountId;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _AccountChooser(accountId: accountId, onChosen: onAccountChosen),
        SizedBox(height: context.spacing.md),
        KararBanner(
          message: l10n.statementImportFileChosen,
          tone: KararStatusTone.success,
        ),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.statementImportActionUpload,
          onPressed: chosen == null
              ? null
              : () => ref
                  .read(statementImportFlowProvider.notifier)
                  .upload(accountId: chosen),
          isFullWidth: true,
        ),
      ],
    );
  }
}

/// The mapping step, for the account this import targets.
class _MappingStep extends ConsumerWidget {
  const _MappingStep({required this.mapping});

  final ImportFlowMapping mapping;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = _currencyFor(ref, mapping.snapshot.accountId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          context.l10n.statementImportMappingTitle,
          style: context.typography.headingSmall,
        ),
        SizedBox(height: context.spacing.sm),
        ColumnMappingForm(
          sample: mapping.sample,
          accountCurrencyCode: currency.code,
          accountCurrencyExponent: currency.exponent,
          onSubmit: (StatedMapping stated) => ref
              .read(statementImportFlowProvider.notifier)
              .parse(mapping: stated.mapping, statedBalance: stated.balance),
        ),
      ],
    );
  }

  /// The currency of the target account, used ONLY to read a typed statement
  /// balance into exact minor units. It is never used as the currency of the
  /// file, which the person states separately.
  static CurrencyRef _currencyFor(WidgetRef ref, String accountId) {
    final accounts = ref.watch(ownAccountsProvider);
    final view = accounts is AsyncData<AccountsView> ? accounts.value : null;
    if (view is AccountsLoaded) {
      for (final account in view.accounts) {
        if (account.accountId == accountId) {
          return account.currency;
        }
      }
    }
    // Two decimal places is the commonest exponent and is used only to read a
    // typed figure the person can see; a wrong reading is refused by
    // `minorUnitsFromTypedAmount` rather than rounded.
    return const CurrencyRef(code: '', exponent: 2);
  }
}

/// Something is in flight, and it says which.
class _Working extends StatelessWidget {
  const _Working({required this.step});

  final ImportFlowStep step;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = switch (step) {
      ImportFlowStep.uploading => l10n.statementImportUploadingStatus,
      ImportFlowStep.parsing => l10n.statementImportParsingStatus,
      ImportFlowStep.committing => l10n.statementImportCommittingStatus,
      ImportFlowStep.discarding => l10n.statementImportActionDiscard,
    };
    return KararLoadingView(subject: label);
  }
}

/// The decision.
class _ReviewStep extends ConsumerWidget {
  const _ReviewStep({required this.snapshot});

  final StatementImportSnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final importId = ref.read(statementImportFlowProvider.notifier).importId;
    final preview = importId == null
        ? null
        : ref.watch(statementImportPreviewProvider(importId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          l10n.statementImportReviewTitle,
          style: context.typography.headingSmall,
        ),
        SizedBox(height: context.spacing.sm),
        if (preview == null)
          KararLoadingView(subject: l10n.statementImportReviewTitle)
        else
          preview.when(
            loading: () => KararLoadingView(subject: l10n.statementImportReviewTitle),
            error: (Object error, StackTrace _) => KararStateView.error(
              title: l10n.statementImportUnavailableTitle,
              message: l10n.statementImportUnavailableDescription,
            ),
            data: (ImportPreviewView view) => switch (view) {
              ImportPreviewUnavailable() => KararStateView.error(
                  title: l10n.statementImportUnavailableTitle,
                  message: l10n.statementImportUnavailableDescription,
                ),
              ImportPreviewLoaded(:final preview) => ImportReviewBody(preview: preview),
            },
          ),
        SizedBox(height: context.spacing.lg),
        _Decision(canCommit: snapshot.canCommit),
      ],
    );
  }
}

class _Decision extends ConsumerWidget {
  const _Decision({required this.canCommit});

  final bool canCommit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final controller = ref.read(statementImportFlowProvider.notifier);
    return Column(
      children: <Widget>[
        KararButton(
          label: l10n.statementImportActionCommit,
          onPressed: canCommit ? controller.commit : null,
          isFullWidth: true,
        ),
        SizedBox(height: context.spacing.sm),
        KararButton(
          label: l10n.statementImportActionDiscard,
          variant: KararButtonVariant.destructive,
          onPressed: controller.discard,
          isFullWidth: true,
        ),
      ],
    );
  }
}

/// The platform refused, with a typed code that gets its own sentence.
class _RefusedStep extends ConsumerWidget {
  const _RefusedStep({required this.snapshot});

  final StatementImportSnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final refusal = snapshot.refusal;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ImportStateBadge(state: snapshot.state),
        SizedBox(height: context.spacing.sm),
        if (refusal != null)
          ImportRefusalCard(refusal: refusal)
        else
          // The platform did not state a code. Saying so is truthful; inventing
          // a reason is not.
          KararBanner(
            title: l10n.statementImportRefusedTitle,
            message: l10n.statementImportRefusalUnrecognised,
            tone: KararStatusTone.danger,
          ),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.actionDone,
          onPressed: ref.read(statementImportFlowProvider.notifier).reset,
          isFullWidth: true,
        ),
      ],
    );
  }
}

class _CommittedStep extends ConsumerWidget {
  const _CommittedStep({required this.receipt});

  final ImportCommitReceipt receipt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        KararBanner(
          title: l10n.statementImportCommittedTitle,
          // An idempotent retry succeeded; a person is told their statement was
          // imported once, not that something failed.
          message: receipt.alreadyCommitted
              ? l10n.statementImportAlreadyCommitted
              : l10n.statementImportCommittedTitle,
          tone: KararStatusTone.success,
        ),
        SizedBox(height: context.spacing.sm),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(l10n.statementImportCommittedCount, style: context.typography.bodyMedium),
            Text(
              context.formatter.integer(receipt.committedTransactionCount),
              style: context.typography.numeric,
            ),
          ],
        ),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.actionDone,
          onPressed: ref.read(statementImportFlowProvider.notifier).reset,
          isFullWidth: true,
        ),
      ],
    );
  }
}

class _DiscardedStep extends ConsumerWidget {
  const _DiscardedStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        KararBanner(
          title: l10n.statementImportDiscardedTitle,
          message: l10n.statementImportDiscardedDetail,
          tone: KararStatusTone.neutral,
        ),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.actionDone,
          onPressed: ref.read(statementImportFlowProvider.notifier).reset,
          isFullWidth: true,
        ),
      ],
    );
  }
}

class _FailedStep extends ConsumerWidget {
  const _FailedStep({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return KararStateView.error(
      title: l10n.statementImportUnavailableTitle,
      message: l10n.statementImportUnavailableDescription,
      actionLabel: l10n.actionRetry,
      onAction: ref.read(statementImportFlowProvider.notifier).reset,
    );
  }
}
