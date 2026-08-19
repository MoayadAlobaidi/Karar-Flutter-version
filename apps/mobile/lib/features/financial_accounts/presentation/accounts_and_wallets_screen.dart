// ACCOUNTS & WALLETS — the whole portfolio.
//
// It shows every account and wallet the authenticated person holds: several
// issuers, several accounts at one issuer including two of the same type and
// currency, several currencies, several cards, several wallets from one
// issuer, cash, and accounts kept by hand. Nothing is merged and nothing is
// deduplicated; two savings accounts in the same currency at the same issuer
// are two rows, because the person made them two.
//
// WHAT IS NOT ON THIS SCREEN, and cannot be:
//
//   * a total. Not per issuer, not per currency, not overall. Currency is a
//     way of KEEPING amounts apart here, and the code that groups by it holds
//     accounts rather than money — see `domain/account_portfolio.dart`;
//   * a conversion, a rate, a net position, a net worth, a score, an insight,
//     a forecast or a budget. None of them exists in this phase and none is
//     assembled from what does;
//   * a balance on a card. A card is a payment instrument and appears under
//     its account on the detail screen, with no figure of its own;
//   * a "Connect bank" action. No issuer exposes an interface to this
//     platform, so there is nothing to connect to;
//   * a delete control. The platform exposes no account-deletion operation
//     and a button that could not finish the job would be a promise nobody
//     made.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../domain/account_portfolio.dart';
import '../domain/balance_snapshot.dart';
import '../domain/financial_account.dart';
import 'accounts_providers.dart';
import 'financial_formatting.dart';
import 'financial_labels.dart';
import 'financial_routes.dart';
import 'financial_widgets.dart';

/// The portfolio surface.
final class AccountsAndWalletsScreen extends ConsumerWidget {
  const AccountsAndWalletsScreen({this.showAppBar = true, super.key});

  /// False when the screen is mounted inside the home shell, which supplies
  /// its own bar.
  final bool showAppBar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final accounts = ref.watch(ownAccountsProvider);

    return Scaffold(
      appBar: showAppBar ? KararAppBar(title: l10n.accountsScreenTitle) : null,
      body: SafeArea(
        top: false,
        child: accounts.when(
          loading: () => KararLoadingView(subject: l10n.accountsScreenTitle),
          error: (Object error, StackTrace _) => _Unavailable(l10n: l10n),
          data: (AccountsView view) => switch (view) {
            AccountsUnavailable() => _Unavailable(l10n: l10n),
            AccountsLoaded(:final accounts) =>
              _PortfolioBody(all: accounts, l10n: l10n),
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
            title: l10n.accountsUnavailableTitle,
            message: l10n.accountsUnavailableDescription,
            actionLabel: l10n.actionRetry,
            onAction: () => ref.invalidate(ownAccountsProvider),
          ),
        ),
      );
}

final class _PortfolioBody extends ConsumerWidget {
  const _PortfolioBody({required this.all, required this.l10n});

  final List<FinancialAccount> all;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arrangement = ref.watch(portfolioArrangementProvider);
    final portfolio = AccountPortfolio.from(
      all,
      filter: arrangement.filter,
      grouping: arrangement.grouping,
    );

    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        // Stated whenever more than one currency is held, because that is
        // exactly when somebody might expect a total and must be told there
        // will not be one.
        if (portfolio.currencies.length > 1)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: KararBanner(
              title: l10n.accountsPerCurrencyNoticeTitle,
              message: l10n.accountsPerCurrencyNoticeDescription,
              tone: KararStatusTone.info,
            ),
          ),
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
          child: KararButton(
            label: l10n.accountsAddManualAction,
            icon: KararIcons.edit,
            isFullWidth: true,
            onPressed: () => context.go(FinancialRoutes.accountCreate),
          ),
        ),
        _Arrangement(all: all, portfolio: portfolio, l10n: l10n),
        if (portfolio.isEmpty)
          KararStateView.empty(
            title: portfolio.isEmptiedByFilter
                ? l10n.accountsFilteredEmptyTitle
                : l10n.accountsEmptyTitle,
            message: portfolio.isEmptiedByFilter
                ? l10n.accountsFilteredEmptyDescription
                : l10n.accountsEmptyDescription,
          )
        else
          for (final group in portfolio.groups)
            FinancialSection(
              heading: portfolioGroupHeading(group.key, l10n),
              child: Column(
                children: <Widget>[
                  for (final account in group.accounts)
                    Padding(
                      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
                      child: AccountSummaryCard(account: account, l10n: l10n),
                    ),
                ],
              ),
            ),
      ],
    );
  }
}

/// The grouping and filtering controls.
///
/// Options are derived from the UNFILTERED portfolio, so choosing one filter
/// never hides the values of another axis and leaves a person unable to get
/// back.
final class _Arrangement extends ConsumerWidget {
  const _Arrangement({
    required this.all,
    required this.portfolio,
    required this.l10n,
  });

  final List<FinancialAccount> all;
  final AccountPortfolio portfolio;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(portfolioArrangementProvider.notifier);
    final filter = portfolio.filter;

    return FinancialSection(
      heading: l10n.accountsFiltersLabel,
      child: KararCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            FinancialChoiceRow(
              label: l10n.accountsGroupByLabel,
              children: <Widget>[
                for (final grouping in PortfolioGrouping.values)
                  FinancialChoice(
                    label: portfolioGroupingLabel(grouping, l10n),
                    isSelected: portfolio.grouping == grouping,
                    onPressed: () => controller.groupBy(grouping),
                  ),
              ],
            ),
            _AxisFilter<String>(
              label: l10n.groupByIssuer,
              options: <String>[
                for (final key in AccountPortfolio.optionsFor(
                  all,
                  PortfolioGrouping.issuer,
                ))
                  key.identifier,
              ],
              selected: filter.issuerKey,
              labelFor: (String key) => portfolioGroupHeading(
                AccountPortfolio.optionsFor(all, PortfolioGrouping.issuer)
                    .firstWhere((PortfolioGroupKey option) => option.identifier == key),
                l10n,
              ),
              onSelected: (String? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearIssuerKey: true)
                    : filter.copyWith(issuerKey: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<IssuerKind>(
              label: l10n.groupByIssuerKind,
              options: _presentIssuerKinds(all),
              selected: filter.issuerKind,
              labelFor: (IssuerKind kind) => issuerKindLabel(kind, l10n),
              onSelected: (IssuerKind? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearIssuerKind: true)
                    : filter.copyWith(issuerKind: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<AccountType>(
              label: l10n.groupByAccountType,
              options: _present<AccountType>(
                all,
                (FinancialAccount account) => account.accountType,
              ),
              selected: filter.accountType,
              labelFor: (AccountType type) => accountTypeLabel(type, l10n),
              onSelected: (AccountType? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearAccountType: true)
                    : filter.copyWith(accountType: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<WalletKind>(
              label: l10n.groupByWalletKind,
              options: <WalletKind>[
                for (final kind in WalletKind.values)
                  if (all.any((FinancialAccount account) => account.walletKind == kind))
                    kind,
              ],
              selected: filter.walletKind,
              labelFor: (WalletKind kind) => walletKindLabel(kind, l10n),
              onSelected: (WalletKind? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearWalletKind: true)
                    : filter.copyWith(walletKind: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<AccountNature>(
              label: l10n.groupByNature,
              options: _present<AccountNature>(
                all,
                (FinancialAccount account) => account.nature,
              ),
              selected: filter.nature,
              labelFor: (AccountNature nature) => accountNatureLabel(nature, l10n),
              onSelected: (AccountNature? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearNature: true)
                    : filter.copyWith(nature: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<String>(
              label: l10n.groupByCurrency,
              options: _present<String>(
                all,
                (FinancialAccount account) => account.currency.code,
              ),
              selected: filter.currencyCode,
              labelFor: (String code) => code,
              onSelected: (String? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearCurrencyCode: true)
                    : filter.copyWith(currencyCode: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<AccountLifecycle>(
              label: l10n.groupByLifecycle,
              options: _present<AccountLifecycle>(
                all,
                (FinancialAccount account) => account.lifecycle,
              ),
              selected: filter.lifecycle,
              labelFor: (AccountLifecycle value) => accountLifecycleLabel(value, l10n),
              onSelected: (AccountLifecycle? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearLifecycle: true)
                    : filter.copyWith(lifecycle: value),
              ),
              l10n: l10n,
            ),
            _AxisFilter<AccountOrigin>(
              label: l10n.groupByOrigin,
              options: _present<AccountOrigin>(
                all,
                (FinancialAccount account) => account.origin,
              ),
              selected: filter.origin,
              labelFor: (AccountOrigin origin) => accountOriginLabel(origin, l10n),
              onSelected: (AccountOrigin? value) => controller.applyFilter(
                value == null
                    ? filter.copyWith(clearOrigin: true)
                    : filter.copyWith(origin: value),
              ),
              l10n: l10n,
            ),
            Text(
              context.formatter
                  .applyNumerals(l10n.financialFiltersActiveCount(filter.activeCount)),
              textAlign: TextAlign.start,
              style: context.typography.bodySmall
                  .copyWith(color: context.colors.contentSecondary),
            ),
            if (!filter.isEmpty) ...<Widget>[
              SizedBox(height: context.spacing.sm),
              KararButton(
                label: l10n.accountsFiltersClear,
                variant: KararButtonVariant.tertiary,
                onPressed: controller.clearFilters,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One filter axis: an "All" option plus every value the portfolio contains.
final class _AxisFilter<T extends Object> extends StatelessWidget {
  const _AxisFilter({
    required this.label,
    required this.options,
    required this.selected,
    required this.labelFor,
    required this.onSelected,
    required this.l10n,
  });

  final String label;
  final List<T> options;
  final T? selected;
  final String Function(T value) labelFor;
  final void Function(T? value) onSelected;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    if (options.length < 2) {
      // One value is not a choice. Rendering it as a filter would suggest
      // there is something to narrow to.
      return const SizedBox.shrink();
    }
    return FinancialChoiceRow(
      label: label,
      children: <Widget>[
        FinancialChoice(
          label: l10n.accountsFilterAllOption,
          isSelected: selected == null,
          onPressed: () => onSelected(null),
        ),
        for (final option in options)
          FinancialChoice(
            label: labelFor(option),
            isSelected: selected == option,
            onPressed: () => onSelected(option),
          ),
      ],
    );
  }
}

List<T> _present<T extends Object>(
  List<FinancialAccount> accounts,
  T Function(FinancialAccount account) read,
) {
  final seen = <T>[];
  for (final account in accounts) {
    final value = read(account);
    if (!seen.contains(value)) {
      seen.add(value);
    }
  }
  return seen;
}

List<IssuerKind> _presentIssuerKinds(List<FinancialAccount> accounts) {
  final seen = <IssuerKind>[];
  for (final account in accounts) {
    final issuer = account.issuer;
    if (issuer is! IssuerFromCatalogue) {
      continue;
    }
    if (!seen.contains(issuer.issuer.kind)) {
      seen.add(issuer.issuer.kind);
    }
  }
  return seen;
}

/// One account, as the portfolio renders it.
///
/// The balances block is a separate widget with its own provider so a slow or
/// failing balance read degrades to "no balance reported" for that account
/// alone, rather than emptying the portfolio.
final class AccountSummaryCard extends StatelessWidget {
  const AccountSummaryCard({required this.account, required this.l10n, super.key});

  final FinancialAccount account;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return KararCard.pressable(
      onPressed: () => context.go(FinancialRoutes.accountDetailPath(account.accountId)),
      semanticLabel: l10n.a11yAccountSummary(
        account.displayName,
        accountTypeLabel(account.accountType, l10n),
        account.currency.code,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararBidiText(
            account.displayName,
            style: context.typography.titleMedium
                .copyWith(color: context.colors.contentPrimary),
          ),
          SizedBox(height: context.spacing.xxs),
          KararBidiText(
            issuerAttributionLabel(account.issuer, l10n),
            style: context.typography.bodySmall
                .copyWith(color: context.colors.contentSecondary),
          ),
          SizedBox(height: context.spacing.sm),
          Wrap(
            spacing: context.spacing.xs,
            runSpacing: context.spacing.xs,
            children: <Widget>[
              KararStatusBadge(
                label: accountTypeLabel(account.accountType, l10n),
                tone: KararStatusTone.neutral,
              ),
              if (account.isWallet)
                KararStatusBadge(
                  label: walletKindLabel(account.walletKind, l10n),
                  tone: KararStatusTone.neutral,
                ),
              KararStatusBadge(
                label: account.currency.code,
                tone: KararStatusTone.info,
              ),
              KararStatusBadge(
                label: accountLifecycleLabel(account.lifecycle, l10n),
                tone: switch (account.lifecycle) {
                  AccountLifecycle.active => KararStatusTone.success,
                  AccountLifecycle.archived => KararStatusTone.warning,
                  AccountLifecycle.closed => KararStatusTone.danger,
                  AccountLifecycle.unrecognised => KararStatusTone.neutral,
                },
              ),
              KararStatusBadge(
                label: accountOriginLabel(account.origin, l10n),
                tone: KararStatusTone.neutral,
              ),
            ],
          ),
          SizedBox(height: context.spacing.sm),
          LabelledValue(
            label: l10n.accountMaskLabel,
            value: safeMaskLabel(
              account.mask.value,
              withheld: account.mask.isWithheld,
              l10n: l10n,
            ),
          ),
          SizedBox(height: context.spacing.sm),
          AccountBalancesBlock(accountId: account.accountId, l10n: l10n),
        ],
      ),
    );
  }
}

/// Every figure a source reported for one account, kept apart by kind.
///
/// There is one row per KIND and each row names its own currency and its own
/// `asOf`. Nothing here adds two rows together — not two kinds, and certainly
/// not two currencies.
final class AccountBalancesBlock extends ConsumerWidget {
  const AccountBalancesBlock({
    required this.accountId,
    required this.l10n,
    this.showOlderReports = false,
    super.key,
  });

  final String accountId;
  final AppLocalizations l10n;

  /// The detail screen shows every report a source made; the portfolio shows
  /// the most recent per kind.
  final bool showOlderReports;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balances = ref.watch(accountBalancesProvider(accountId));
    return balances.when(
      loading: () => const KararLoadingIndicator.inline(),
      error: (Object error, StackTrace _) => Text(
        l10n.balancesEmptyTitle,
        textAlign: TextAlign.start,
        style: context.typography.bodySmall
            .copyWith(color: context.colors.contentSecondary),
      ),
      data: (BalancesByKind value) {
        if (value.isEmpty) {
          return Text(
            l10n.balancesEmptyTitle,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall
                .copyWith(color: context.colors.contentSecondary),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            for (final group in value.entries) ...<Widget>[
              _ReportedFigure(
                snapshot: group.mostRecent,
                kindLabel: balanceKindLabel(group.kind, l10n),
                l10n: l10n,
              ),
              if (showOlderReports && group.snapshots.length > 1)
                for (final older in group.snapshots.skip(1))
                  Padding(
                    padding: EdgeInsetsDirectional.only(
                      start: context.spacing.md,
                      top: context.spacing.xs,
                    ),
                    child: _ReportedFigure(
                      snapshot: older,
                      kindLabel: l10n.balanceOlderReportsLabel,
                      l10n: l10n,
                    ),
                  ),
              SizedBox(height: context.spacing.xs),
            ],
            Text(
              l10n.balancesNoTotalNotice,
              textAlign: TextAlign.start,
              style: context.typography.bodySmall
                  .copyWith(color: context.colors.contentTertiary),
            ),
          ],
        );
      },
    );
  }
}

/// One reported figure with the kind, the moment and the rail it came from.
final class _ReportedFigure extends StatelessWidget {
  const _ReportedFigure({
    required this.snapshot,
    required this.kindLabel,
    required this.l10n,
  });

  final BalanceSnapshot snapshot;
  final String kindLabel;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final amount = formatMoney(context, snapshot.amount);
    final asOf = l10n.balanceAsOfLabel(formatInstant(context, snapshot.asOf));
    return Semantics(
      label: l10n.a11yBalanceSummary(kindLabel, amount, asOf),
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            kindLabel,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          KararBidiText(
            amount,
            style: context.typography.titleMedium
                .copyWith(color: context.colors.contentPrimary),
          ),
          Text(
            asOf,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall
                .copyWith(color: context.colors.contentSecondary),
          ),
          Text(
            sourceKindLabel(snapshot.sourceKind, snapshot.availability, l10n),
            textAlign: TextAlign.start,
            style: context.typography.bodySmall
                .copyWith(color: context.colors.contentSecondary),
          ),
        ],
      ),
    );
  }
}
