// Routing decisions.
//
// Two properties are asserted for EVERY startup state:
//   * exactly one destination;
//   * convergence in one hop — redirecting to the destination produces no
//     further redirect, so a loop is impossible.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/app/routing/route_paths.dart';
import 'package:karar_mobile/app/routing/startup_route_resolver.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/security/token_store.dart';

import '../../core/support/fakes.dart';

List<StartupState> allStates() => <StartupState>[
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
      Ready(readySnapshot()),
    ];

void main() {
  const resolver = StartupRouteResolver();

  group('routeFor', () {
    test('maps each state to its declared destination', () {
      expect(resolver.routeFor(const ConfigLoading()), RoutePaths.startup);
      expect(resolver.routeFor(const SessionRestoring()), RoutePaths.startup);
      expect(resolver.routeFor(const BootstrapLoading()), RoutePaths.startup);
      expect(
        resolver.routeFor(const ConfigInvalid(<String>['X'])),
        RoutePaths.configurationError,
      );
      expect(
        resolver.routeFor(
          const LocalSecurityStateUnavailable(
            LocalSecurityStateUnavailableFailure(
              operation: LocalSecurityStateOperation.read,
            ),
          ),
        ),
        RoutePaths.securityUnavailable,
      );
      expect(
        resolver.routeFor(const SecurityRecoveryBlocked(AbandonmentNotDurable())),
        RoutePaths.securityRecovery,
      );
      expect(resolver.routeFor(const AppLocked()), RoutePaths.lock);
      expect(resolver.routeFor(const Unauthenticated()), RoutePaths.signIn);
      expect(
        resolver.routeFor(const SessionExpired(SessionEndReason.expired)),
        RoutePaths.sessionExpired,
      );
      expect(resolver.routeFor(const MfaChallengeRequired()), RoutePaths.mfaChallenge);
      expect(resolver.routeFor(const EmailVerificationRequired()), RoutePaths.verifyEmail);
      expect(
        resolver.routeFor(const TenantSelectionPending(<TenantOption>[])),
        RoutePaths.tenantSelection,
      );
      expect(
        resolver.routeFor(const BootstrapUnavailable(BootstrapUnavailableFailure())),
        RoutePaths.serviceUnavailable,
      );
      expect(resolver.routeFor(Ready(readySnapshot())), RoutePaths.home);
    });

    test('every stage resolves to a route the router declares', () {
      final destinations = <String>{
        for (final state in allStates()) resolver.routeFor(state),
      };
      final declared = <String>{...RoutePaths.gateRoutes, RoutePaths.home};

      expect(destinations.difference(declared), isEmpty);
    });

    test('no gate route is a prefix of another', () {
      for (final route in RoutePaths.gateRoutes) {
        for (final other in RoutePaths.gateRoutes) {
          if (identical(route, other) || route == other) {
            continue;
          }
          expect(
            other.startsWith('$route/'),
            isFalse,
            reason: '$other must not sit beneath $route',
          );
        }
      }
    });
  });

  group('redirect', () {
    test('converges in exactly one hop for every state', () {
      for (final state in allStates()) {
        final target = resolver.routeFor(state);
        // A gate route is the one location every state has an opinion about:
        // a not-ready state pulls away from the wrong gate, and READY pulls
        // away from all of them.
        final origin = target == RoutePaths.signIn ? RoutePaths.lock : RoutePaths.signIn;

        expect(
          resolver.redirect(state, origin),
          target,
          reason: '${state.stage.name} must redirect to its route in one hop',
        );
        expect(
          resolver.redirect(state, target),
          isNull,
          reason: '${state.stage.name} must not redirect away from its own route',
        );
      }
    });

    test('never returns the location it was given', () {
      for (final state in allStates()) {
        for (final location in <String>[
          ...RoutePaths.gateRoutes,
          RoutePaths.home,
          '/accounts',
          '/settings/security',
        ]) {
          final redirect = resolver.redirect(state, location);
          expect(
            redirect,
            isNot(location),
            reason: '${state.stage.name} at $location redirected to itself',
          );
        }
      }
    });

    test('a gate permits its own sub-tree so a flow can have steps', () {
      expect(resolver.redirect(const Unauthenticated(), '/sign-in/register'), isNull);
      expect(
        resolver.redirect(const Unauthenticated(), '/sign-in/forgot-password'),
        isNull,
      );
    });

    test('READY bounces every gate route to the protected root', () {
      final ready = Ready(readySnapshot());

      for (final route in RoutePaths.gateRoutes) {
        expect(
          resolver.redirect(ready, route),
          RoutePaths.home,
          reason: '$route must not remain visible once startup resolved',
        );
      }
    });

    test('READY leaves feature routes alone', () {
      final ready = Ready(readySnapshot());

      expect(resolver.redirect(ready, RoutePaths.home), isNull);
      expect(resolver.redirect(ready, '/settings'), isNull);
      expect(resolver.redirect(ready, '/settings/security'), isNull);
    });

    test('a not-ready state pulls a feature route back to the gate', () {
      for (final state in allStates().where((StartupState state) => !state.isReady)) {
        expect(
          resolver.redirect(state, '/settings/security'),
          resolver.routeFor(state),
          reason: '${state.stage.name} must not leave protected content visible',
        );
      }
    });

    test('protected content is unreachable in every non-ready state', () {
      for (final state in allStates().where((StartupState state) => !state.isReady)) {
        expect(
          resolver.redirect(state, RoutePaths.home),
          isNot(isNull),
          reason: '${state.stage.name} must not permit the protected root',
        );
      }
    });
  });
}
