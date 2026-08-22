// THE PORTFOLIO GROUPS AND FILTERS. IT NEVER ADDS.
//
// The second mutation this workstream is checked against is "sum two
// currencies into one total". The domain half of that check lives here: the
// grouping types hold ACCOUNTS, and there is no member anywhere in them that
// could hold a figure. The widget half is in `accounts_screen_test.dart`.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_portfolio.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';

import 'support/financial_fixtures.dart';

void main() {
  group('multiplicity survives', () {
    test('two accounts of the same type and currency at one issuer stay two', () {
      final portfolio = AccountPortfolio.from(wholePortfolio());
      final atIssuerOne = portfolio.groups
          .firstWhere(
            (PortfolioGroup group) => group.key.issuer?.issuerId == issuerOneId,
          )
          .accounts;

      final everyday = atIssuerOne
          .where(
            (FinancialAccount account) =>
                account.accountType == AccountType.current &&
                account.currency.code == 'QAR',
          )
          .toList();
      expect(everyday.length, 2, reason: 'two accounts must not be merged into one');
      expect(
        everyday.map((FinancialAccount account) => account.accountId).toSet().length,
        2,
      );
    });

    test('two wallets from one issuer are two rows with their own kinds', () {
      final portfolio = AccountPortfolio.from(
        wholePortfolio(),
        grouping: PortfolioGrouping.issuer,
      );
      final wallets = portfolio.accounts
          .where((FinancialAccount account) => account.isWallet)
          .toList();
      expect(wallets.length, 2);
      expect(
        wallets.map((FinancialAccount account) => account.walletKind).toSet(),
        <WalletKind>{WalletKind.mobileMoney, WalletKind.prepaid},
      );
      expect(
        wallets.map((FinancialAccount account) => account.issuer.groupingKey).toSet(),
        hasLength(1),
        reason: 'both wallets are at the same issuer',
      );
    });

    test('a wallet kind exists only on a wallet', () {
      for (final account in wholePortfolio()) {
        if (account.isWallet) {
          expect(account.walletKind, isNotNull);
        } else {
          expect(account.walletKind, isNull);
        }
      }
    });

    test('cash and an unlisted issuer each group on their own', () {
      final portfolio = AccountPortfolio.from(wholePortfolio());
      final keys = portfolio.groups
          .map((PortfolioGroup group) => group.key.identifier)
          .toList();
      expect(keys, contains('none'));
      expect(keys, contains('unlisted:$unlistedIssuerLabel'));
    });
  });

  group('grouping', () {
    test('every axis produces groups that partition the portfolio', () {
      for (final grouping in PortfolioGrouping.values) {
        final portfolio =
            AccountPortfolio.from(wholePortfolio(), grouping: grouping);
        final counted = portfolio.groups.fold<int>(
          0,
          (int total, PortfolioGroup group) => total + group.accounts.length,
        );
        expect(
          counted,
          wholePortfolio().length,
          reason: '${grouping.name} lost or duplicated an account',
        );
      }
    });

    test('grouping by currency keeps each currency in its own group', () {
      final portfolio = AccountPortfolio.from(
        wholePortfolio(),
        grouping: PortfolioGrouping.currency,
      );
      for (final group in portfolio.groups) {
        expect(
          group.accounts
              .map((FinancialAccount account) => account.currency.code)
              .toSet(),
          hasLength(1),
          reason: 'a currency group must hold exactly one currency',
        );
      }
      expect(portfolio.currencies, <String>['QAR', 'USD']);
    });

    test('a group holds accounts and nothing else', () {
      final portfolio = AccountPortfolio.from(wholePortfolio());
      for (final group in portfolio.groups) {
        expect(group.accounts, everyElement(isA<FinancialAccount>()));
      }
    });
  });

  group('filtering', () {
    test('every axis narrows the set without widening it', () {
      final all = wholePortfolio();
      final filters = <PortfolioFilter>[
        PortfolioFilter(issuerKey: IssuerFromCatalogue(issuerOne()).groupingKey),
        const PortfolioFilter(issuerKind: IssuerKind.fintechWallet),
        const PortfolioFilter(accountType: AccountType.wallet),
        const PortfolioFilter(walletKind: WalletKind.prepaid),
        const PortfolioFilter(nature: AccountNature.liability),
        const PortfolioFilter(currencyCode: 'USD'),
        const PortfolioFilter(lifecycle: AccountLifecycle.archived),
        const PortfolioFilter(origin: AccountOrigin.csv),
      ];
      for (final filter in filters) {
        final portfolio = AccountPortfolio.from(all, filter: filter);
        expect(portfolio.accounts.length, lessThan(all.length));
        expect(portfolio.accounts.length, greaterThan(0));
        expect(portfolio.totalBeforeFilter, all.length);
      }
    });

    test('an empty result caused by a filter is distinguishable from no accounts',
        () {
      final filtered = AccountPortfolio.from(
        wholePortfolio(),
        filter: const PortfolioFilter(currencyCode: 'ZZZ'),
      );
      expect(filtered.isEmpty, isTrue);
      expect(filtered.isEmptiedByFilter, isTrue);

      final nothing = AccountPortfolio.from(const <FinancialAccount>[]);
      expect(nothing.isEmpty, isTrue);
      expect(nothing.isEmptiedByFilter, isFalse);
    });

    test('an unlisted issuer filters as precisely as a catalogue one', () {
      final portfolio = AccountPortfolio.from(
        wholePortfolio(),
        filter: const PortfolioFilter(issuerKey: 'unlisted:$unlistedIssuerLabel'),
      );
      expect(portfolio.accounts, hasLength(1));
      expect(portfolio.accounts.single.issuer, isA<IssuerUnlisted>());
    });

    test('the filter reports how many axes are narrowed', () {
      expect(const PortfolioFilter().activeCount, 0);
      expect(
        const PortfolioFilter(currencyCode: 'QAR', accountType: AccountType.wallet)
            .activeCount,
        2,
      );
    });

    test('options are offered only where there is a choice to make', () {
      final options =
          AccountPortfolio.optionsFor(wholePortfolio(), PortfolioGrouping.currency);
      expect(options.map((PortfolioGroupKey key) => key.currencyCode).toList(),
          <String>['QAR', 'USD']);
    });
  });

  group('balances stay apart by kind and are never combined', () {
    test('one kind per group, newest report first', () {
      final grouped = BalancesByKind.from(<BalanceSnapshot>[
        balance(
          snapshotId: 'snapshot-a',
          balanceKind: BalanceKind.booked,
          asOf: DateTime.utc(2026, 3, 1),
        ),
        balance(
          snapshotId: 'snapshot-b',
          balanceKind: BalanceKind.booked,
          asOf: DateTime.utc(2026, 3, 5),
        ),
        balance(snapshotId: 'snapshot-c', balanceKind: BalanceKind.available),
      ]);

      expect(grouped.entries, hasLength(2));
      final booked = grouped.entries
          .firstWhere((BalanceKindGroup group) => group.kind == BalanceKind.booked);
      expect(booked.snapshots, hasLength(2));
      expect(booked.mostRecent.snapshotId, 'snapshot-b');
    });

    test('two currencies reported for one account remain two figures', () {
      final grouped = BalancesByKind.from(<BalanceSnapshot>[
        balance(snapshotId: 'snapshot-a', amount: money('100000')),
        balance(
          snapshotId: 'snapshot-b',
          amount: money('200000', currency: 'USD'),
          balanceKind: BalanceKind.available,
        ),
      ]);
      final currencies = <String>{
        for (final group in grouped.entries)
          for (final snapshot in group.snapshots) snapshot.amount.currency,
      };
      expect(currencies, <String>{'QAR', 'USD'});
    });
  });

  group('no aggregation exists to be reached for', () {
    test('the portfolio and balance types declare no total, sum or net member', () {
      // A source rule rather than a behavioural one: the mutation under test
      // is somebody ADDING an aggregate, and an aggregate has to be declared
      // somewhere before it can be rendered.
      const List<String> forbidden = <String>[
        'netWorth',
        'net_worth',
        'totalAmount',
        'totalBalance',
        'sumOf',
        'grandTotal',
        'convertTo',
        'exchangeRate',
        'fxRate',
      ];
      for (final path in <String>[
        'lib/features/financial_accounts/domain/account_portfolio.dart',
        'lib/features/financial_accounts/domain/balance_snapshot.dart',
        'lib/features/financial_accounts/domain/money.dart',
      ]) {
        final body = File(path)
            .readAsLinesSync()
            .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
            .join('\n');
        for (final name in forbidden) {
          expect(
            body.contains(name),
            isFalse,
            reason: '$path declares "$name"; Phase 5 computes no financial figure',
          );
        }
      }
    });

    test('money declares no arithmetic operator', () {
      final body = File('lib/features/financial_accounts/domain/money.dart')
          .readAsLinesSync()
          .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
          .join('\n');
      expect(body, isNot(contains('operator +')));
      expect(body, isNot(contains('operator -')));
      expect(body, isNot(contains('operator *')));
      expect(body, isNot(contains('operator /')));
    });
  });
}
