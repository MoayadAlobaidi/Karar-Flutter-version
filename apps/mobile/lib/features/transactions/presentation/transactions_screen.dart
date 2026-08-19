// THE TRANSACTION LISTING.
//
// Filters narrow the caller's own set; none of them can widen it. There is
// deliberately no category filter, because the contract has none — a
// transaction's active category lives in another table and is read per
// transaction, so the parameter would have cost one query per row of every
// page.
//
// Pagination follows the PLATFORM'S cursor to the end. The platform applies
// most filters after its keyset query, so a page can come back short while
// there are still rows behind it; a client that stopped at the first sparse
// page would show a person half a month and say nothing.
//
// Nothing here totals anything. Not the page, not the filter, not a currency.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/domain/source_rail.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../../financial_accounts/presentation/financial_labels.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/transaction.dart';
import '../domain/transactions_repository.dart';
import 'transaction_labels.dart';
import 'transaction_row.dart';
import 'transactions_providers.dart';

/// The transaction surface.
final class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({this.initialAccountId, super.key});

  /// Set when the screen is opened from one account. An opaque identifier, and
  /// the only thing this screen ever reads out of a location.
  final String? initialAccountId;

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  @override
  void initState() {
    super.initState();
    final accountId = widget.initialAccountId;
    if (accountId != null) {
      // Applied after the first frame so the notifier is not written to during
      // a build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref
            .read(transactionFilterProvider.notifier)
            .apply(TransactionFilter(accountId: accountId));
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final listing = ref.watch(transactionListingProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.transactionsScreenTitle,
        onBack: () => context.go(FinancialRoutes.accounts),
      ),
      body: SafeArea(
        top: false,
        child: listing.when(
          loading: () => KararLoadingView(subject: l10n.transactionsScreenTitle),
          error: (Object error, StackTrace _) => _Unavailable(l10n: l10n),
          data: (TransactionListing value) => switch (value) {
            TransactionsUnavailable() => _Unavailable(l10n: l10n),
            TransactionsLoaded() => _Listing(listing: value, l10n: l10n),
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
            title: l10n.transactionsUnavailableTitle,
            message: l10n.transactionsUnavailableDescription,
            actionLabel: l10n.actionRetry,
            onAction: () => unawaited(
              ref.read(transactionListingProvider.notifier).refresh(),
            ),
          ),
        ),
      );
}

final class _Listing extends ConsumerWidget {
  const _Listing({required this.listing, required this.l10n});

  final TransactionsLoaded listing;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        Padding(
          padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
          child: KararButton(
            label: l10n.transactionsAddManualAction,
            isFullWidth: true,
            onPressed: () => context.go(FinancialRoutes.transactionCreate),
          ),
        ),
        _Filters(l10n: l10n),
        if (listing.transactions.isEmpty)
          KararStateView.empty(
            title: listing.filtered
                ? l10n.transactionsFilteredEmptyTitle
                : l10n.transactionsEmptyTitle,
            message: listing.filtered
                ? l10n.transactionsFilteredEmptyDescription
                : l10n.transactionsEmptyDescription,
          )
        else
          for (final transaction in listing.transactions)
            Padding(
              padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
              child: TransactionRow(transaction: transaction, l10n: l10n),
            ),
        if (listing.hasMore)
          Padding(
            padding: EdgeInsetsDirectional.only(top: context.spacing.md),
            child: KararButton(
              label: l10n.transactionsLoadMoreAction,
              variant: KararButtonVariant.secondary,
              isFullWidth: true,
              isLoading: listing.isLoadingMore,
              onPressed: () => unawaited(
                ref.read(transactionListingProvider.notifier).loadMore(),
              ),
            ),
          ),
      ],
    );
  }
}

/// The filter controls.
///
/// The account options come from the portfolio, so a person filters by an
/// account they actually hold rather than by typing an identifier.
final class _Filters extends ConsumerWidget {
  const _Filters({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(transactionFilterProvider);
    final controller = ref.read(transactionFilterProvider.notifier);
    final accountsView = ref.watch(ownAccountsProvider).value;
    final accounts = accountsView is AccountsLoaded
        ? accountsView.accounts
        : const <FinancialAccountOption>[];

    return FinancialSection(
      heading: l10n.transactionFiltersTitle,
      child: KararCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (accounts.isNotEmpty)
              FinancialChoiceRow(
                label: l10n.transactionFilterAccountLabel,
                children: <Widget>[
                  FinancialChoice(
                    label: l10n.accountsFilterAllOption,
                    isSelected: filter.accountId == null,
                    onPressed: () =>
                        controller.apply(filter.copyWith(clearAccountId: true)),
                  ),
                  for (final account in accounts)
                    FinancialChoice(
                      label: account.displayName,
                      isSelected: filter.accountId == account.accountId,
                      onPressed: () => controller
                          .apply(filter.copyWith(accountId: account.accountId)),
                    ),
                ],
              ),
            FinancialChoiceRow(
              label: l10n.transactionFilterDirectionLabel,
              children: <Widget>[
                FinancialChoice(
                  label: l10n.accountsFilterAllOption,
                  isSelected: filter.direction == null,
                  onPressed: () =>
                      controller.apply(filter.copyWith(clearDirection: true)),
                ),
                for (final direction in <MoneyDirection>[
                  MoneyDirection.moneyIn,
                  MoneyDirection.moneyOut,
                ])
                  FinancialChoice(
                    label: moneyDirectionLabel(direction, l10n),
                    isSelected: filter.direction == direction,
                    onPressed: () =>
                        controller.apply(filter.copyWith(direction: direction)),
                  ),
              ],
            ),
            FinancialChoiceRow(
              label: l10n.transactionFilterStatusLabel,
              children: <Widget>[
                FinancialChoice(
                  label: l10n.accountsFilterAllOption,
                  isSelected: filter.status == null,
                  onPressed: () => controller.apply(filter.copyWith(clearStatus: true)),
                ),
                for (final status in <TransactionStatus>[
                  TransactionStatus.posted,
                  TransactionStatus.voided,
                ])
                  FinancialChoice(
                    label: transactionStatusLabel(status, l10n),
                    isSelected: filter.status == status,
                    onPressed: () => controller.apply(filter.copyWith(status: status)),
                  ),
              ],
            ),
            FinancialChoiceRow(
              label: l10n.transactionFilterSourceLabel,
              children: <Widget>[
                FinancialChoice(
                  label: l10n.accountsFilterAllOption,
                  isSelected: filter.sourceKind == null,
                  onPressed: () =>
                      controller.apply(filter.copyWith(clearSourceKind: true)),
                ),
                // Only the two rails this platform can run are offered. A
                // filter for a rail that produces nothing would be a control
                // that always empties the screen.
                for (final kind in <SourceKind>[SourceKind.manual, SourceKind.csv])
                  FinancialChoice(
                    label: sourceKindLabel(kind, RailAvailability.executable, l10n),
                    isSelected: filter.sourceKind == kind,
                    onPressed: () => controller.apply(filter.copyWith(sourceKind: kind)),
                  ),
              ],
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
                onPressed: controller.clear,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
