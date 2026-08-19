// COMPOSITION FOR THE FINANCIAL WORKSTREAM.
//
// The one place that knows every financial surface. It exposes its routes, its
// home builder and its tenant-scoped providers separately so the composition
// root can merge them with the other workstreams' contributions rather than
// replacing them — a Riverpod override REPLACES a value, and two workstreams
// that each override the same provider would leave only the last one standing.
//
// EVERY ROUTE IS GATED. Each builder is wrapped in [FinancialCapabilityGate],
// which decides before the screen is constructed. A deep link into any of
// these paths without the capability therefore renders the refusal and reads
// no financial provider at all, so no repository is built and no request is
// issued.
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;
import 'package:go_router/go_router.dart';

import '../../payment_instruments/presentation/instruments_providers.dart';
import '../../transaction_categories/presentation/categories_providers.dart';
import '../../transaction_categories/presentation/category_picker_screen.dart';
import '../../transactions/presentation/manual_transaction_screen.dart';
import '../../transactions/presentation/transaction_correction_screen.dart';
import '../../transactions/presentation/transaction_detail_screen.dart';
import '../../transactions/presentation/transactions_providers.dart';
import '../../transactions/presentation/transactions_screen.dart';
import 'account_detail_screen.dart';
import 'accounts_and_wallets_screen.dart';
import 'accounts_providers.dart';
import 'financial_capability.dart';
import 'financial_routes.dart';
import 'manual_account_screen.dart';

/// The routes this workstream contributes.
///
/// Literal paths come before the parameterised ones they would otherwise be
/// captured by, so `/financial/accounts/new` opens the create form rather than
/// an account whose id is the word "new".
List<RouteBase> financialFeatureRoutes() => <RouteBase>[
      GoRoute(
        path: FinancialRoutes.accounts,
        builder: (BuildContext context, GoRouterState _) => FinancialCapabilityGate(
          builder: (BuildContext context) => const AccountsAndWalletsScreen(),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.accountCreate,
        builder: (BuildContext context, GoRouterState _) => FinancialCapabilityGate(
          builder: (BuildContext context) => const ManualAccountScreen(),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.accountEdit,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => ManualAccountScreen(
            accountId: state.pathParameters['accountId'],
          ),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.accountDetail,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => AccountDetailScreen(
            accountId: state.pathParameters['accountId'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.transactions,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => TransactionsScreen(
            initialAccountId:
                state.uri.queryParameters[FinancialRoutes.accountIdQueryParameter],
          ),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.transactionCreate,
        builder: (BuildContext context, GoRouterState _) => FinancialCapabilityGate(
          builder: (BuildContext context) => const ManualTransactionScreen(),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.transactionCorrect,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => TransactionCorrectionScreen(
            transactionId: state.pathParameters['transactionId'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.transactionCategory,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => CategoryPickerScreen(
            transactionId: state.pathParameters['transactionId'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: FinancialRoutes.transactionDetail,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => TransactionDetailScreen(
            transactionId: state.pathParameters['transactionId'] ?? '',
          ),
        ),
      ),
    ];

/// Providers whose value belongs to one organisation.
///
/// An account, a balance, a transaction and a category assignment are all read
/// under the session's tenant binding and are invalid the moment it changes. A
/// financial provider missing from this list would survive a tenant switch and
/// show one organisation's money under another.
List<ProviderOrFamily> financialTenantScopedProviders() => <ProviderOrFamily>[
      ownAccountsProvider,
      portfolioArrangementProvider,
      accountFormControllerProvider,
      accountDetailProvider,
      accountBalancesProvider,
      accountSourceLinksProvider,
      selectableIssuersProvider,
      accountInstrumentsProvider,
      transactionListingProvider,
      transactionFilterProvider,
      transactionDetailProvider,
      transactionProvenanceProvider,
      accountRecentTransactionsProvider,
      transactionWriteControllerProvider,
      // The category catalogue is non-personal reference data, but it is read
      // through the tenant-bound financial surface and its search state is a
      // person's own; discarding both on a switch costs one request.
      categoryCatalogueProvider,
      categorySearchProvider,
    ];
