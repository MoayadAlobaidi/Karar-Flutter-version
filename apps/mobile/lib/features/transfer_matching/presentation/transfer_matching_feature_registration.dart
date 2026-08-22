// COMPOSITION FOR THE TRANSFER-MATCHING SURFACE.
//
// The one place that knows every transfer-matching location. It exposes its
// routes and its tenant-scoped providers separately so the composition root can
// MERGE them with the other workstreams' contributions rather than replacing
// them — a Riverpod override replaces a value, and two workstreams that each
// override the same provider would leave only the last one standing.
//
// EVERY ROUTE IS GATED. The builder is wrapped in `FinancialCapabilityGate`,
// which decides BEFORE the screen is constructed. A deep link into this surface
// without the capability therefore renders the refusal and reads no provider at
// all, so no repository is built and no request is issued. A transfer match is
// a relationship between two canonical transactions, so it is gated on exactly
// the capability the rest of the financial surface is.
//
// Nothing here mounts itself. `app/composition/feature_surface.dart` is where
// these two contributions are merged into the router and the tenant-scoped
// registry.
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../financial_accounts/presentation/financial_capability.dart';
import 'transfer_match_routes.dart';
import 'transfer_matches_screen.dart';
import 'transfer_matching_providers.dart';

/// The routes this feature contributes.
List<RouteBase> transferMatchingRoutes() => <RouteBase>[
      GoRoute(
        path: TransferMatchRoutes.matches,
        builder: (BuildContext context, GoRouterState _) => FinancialCapabilityGate(
          builder: (BuildContext context) => const TransferMatchesScreen(),
        ),
      ),
    ];

/// Providers whose value belongs to one organisation.
///
/// A match names two of one organisation's transactions on two of its accounts,
/// and the filter and the opened set name that organisation's matches. A
/// provider missing from this list would survive a tenant switch and leave one
/// organisation's financial structure readable under another.
List<TenantScopedProvider> transferMatchingTenantScopedProviders() =>
    transferMatchingProviders();
