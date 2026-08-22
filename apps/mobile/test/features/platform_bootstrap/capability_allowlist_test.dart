// REGRESSION: NAVIGATION IS ALLOWLIST-DRIVEN.
//
// The client renders exactly what the platform's client-safe view returns and
// this build registered a destination for. Everything else produces nothing.
//
// The tests below assert on SHAPE rather than on names. That is deliberate: a
// rule expressed as "these particular identifiers must be suppressed" only
// protects the identifiers someone thought to write down, and writing them
// down ships them in the artifact. A rule expressed as "an identifier this
// build did not register renders nothing" holds for every identifier,
// including ones nobody has invented yet.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_capability.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/home_screen.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_providers.dart';

import 'support/feature_harness.dart';
import 'support/fixtures.dart';

/// Product capabilities the phase states are not implemented and must not be
/// presented as available. They are named here only because they are already
/// public product names; the assertions do not depend on the list being
/// complete, because the allowlist is what closes the door.
const List<String> unimplementedProductCapabilities = <String>[
  'transactions',
  'budgets',
  'goals',
  'insights',
  'ai-advisor',
  'zakat',
];

/// Identifiers this build has never heard of, in the shapes a server might
/// send them.
const List<String> unrecognisedCapabilityIds = <String>[
  'capability-alpha',
  'Capability.Beta',
  'NAMESPACED.capability.gamma',
  'a-capability-invented-after-this-build-shipped',
];

/// A hypothetical answer containing everything a server might return.
List<PlatformCapability> hypotheticalCapabilities() => <PlatformCapability>[
      for (final id in unimplementedProductCapabilities)
        PlatformCapability(id: id, status: capabilityStatusAvailable),
      for (final id in unrecognisedCapabilityIds)
        PlatformCapability(id: id, status: capabilityStatusAvailable),
      const PlatformCapability(id: 'capability-restricted', status: 'RESTRICTED'),
    ];

void main() {
  group('the resolver', () {
    const resolver = CapabilityNavigationResolver();

    test('registers nothing, because this build ships no capability screen', () {
      expect(navigableCapabilityIds, isEmpty);
      for (final id in <String>[
        ...unimplementedProductCapabilities,
        ...unrecognisedCapabilityIds,
      ]) {
        expect(resolver.isNavigable(id), isFalse);
      }
    });

    test('builds no destination for an identifier it did not register', () {
      final navigation = resolver.resolve(
        resolutionCompleted: true,
        capabilities: hypotheticalCapabilities(),
      );

      expect(navigation, isA<CapabilityNavigationResolved>());
      expect((navigation as CapabilityNavigationResolved).destinations, isEmpty);
    });

    test('publishes no list, count or summary of what it did not register', () {
      // The resolved value exposes destinations and nothing else, so an
      // unregistered identifier cannot travel upwards inside a diagnostic.
      final navigation = resolver.resolve(
            resolutionCompleted: true,
            capabilities: hypotheticalCapabilities(),
          ) as CapabilityNavigationResolved;

      expect(navigation.hasDestinations, isFalse);
      expect(navigation.toString(), 'CapabilityNavigationResolved(0)');
      for (final capability in hypotheticalCapabilities()) {
        expect(navigation.toString(), isNot(contains(capability.id)));
      }
    });

    test('grants nothing when resolution did not complete', () {
      final navigation = resolver.resolve(
        resolutionCompleted: false,
        capabilities: hypotheticalCapabilities(),
      );

      expect(navigation, isA<CapabilityNavigationUnresolved>());
    });

    test('a registered identifier with no route fails loudly', () {
      // Registering an identifier without shipping a screen is a programming
      // error, and it must not degrade into a row that leads nowhere.
      const misconfigured =
          CapabilityNavigationResolver(navigable: <String>{'capability-alpha'});

      expect(
        () => misconfigured.resolve(
          resolutionCompleted: true,
          capabilities: const <PlatformCapability>[
            PlatformCapability(id: 'capability-alpha', status: capabilityStatusAvailable),
          ],
        ),
        throwsStateError,
      );
    });

    test('a registered identifier that is not available is still not rendered', () {
      const registered =
          CapabilityNavigationResolver(navigable: <String>{'capability-alpha'});

      final navigation = registered.resolve(
        resolutionCompleted: true,
        capabilities: const <PlatformCapability>[
          PlatformCapability(id: 'capability-alpha', status: 'RESTRICTED'),
        ],
      );

      expect((navigation as CapabilityNavigationResolved).destinations, isEmpty);
    });
  });

  group('the home screen', () {
    testInBothDirections(
      'renders none of the identifiers a hypothetical answer contained',
      (WidgetTester tester, Locale locale, double scale) async {
        final resolved = const CapabilityNavigationResolver().resolve(
          resolutionCompleted: true,
          capabilities: hypotheticalCapabilities(),
        );

        await pumpFeatureScreen(
          tester,
          const PlatformHomeScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(
              platformContext(navigation: resolved),
            ),
          ],
        );

        for (final capability in hypotheticalCapabilities()) {
          expectNothingMatching(
            tester,
            RegExp(RegExp.escape(capability.id), caseSensitive: false),
            because: '${capability.id} is not registered by this build and must not '
                'appear, as available, as unavailable, or as forthcoming',
          );
        }
      },
      textScales: featureTextScales,
    );
  });
}
