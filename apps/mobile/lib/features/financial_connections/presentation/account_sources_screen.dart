// THE SOURCES FEEDING ONE ACCOUNT.
//
// Three questions get answers here, and each answer is guarded against the
// plausible lie that sits beside it:
//
//   1. WHICH SOURCES FEED THIS ACCOUNT, AND IN WHAT ORDER. The order on screen
//      is the platform's own, echoed rather than sorted, and each row shows the
//      rank the ordering is based on. When two sources claim one rank the
//      screen says the precedence is not decided instead of picking one — an
//      order this client invented would disagree with the platform's the moment
//      the rule changed;
//
//   2. WHEN DATA LAST ARRIVED. Exactly one field can produce that instant, and
//      the sentence naming it names the PERSON as the origin. The three nearby
//      instants — when the source was last SEEN, when the row last changed,
//      when the person confirmed the link — are each shown under their own
//      label with their own explanation, so none of them can be read as "we
//      checked with your bank";
//
//   3. WHAT THIS SOURCE CAN ACTUALLY DO. What was OBSERVED, never what is
//      supported. NOT_OBSERVED and NOT_PROVIDED stay two answers.
//
// THE COVERAGE RANGE IS NOT A FRESHNESS DATE, and this screen is where that
// mistake would be made. A statement covering up to March says nothing about
// when it was supplied. So the coverage row carries its own note, and the
// arrival sentence is derived from `lastSuccessfulImportAt` alone — see
// `domain/source_arrival.dart`, which takes the observation and cannot see the
// coverage at all.
//
// There is NO CONFIRM AND NO DECLINE CONTROL on this screen. The contract has no
// operation for either on this surface, and a control with no operation behind
// it is a button that lies.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/account_source_link.dart';
import '../../financial_accounts/domain/calendar_day.dart';
import '../../financial_accounts/domain/financial_account.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../../financial_accounts/presentation/financial_formatting.dart';
import '../../financial_accounts/presentation/financial_labels.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/financial_connections_repository.dart';
import '../domain/rail_standing.dart';
import '../domain/source_arrival.dart';
import 'connection_labels.dart';
import 'connection_routes.dart';

/// The sources feeding one of the caller's own accounts.
final class AccountSourcesScreen extends ConsumerWidget {
  const AccountSourcesScreen({required this.accountId, super.key});

  /// Opaque. It is the only thing this screen takes, and the only thing the
  /// location carries.
  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final AsyncValue<List<AccountSourceLink>> links =
        ref.watch(accountSourceLinksProvider(accountId));

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.accountSourcesScreenTitle,
        onBack: () => context.go(ConnectionRoutes.dataSources),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            _Heading(accountId: accountId, l10n: l10n),
            links.when(
              loading: () =>
                  KararLoadingView(subject: l10n.accountSourcesScreenTitle),
              error: (Object error, StackTrace _) => KararStateView.error(
                title: l10n.accountSourcesUnavailableTitle,
                message: l10n.accountSourcesUnavailableDescription,
              ),
              data: (List<AccountSourceLink> value) =>
                  _Sources(links: value, l10n: l10n),
            ),
          ],
        ),
      ),
    );
  }
}

/// The account this is about, named from the person's own portfolio, plus the
/// sentence that governs every date below it.
///
/// An identifier is never rendered. When the portfolio cannot be read the
/// account is left unnamed rather than shown as a uuid, which would be both
/// meaningless to a person and a reference in a screenshot.
final class _Heading extends ConsumerWidget {
  const _Heading({required this.accountId, required this.l10n});

  final String accountId;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AccountsView? view = ref.watch(ownAccountsProvider).value;
    final String? name = switch (view) {
      AccountsLoaded(:final accounts) => _nameOf(accounts),
      AccountsUnavailable() => null,
      null => null,
    };
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      child: KararCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (name != null) ...<Widget>[
              KararBidiText(
                name,
                style: context.typography.bodyLarge
                    .copyWith(color: context.colors.contentPrimary),
              ),
              SizedBox(height: context.spacing.sm),
            ],
            Text(
              l10n.accountSourcesIntro,
              textAlign: TextAlign.start,
              style: context.typography.bodyMedium
                  .copyWith(color: context.colors.contentSecondary),
            ),
            SizedBox(height: context.spacing.sm),
            KararBanner(
              title: l10n.dataSourcesNoLiveLinkTitle,
              message: l10n.sourceNoLiveLinkNotice,
              tone: KararStatusTone.info,
            ),
          ],
        ),
      ),
    );
  }

  String? _nameOf(List<FinancialAccount> accounts) {
    for (final account in accounts) {
      if (account.accountId == accountId) {
        return account.displayName;
      }
    }
    return null;
  }
}

final class _Sources extends StatelessWidget {
  const _Sources({required this.links, required this.l10n});

  final List<AccountSourceLink> links;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    if (links.isEmpty) {
      return KararStateView.empty(
        title: l10n.accountSourcesEmptyTitle,
        message: l10n.accountSourcesEmptyDescription,
      );
    }
    // Echoed, never sorted. See `sourcesInStatedPriorityOrder`.
    final ordered = sourcesInStatedPriorityOrder(links);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
          child: Text(
            l10n.accountSourcesPriorityNote,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
        ),
        if (priorityOrderIsAmbiguous(ordered))
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: KararBanner(
              message: l10n.accountSourcesPriorityAmbiguous,
              tone: KararStatusTone.warning,
            ),
          ),
        for (var index = 0; index < ordered.length; index++)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: _SourceCard(
              link: ordered[index],
              position: index + 1,
              l10n: l10n,
            ),
          ),
      ],
    );
  }
}

/// One source feeding this account.
final class _SourceCard extends StatelessWidget {
  const _SourceCard({
    required this.link,
    required this.position,
    required this.l10n,
  });

  final AccountSourceLink link;
  final int position;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final RailStanding standing = standingOfRail(link.rail);
    final DateTime? confirmedAt = link.subjectConfirmedAt;
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              // Through the formatter: the generated method formats the number
              // with `intl`, which never consults the numeral system, so an
              // unwrapped call renders Western digits beside the Arabic-Indic
              // dates in the same card.
              context.formatter.applyNumerals(
                l10n.accountSourcesCardHeading(position),
              ),
              textAlign: TextAlign.start,
              style: context.typography.titleMedium
                  .copyWith(color: context.colors.contentSecondary),
            ),
          ),
          SizedBox(height: context.spacing.xs),
          KararStatusBadge(
            label: railStandingBadge(standing, l10n),
            tone: railStandingTone(standing),
          ),
          SizedBox(height: context.spacing.sm),
          LabelledValue(
            label: l10n.connectionRailFieldLabel,
            value: connectionRailLabel(link.rail, l10n),
            emphasis: true,
          ),
          SizedBox(height: context.spacing.xs),
          Text(
            railStandingSentence(standing, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentPrimary),
          ),
          SizedBox(height: context.spacing.sm),
          _Priority(link: link, l10n: l10n),
          SizedBox(height: context.spacing.sm),
          _Arrival(link: link, l10n: l10n),
          SizedBox(height: context.spacing.sm),
          _Coverage(coverage: link.historyCoverage, l10n: l10n),
          SizedBox(height: context.spacing.sm),
          LabelledValue(
            label: l10n.accountLifecycleFieldLabel,
            value: sourceLinkStatusLabel(link.status, l10n),
          ),
          SizedBox(height: context.spacing.xs),
          LabelledValue(
            label: l10n.accountSourcesMatchLabel,
            value: matchBasisLabel(link.matchBasis, l10n),
          ),
          SizedBox(height: context.spacing.xxs),
          Text(
            l10n.accountSourcesNoScoreNote,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          SizedBox(height: context.spacing.xs),
          LabelledValue(
            label: l10n.accountSourcesConfirmedLabel,
            value: confirmedAt == null
                ? l10n.accountSourcesConfirmedPending
                : formatInstantDate(context, confirmedAt),
          ),
          SizedBox(height: context.spacing.sm),
          _Capabilities(link: link, l10n: l10n),
        ],
      ),
    );
  }
}

final class _Priority extends StatelessWidget {
  const _Priority({required this.link, required this.l10n});

  final AccountSourceLink link;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          LabelledValue(
            label: l10n.accountSourcesPriorityLabel,
            value: context.formatter.applyNumerals(
              l10n.accountSourcesPriorityValue(link.sourcePriority),
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          LabelledValue(
            label: l10n.sourceAuthorityFieldLabel,
            value: sourceAuthorityLabel(link.sourceAuthority, l10n),
          ),
        ],
      );
}

/// When data last arrived — and the two instants that are NOT that.
///
/// The three rows are deliberately separate and separately labelled. Merging
/// them into one "last updated" is the whole mistake this screen exists to
/// avoid.
final class _Arrival extends StatelessWidget {
  const _Arrival({required this.link, required this.l10n});

  final AccountSourceLink link;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final SourceArrival arrival = arrivalOf(link.observation);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          sourceArrivalSentence(
            arrival,
            l10n,
            formatInstant: (DateTime instant) => formatInstant(context, instant),
          ),
          textAlign: TextAlign.start,
          style: context.typography.bodyMedium
              .copyWith(color: context.colors.contentPrimary),
        ),
        SizedBox(height: context.spacing.xxs),
        Text(
          l10n.accountSourcesArrivalNote,
          textAlign: TextAlign.start,
          style: context.typography.labelMedium
              .copyWith(color: context.colors.contentSecondary),
        ),
        SizedBox(height: context.spacing.xs),
        LabelledValue(
          label: l10n.accountSourcesFirstRecordedLabel,
          value: formatInstantDate(context, link.observation.firstObservedAt),
        ),
        SizedBox(height: context.spacing.xxs),
        LabelledValue(
          label: l10n.accountSourcesLastRecordedLabel,
          value: formatInstantDate(context, link.observation.lastObservedAt),
        ),
        SizedBox(height: context.spacing.xxs),
        Text(
          l10n.accountSourcesLastRecordedNote,
          textAlign: TextAlign.start,
          style: context.typography.labelMedium
              .copyWith(color: context.colors.contentSecondary),
        ),
      ],
    );
  }
}

/// What the supplied data covers, with the note that keeps it a coverage range.
final class _Coverage extends StatelessWidget {
  const _Coverage({required this.coverage, required this.l10n});

  final CalendarDayRange? coverage;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final CalendarDayRange? range = coverage;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        LabelledValue(
          label: l10n.sourceCoverageLabel,
          value: range == null
              ? l10n.sourceCoverageNone
              : l10n.sourceCoverageRange(
                  formatCalendarDay(context, range.start),
                  formatCalendarDay(context, range.end),
                ),
        ),
        SizedBox(height: context.spacing.xxs),
        Text(
          l10n.accountSourcesCoverageNote,
          textAlign: TextAlign.start,
          style: context.typography.labelMedium
              .copyWith(color: context.colors.contentSecondary),
        ),
      ],
    );
  }
}

final class _Capabilities extends StatelessWidget {
  const _Capabilities({required this.link, required this.l10n});

  final AccountSourceLink link;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              l10n.accountSourcesCapabilitiesHeading,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium
                  .copyWith(color: context.colors.contentSecondary),
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          LabelledValue(
            label: l10n.sourceBalanceObservationLabel,
            value: sourceObservationLabel(link.capabilities.balance, l10n),
          ),
          SizedBox(height: context.spacing.xxs),
          LabelledValue(
            label: l10n.sourcePendingObservationLabel,
            value: sourceObservationLabel(
              link.capabilities.pendingTransactions,
              l10n,
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          Text(
            l10n.accountSourcesCapabilitiesNote,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
        ],
      );
}
