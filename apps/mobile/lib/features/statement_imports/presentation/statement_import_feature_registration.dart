// COMPOSITION FOR THE STATEMENT-IMPORT SURFACE.
//
// The one place that knows every statement-import location. It exposes its
// routes and its tenant-scoped providers separately so the composition root can
// MERGE them with the other workstreams' contributions rather than replacing
// them — a Riverpod override replaces a value, and two workstreams that each
// override the same provider would leave only the last one standing.
//
// EVERY ROUTE IS GATED. Each builder is wrapped in `FinancialCapabilityGate`,
// which decides BEFORE the screen is constructed. A deep link into an import
// without the capability therefore renders the refusal and reads no provider at
// all, so no repository is built and no request is issued. A statement import
// writes canonical transactions, so it is gated on exactly the capability the
// rest of the financial surface is.
import 'package:flutter/widgets.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import 'package:go_router/go_router.dart';

import '../../financial_accounts/presentation/financial_capability.dart';
import 'statement_import_review_screen.dart';
import 'statement_import_routes.dart';
import 'statement_import_screen.dart';
import 'statement_imports_providers.dart';

/// The routes this feature contributes.
///
/// The composition root merges these into `featureRoutesProvider`; nothing here
/// mounts itself.
List<RouteBase> statementImportRoutes() => <RouteBase>[
      GoRoute(
        path: StatementImportRoutes.start,
        builder: (BuildContext context, GoRouterState _) => FinancialCapabilityGate(
          builder: (BuildContext context) => const StatementImportScreen(),
        ),
      ),
      GoRoute(
        path: StatementImportRoutes.review,
        builder: (BuildContext context, GoRouterState state) => FinancialCapabilityGate(
          builder: (BuildContext context) => StatementImportReviewScreen(
            importId:
                state.pathParameters[StatementImportRoutes.importIdParameter] ?? '',
          ),
        ),
      ),
    ];

/// Providers whose value belongs to one organisation.
///
/// An import targets an account, and an account belongs to one organisation.
/// The composition root registers these so a tenant switch discards them; a
/// provider missing from this list would leave one organisation's staged
/// statement visible under another.
List<TenantScopedProvider> statementImportFeatureTenantScopedProviders() =>
    statementImportTenantScopedProviders();
