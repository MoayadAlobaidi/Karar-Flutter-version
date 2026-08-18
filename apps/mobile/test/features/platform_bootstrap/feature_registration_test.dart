// Composition: what this workstream registers, and how it merges with another
// workstream's registration.
//
// An override REPLACES a provider's value, so two workstreams that each call
// `overrideWithValue` on `featureRoutesProvider` independently would leave only
// the last one standing. The registration helper therefore accepts the other
// side's contributions rather than assuming it is alone.
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/app/routing/app_router.dart';
import 'package:karar_mobile/app/routing/route_paths.dart';
import 'package:karar_mobile/features/consent/presentation/consent_routes.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_feature_registration.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_routes.dart';
import 'package:karar_mobile/features/profile/presentation/profile_routes.dart';
import 'package:karar_mobile/features/settings/presentation/settings_routes.dart';
import 'package:karar_mobile/features/tenant_selection/presentation/tenant_providers.dart';
import 'package:karar_mobile/features/tenant_selection/presentation/tenant_routes.dart';

List<String> pathsOf(List<RouteBase> routes) => <String>[
      for (final route in routes)
        if (route is GoRoute) route.path,
    ];

void main() {
  test('every protected surface is registered exactly once', () {
    final paths = pathsOf(platformFeatureRoutes());

    expect(
      paths.toSet(),
      <String>{
        ProfileRoutes.profile,
        SettingsRoutes.settings,
        TenantRoutes.organisation,
        PlatformRoutes.jurisdiction,
        PlatformRoutes.legal,
        ConsentRoutes.consent,
      },
    );
    expect(paths.length, paths.toSet().length, reason: 'no route is registered twice');
  });

  test('no protected route collides with a startup gate route', () {
    // A protected route that shared a gate route's prefix would be swallowed
    // by the single redirect in `app/routing/app_router.dart`.
    for (final path in pathsOf(platformFeatureRoutes())) {
      expect(RoutePaths.gateRoutes.contains(path), isFalse, reason: path);
      for (final gate in RoutePaths.gateRoutes) {
        expect(path.startsWith('$gate/'), isFalse, reason: '$path under $gate');
      }
    }
  });

  test('no route takes a tenant, entity or jurisdiction as a path parameter', () {
    for (final path in pathsOf(platformFeatureRoutes())) {
      expect(
        path.contains(':'),
        isFalse,
        reason: 'context is read from the platform answer, never from a path segment',
      );
    }
  });

  test('the two startup gates this workstream owns are replaced', () {
    expect(
      platformStartupScreens().keys.toSet(),
      <StartupStage>{
        StartupStage.tenantSelectionRequired,
        StartupStage.bootstrapUnavailable,
      },
    );
  });

  test('every tenant-scoped provider is registered for invalidation', () {
    expect(platformTenantScopedProviders(), isNotEmpty);
  });

  test('the overrides install routes, gates, the home surface and the scoped list', () {
    final container = ProviderContainer(overrides: platformSurfaceOverrides());
    addTearDown(container.dispose);

    expect(pathsOf(container.read(featureRoutesProvider)).length, 6);
    expect(container.read(startupScreenOverridesProvider).length, 2);
    expect(container.read(homeScreenBuilderProvider), isNotNull);
    expect(container.read(tenantScopedProvidersProvider), isNotEmpty);
  });

  test('another workstream\'s contributions are merged, not replaced', () {
    final container = ProviderContainer(
      overrides: platformSurfaceOverrides(
        additionalRoutes: <RouteBase>[
          GoRoute(
            path: '/elsewhere',
            builder: (BuildContext context, GoRouterState _) => const SizedBox.shrink(),
          ),
        ],
        additionalStartupScreens: <StartupStage, StartupScreenBuilder>{
          StartupStage.appLocked: (BuildContext context, StartupState state) =>
              const SizedBox.shrink(),
        },
      ),
    );
    addTearDown(container.dispose);

    expect(pathsOf(container.read(featureRoutesProvider)), contains('/elsewhere'));
    expect(
      container.read(startupScreenOverridesProvider).keys,
      contains(StartupStage.appLocked),
    );
    expect(
      container.read(startupScreenOverridesProvider).keys,
      contains(StartupStage.tenantSelectionRequired),
    );
  });
}
