// THE ROUTES, AND THE GATE IN FRONT OF THEM.
//
// The route table is contributed unconditionally and read once when the router
// is built, so the whole of "this surface is unavailable without the
// capability" rests on the decision being made INSIDE the builder, per build.
//
// Four properties, each of which can break on its own:
//
//   * A DEEP LINK IS REFUSED. Every location this feature contributes renders
//     the refusal screen without the capability;
//   * NOTHING IS FETCHED. The gate decides BEFORE the screen is constructed, so
//     no provider is read, no repository is built and no request is issued —
//     which is what makes the refusal free of side effects rather than merely
//     free of pixels;
//   * NO CONTRACT PATH IS IN A LOCATION. These are in-app navigation locations
//     and they never begin with `/financial`, which is what keeps this feature
//     off the one-file allowlist in
//     `test/architecture/financial_contract_reading_test.dart`;
//   * EVERY PROVIDER THIS FEATURE CONTRIBUTES CAN EMPTY ITSELF. The registry is
//     typed, so this is largely a compile-time guarantee; the count is asserted
//     so a provider added and not registered is caught rather than assumed.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_unavailable_screen.dart';
import 'package:karar_mobile/features/financial_connections/presentation/account_sources_screen.dart';
import 'package:karar_mobile/features/financial_connections/presentation/connection_routes.dart';
import 'package:karar_mobile/features/financial_connections/presentation/connections_screen.dart';
import 'package:karar_mobile/features/financial_connections/presentation/financial_connections_feature_registration.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../financial_accounts/support/financial_fixtures.dart';
import 'support/financial_connections_harness.dart';

/// Every location this feature contributes, DERIVED from the route table so a
/// route added later is covered without anyone editing this file.
List<String> everyConnectionPath() => <String>[
  for (final route in financialConnectionRoutes())
    if (route is GoRoute) route.path,
];

/// The same locations with their parameters filled in, so a deep link can
/// actually be opened at one.
List<String> everyOpenableConnectionLocation() => <String>[
  for (final path in everyConnectionPath())
    path.replaceAll(':${ConnectionRoutes.accountIdParameter}', fedAccountId),
];

Future<void> pumpAt(
  WidgetTester tester,
  String location, {
  required List<Override> overrides,
}) async {
  await tester.binding.setSurfaceSize(const Size(1200, 14000));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final router = GoRouter(
    initialLocation: location,
    routes: <RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState _) => const SizedBox.shrink(),
      ),
      ...financialConnectionRoutes(),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(
        routerConfig: router,
        locale: KararLocalization.english,
        localizationsDelegates: KararLocalization.localizationsDelegates,
        supportedLocales: KararLocalization.supportedLocales,
        localeResolutionCallback: KararLocalization.resolve,
        theme: KararTheme.light(locale: KararLocalization.english),
        builder: (BuildContext context, Widget? child) =>
            KararThemeScope(child: child ?? const SizedBox.shrink()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test('the derivation produces the routes this feature actually contributes', () {
    // Without this the assertions below could all be vacuous.
    final paths = everyConnectionPath();
    expect(paths, hasLength(2));
    expect(paths, contains(ConnectionRoutes.dataSources));
    expect(paths, contains(ConnectionRoutes.accountSources));
  });

  test('no location is a contract path', () {
    for (final path in everyConnectionPath()) {
      expect(
        path.startsWith('/financial'),
        isFalse,
        reason:
            '$path resembles a contract path; this feature takes its own '
            'prefix rather than asking for a second allowlist exemption',
      );
    }
  });

  test('the literal location is declared before the parameterised one', () {
    // Otherwise `/data-sources` would be captured by the route that reads an
    // account identifier out of the path.
    final paths = everyConnectionPath();
    expect(paths.indexOf(ConnectionRoutes.dataSources), 0);
  });

  test('a location carries nothing but literals and an opaque identifier', () {
    // No connection label, no issuer name, no rail, no date. A location ends up
    // in a deep link, a restoration bundle and a framework log line.
    for (final path in everyConnectionPath()) {
      for (final segment in path.split('/')) {
        if (!segment.startsWith(':')) {
          continue;
        }
        expect(
          segment,
          ':${ConnectionRoutes.accountIdParameter}',
          reason: '$path carries a parameter that is not the opaque account id',
        );
      }
    }
  });

  test('the built path for one account is one of the declared locations', () {
    expect(
      ConnectionRoutes.accountSourcesPath(fedAccountId),
      ConnectionRoutes.accountSources.replaceAll(
        ':${ConnectionRoutes.accountIdParameter}',
        fedAccountId,
      ),
    );
  });

  testWidgets('the capability opens the listing', (WidgetTester tester) async {
    await pumpAt(tester, ConnectionRoutes.dataSources, overrides: financialConnectionOverrides());

    expect(find.byType(DataSourcesScreen), findsOneWidget);
    expect(find.byType(FinancialUnavailableScreen), findsNothing);
  });

  testWidgets('the capability opens one account\'s sources', (WidgetTester tester) async {
    await pumpAt(
      tester,
      ConnectionRoutes.accountSourcesPath(fedAccountId),
      overrides: financialConnectionOverrides(),
    );

    expect(find.byType(AccountSourcesScreen), findsOneWidget);
    expect(find.byType(FinancialUnavailableScreen), findsNothing);
  });

  testWidgets('without the capability every location renders the refusal', (
    WidgetTester tester,
  ) async {
    for (final location in everyOpenableConnectionLocation()) {
      final connections = ScriptedFinancialConnectionsRepository();
      final accounts = accountsWithSources();
      await pumpAt(
        tester,
        location,
        overrides: financialConnectionOverrides(
          connections: connections,
          accounts: accounts,
          bootstrap: syntheticBootstrap(withTransactions: false),
        ),
      );

      expect(find.byType(FinancialUnavailableScreen), findsOneWidget, reason: location);
      expect(find.byType(DataSourcesScreen), findsNothing, reason: location);
      expect(find.byType(AccountSourcesScreen), findsNothing, reason: location);
      expect(
        connections.calls,
        isEmpty,
        reason:
            'the gate decides before the screen is constructed, so a '
            'refused deep link reads no provider and issues no request '
            '($location)',
      );
      expect(accounts.reads, isEmpty, reason: location);
    }
  });

  test('every provider this feature contributes is registered as tenant-scoped', () {
    // Typed entries: `tenantScopedAsync` accepts only a
    // `TenantScopedAsyncNotifier`, so a provider that could not empty itself
    // cannot be registered here at all.
    expect(financialConnectionTenantScopedProviders(), hasLength(3));
  });
}
