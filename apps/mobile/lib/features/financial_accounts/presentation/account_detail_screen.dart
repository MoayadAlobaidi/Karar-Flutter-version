// ONE ACCOUNT OR WALLET.
//
// Identity, wallet kind, nature, currency, lifecycle, balances by kind, the
// source-and-freshness summary, the instruments that spend from it, and its
// most recent transactions.
//
// TWO ABSENCES ARE STRUCTURAL:
//
//   * there is NO DELETE CONTROL. The platform exposes no account-deletion
//     operation — its cross-module cascade is not atomic and the contract for
//     reporting a partial outcome has not been chosen — so there is no port to
//     call and no button offering one;
//   * there is NO CONNECT ACTION. No issuer exposes an interface to this
//     platform, so there is nothing to connect to. What the source section
//     says instead is exactly what is true: data arrives when a person enters
//     it or imports a file.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../payment_instruments/presentation/account_instruments_section.dart';
import '../../transactions/domain/transaction.dart';
import '../../transactions/presentation/transaction_row.dart';
import '../../transactions/presentation/transactions_providers.dart';
import '../domain/account_source_link.dart';
import '../domain/data_origin.dart';
import '../domain/financial_account.dart';
import 'accounts_and_wallets_screen.dart';
import 'accounts_providers.dart';
import 'financial_formatting.dart';
import 'financial_labels.dart';
import 'financial_routes.dart';
import 'financial_widgets.dart';

/// One account, in full.
final class AccountDetailScreen extends ConsumerWidget {
  const AccountDetailScreen({required this.accountId, super.key});

  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final account = ref.watch(accountDetailProvider(accountId));

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.accountDetailTitle,
        onBack: () => context.go(FinancialRoutes.accounts),
      ),
      body: SafeArea(
        top: false,
        child: account.when(
          loading: () => KararLoadingView(subject: l10n.accountDetailTitle),
          error: (Object error, StackTrace _) => Center(
            child: SingleChildScrollView(
              padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
              child: KararStateView.error(
                title: l10n.accountDetailUnavailableTitle,
                message: l10n.accountDetailUnavailableDescription,
                actionLabel: l10n.actionRetry,
                onAction: () => ref.invalidate(accountDetailProvider(accountId)),
              ),
            ),
          ),
          data: (FinancialAccount value) => _Body(account: value, l10n: l10n),
        ),
      ),
    );
  }
}

final class _Body extends StatelessWidget {
  const _Body({required this.account, required this.l10n});

  final FinancialAccount account;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        FinancialSection(
          heading: l10n.accountDetailIdentitySection,
          child: KararCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                LabelledValue(
                  label: l10n.accountFormDisplayNameLabel,
                  value: account.displayName,
                  emphasis: true,
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountIssuerFieldLabel,
                  value: issuerAttributionLabel(account.issuer, l10n),
                ),
                if (account.issuer is IssuerUnlisted) ...<Widget>[
                  SizedBox(height: context.spacing.xxs),
                  Text(
                    l10n.issuerUnlistedHint,
                    textAlign: TextAlign.start,
                    style: context.typography.bodySmall
                        .copyWith(color: context.colors.contentTertiary),
                  ),
                ],
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountTypeFieldLabel,
                  value: accountTypeLabel(account.accountType, l10n),
                ),
                if (account.isWallet) ...<Widget>[
                  SizedBox(height: context.spacing.sm),
                  LabelledValue(
                    label: l10n.accountWalletKindFieldLabel,
                    value: walletKindLabel(account.walletKind, l10n),
                  ),
                ],
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountNatureFieldLabel,
                  value: accountNatureLabel(account.nature, l10n),
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountCurrencyLabel,
                  value: account.currency.code,
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountLifecycleFieldLabel,
                  value: accountLifecycleLabel(account.lifecycle, l10n),
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountSourceFieldLabel,
                  value: accountOriginLabel(account.origin, l10n),
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
                SizedBox(height: context.spacing.xxs),
                Text(
                  l10n.accountMaskNeverFullNumber,
                  textAlign: TextAlign.start,
                  style: context.typography.bodySmall
                      .copyWith(color: context.colors.contentTertiary),
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountCreatedLabel,
                  value: formatInstantDate(context, account.createdAt),
                ),
                SizedBox(height: context.spacing.sm),
                LabelledValue(
                  label: l10n.accountUpdatedLabel,
                  value: formatInstantDate(context, account.updatedAt),
                ),
                SizedBox(height: context.spacing.md),
                KararButton(
                  label: l10n.accountDetailEditAction,
                  variant: KararButtonVariant.secondary,
                  onPressed: () => context.go(
                    FinancialRoutes.accountEditPath(account.accountId),
                  ),
                ),
              ],
            ),
          ),
        ),
        FinancialSection(
          heading: l10n.balancesSectionTitle,
          child: KararCard(
            child: AccountBalancesBlock(
              accountId: account.accountId,
              l10n: l10n,
              showOlderReports: true,
            ),
          ),
        ),
        AccountSourceSection(accountId: account.accountId, l10n: l10n),
        AccountInstrumentsSection(accountId: account.accountId, l10n: l10n),
        _RecentTransactions(accountId: account.accountId, l10n: l10n),
      ],
    );
  }
}

/// Which sources feed this account and how fresh they are.
///
/// The "last synchronized" line comes from `lastSuccessfulImportAt` alone —
/// the moment an import actually finished — and never from "we saw the source"
/// or from a row's `updatedAt`. When no import has finished, it says so.
final class AccountSourceSection extends ConsumerWidget {
  const AccountSourceSection({
    required this.accountId,
    required this.l10n,
    super.key,
  });

  final String accountId;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final links = ref.watch(accountSourceLinksProvider(accountId));

    return FinancialSection(
      heading: l10n.sourceSectionTitle,
      child: KararCard(
        child: links.when(
          loading: () => const KararLoadingIndicator.inline(),
          error: (Object error, StackTrace _) => Text(
            l10n.sourceNoneObservedTitle,
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          data: (List<AccountSourceLink> value) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Stated on every account, in every state. It is the sentence
              // that makes "Connected" unsayable rather than merely unsaid.
              KararBanner(
                message: l10n.sourceNoLiveLinkNotice,
                tone: KararStatusTone.info,
              ),
              SizedBox(height: context.spacing.md),
              _Freshness(freshness: freshnessOf(value), l10n: l10n),
              SizedBox(height: context.spacing.md),
              if (value.isEmpty)
                Text(
                  l10n.sourceNoneObservedTitle,
                  textAlign: TextAlign.start,
                  style: context.typography.bodyMedium
                      .copyWith(color: context.colors.contentSecondary),
                )
              else
                for (final link in value)
                  Padding(
                    padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        LabelledValue(
                          label: l10n.accountSourceFieldLabel,
                          value: dataOriginLabel(
                            dataOriginOfRail(link.rail, link.availability),
                            l10n,
                          ),
                        ),
                        SizedBox(height: context.spacing.xs),
                        LabelledValue(
                          label: l10n.accountLifecycleFieldLabel,
                          value: sourceLinkStatusLabel(link.status, l10n),
                        ),
                        SizedBox(height: context.spacing.xs),
                        LabelledValue(
                          label: l10n.sourceAuthorityAuthoritative,
                          value: sourceAuthorityLabel(link.sourceAuthority, l10n),
                        ),
                        SizedBox(height: context.spacing.xs),
                        LabelledValue(
                          label: l10n.sourceCoverageLabel,
                          value: link.historyCoverage == null
                              ? l10n.sourceCoverageNone
                              : l10n.sourceCoverageRange(
                                  formatCalendarDay(
                                    context,
                                    link.historyCoverage!.start,
                                  ),
                                  formatCalendarDay(
                                    context,
                                    link.historyCoverage!.end,
                                  ),
                                ),
                        ),
                        SizedBox(height: context.spacing.xs),
                        LabelledValue(
                          label: l10n.sourceBalanceObservationLabel,
                          value: sourceObservationLabel(
                            link.capabilities.balance,
                            l10n,
                          ),
                        ),
                        SizedBox(height: context.spacing.xs),
                        LabelledValue(
                          label: l10n.sourcePendingObservationLabel,
                          value: sourceObservationLabel(
                            link.capabilities.pendingTransactions,
                            l10n,
                          ),
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

final class _Freshness extends StatelessWidget {
  const _Freshness({required this.freshness, required this.l10n});

  final SourceFreshness freshness;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) => switch (freshness) {
        LastSynchronisedAt(:final at) => LabelledValue(
            label: l10n.sourceLastSynchronisedLabel,
            value: formatInstant(context, at),
          ),
        NeverImported() => LabelledValue(
            label: l10n.sourceLastSynchronisedLabel,
            value: l10n.sourceNeverImportedTitle,
          ),
        NoSourceObserved() => LabelledValue(
            label: l10n.sourceLastSynchronisedLabel,
            value: l10n.sourceNoneObservedTitle,
          ),
      };
}

/// The most recent transactions on this account.
final class _RecentTransactions extends ConsumerWidget {
  const _RecentTransactions({required this.accountId, required this.l10n});

  final String accountId;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recent = ref.watch(accountRecentTransactionsProvider(accountId));

    return FinancialSection(
      heading: l10n.accountDetailRecentTransactions,
      child: Column(
        children: <Widget>[
          recent.when(
            loading: () => const KararLoadingIndicator.inline(),
            error: (Object error, StackTrace _) => KararStateView.empty(
              title: l10n.transactionsEmptyTitle,
              message: l10n.transactionsEmptyDescription,
            ),
            data: (List<Transaction> value) => Column(
              children: <Widget>[
                if (value.isEmpty)
                  KararStateView.empty(
                    title: l10n.transactionsEmptyTitle,
                    message: l10n.transactionsEmptyDescription,
                  )
                else
                  for (final transaction in value)
                    Padding(
                      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
                      child: TransactionRow(transaction: transaction, l10n: l10n),
                    ),
              ],
            ),
          ),
          SizedBox(height: context.spacing.sm),
          KararButton(
            label: l10n.accountDetailSeeAllTransactions,
            variant: KararButtonVariant.secondary,
            isFullWidth: true,
            onPressed: () =>
                context.go(FinancialRoutes.transactionsForAccount(accountId)),
          ),
        ],
      ),
    );
  }
}
