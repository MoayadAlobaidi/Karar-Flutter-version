// THE TRANSFER-MATCHING SURFACE.
//
// A person is shown pairs the platform PROPOSED and answers them. Four
// properties hold on this screen, and each is a decision rather than a detail:
//
//   1. A PROPOSAL IS NEVER RENDERED AS APPLIED. Every proposed pair carries the
//      sentence that nothing has changed, the badge reads "Proposed", and the
//      only thing that turns it into "Confirmed by you" is the row the platform
//      answers with. An in-flight confirmation shows as an in-flight
//      confirmation.
//
//   2. THE ANSWER CONTROLS LIVE INSIDE THE EVIDENCE. "Yes, one movement" does
//      not exist on a collapsed card. To reach it a person opens the two
//      movements, and opening them is what reads the two transactions — so the
//      button appears next to the amounts and dates it is about, and never
//      instead of them. The confirmation is also withheld while either movement
//      is unreadable: answering "these are one movement" about something you
//      cannot see is exactly the trust this surface exists not to ask for.
//
//   3. NOTHING IS TOTALLED, NETTED OR CONVERTED. The two sides are rendered as
//      two amounts. There is no sum, no net, no "you moved X this month", and
//      across two currencies there is no rate — a cross-currency pair states
//      the refusal and withholds the confirmation instead of relating the two
//      figures with a number nobody supplied.
//
//   4. THE BASIS IS SHOWN, NOT A SCORE. The rule the platform matched on is
//      written out and its version label is shown verbatim, so a person can see
//      WHY a pair was proposed rather than being asked to trust a confidence
//      figure — of which this platform has none.
//
// No widget here performs a request. A screen reads a provider, the provider
// reads a use case, the use case reads the repository, and only the repository
// touches the generated client.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/financial_account.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../../financial_accounts/presentation/financial_formatting.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../../transactions/domain/transaction_detail.dart';
import '../../transactions/presentation/transactions_providers.dart';
import '../domain/transfer_match.dart';
import '../domain/transfer_matches_repository.dart';
import 'transfer_match_labels.dart';
import 'transfer_matching_providers.dart';

/// Every pair the platform has proposed, and every one already answered.
final class TransferMatchesScreen extends ConsumerWidget {
  const TransferMatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final listing = ref.watch(transferMatchListingProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.transferMatchesScreenTitle,
        onBack: () => context.go(FinancialRoutes.accounts),
      ),
      body: SafeArea(
        top: false,
        child: listing.when(
          loading: () => KararLoadingView(subject: l10n.transferMatchesScreenTitle),
          error: (Object error, StackTrace _) => _Unavailable(l10n: l10n),
          data: (TransferMatchListing value) => switch (value) {
            TransferMatchesUnavailable() => _Unavailable(l10n: l10n),
            TransferMatchesLoaded() => _Listing(listing: value, l10n: l10n),
          },
        ),
      ),
    );
  }
}

final class _Unavailable extends ConsumerWidget {
  const _Unavailable({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Center(
        child: SingleChildScrollView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          child: KararStateView.error(
            title: l10n.transferMatchesUnavailableTitle,
            message: l10n.transferMatchesUnavailableDescription,
            actionLabel: l10n.actionRetry,
            onAction: () => unawaited(
              ref.read(transferMatchListingProvider.notifier).refresh(),
            ),
          ),
        ),
      );
}

final class _Listing extends ConsumerWidget {
  const _Listing({required this.listing, required this.l10n});

  final TransferMatchesLoaded listing;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => ListView(
        padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
        children: <Widget>[
          _Introduction(l10n: l10n),
          _Filters(selected: listing.filter, l10n: l10n),
          if (listing.rows.isEmpty)
            KararStateView.empty(
              title: emptyListingTitle(listing.filter, l10n),
              message: emptyListingDescription(listing.filter, l10n),
            )
          else
            for (final row in listing.rows)
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                child: _MatchCard(row: row, l10n: l10n),
              ),
          if (listing.hasMore)
            Padding(
              padding: EdgeInsetsDirectional.only(top: context.spacing.sm),
              child: listing.isLoadingMore
                  ? KararLoadingIndicator(label: l10n.transferMatchesLoadingMore)
                  : KararButton(
                      label: l10n.transferMatchesLoadMore,
                      variant: KararButtonVariant.secondary,
                      isFullWidth: true,
                      onPressed: () => unawaited(
                        ref.read(transferMatchListingProvider.notifier).loadMore(),
                      ),
                    ),
            ),
        ],
      );
}

/// What this surface is, before the first card.
///
/// It states that a proposal changes nothing. That sentence is the difference
/// between a product that asks a person a question and one that quietly
/// rewrites their record and tells them afterwards.
final class _Introduction extends StatelessWidget {
  const _Introduction({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
        child: KararCard(
          child: Text(
            l10n.transferMatchesIntro,
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
        ),
      );
}

final class _Filters extends ConsumerWidget {
  const _Filters({required this.selected, required this.l10n});

  final MatchStateFilter selected;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => FinancialChoiceRow(
        label: l10n.transferMatchesFilterLabel,
        children: <Widget>[
          for (final filter in MatchStateFilter.values)
            FinancialChoice(
              label: matchFilterLabel(filter, l10n),
              isSelected: filter == selected,
              onPressed: () =>
                  ref.read(transferMatchFilterProvider.notifier).show(filter),
            ),
        ],
      );
}

/// One proposed or answered pair.
final class _MatchCard extends ConsumerWidget {
  const _MatchCard({required this.row, required this.l10n});

  final TransferMatchRow row;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final match = row.match;
    final isOpen = ref.watch(openedTransferMatchProvider).contains(match.matchId);
    final progress = decisionProgressStatus(row.progress, l10n);
    final refusal = row.refusal;

    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararStatusBadge(
            label: matchStateLabel(match.state, l10n),
            tone: matchStateTone(match.state),
          ),
          SizedBox(height: context.spacing.sm),
          _AccountPair(match: match, l10n: l10n),
          SizedBox(height: context.spacing.sm),
          Text(
            matchStateNote(match.state, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          SizedBox(height: context.spacing.sm),
          _Basis(match: match, l10n: l10n),
          if (match.spansTwoCurrencies) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            KararBanner(
              title: l10n.transferMatchCrossCurrencyTitle,
              message: l10n.transferMatchCrossCurrencyDetail,
              tone: KararStatusTone.warning,
            ),
          ],
          if (refusal != null) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            KararBanner(
              message: decisionRefusalMessage(refusal, l10n),
              tone: KararStatusTone.danger,
            ),
          ],
          if (progress != null) ...<Widget>[
            SizedBox(height: context.spacing.sm),
            KararLoadingIndicator(label: progress),
          ],
          SizedBox(height: context.spacing.sm),
          _Timestamps(match: match, l10n: l10n),
          SizedBox(height: context.spacing.sm),
          KararButton(
            label: isOpen
                ? l10n.transferMatchActionHideMovements
                : l10n.transferMatchActionOpenMovements,
            variant: KararButtonVariant.secondary,
            isFullWidth: true,
            onPressed: () => ref
                .read(openedTransferMatchProvider.notifier)
                .toggle(match.matchId),
          ),
          if (!isOpen && match.awaitsDecision) ...<Widget>[
            SizedBox(height: context.spacing.xs),
            Text(
              l10n.transferMatchOpenToAnswerNote,
              textAlign: TextAlign.start,
              style: context.typography.labelMedium
                  .copyWith(color: context.colors.contentSecondary),
            ),
          ],
          if (isOpen) ...<Widget>[
            SizedBox(height: context.spacing.md),
            _Movements(row: row, l10n: l10n),
          ],
        ],
      ),
    );
  }
}

/// The two accounts, named from the person's own portfolio.
///
/// An identifier is never rendered. When the portfolio cannot be read the
/// account is named as unavailable rather than shown as a uuid, which would be
/// both meaningless to a person and a reference in a screenshot.
final class _AccountPair extends ConsumerWidget {
  const _AccountPair({required this.match, required this.l10n});

  final TransferMatch match;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(ownAccountsProvider).value;
    final accounts = view is AccountsLoaded ? view.accounts : const <FinancialAccount>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        LabelledValue(
          label: l10n.transferMatchOutflowHeading,
          value: _nameFor(match.outflow.accountId, accounts),
          emphasis: true,
        ),
        SizedBox(height: context.spacing.xs),
        LabelledValue(
          label: l10n.transferMatchInflowHeading,
          value: _nameFor(match.inflow.accountId, accounts),
          emphasis: true,
        ),
      ],
    );
  }

  String _nameFor(String accountId, List<FinancialAccount> accounts) {
    for (final account in accounts) {
      if (account.accountId == accountId) {
        return account.displayName;
      }
    }
    return l10n.transferMatchAccountNotNamed;
  }
}

/// Why the platform proposed this pair, and under which version of the rule.
final class _Basis extends StatelessWidget {
  const _Basis({required this.match, required this.l10n});

  final TransferMatch match;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              l10n.transferMatchBasisHeading,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium
                  .copyWith(color: context.colors.contentSecondary),
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          Text(
            suggestionBasisSentence(match.suggestionBasis, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentPrimary),
          ),
          SizedBox(height: context.spacing.xs),
          // Verbatim. The label names the rule that looked at this person's
          // data; parsing it into a number of days here would let a widened
          // window silently reinterpret a question already answered.
          LabelledValue(
            label: l10n.transferMatchRuleLabel,
            value: match.suggestionWindow,
          ),
          SizedBox(height: context.spacing.xxs),
          Text(
            l10n.transferMatchNoScoreNote,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
        ],
      );
}

final class _Timestamps extends StatelessWidget {
  const _Timestamps({required this.match, required this.l10n});

  final TransferMatch match;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final decidedAt = match.subjectDecidedAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        LabelledValue(
          label: l10n.transferMatchProposedAtLabel,
          value: formatInstantDate(context, match.firstSuggestedAt),
        ),
        if (decidedAt != null) ...<Widget>[
          SizedBox(height: context.spacing.xxs),
          LabelledValue(
            label: l10n.transferMatchDecidedAtLabel,
            value: formatInstantDate(context, decidedAt),
          ),
        ],
      ],
    );
  }
}

/// The two movements a pair relates, and the controls that answer it.
///
/// The two transactions are read HERE rather than with the listing: a page of
/// proposals would otherwise cost two extra requests per row for evidence
/// nobody had asked to see.
final class _Movements extends ConsumerWidget {
  const _Movements({required this.row, required this.l10n});

  final TransferMatchRow row;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final match = row.match;
    final outflow = ref.watch(transactionDetailProvider(match.outflow.transactionId));
    final inflow = ref.watch(transactionDetailProvider(match.inflow.transactionId));
    final bothReadable = outflow.value != null && inflow.value != null;
    final anyLoading = outflow.isLoading || inflow.isLoading;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _MovementSide(
          heading: l10n.transferMatchOutflowHeading,
          side: match.outflow,
          detail: outflow,
          l10n: l10n,
        ),
        SizedBox(height: context.spacing.sm),
        _MovementSide(
          heading: l10n.transferMatchInflowHeading,
          side: match.inflow,
          detail: inflow,
          l10n: l10n,
        ),
        if (anyLoading) ...<Widget>[
          SizedBox(height: context.spacing.sm),
          KararLoadingIndicator(label: l10n.transferMatchMovementsLoading),
        ],
        SizedBox(height: context.spacing.md),
        _Answers(row: row, bothMovementsReadable: bothReadable, l10n: l10n),
      ],
    );
  }
}

/// One side of the pair: the amount and the day, as the platform reported them.
///
/// The amount comes from the TRANSACTION. The relationship carries none, by
/// design — a copy on the relationship would be a third figure free to disagree
/// with the two it claims to describe.
final class _MovementSide extends StatelessWidget {
  const _MovementSide({
    required this.heading,
    required this.side,
    required this.detail,
    required this.l10n,
  });

  final String heading;
  final MatchSide side;
  final AsyncValue<TransactionDetail?> detail;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final loaded = detail.value;
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              heading,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium
                  .copyWith(color: context.colors.contentPrimary),
            ),
          ),
          SizedBox(height: context.spacing.xs),
          // The currency comes off the RELATIONSHIP, which states one code per
          // side. It is shown for each side separately and the two are never
          // related to one another.
          LabelledValue(
            label: l10n.transferMatchCurrencyLabel,
            value: context.formatter.currencyDisplayFor(side.currencyCode),
          ),
          if (loaded == null)
            Padding(
              padding: EdgeInsetsDirectional.only(top: context.spacing.xs),
              child: detail.hasError
                  ? Text(
                      l10n.transferMatchMovementUnavailable,
                      textAlign: TextAlign.start,
                      style: context.typography.bodyMedium
                          .copyWith(color: context.colors.danger.content),
                    )
                  : const SizedBox.shrink(),
            )
          else ...<Widget>[
            SizedBox(height: context.spacing.xs),
            LabelledValue(
              label: l10n.transferMatchAmountLabel,
              value: formatMoney(context, loaded.transaction.amount),
              emphasis: true,
            ),
            SizedBox(height: context.spacing.xxs),
            LabelledValue(
              label: l10n.transferMatchBookedLabel,
              value: formatCalendarDay(context, loaded.transaction.bookingDate),
            ),
            SizedBox(height: context.spacing.xxs),
            LabelledValue(
              label: l10n.transferMatchDescriptionLabel,
              value: loaded.transaction.description,
            ),
          ],
        ],
      ),
    );
  }
}

/// The person's two possible answers.
///
/// "Yes, one movement" exists ONLY when the pair is still open, the two sides
/// are in one currency, and both movements are on the screen. "No, two separate
/// movements" — which from a confirmed pair is how a confirmation is withdrawn —
/// stays available without the evidence: it asserts nothing about a
/// relationship and leaves both records exactly as they are.
final class _Answers extends ConsumerWidget {
  const _Answers({
    required this.row,
    required this.bothMovementsReadable,
    required this.l10n,
  });

  final TransferMatchRow row;
  final bool bothMovementsReadable;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final match = row.match;
    final withdrawing = match.rejectionWouldWithdrawConfirmation;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (match.isConfirmable && bothMovementsReadable)
          KararButton(
            label: l10n.transferMatchActionConfirm,
            semanticLabel: l10n.transferMatchActionConfirm,
            isFullWidth: true,
            isLoading: row.progress == MatchDecisionProgress.confirming,
            onPressed: row.isDeciding
                ? null
                : () => unawaited(
                      ref
                          .read(transferMatchListingProvider.notifier)
                          .confirm(match.matchId),
                    ),
          ),
        if (match.isRejectable) ...<Widget>[
          SizedBox(height: context.spacing.xs),
          KararButton(
            label: withdrawing
                ? l10n.transferMatchActionWithdraw
                : l10n.transferMatchActionReject,
            semanticLabel: withdrawing
                ? l10n.transferMatchActionWithdraw
                : l10n.transferMatchActionReject,
            variant: KararButtonVariant.secondary,
            isFullWidth: true,
            isLoading: row.progress == MatchDecisionProgress.rejecting,
            onPressed: row.isDeciding
                ? null
                : () => unawaited(_askThenReject(context, ref, withdrawing)),
          ),
        ],
      ],
    );
  }

  /// Both refusals are TERMINAL — a rejected pair can never be confirmed — so
  /// each is asked for once, with the consequence stated, before it is sent.
  Future<void> _askThenReject(
    BuildContext context,
    WidgetRef ref,
    bool withdrawing,
  ) async {
    final agreed = await showKararDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => KararDialog(
        title: withdrawing
            ? l10n.transferMatchWithdrawDialogTitle
            : l10n.transferMatchRejectDialogTitle,
        message: withdrawing
            ? l10n.transferMatchWithdrawDialogMessage
            : l10n.transferMatchRejectDialogMessage,
        confirmLabel: withdrawing
            ? l10n.transferMatchActionWithdraw
            : l10n.transferMatchActionReject,
        cancelLabel: l10n.actionCancel,
        isDestructive: true,
        onConfirm: () => Navigator.of(dialogContext).pop(true),
        onCancel: () => Navigator.of(dialogContext).pop(false),
      ),
    );
    if (agreed != true) {
      return;
    }
    await ref
        .read(transferMatchListingProvider.notifier)
        .reject(row.match.matchId);
  }
}
