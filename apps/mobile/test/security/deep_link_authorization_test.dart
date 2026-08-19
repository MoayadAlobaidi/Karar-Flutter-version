// §3H — AUTHORIZATION IS RE-EVALUATED WHEN A DEEP LINK IS FOLLOWED.
//
// A deep link arrives at a time of somebody else's choosing: while signed out,
// while the application lock is engaged, before bootstrap has resolved, under a
// tenant that lacks the capability, or naming a resource that belongs to
// another organisation. The route TABLE is built once — `featureRoutesProvider`
// is read when the router is constructed and the financial routes are
// contributed unconditionally — so the whole property rests on the decision
// being made per build, inside every builder.
//
// "Inside EVERY builder" is the part a hand-written list of paths cannot check.
// The paths below are DERIVED from `financialFeatureRoutes()`, so a route added
// without a gate is refused here rather than discovered in production.
//
// Everything runs through the application's own router and the real
// `StartupCoordinator`; the capability answer comes from bootstrap through
// `financialBootstrapProvider` rather than being injected.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/app/routing/route_paths.dart';
import 'package:karar_mobile/app/routing/startup_route_resolver.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/account_detail_screen.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_and_wallets_screen.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_feature_registration.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_routes.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_unavailable_screen.dart';
import 'package:karar_mobile/features/transactions/presentation/transaction_detail_screen.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_screen.dart';

import '../features/financial_accounts/support/financial_fixtures.dart';
import 'support/deep_link_launch.dart';
import 'support/refusing_repositories.dart';

/// An identifier a link could name. It belongs to nobody in these fixtures,
/// which is the point of the last group.
const String foreignAccountId = 'account-belonging-to-another-tenant';
const String foreignTransactionId = 'transaction-belonging-to-another-tenant';

/// Every financial path a deep link could name, derived from the route table
/// rather than written down.
///
/// A parameterised segment is filled with an identifier of the right shape. The
/// derivation is what makes this list complete: a route added to
/// `financialFeatureRoutes()` appears here without anyone editing this file.
List<String> everyFinancialPath() {
  final paths = <String>[];
  for (final route in financialFeatureRoutes()) {
    if (route is! GoRoute) {
      continue;
    }
    paths.add(
      route.path
          .replaceAll(':accountId', foreignAccountId)
          .replaceAll(':transactionId', foreignTransactionId),
    );
  }
  return paths;
}

/// Bootstrap answers with and without the financial capability, in the shape
/// the coordinator maps to READY.
Result<BootstrapSnapshot> ready({required bool withTransactions}) =>
    Success<BootstrapSnapshot>(syntheticBootstrap(withTransactions: withTransactions));

/// The same answer, but with the session not yet bound to an organisation.
Result<BootstrapSnapshot> bindingPending() {
  final resolved = syntheticBootstrap();
  return Success<BootstrapSnapshot>(
    BootstrapSnapshot(
      userId: resolved.userId,
      emailVerified: resolved.emailVerified,
      sessionId: resolved.sessionId,
      binding: const TenantSelectionRequired(<TenantOption>[
        TenantOption(tenantId: 'tenant-0001', name: 'One', roleHint: 'MEMBER'),
        TenantOption(tenantId: 'tenant-0002', name: 'Two', roleHint: 'MEMBER'),
      ]),
      jurisdictionState: resolved.jurisdictionState,
      jurisdictionId: resolved.jurisdictionId,
      operatingEntityState: resolved.operatingEntityState,
      operatingEntity: resolved.operatingEntity,
      policyPackVersion: resolved.policyPackVersion,
      policyPackStatus: resolved.policyPackStatus,
      capabilityState: resolved.capabilityState,
      capabilities: resolved.capabilities,
    ),
  );
}

void main() {
  group('the derived route set', () {
    test('covers every financial route the workstream contributes', () {
      final derived = everyFinancialPath();
      final declared = financialFeatureRoutes().whereType<GoRoute>().length;

      expect(derived, hasLength(declared));
      expect(
        derived,
        contains(FinancialRoutes.accounts),
        reason: 'the derivation must produce real paths, or the suite below is '
            'checking an empty list',
      );
      for (final path in derived) {
        expect(
          path,
          isNot(contains(':')),
          reason: '$path still carries an unfilled parameter, so the deep link '
              'that follows it is not a real location',
        );
      }
    });
  });

  group('without the capability', () {
    testWidgets('every financial deep link renders the refusal', (
      WidgetTester tester,
    ) async {
      for (final path in everyFinancialPath()) {
        final launch = DeepLinkLaunch(
          bootstrapAnswers: <Result<BootstrapSnapshot>>[
            ready(withTransactions: false),
          ],
        );
        await launch.persistSession();
        await launch.boot(tester);
        expect(
          launch.coordinator.state,
          isA<Ready>(),
          reason: 'the launch must reach READY, or the refusal below is the '
              'startup gate rather than the capability gate',
        );

        await launch.follow(tester, path);

        expect(
          find.byType(FinancialUnavailableScreen),
          findsOneWidget,
          reason: '$path was not refused',
        );
        expect(find.byType(AccountsAndWalletsScreen), findsNothing);
        expect(find.byType(TransactionsScreen), findsNothing);
        expect(find.byType(AccountDetailScreen), findsNothing);
        expect(find.byType(TransactionDetailScreen), findsNothing);
        expect(
          launch.financialReads,
          isEmpty,
          reason: '$path constructed a financial screen and read from it',
        );
        expect(
          launch.transport.requests,
          isEmpty,
          reason: '$path put a request on the wire',
        );
      }
    });

    testWidgets('the capability is re-read, not fixed when the router is built', (
      WidgetTester tester,
    ) async {
      // The route table is built ONCE and contributed unconditionally. If
      // authorization were decided there, the same router would go on opening
      // the surface after the platform withdrew the capability.
      final launch = DeepLinkLaunch(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          ready(withTransactions: true),
          ready(withTransactions: false),
        ],
      );
      launch.accounts.accounts = wholePortfolio();
      await launch.persistSession();
      await launch.boot(tester);
      await launch.follow(tester, FinancialRoutes.accounts);
      expect(
        find.byType(AccountsAndWalletsScreen),
        findsOneWidget,
        reason: 'the surface must open first, or the withdrawal proves nothing',
      );
      final GoRouter routerBefore = launch.router;

      // The platform withdraws the capability; bootstrap is re-read. The SAME
      // router, holding the SAME route table, is then asked for the same
      // location again.
      await launch.coordinator.retryBootstrap();
      await tester.pumpAndSettle();
      await launch.follow(tester, FinancialRoutes.accounts);

      expect(
        identical(launch.router, routerBefore),
        isTrue,
        reason: 'the router must NOT have been rebuilt — a route table whose '
            'shape depended on the capability would reset navigation, which is '
            'why the decision has to be made per build instead',
      );
      expect(
        find.byType(FinancialUnavailableScreen),
        findsOneWidget,
        reason: 'the same route table opened the surface after the capability '
            'was withdrawn, so authorization was decided once',
      );
      expect(find.byType(AccountsAndWalletsScreen), findsNothing);
    });
  });

  group('with the capability', () {
    testWidgets('a deep link into the portfolio opens it', (
      WidgetTester tester,
    ) async {
      final launch = DeepLinkLaunch(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[ready(withTransactions: true)],
      );
      launch.accounts.accounts = wholePortfolio();
      await launch.persistSession();
      await launch.boot(tester);

      await launch.follow(tester, FinancialRoutes.accounts);

      expect(
        find.byType(AccountsAndWalletsScreen),
        findsOneWidget,
        reason: 'the suite above would pass vacuously if nothing ever opened',
      );
      expect(find.byType(FinancialUnavailableScreen), findsNothing);
      expect(launch.accounts.reads, contains('listOwnAccounts'));
    });
  });

  group('a deep link naming another organisation\'s resource', () {
    /// Everything the screen puts on the display, in order.
    List<String> visibleText(WidgetTester tester) => tester
        .widgetList<Text>(find.byType(Text))
        .map((Text held) => held.data ?? '')
        .where((String held) => held.isNotEmpty)
        .toList();

    /// Follows [path] with the account and transaction reads refused by
    /// [failure], and returns what the screen said.
    Future<List<String>> renderRefusal(
      WidgetTester tester,
      String path,
      Failure failure,
    ) async {
      final launch = DeepLinkLaunch(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[ready(withTransactions: true)],
        financialRepositories: refusingFinancialRepositories(failure),
      );
      await launch.persistSession();
      await launch.boot(tester);
      await launch.follow(tester, path);
      return visibleText(tester);
    }

    testWidgets('reads the same as one that does not exist — account', (
      WidgetTester tester,
    ) async {
      final notMine = await renderRefusal(
        tester,
        '/financial/accounts/$foreignAccountId',
        const NotAuthorizedFailure(code: 'NOT_AUTHORIZED', requirement: 'MEMBERSHIP'),
      );
      final missing = await renderRefusal(
        tester,
        '/financial/accounts/$foreignAccountId',
        const NotFoundFailure(code: 'ACCOUNT_NOT_FOUND'),
      );

      expect(
        notMine,
        isNotEmpty,
        reason: 'the screen must render something, or the comparison is empty',
      );
      expect(
        notMine,
        missing,
        reason: 'the client tells a link-follower whether the identifier exists '
            'and is merely not theirs, which confirms the resource',
      );
      for (final line in notMine) {
        expect(line, isNot(contains(foreignAccountId)));
        expect(line, isNot(contains('NOT_AUTHORIZED')));
        expect(line, isNot(contains('MEMBERSHIP')));
      }
    });

    testWidgets('reads the same as one that does not exist — transaction', (
      WidgetTester tester,
    ) async {
      final notMine = await renderRefusal(
        tester,
        '/financial/transactions/$foreignTransactionId',
        const NotAuthorizedFailure(code: 'NOT_AUTHORIZED', requirement: 'MEMBERSHIP'),
      );
      final missing = await renderRefusal(
        tester,
        '/financial/transactions/$foreignTransactionId',
        const NotFoundFailure(code: 'TRANSACTION_NOT_FOUND'),
      );

      expect(notMine, isNotEmpty);
      expect(
        notMine,
        missing,
        reason: 'the refusal distinguishes a transaction that is not yours from '
            'one that is not there',
      );
      for (final line in notMine) {
        expect(line, isNot(contains(foreignTransactionId)));
        expect(line, isNot(contains('NOT_AUTHORIZED')));
      }
    });
  });

  group('a deep link cannot step around the startup state machine', () {
    const resolver = StartupRouteResolver();

    test('every non-ready state redirects every financial path to its gate', () {
      final states = <StartupState>[
        const ConfigLoading(),
        const ConfigInvalid(<String>['API_BASE_URL_MISSING']),
        const LocalSecurityStateUnavailable(
          LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.read,
          ),
        ),
        const SecurityRecoveryBlocked(AbandonmentNotDurable()),
        const AppLocked(),
        const SessionRestoring(),
        const Unauthenticated(),
        const SessionExpired(SessionEndReason.expired),
        const MfaChallengeRequired(),
        const EmailVerificationRequired(),
        const BootstrapLoading(),
        const BootstrapUnavailable(BootstrapUnavailableFailure()),
        const TenantSelectionPending(<TenantOption>[]),
      ];

      for (final state in states) {
        for (final path in everyFinancialPath()) {
          final target = resolver.redirect(state, path);
          expect(
            target,
            resolver.routeFor(state),
            reason: '$path was permitted in ${state.stage.name}',
          );
          // And the destination is stable, so the deep link cannot bounce back.
          expect(resolver.redirect(state, target!), isNull);
        }
      }
    });

    testWidgets('a locked cold launch does not follow a financial deep link', (
      WidgetTester tester,
    ) async {
      final launch = DeepLinkLaunch(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[ready(withTransactions: true)],
      );
      launch.accounts.accounts = wholePortfolio();
      // Credential on disk, lock engaged, nothing restored — the state a user
      // launching a locked application is actually in.
      await launch.persistSession();
      await launch.enableLock();
      await launch.boot(tester);
      expect(launch.coordinator.state, isA<AppLocked>());

      await launch.follow(tester, FinancialRoutes.accounts);

      expect(launch.location, RoutePaths.lock);
      expect(find.byType(AccountsAndWalletsScreen), findsNothing);
      expect(find.byType(FinancialUnavailableScreen), findsNothing);
      expect(
        launch.financialReads,
        isEmpty,
        reason: 'a locked launch must not read a financial repository',
      );
    });

    testWidgets('a signed-out launch does not follow a financial deep link', (
      WidgetTester tester,
    ) async {
      final launch = DeepLinkLaunch(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[ready(withTransactions: true)],
      );
      launch.accounts.accounts = wholePortfolio();
      // No credential is persisted, so startup resolves to UNAUTHENTICATED.
      await launch.boot(tester);
      expect(launch.coordinator.state, isA<Unauthenticated>());

      await launch.follow(tester, FinancialRoutes.transactions);

      expect(launch.location, RoutePaths.signIn);
      expect(find.byType(TransactionsScreen), findsNothing);
      expect(launch.financialReads, isEmpty);
    });

    testWidgets('a tenant-selection launch does not follow a financial deep link', (
      WidgetTester tester,
    ) async {
      final launch = DeepLinkLaunch(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[bindingPending()],
      );
      launch.accounts.accounts = wholePortfolio();
      await launch.persistSession();
      await launch.boot(tester);
      expect(launch.coordinator.state, isA<TenantSelectionPending>());

      await launch.follow(tester, FinancialRoutes.accounts);

      expect(launch.location, RoutePaths.tenantSelection);
      expect(find.byType(AccountsAndWalletsScreen), findsNothing);
      expect(launch.financialReads, isEmpty);
    });
  });
}
