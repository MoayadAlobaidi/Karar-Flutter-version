// COMPOSITION FOR THE DATA-SOURCE SURFACE.
//
// The one place that knows every data-source location. It exposes its routes
// and its tenant-scoped providers separately so the composition root can MERGE
// them with the other workstreams' contributions rather than replacing them — a
// Riverpod override replaces a value, and two workstreams that each override the
// same provider would leave only the last one standing.
//
// EVERY ROUTE IS GATED. Each builder is wrapped in `FinancialCapabilityGate`,
// which decides BEFORE the screen is constructed. A deep link into this surface
// without the capability therefore renders the refusal and reads no provider at
// all, so no repository is built and no request is issued. This surface reads
// financial connections and account source links, so it is gated on exactly the
// capability the rest of the financial surface is.
//
// THE ORDER OF THE TWO ROUTES IS LOAD-BEARING. `/data-sources` is declared
// before `/data-sources/accounts/:accountId` so the literal location cannot be
// captured by the parameterised one.
//
// Nothing here mounts itself. `app/composition/feature_surface.dart` is where
// these two contributions are merged into the router and the tenant-scoped
// registry.
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../financial_accounts/presentation/financial_capability.dart';
import 'account_sources_screen.dart';
import 'connection_routes.dart';
import 'connections_providers.dart';
import 'connections_screen.dart';

/// The routes this feature contributes.
List<RouteBase> financialConnectionRoutes() => <RouteBase>[
      GoRoute(
        path: ConnectionRoutes.dataSources,
        builder: (BuildContext context, GoRouterState _) => FinancialCapabilityGate(
          builder: (BuildContext context) => const DataSourcesScreen(),
        ),
      ),
      GoRoute(
        path: ConnectionRoutes.accountSources,
        builder: (BuildContext context, GoRouterState state) =>
            FinancialCapabilityGate(
          builder: (BuildContext context) => AccountSourcesScreen(
            accountId:
                state.pathParameters[ConnectionRoutes.accountIdParameter] ?? '',
          ),
        ),
      ),
    ];

/// Providers whose value belongs to one organisation.
///
/// A connection names one organisation's record of how its data arrives, and
/// the filter and the opened set name that organisation's rows. A provider
/// missing from this list would survive a tenant switch and leave one
/// organisation's data-source structure readable under another.
///
/// The per-account source links are NOT listed here. They are read through
/// `accountSourceLinksProvider`, which belongs to the financial workstream and
/// is registered by `financialTenantScopedProviders()`; a second registration
/// would be two entries for one cache, which is not two discards.
List<TenantScopedProvider> financialConnectionTenantScopedProviders() =>
    connectionsProviders();
