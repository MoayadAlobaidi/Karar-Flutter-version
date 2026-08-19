// ACCOUNTS & WALLETS, ON SCREEN.
//
// This is the widget half of the second mutation check: "sum two currencies
// into one total". The test collects EVERY money-shaped string the screen
// rendered and asserts the set is exactly the figures the sources reported.
// A total — of two currencies, of two kinds, or of two accounts — is one more
// string than the sources reported, so it fails here whatever it is called.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_portfolio.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_and_wallets_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import 'support/financial_fixtures.dart';
import 'support/financial_harness.dart';

/// Anything that reads as a monetary figure: a run of digits in any script
/// with an optional grouping and decimal separator.
final RegExp moneyShaped = RegExp(r'[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٫٬  ]*[0-9٠-٩۰-۹]');

/// Every string the screen actually rendered.
List<String> renderedStrings(WidgetTester tester) => <String>[
      for (final widget in tester.allWidgets)
        if (widget is Text && widget.data != null) widget.data!,
    ];

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(AccountsAndWalletsScreen)));

ScriptedAccountsRepository portfolioRepository() => ScriptedAccountsRepository(
      accounts: wholePortfolio(),
      balances: <String, List<BalanceSnapshot>>{
        'account-0001': <BalanceSnapshot>[
          balance(amount: money('125000')),
          balance(
            snapshotId: 'snapshot-0002',
            amount: money('120000'),
            balanceKind: BalanceKind.available,
          ),
        ],
        'account-0003': <BalanceSnapshot>[
          balance(
            snapshotId: 'snapshot-0003',
            accountId: 'account-0003',
            amount: money('900000', currency: 'USD'),
          ),
        ],
      },
    );

/// A surface tall enough for the whole portfolio, the eight filter rows and
/// the balances beneath every card — at twice the text scale.
///
/// A lazy list only builds what fits, so a card below the fold would be absent
/// from the tree and a test asserting on it would fail for a reason that has
/// nothing to do with the code.
const Size portfolioSurface = Size(1400, 24000);

Future<void> pumpPortfolio(
  WidgetTester tester, {
  ScriptedAccountsRepository? repository,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) =>
    pumpFeatureScreen(
      tester,
      const AccountsAndWalletsScreen(),
      locale: locale,
      textScale: textScale,
      surfaceSize: portfolioSurface,
      overrides: financialOverrides(accounts: repository ?? portfolioRepository()),
    );

void main() {
  group('the portfolio renders the whole holding', () {
    testInBothDirections(
      'every account, wallet and cash row is present',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);

        expect(find.byType(AccountSummaryCard), findsNWidgets(wholePortfolio().length));
        for (final account in wholePortfolio()) {
          expect(
            find.text(account.displayName),
            findsOneWidget,
            reason: '${account.displayName} is missing from the portfolio',
          );
        }
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'two accounts of the same type and currency at one issuer stay two rows',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        expect(find.text('Everyday account'), findsOneWidget);
        expect(find.text('Second everyday account'), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'a wallet shows its subtype and a non-wallet does not',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);
        // Each kind appears twice: once as a filter option, once as the badge
        // on the wallet that carries it.
        expect(find.text(l10n.walletKindMobileMoney), findsWidgets);
        expect(find.text(l10n.walletKindPrepaid), findsWidgets);
        // "Not a wallet" is the detail-screen copy for an absent kind; the
        // portfolio simply omits the badge, and offers no filter for it.
        expect(find.text(l10n.walletKindNone), findsNothing);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'each row states its own currency code',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        expect(find.text('QAR'), findsWidgets);
        expect(find.text('USD'), findsWidgets);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'the safe mask is rendered and nothing longer is',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        expect(find.text('**1234'), findsWidgets);
        // Nothing that reads as a full number appears anywhere.
        for (final rendered in renderedStrings(tester)) {
          final digits = rendered.replaceAll(RegExp('[^0-9]'), '');
          expect(
            digits.length,
            lessThan(9),
            reason: '"$rendered" renders a run of digits that could be an '
                'account or card number',
          );
        }
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'a long issuer and a long account name do not clip',
      (WidgetTester tester, Locale locale, double scale) async {
        final repository = ScriptedAccountsRepository(
          accounts: <FinancialAccount>[
            account(
              accountId: 'account-long',
              displayName: longAccountName,
              issuer: IssuerFromCatalogue(
                Issuer(
                  issuerId: 'issuer-long',
                  code: 'ISSUER_LONG',
                  kind: IssuerKind.bank,
                  displayNameEn: longIssuerNameEn,
                  displayNameAr: '$longIssuerNameEn بالعربية',
                  status: IssuerStatus.active,
                ),
              ),
            ),
          ],
        );
        await pumpPortfolio(
          tester,
          repository: repository,
          locale: locale,
          textScale: scale,
        );
        // A render overflow throws in a test binding, so reaching here with no
        // exception is the assertion. The names are also present in full.
        expect(tester.takeException(), isNull);
        expect(find.text(longAccountName), findsOneWidget);
      },
      textScales: featureTextScales,
    );
  });

  group('balances are shown by kind and never combined', () {
    testInBothDirections(
      'each reported kind gets its own labelled figure',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.balanceKindBooked), findsWidgets);
        expect(find.text(l10n.balanceKindAvailable), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'the notice that nothing is added up is always present with figures',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        expect(find.text(mountedL10n(tester).balancesNoTotalNotice), findsWidgets);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'two currencies produce the per-currency notice, never a total',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.accountsPerCurrencyNoticeDescription), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'THE MONEY ON SCREEN IS EXACTLY WHAT THE SOURCES REPORTED',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);

        // Every string that carries a currency code, which is how this client
        // renders an amount. A cross-currency total, a per-issuer subtotal or
        // a net position would add one that no source reported.
        final amounts = <String>[
          for (final rendered in renderedStrings(tester))
            if ((rendered.contains('QAR') || rendered.contains('USD')) &&
                moneyShaped.hasMatch(rendered))
              rendered,
        ];

        expect(
          amounts,
          hasLength(3),
          reason: 'three figures were reported — booked and available on one '
              'account, and one on another in a different currency. Anything '
              'else on screen is a figure this client computed:\n$amounts',
        );
        final currencies = <String>{
          for (final amount in amounts)
            if (amount.contains('QAR')) 'QAR' else 'USD',
        };
        expect(currencies, <String>{'QAR', 'USD'});
        expect(
          amounts.where((String amount) => amount.contains('QAR')),
          hasLength(2),
        );
        expect(
          amounts.where((String amount) => amount.contains('USD')),
          hasLength(1),
        );
      },
      textScales: featureTextScales,
    );

    testWidgets('an account with no reported figure says so', (WidgetTester tester) async {
      await pumpPortfolio(tester);
      expect(find.text(mountedL10n(tester).balancesEmptyTitle), findsWidgets);
    });
  });

  group('source labels are honest', () {
    testInBothDirections(
      'a manual account reads as manually added and a CSV one as imported',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.dataOriginManuallyAdded), findsWidgets);
        expect(find.text(l10n.dataOriginImportedFromStatement), findsWidgets);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'nothing on the portfolio reads as a connection',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        for (final claim in <Pattern>[
          RegExp('connect', caseSensitive: false),
          RegExp('متصل'),
          RegExp('linked to', caseSensitive: false),
        ]) {
          expectNothingMatching(
            tester,
            claim,
            because: 'no issuer exposes an interface to this platform',
          );
        }
      },
      textScales: featureTextScales,
    );

    testWidgets('there is no connect action and no account delete action',
        (WidgetTester tester) async {
      await pumpPortfolio(tester);
      for (final rendered in renderedStrings(tester)) {
        expect(rendered.toLowerCase(), isNot(contains('connect bank')));
        expect(rendered.toLowerCase(), isNot(contains('delete account')));
      }
    });
  });

  group('grouping and filtering', () {
    testInBothDirections(
      'the group-by control offers every axis and switches the headings',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);
        for (final grouping in PortfolioGrouping.values) {
          expect(
            find.text(portfolioGroupingLabelFor(grouping, l10n)),
            findsWidgets,
            reason: '${grouping.name} is not offered',
          );
        }

        // Grouping by issuer puts the issuer's name on a heading, in the
        // reading language: the catalogue ships both as reference data.
        expect(
          find.text(
            locale.languageCode == 'ar' ? issuerOneNameAr : issuerOneNameEn,
          ),
          findsWidgets,
        );

        await tester.tap(find.text(l10n.groupByCurrency).first);
        await tester.pumpAndSettle();
        expect(find.text('QAR'), findsWidgets);
        expect(find.text('USD'), findsWidgets);
      },
      textScales: featureTextScales,
    );

    testWidgets('a filter narrows the list and says how many are applied',
        (WidgetTester tester) async {
      await pumpPortfolio(tester);
      final l10n = mountedL10n(tester);
      expect(
        find.text(
          KararFormatter.of(tester.element(find.byType(AccountsAndWalletsScreen)))
              .applyNumerals(l10n.financialFiltersActiveCount(0)),
        ),
        findsOneWidget,
      );

      await tester.tap(find.text(l10n.accountTypeWallet).first);
      await tester.pumpAndSettle();

      expect(find.byType(AccountSummaryCard), findsNWidgets(2));
      expect(find.text('First wallet'), findsOneWidget);
      expect(find.text('Everyday account'), findsNothing);
      expect(find.text(l10n.accountsFiltersClear), findsOneWidget);
    });

    testWidgets('clearing the filters restores the whole portfolio',
        (WidgetTester tester) async {
      await pumpPortfolio(tester);
      final l10n = mountedL10n(tester);

      await tester.tap(find.text(l10n.accountTypeWallet).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.accountsFiltersClear));
      await tester.pumpAndSettle();

      expect(find.byType(AccountSummaryCard), findsNWidgets(wholePortfolio().length));
    });

    testWidgets('a filter that matches nothing says the filter emptied it',
        (WidgetTester tester) async {
      await pumpPortfolio(tester);
      final l10n = mountedL10n(tester);

      await tester.tap(find.text(l10n.accountTypeWallet).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.accountLifecycleArchived).first);
      await tester.pumpAndSettle();

      expect(find.text(l10n.accountsFilteredEmptyTitle), findsOneWidget);
      expect(find.text(l10n.accountsEmptyTitle), findsNothing);
    });
  });

  group('states', () {
    testInBothDirections(
      'an empty portfolio invites the person to add one',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(
          tester,
          repository: ScriptedAccountsRepository(),
          locale: locale,
          textScale: scale,
        );
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.accountsEmptyTitle), findsOneWidget);
        expect(find.text(l10n.accountsAddManualAction), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'a failed read renders an error state with a retry',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(
          tester,
          repository: ScriptedAccountsRepository(
            listFailure: const DependencyUnavailableFailure(),
          ),
          locale: locale,
          textScale: scale,
        );
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.accountsUnavailableTitle), findsOneWidget);
        expect(find.text(l10n.actionRetry), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'Arabic renders right to left',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPortfolio(tester, locale: locale, textScale: scale);
        final direction = directionUnder(tester, find.byType(AccountSummaryCard).first);
        expect(
          direction,
          locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        );
      },
      textScales: featureTextScales,
    );
  });

  group('accessibility', () {
    // The identity surfaces have asserted these guidelines since Phase 4; the
    // financial surfaces — the larger and newer half of the app — asserted
    // neither. A control a screen reader cannot name is unusable to somebody
    // who cannot see it, and a tap target below the platform minimum is
    // unusable to somebody whose hands shake.
    testWidgets('every interactive control is named and big enough', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpPortfolio(tester);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree, because the guideline above does not
      // see this product's own pressable.
      expectEveryTapTargetLargeEnough(tester, expectAtLeast: 1);
      handle.dispose();
    });
  });

}

/// Re-exported so the test reads the same label function the screen does.
String portfolioGroupingLabelFor(PortfolioGrouping grouping, AppLocalizations l10n) =>
    switch (grouping) {
      PortfolioGrouping.issuer => l10n.groupByIssuer,
      PortfolioGrouping.issuerKind => l10n.groupByIssuerKind,
      PortfolioGrouping.accountType => l10n.groupByAccountType,
      PortfolioGrouping.walletKind => l10n.groupByWalletKind,
      PortfolioGrouping.nature => l10n.groupByNature,
      PortfolioGrouping.currency => l10n.groupByCurrency,
      PortfolioGrouping.lifecycle => l10n.groupByLifecycle,
      PortfolioGrouping.origin => l10n.groupByOrigin,
    };
