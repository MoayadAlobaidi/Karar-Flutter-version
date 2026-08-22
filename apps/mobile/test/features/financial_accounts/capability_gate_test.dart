// THE CAPABILITY GATE.
//
// The fourth mutation this workstream is checked against is "remove the
// capability guard". These tests are what fails when somebody does.
//
// Three properties, and each is asserted separately because each can break on
// its own:
//
//   * NO NAV ITEM — the home surface names nothing financial;
//   * A DEEP LINK IS REFUSED — every financial route renders the refusal, and
//     the refusal names no account, wallet, transaction, balance or currency;
//   * NOTHING IS FETCHED OR RETAINED — no repository read is issued at all, so
//     there is no financial state to keep and nothing to clear.
//
// The capability answer is a LOCAL/TEST bootstrap built in this process. No
// real capability state is read or written, and the platform's own
// `navigableCapabilityIds` allowlist stays empty and untouched.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_and_wallets_screen.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_capability.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_feature_registration.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_home_shell.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_routes.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_unavailable_screen.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_capability.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_providers.dart';
import 'package:karar_mobile/features/transactions/presentation/transaction_detail_screen.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import '../platform_bootstrap/support/fixtures.dart';
import 'support/financial_fixtures.dart';
import 'support/financial_harness.dart';

/// The startup state handed to the home shell.
///
/// The shell reads the capability from its own provider and passes the state
/// straight through to the platform home screen, which does not read it
/// either, so any state serves.
const StartupState homeState = ConfigLoading();

/// Every financial path a deep link could name.
const List<String> everyFinancialPath = <String>[
  FinancialRoutes.accounts,
  FinancialRoutes.accountCreate,
  '/financial/accounts/account-0001',
  '/financial/accounts/account-0001/edit',
  FinancialRoutes.transactions,
  FinancialRoutes.transactionCreate,
  '/financial/transactions/transaction-0001',
  '/financial/transactions/transaction-0001/correct',
  '/financial/transactions/transaction-0001/category',
];

/// Mounts the real financial route table at [location].
Future<void> pumpFinancialRouter(
  WidgetTester tester,
  String location, {
  required List<Override> overrides,
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
}) async {
  await tester.binding.setSurfaceSize(featureSurfaceSize);
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final router = GoRouter(
    initialLocation: location,
    routes: <RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState _) => const SizedBox.shrink(),
      ),
      ...financialFeatureRoutes(),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(
        routerConfig: router,
        locale: locale,
        localizationsDelegates: KararLocalization.localizationsDelegates,
        supportedLocales: KararLocalization.supportedLocales,
        localeResolutionCallback: KararLocalization.resolve,
        theme: KararTheme.light(locale: locale),
        builder: (BuildContext context, Widget? child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
          child: KararThemeScope(child: child ?? const SizedBox.shrink()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('the gate', () {
    test('is closed until bootstrap reports the capability as available', () {
      ProviderContainer containerFor(BootstrapSnapshot? bootstrap) {
        final container = ProviderContainer(
          overrides: <Override>[financialBootstrapProvider.overrideWithValue(bootstrap)],
        );
        addTearDown(container.dispose);
        return container;
      }

      expect(containerFor(syntheticBootstrap()).read(financialSurfaceEnabledProvider), isTrue);
      expect(
        containerFor(syntheticBootstrap(withTransactions: false))
            .read(financialSurfaceEnabledProvider),
        isFalse,
      );
      // Not READY at all.
      expect(containerFor(null).read(financialSurfaceEnabledProvider), isFalse);
      // Resolution did not complete, so nothing is granted.
      expect(
        containerFor(syntheticBootstrap(resolution: CapabilityResolutionState.unknown))
            .read(financialSurfaceEnabledProvider),
        isFalse,
      );
      // Present but not available.
      expect(
        containerFor(syntheticBootstrap(status: 'RESTRICTED'))
            .read(financialSurfaceEnabledProvider),
        isFalse,
      );
    });

    test('names the identifier the platform publishes', () {
      expect(transactionsCapabilityId, 'TRANSACTIONS');
    });

    test('the platform allowlist is untouched by this workstream', () {
      // The financial surface is gated on the client-safe bootstrap answer,
      // not by registering a destination in the platform's navigation
      // allowlist. That allowlist is deliberately empty and stays that way.
      expect(navigableCapabilityIds, isEmpty);
      expect(const CapabilityNavigationResolver().isNavigable(transactionsCapabilityId), isFalse);
    });
  });

  group('without the capability', () {
    testInBothDirections('the home surface names nothing financial', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final accounts = ScriptedAccountsRepository(accounts: wholePortfolio());
      await pumpFeatureScreen(
        tester,
        const FinancialHomeShell(state: homeState),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          ...financialOverrides(
            accounts: accounts,
            bootstrap: syntheticBootstrap(withTransactions: false),
          ),
          platformContextProvider.overrideWithValue(platformContext()),
        ],
      );

      expect(find.byType(KararNavigationBar), findsNothing);
      expect(find.byType(AccountsAndWalletsScreen), findsNothing);
      expect(accounts.reads, isEmpty, reason: 'a closed surface must issue no financial read');
    }, textScales: featureTextScales);

    testWidgets('every financial deep link is refused', (WidgetTester tester) async {
      for (final path in everyFinancialPath) {
        final accounts = ScriptedAccountsRepository(accounts: wholePortfolio());
        final transactions = ScriptedTransactionsRepository();
        await pumpFinancialRouter(
          tester,
          path,
          overrides: financialOverrides(
            accounts: accounts,
            transactions: transactions,
            bootstrap: syntheticBootstrap(withTransactions: false),
          ),
        );

        expect(
          find.byType(FinancialUnavailableScreen),
          findsOneWidget,
          reason: '$path must be refused',
        );
        expect(find.byType(AccountsAndWalletsScreen), findsNothing);
        expect(find.byType(TransactionsScreen), findsNothing);
        expect(find.byType(TransactionDetailScreen), findsNothing);
        expect(
          accounts.reads,
          isEmpty,
          reason: '$path constructed a financial screen and fetched from it',
        );
        expect(transactions.reads, isEmpty, reason: '$path issued a read');
      }
    });

    testInBothDirections('the refusal describes nothing that is behind it', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFinancialRouter(
        tester,
        FinancialRoutes.accounts,
        locale: locale,
        textScale: scale,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
          bootstrap: syntheticBootstrap(withTransactions: false),
        ),
      );

      // No account, wallet, issuer, amount or currency is named.
      for (final forbidden in <String>[
        'Everyday account',
        issuerOneNameEn,
        issuerOneNameAr,
        unlistedIssuerLabel,
        'QAR',
        'USD',
        '1,250',
      ]) {
        expectNothingMatching(
          tester,
          forbidden,
          because: 'a refusal must not describe what it is refusing',
        );
      }
    }, textScales: featureTextScales);
  });

  group('with the capability', () {
    testInBothDirections('the home surface offers the financial destination', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const FinancialHomeShell(state: homeState),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          ...financialOverrides(accounts: ScriptedAccountsRepository(accounts: wholePortfolio())),
          platformContextProvider.overrideWithValue(platformContext()),
        ],
      );

      expect(find.byType(KararNavigationBar), findsOneWidget);
      final l10n = AppLocalizations.of(tester.element(find.byType(KararNavigationBar)));
      expect(find.text(l10n.financialHomeTabAccounts), findsOneWidget);
    }, textScales: featureTextScales);

    testWidgets('a deep link into the portfolio opens it', (WidgetTester tester) async {
      final accounts = ScriptedAccountsRepository(accounts: wholePortfolio());
      await pumpFinancialRouter(
        tester,
        FinancialRoutes.accounts,
        overrides: financialOverrides(accounts: accounts),
      );

      expect(find.byType(AccountsAndWalletsScreen), findsOneWidget);
      expect(find.byType(FinancialUnavailableScreen), findsNothing);
      expect(accounts.reads, contains('listOwnAccounts'));
    });
  });
}
