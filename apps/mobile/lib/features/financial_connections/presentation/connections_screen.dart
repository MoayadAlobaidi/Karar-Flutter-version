// WHERE YOUR DATA COMES FROM.
//
// This is the screen a person opens to ask three questions — where does my data
// come from, how current is it, and what can each source actually do — and it is
// the screen on which a fintech is most tempted to lie. Four properties hold,
// and each is a decision rather than a detail:
//
//   1. NOTHING HERE OFFERS A CONNECTION. There is no connect control, no
//      institution picker, no authorisation flow and no credential field of any
//      kind — not a password, PIN, mPIN, one-time code, recovery code, card
//      number or CVV, and not a disabled one either. A disabled control is still
//      a promise; it says "this will work later", and nothing here will. The
//      whole of the unimplemented-rail section is TEXT, with no interactive
//      widget in the subtree at all, and a test asserts that over the rendered
//      tree rather than over this comment.
//
//   2. AN UNIMPLEMENTED RAIL IS NAMED AND REFUSED IN THE SAME BREATH. Every
//      rail the contract declares is listed, so a person can see the whole
//      picture rather than a curated part of it — and each one that does not
//      exist says it does not exist, is not switched off, and is not scheduled.
//      "Coming soon" would be a commitment nobody made.
//
//   3. THE THREE UNAVAILABLE REASONS STAY THREE. NOT_CONFIGURED, UNAVAILABLE
//      and NOT_IMPLEMENTED get three different sentences, because "you have not
//      set this up", "this is off right now" and "this was never built" send a
//      person to three different conclusions and only one of them will ever
//      change.
//
//   4. NO DATE HERE IS A FRESHNESS CLAIM. The only instants on this screen are
//      when a RECORD was created and when a RECORD last changed, and each says
//      so in words. When data last arrived is a property of a source feeding an
//      account, and it lives on the per-account screen where the person can see
//      what it belongs to.
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
import '../../financial_accounts/domain/account_source_link.dart';
import '../../financial_accounts/domain/financial_account.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../../financial_accounts/presentation/financial_formatting.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/financial_connection.dart';
import '../domain/financial_connections_repository.dart';
import '../domain/rail_standing.dart';
import 'connection_labels.dart';
import 'connection_routes.dart';
import 'connections_providers.dart';

/// The section listing the rails this platform has never built.
///
/// Exported so the test can assert, over the real tree, that NOTHING in this
/// subtree is interactive. A key is a weaker claim than a type, but it is the
/// claim that survives the section being restructured.
const Key unbuiltRailsSectionKey = Key('data-sources-unbuilt-rails');

/// The section listing the two rails that exist.
const Key builtRailsSectionKey = Key('data-sources-built-rails');

/// Where the person's data comes from.
final class DataSourcesScreen extends ConsumerWidget {
  const DataSourcesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final listing = ref.watch(connectionListingProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.dataSourcesScreenTitle,
        onBack: () => context.go(FinancialRoutes.accounts),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            _Introduction(l10n: l10n),
            listing.when(
              loading: () =>
                  KararLoadingView(subject: l10n.dataSourcesScreenTitle),
              error: (Object error, StackTrace _) => _Unavailable(l10n: l10n),
              data: (ConnectionListing value) => switch (value) {
                ConnectionsUnavailable() => _Unavailable(l10n: l10n),
                ConnectionsLoaded() => _Connections(listing: value, l10n: l10n),
              },
            ),
            _AccountsWithSources(l10n: l10n),
            const _BuiltRails(),
            const _UnbuiltRails(),
          ],
        ),
      ),
    );
  }
}

/// What is true about this platform, before anything else is shown.
///
/// It is first on the screen rather than a footnote, because a person reads the
/// top of a page and stops. The sentence they must not miss is that Karar holds
/// no credential and reaches no institution.
final class _Introduction extends StatelessWidget {
  const _Introduction({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
        child: KararCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                l10n.dataSourcesIntro,
                textAlign: TextAlign.start,
                style: context.typography.bodyMedium.copyWith(
                  color: context.colors.contentSecondary,
                ),
              ),
              SizedBox(height: context.spacing.md),
              KararBanner(
                title: l10n.dataSourcesNoLiveLinkTitle,
                message: l10n.sourceNoLiveLinkNotice,
                tone: KararStatusTone.info,
              ),
              SizedBox(height: context.spacing.sm),
              Text(
                l10n.dataSourcesCredentialNote,
                textAlign: TextAlign.start,
                style: context.typography.labelMedium.copyWith(
                  color: context.colors.contentSecondary,
                ),
              ),
            ],
          ),
        ),
      );
}

final class _Unavailable extends ConsumerWidget {
  const _Unavailable({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
        padding: EdgeInsetsDirectional.only(bottom: context.spacing.sectionGap),
        child: KararStateView.error(
          title: l10n.dataSourcesUnavailableTitle,
          message: l10n.dataSourcesUnavailableDescription,
          actionLabel: l10n.actionRetry,
          onAction: () => unawaited(
            ref.read(connectionListingProvider.notifier).refresh(),
          ),
        ),
      );
}

final class _Connections extends ConsumerWidget {
  const _Connections({required this.listing, required this.l10n});

  final ConnectionsLoaded listing;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => FinancialSection(
        heading: l10n.dataSourcesConnectionsHeading,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _Filters(selected: listing.filter, l10n: l10n),
            if (listing.connections.isEmpty)
              KararStateView.empty(
                title: listing.filter == null
                    ? l10n.dataSourcesEmptyTitle
                    : l10n.dataSourcesFilteredEmptyTitle,
                message: listing.filter == null
                    ? l10n.dataSourcesEmptyDescription
                    : l10n.dataSourcesFilteredEmptyDescription,
              )
            else
              for (final connection in listing.connections)
                Padding(
                  padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                  child: _ConnectionCard(connection: connection, l10n: l10n),
                ),
            if (listing.hasMore)
              Padding(
                padding: EdgeInsetsDirectional.only(top: context.spacing.sm),
                child: listing.isLoadingMore
                    ? KararLoadingIndicator(label: l10n.dataSourcesLoadingMore)
                    : KararButton(
                        label: l10n.dataSourcesLoadMore,
                        variant: KararButtonVariant.secondary,
                        isFullWidth: true,
                        onPressed: () => unawaited(
                          ref.read(connectionListingProvider.notifier).loadMore(),
                        ),
                      ),
              ),
          ],
        ),
      );
}

final class _Filters extends ConsumerWidget {
  const _Filters({required this.selected, required this.l10n});

  final ConnectionStatusFilter? selected;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => FinancialChoiceRow(
        label: l10n.dataSourcesFilterLabel,
        children: <Widget>[
          for (final filter in <ConnectionStatusFilter?>[
            null,
            ...ConnectionStatusFilter.values,
          ])
            FinancialChoice(
              label: connectionFilterLabel(filter, l10n),
              isSelected: filter == selected,
              onPressed: () =>
                  ref.read(connectionFilterProvider.notifier).show(filter),
            ),
        ],
      );
}

/// One of the person's own connections.
///
/// The badge is the STANDING — what this build can do with the rail — rather
/// than the lifecycle status, because "you upload it" is the answer to the
/// question a person came here with. The status is stated in full beneath it,
/// in its own words, never merged with the standing.
final class _ConnectionCard extends ConsumerWidget {
  const _ConnectionCard({required this.connection, required this.l10n});

  final FinancialConnection connection;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool isOpen =
        ref.watch(expandedConnectionProvider).contains(connection.connectionId);
    final RailStanding standing = connection.standing;

    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararStatusBadge(
            label: railStandingBadge(standing, l10n),
            tone: railStandingTone(standing),
          ),
          SizedBox(height: context.spacing.sm),
          // The subject's own words about their own money. Bidi-isolated, and
          // never trusted as anything but text.
          LabelledValue(
            label: l10n.connectionLabelFieldLabel,
            value: connection.displayLabel,
            emphasis: true,
          ),
          SizedBox(height: context.spacing.xs),
          LabelledValue(
            label: l10n.connectionRailFieldLabel,
            value: connectionRailLabel(connection.rail, l10n),
          ),
          SizedBox(height: context.spacing.xs),
          Text(
            railStandingSentence(standing, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentPrimary),
          ),
          SizedBox(height: context.spacing.xs),
          LabelledValue(
            label: l10n.connectionStatusFieldLabel,
            value: connectionStatusLabel(connection.status, l10n),
          ),
          SizedBox(height: context.spacing.sm),
          KararButton(
            label: isOpen
                ? l10n.connectionHideDetailAction
                : l10n.connectionShowDetailAction,
            variant: KararButtonVariant.secondary,
            isFullWidth: true,
            semanticLabel: context.l10n.a11yTitleWithSubtitle(
              isOpen
                  ? l10n.connectionHideDetailAction
                  : l10n.connectionShowDetailAction,
              connection.displayLabel,
            ),
            onPressed: () => ref
                .read(expandedConnectionProvider.notifier)
                .toggle(connection.connectionId),
          ),
          if (isOpen) ...<Widget>[
            SizedBox(height: context.spacing.md),
            _ConnectionDetail(connection: connection, l10n: l10n),
          ],
        ],
      ),
    );
  }
}

/// The record's own facts, each labelled as a fact about the RECORD.
final class _ConnectionDetail extends StatelessWidget {
  const _ConnectionDetail({required this.connection, required this.l10n});

  final FinancialConnection connection;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          LabelledValue(
            label: l10n.connectionAvailabilityFieldLabel,
            value: railAvailabilityLabel(connection.availability, l10n),
          ),
          SizedBox(height: context.spacing.xs),
          LabelledValue(
            label: l10n.connectionAddedAtLabel,
            value: formatInstantDate(context, connection.createdAt),
          ),
          SizedBox(height: context.spacing.xs),
          LabelledValue(
            label: l10n.connectionRecordChangedLabel,
            value: formatInstantDate(context, connection.updatedAt),
          ),
          SizedBox(height: context.spacing.xxs),
          // The sentence that stops `updatedAt` becoming a freshness figure.
          Text(
            l10n.connectionRecordChangedNote,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
        ],
      );
}

/// Each account, with the way through to the sources feeding it.
final class _AccountsWithSources extends ConsumerWidget {
  const _AccountsWithSources({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AccountsView? view = ref.watch(ownAccountsProvider).value;
    return FinancialSection(
      heading: l10n.dataSourcesAccountsHeading,
      child: KararCard(
        child: switch (view) {
          null => const KararLoadingIndicator.inline(),
          AccountsUnavailable() => _Note(text: l10n.dataSourcesAccountsUnavailable),
          AccountsLoaded(:final accounts) when accounts.isEmpty =>
            _Note(text: l10n.dataSourcesAccountsEmpty),
          AccountsLoaded(:final accounts) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final account in accounts)
                  Padding(
                    padding:
                        EdgeInsetsDirectional.only(bottom: context.spacing.md),
                    child: _AccountRow(account: account, l10n: l10n),
                  ),
              ],
            ),
        },
      ),
    );
  }
}

final class _AccountRow extends StatelessWidget {
  const _AccountRow({required this.account, required this.l10n});

  final FinancialAccount account;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararBidiText(
            account.displayName,
            style: context.typography.bodyLarge
                .copyWith(color: context.colors.contentPrimary),
          ),
          SizedBox(height: context.spacing.xs),
          KararButton(
            label: l10n.dataSourcesOpenAccountSourcesAction,
            variant: KararButtonVariant.secondary,
            isFullWidth: true,
            // The account is NAMED in the spoken label. A row of identical
            // "Where its data comes from" buttons is unusable without sight.
            semanticLabel:
                l10n.dataSourcesOpenAccountSourcesA11y(account.displayName),
            onPressed: () => context
                .go(ConnectionRoutes.accountSourcesPath(account.accountId)),
          ),
        ],
      );
}

/// The two rails that exist.
final class _BuiltRails extends StatelessWidget {
  const _BuiltRails();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FinancialSection(
      key: builtRailsSectionKey,
      heading: l10n.dataSourcesBuiltRailsHeading,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          for (final rail in declaredRails())
            if (standingIsSuppliedBySubject(standingOfRail(rail)))
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                child: _RailCard(rail: rail, l10n: l10n),
              ),
        ],
      ),
    );
  }
}

/// Every rail this platform has NOT built, named and refused.
///
/// The whole subtree is text. Not one interactive widget is constructed here —
/// no button, no disabled button, no field, no tappable card — because an
/// affordance beside an unimplemented rail is a promise, and this platform has
/// made none. The test asserts that over the rendered tree.
final class _UnbuiltRails extends StatelessWidget {
  const _UnbuiltRails();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FinancialSection(
      key: unbuiltRailsSectionKey,
      heading: l10n.dataSourcesRailsHeading,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: _Note(text: l10n.dataSourcesRailsExplanation),
          ),
          for (final rail in declaredRails())
            if (!standingIsSuppliedBySubject(standingOfRail(rail)))
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                child: _RailCard(rail: rail, l10n: l10n),
              ),
        ],
      ),
    );
  }
}

/// One rail, named, with what this build can do with it.
///
/// [KararCard] and not [KararCard.pressable]: a rail is a statement, not a
/// destination. There is nowhere for a tap to go.
final class _RailCard extends StatelessWidget {
  const _RailCard({required this.rail, required this.l10n});

  final ConnectionRail rail;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final RailStanding standing = standingOfRail(rail);
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            // `container: true` so the pair is ONE node a screen reader reads
            // as "this rail, this standing", rather than a name and a badge
            // arriving as two unrelated strings.
            container: true,
            label: l10n.a11yTitleWithSubtitle(
              connectionRailLabel(rail, l10n),
              railStandingBadge(standing, l10n),
            ),
            excludeSemantics: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  connectionRailLabel(rail, l10n),
                  textAlign: TextAlign.start,
                  style: context.typography.bodyLarge
                      .copyWith(color: context.colors.contentPrimary),
                ),
                SizedBox(height: context.spacing.xxs),
                KararStatusBadge(
                  label: railStandingBadge(standing, l10n),
                  tone: railStandingTone(standing),
                ),
              ],
            ),
          ),
          SizedBox(height: context.spacing.xs),
          Text(
            railStandingSentence(standing, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
        ],
      ),
    );
  }
}

/// A plain secondary sentence.
final class _Note extends StatelessWidget {
  const _Note({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: TextAlign.start,
        style: context.typography.bodyMedium
            .copyWith(color: context.colors.contentSecondary),
      );
}
