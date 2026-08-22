// THE ROUTE, AND THE GATE IN FRONT OF IT.
//
// The route table is contributed unconditionally and read once when the router
// is built, so the whole of "this surface is unavailable without the
// capability" rests on the decision being made INSIDE the builder, per build.
//
// Three properties, each of which can break on its own:
//
//   * A DEEP LINK IS REFUSED. The location renders the refusal screen;
//   * NOTHING IS FETCHED. The gate decides BEFORE the screen is constructed, so
//     no provider is read, no repository is built and no request is issued —
//     which is what makes the refusal free of side effects rather than merely
//     free of pixels;
//   * NO CONTRACT PATH IS IN A LOCATION. These are in-app navigation locations
//     and they never begin with `/financial`, which is what keeps this feature
//     off the one-file allowlist in
//     `test/architecture/financial_contract_reading_test.dart`.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_unavailable_screen.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_match.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_match_routes.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matches_screen.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matching_feature_registration.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matching_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../financial_accounts/support/financial_fixtures.dart';
import '../financial_accounts/support/financial_harness.dart';
import '../platform_bootstrap/support/feature_harness.dart';
import 'support/transfer_matching_harness.dart';

/// Every location this feature contributes, DERIVED from the route table so a
/// route added later is covered without anyone editing this file.
List<String> everyTransferMatchingPath() => <String>[
      for (final route in transferMatchingRoutes())
        if (route is GoRoute) route.path,
    ];

Future<void> pumpAt(
  WidgetTester tester,
  String location, {
  required List<Override> overrides,
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
      ...transferMatchingRoutes(),
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
    final paths = everyTransferMatchingPath();
    expect(paths, isNotEmpty);
    expect(paths, contains(TransferMatchRoutes.matches));
  });

  test('no location is a contract path', () {
    for (final path in everyTransferMatchingPath()) {
      expect(
        path.startsWith('/financial'),
        isFalse,
        reason: '$path resembles a contract path; this feature takes its own '
            'prefix rather than asking for a second allowlist exemption',
      );
    }
  });

  test('no location carries anything but literals', () {
    // No match identifier, no account, no transaction. A location ends up in a
    // deep link, a restoration bundle and a framework log line.
    for (final path in everyTransferMatchingPath()) {
      expect(path.contains(':'), isFalse, reason: '$path has a parameter');
    }
  });

  testWidgets('the capability opens the surface', (WidgetTester tester) async {
    final matches = ScriptedTransferMatchesRepository(
      matches: <TransferMatch>[matchFixture()],
    );
    await pumpAt(
      tester,
      TransferMatchRoutes.matches,
      overrides: transferMatchingOverrides(matches: matches),
    );

    expect(find.byType(TransferMatchesScreen), findsOneWidget);
    expect(find.byType(FinancialUnavailableScreen), findsNothing);
  });

  testWidgets('without the capability every location renders the refusal',
      (WidgetTester tester) async {
    for (final path in everyTransferMatchingPath()) {
      final matches = ScriptedTransferMatchesRepository();
      final accounts = accountsFixture();
      await pumpAt(
        tester,
        path,
        overrides: <Override>[
          ...financialOverrides(
            accounts: accounts,
            bootstrap: syntheticBootstrap(withTransactions: false),
          ),
          transferMatchesRepositoryProvider.overrideWithValue(matches),
        ],
      );

      expect(find.byType(FinancialUnavailableScreen), findsOneWidget, reason: path);
      expect(find.byType(TransferMatchesScreen), findsNothing, reason: path);
      expect(
        matches.calls,
        isEmpty,
        reason: 'the gate decides before the screen is constructed, so a '
            'refused deep link reads no provider and issues no request ($path)',
      );
      expect(accounts.reads, isEmpty, reason: path);
    }
  });

  test('every provider this feature contributes is registered as tenant-scoped',
      () {
    // Typed entries: `tenantScopedAsync` accepts only a
    // `TenantScopedAsyncNotifier`, so a provider that could not empty itself
    // cannot be registered here at all.
    expect(transferMatchingTenantScopedProviders(), hasLength(3));
  });
}
