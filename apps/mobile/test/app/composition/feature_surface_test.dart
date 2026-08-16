// The merge in `app/composition/feature_surface.dart` is the one place where
// losing a contribution is silent: a Riverpod override REPLACES a value, so if
// both workstreams applied their own, the second would discard the first and
// the app would simply be missing screens with nothing failing.
//
// These tests assert the merged surface still contains both contributions, and
// that the two stage sets are disjoint — so a future collision is a failure
// here rather than one workstream quietly overriding the other.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/composition/feature_surface.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/features/authentication/presentation/routes/identity_module.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_feature_registration.dart';

Set<String> _pathsOf(List<RouteBase> routes) => <String>{
      for (final route in routes)
        if (route is GoRoute) route.path,
    };

void main() {
  group('the merged feature surface keeps every contribution', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer(overrides: featureSurfaceOverrides());
    });

    tearDown(() => container.dispose());

    test('every identity route survives the merge', () {
      final merged = _pathsOf(container.read(featureRoutesProvider));
      for (final path in _pathsOf(identityRoutes())) {
        expect(
          merged,
          contains(path),
          reason: 'identity route $path was dropped by the merge',
        );
      }
    });

    test('every platform route survives the merge', () {
      final merged = _pathsOf(container.read(featureRoutesProvider));
      for (final path in _pathsOf(platformFeatureRoutes())) {
        expect(
          merged,
          contains(path),
          reason: 'platform route $path was dropped by the merge',
        );
      }
    });

    test('every startup gate from both workstreams survives the merge', () {
      final merged = container.read(startupScreenOverridesProvider);
      for (final stage in <StartupStage>{
        ...identityStartupScreens().keys,
        ...platformStartupScreens().keys,
      }) {
        expect(
          merged.keys,
          contains(stage),
          reason: 'startup gate $stage was dropped by the merge',
        );
      }
    });

    test('the two workstreams claim disjoint startup stages', () {
      // A collision is not necessarily wrong, but it must be a decision rather
      // than an accident: whichever set is merged second would win silently.
      final identity = identityStartupScreens().keys.toSet();
      final platform = platformStartupScreens().keys.toSet();
      expect(
        identity.intersection(platform),
        isEmpty,
        reason: 'both workstreams claim the same startup stage; decide the '
            'precedence explicitly in feature_surface.dart rather than '
            'depending on merge order',
      );
    });

    test('no route path is contributed twice', () {
      final all = <String>[
        ..._pathsOf(identityRoutes()),
        ..._pathsOf(platformFeatureRoutes()),
      ];
      expect(all.toSet().length, all.length, reason: 'duplicate route path');
    });
  });
}
