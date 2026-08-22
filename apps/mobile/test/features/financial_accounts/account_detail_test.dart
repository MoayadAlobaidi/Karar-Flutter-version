// ONE ACCOUNT, IN FULL.
//
// Identity, wallet kind, nature, currency, lifecycle, balances by kind, the
// source-and-freshness summary and the linked instruments — and two absences
// that are the point of the screen: no delete control, and no connect action.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/calendar_day.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/account_detail_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import 'support/financial_fixtures.dart';
import 'support/financial_harness.dart';

const String subjectId = 'account-0005';
const Size detailSurface = Size(1400, 24000);

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(AccountDetailScreen)));

ScriptedAccountsRepository detailRepository({
  DateTime? lastSuccessfulImportAt,
  List<AccountSourceLink>? links,
  AccountOrigin origin = AccountOrigin.csv,
}) =>
    ScriptedAccountsRepository(
      accounts: <FinancialAccount>[
        account(
          accountId: subjectId,
          displayName: 'Wallet under inspection',
          accountType: AccountType.wallet,
          walletKind: WalletKind.superApp,
          nature: AccountNature.liability,
          issuer: IssuerFromCatalogue(walletIssuer()),
          origin: origin,
        ),
      ],
      balances: <String, List<BalanceSnapshot>>{
        subjectId: <BalanceSnapshot>[
          balance(
            accountId: subjectId,
            amount: money('50000'),
            asOf: DateTime.utc(2026, 3, 5),
          ),
          balance(
            snapshotId: 'snapshot-older',
            accountId: subjectId,
            amount: money('49000'),
            asOf: DateTime.utc(2026, 3, 1),
          ),
          balance(
            snapshotId: 'snapshot-available',
            accountId: subjectId,
            amount: money('45000'),
            balanceKind: BalanceKind.available,
            sourceKind: SourceKind.csv,
          ),
        ],
      },
      sourceLinks: <String, List<AccountSourceLink>>{
        subjectId: links ??
            <AccountSourceLink>[
              sourceLink(
                accountId: subjectId,
                lastSuccessfulImportAt: lastSuccessfulImportAt,
                coverage: const CalendarDayRange(
                  start: CalendarDay(year: 2026, month: 1, day: 1),
                  end: CalendarDay(year: 2026, month: 3, day: 31),
                ),
              ),
            ],
      },
    );

Future<void> pumpDetail(
  WidgetTester tester, {
  ScriptedAccountsRepository? repository,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) =>
    pumpFeatureScreen(
      tester,
      const AccountDetailScreen(accountId: subjectId),
      locale: locale,
      textScale: textScale,
      surfaceSize: detailSurface,
      overrides: financialOverrides(
        accounts: repository ?? detailRepository(),
        instruments: ScriptedInstrumentsRepository(),
        transactions: ScriptedTransactionsRepository(),
      ),
    );

void main() {
  group('identity', () {
    testInBothDirections(
      'every stated field is rendered',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);

        expect(find.text('Wallet under inspection'), findsOneWidget);
        expect(
          find.text(locale.languageCode == 'ar' ? issuerWalletNameAr : issuerWalletNameEn),
          findsOneWidget,
        );
        expect(find.text(l10n.accountTypeWallet), findsOneWidget);
        expect(find.text(l10n.walletKindSuperApp), findsOneWidget);
        expect(find.text(l10n.accountNatureLiability), findsOneWidget);
        expect(find.text('QAR'), findsOneWidget);
        expect(find.text(l10n.accountLifecycleActive), findsOneWidget);
        expect(find.text('**1234'), findsOneWidget);
        expect(find.text(l10n.accountMaskNeverFullNumber), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('a non-wallet renders no wallet kind at all',
        (WidgetTester tester) async {
      await pumpDetail(
        tester,
        repository: ScriptedAccountsRepository(
          accounts: <FinancialAccount>[
            account(accountId: subjectId, accountType: AccountType.savings),
          ],
        ),
      );
      expect(find.text(mountedL10n(tester).accountWalletKindFieldLabel), findsNothing);
    });
  });

  group('balances by kind', () {
    testInBothDirections(
      'every kind is labelled and every report is shown with its own moment',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);

        expect(find.text(l10n.balanceKindBooked), findsOneWidget);
        expect(find.text(l10n.balanceKindAvailable), findsOneWidget);
        // The older booked report is kept rather than discarded.
        expect(find.text(l10n.balanceOlderReportsLabel), findsOneWidget);
        expect(find.text(l10n.balancesNoTotalNotice), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'the figures are exactly the three the sources reported',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        final amounts = <String>[
          for (final widget in tester.allWidgets)
            if (widget is Text &&
                widget.data != null &&
                widget.data!.contains('QAR') &&
                RegExp('[0-9٠-٩۰-۹]').hasMatch(widget.data!))
              widget.data!,
        ];
        expect(
          amounts,
          hasLength(3),
          reason: 'three figures were reported; anything else is computed:\n'
              '$amounts',
        );
      },
      textScales: featureTextScales,
    );

    testWidgets('each figure states the rail it arrived on',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.dataOriginManuallyAdded), findsWidgets);
      expect(find.text(l10n.dataOriginImportedFromStatement), findsWidgets);
    });
  });

  group('source and freshness', () {
    testInBothDirections(
      'the no-live-link notice is always present',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        expect(find.text(mountedL10n(tester).sourceNoLiveLinkNotice), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('a completed import is reported as the last synchronised moment',
        (WidgetTester tester) async {
      await pumpDetail(
        tester,
        repository: detailRepository(
          lastSuccessfulImportAt: DateTime.utc(2026, 3, 10, 9),
        ),
      );
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.sourceLastSynchronisedLabel), findsOneWidget);
      expect(find.text(l10n.sourceNeverImportedTitle), findsNothing);
    });

    testWidgets('a source that never delivered says so rather than showing a moment',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.sourceLastSynchronisedLabel), findsOneWidget);
      expect(find.text(l10n.sourceNeverImportedTitle), findsOneWidget);
    });

    testWidgets('no source at all is a different sentence again',
        (WidgetTester tester) async {
      await pumpDetail(
        tester,
        repository: detailRepository(links: const <AccountSourceLink>[]),
      );
      expect(
        find.text(mountedL10n(tester).sourceNoneObservedTitle),
        findsWidgets,
      );
    });

    testWidgets('a LINKED source reads as attached to the account, not connected',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.sourceStatusAttached), findsOneWidget);
      expectNothingMatching(
        tester,
        RegExp('connect', caseSensitive: false),
        because: 'LINKED describes a relationship inside this platform',
      );
    });

    testInBothDirections(
      'the covered days render as days, not as moments',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);
        // Both endpoints are calendar days, rendered from their own integers.
        final expected = l10n.sourceCoverageRange(
          _localisedDay(tester, '2026-01-01'),
          _localisedDay(tester, '2026-03-31'),
        );
        expect(find.text(expected), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('what the source has been seen to supply is stated',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.sourceObservationObserved), findsOneWidget);
      expect(find.text(l10n.sourceObservationNotProvided), findsOneWidget);
    });
  });

  group('what the screen deliberately does not offer', () {
    testWidgets('there is no delete control for an account',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      for (final widget in tester.allWidgets) {
        if (widget is Text && widget.data != null) {
          expect(widget.data!.toLowerCase(), isNot(contains('delete')));
          expect(widget.data!, isNot(contains('حذف')));
        }
      }
    });

    testWidgets('there is no connect action', (WidgetTester tester) async {
      await pumpDetail(tester);
      for (final widget in tester.allWidgets) {
        if (widget is Text && widget.data != null) {
          expect(widget.data!.toLowerCase(), isNot(contains('connect bank')));
          expect(widget.data!.toLowerCase(), isNot(contains('link account')));
        }
      }
    });

    testWidgets('the currency cannot be changed from here', (WidgetTester tester) async {
      await pumpDetail(tester);
      // The only control on this screen is the edit action; the currency is a
      // read-only value beside it.
      expect(find.text(mountedL10n(tester).accountDetailEditAction), findsOneWidget);
    });
  });

  group('failure', () {
    testInBothDirections(
      'an account that cannot be read renders an error state',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(
          tester,
          repository: ScriptedAccountsRepository(),
          locale: locale,
          textScale: scale,
        );
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.accountDetailUnavailableTitle), findsOneWidget);
        expect(find.text(l10n.actionRetry), findsOneWidget);
      },
      textScales: featureTextScales,
    );
  });
}

/// The day as this locale renders it, so the assertion follows the numerals
/// the interface uses rather than assuming Western digits.
String _localisedDay(WidgetTester tester, String iso) => KararFormatter.of(
      tester.element(find.byType(AccountDetailScreen)),
    ).applyNumerals(iso);
