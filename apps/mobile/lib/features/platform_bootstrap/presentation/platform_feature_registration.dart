// COMPOSITION FOR THE TENANT, POLICY AND CONSENT WORKSTREAM.
//
// This is the one place that knows every surface in the workstream. It exists
// so that registering them needs no edit to `app/dependency_injection`, no
// edit to `app/routing`, and no cross-import between features that otherwise
// have no reason to know about each other.
//
// The route and gate maps are exposed separately from the override list so a
// second workstream can merge its own into the same three providers rather
// than overwriting them: an override REPLACES a provider's value, so two
// workstreams that each call `overrideWithValue` independently would leave
// only the last one standing.
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:go_router/go_router.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/startup_state.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../app/routing/app_router.dart';
import '../../consent/presentation/consent_providers.dart';
import '../../consent/presentation/consent_routes.dart';
import '../../consent/presentation/consent_screen.dart';
import '../../profile/presentation/profile_providers.dart';
import '../../profile/presentation/profile_routes.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../settings/presentation/settings_routes.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../tenant_selection/presentation/organisation_screen.dart';
import '../../tenant_selection/presentation/tenant_routes.dart';
import '../../tenant_selection/presentation/tenant_selection_screen.dart';
import 'home_screen.dart';
import 'jurisdiction_screen.dart';
import 'legal_context_screen.dart';
import 'platform_routes.dart';
import 'service_unavailable_screen.dart';

/// Protected routes this workstream contributes.
List<RouteBase> platformFeatureRoutes() => <RouteBase>[
      GoRoute(
        path: ProfileRoutes.profile,
        builder: (BuildContext context, GoRouterState _) => const ProfileScreen(),
      ),
      GoRoute(
        path: SettingsRoutes.settings,
        builder: (BuildContext context, GoRouterState _) => const SettingsScreen(),
      ),
      GoRoute(
        path: TenantRoutes.organisation,
        builder: (BuildContext context, GoRouterState _) => const OrganisationScreen(),
      ),
      GoRoute(
        path: PlatformRoutes.jurisdiction,
        builder: (BuildContext context, GoRouterState _) => const JurisdictionScreen(),
      ),
      GoRoute(
        path: PlatformRoutes.legal,
        builder: (BuildContext context, GoRouterState _) => const LegalContextScreen(),
      ),
      GoRoute(
        path: ConsentRoutes.consent,
        builder: (BuildContext context, GoRouterState _) => const ConsentScreen(),
      ),
    ];

/// Startup gate screens this workstream replaces.
Map<StartupStage, StartupScreenBuilder> platformStartupScreens() =>
    <StartupStage, StartupScreenBuilder>{
      StartupStage.tenantSelectionRequired: buildTenantSelectionScreen,
      StartupStage.bootstrapUnavailable: buildServiceUnavailableScreen,
    };

/// Providers whose value belongs to one organisation, with the operation that
/// discards each one.
///
/// A tenant switch DISCARDS every entry here — empties it, then re-reads it.
/// A tenant-scoped provider that is not listed survives the switch and will be
/// read under the wrong organisation, which is the specific defect this list
/// prevents. Naming the kind is what makes the discard real: `ref.invalidate`
/// alone reloads an asynchronous provider and leaves its previous value
/// readable, so only a [TenantScopedAsyncNotifier] may be registered as one.
List<TenantScopedProvider> platformTenantScopedProviders() => <TenantScopedProvider>[
      tenantScopedAsync(consentSurfaceControllerProvider),
      tenantScopedNotifier(consentActionControllerProvider),
      tenantScopedAsync(ownProfileProvider),
      tenantScopedNotifier(profileEditControllerProvider),
      tenantScopedNotifier(accountDisableControllerProvider),
    ];

/// The overrides that install this workstream.
///
/// [additionalRoutes] and [additionalStartupScreens] let another workstream's
/// contributions be merged in rather than replaced.
List<Override> platformSurfaceOverrides({
  List<RouteBase> additionalRoutes = const <RouteBase>[],
  Map<StartupStage, StartupScreenBuilder> additionalStartupScreens =
      const <StartupStage, StartupScreenBuilder>{},
  List<TenantScopedProvider> additionalTenantScopedProviders =
      const <TenantScopedProvider>[],
}) =>
    <Override>[
      featureRoutesProvider.overrideWithValue(<RouteBase>[
        ...platformFeatureRoutes(),
        ...additionalRoutes,
      ]),
      startupScreenOverridesProvider.overrideWithValue(
        <StartupStage, StartupScreenBuilder>{
          ...platformStartupScreens(),
          ...additionalStartupScreens,
        },
      ),
      homeScreenBuilderProvider.overrideWithValue(buildPlatformHomeScreen),
      tenantScopedDataProvider.overrideWithValue(<TenantScopedProvider>[
        ...platformTenantScopedProviders(),
        ...additionalTenantScopedProviders,
      ]),
    ];

/// The home-screen builder. The startup state is not read here: the router
/// only reaches this route in READY, and the screen derives its context from
/// the coordinator through a provider.
Widget buildPlatformHomeScreen(BuildContext context, StartupState state) =>
    const PlatformHomeScreen();
