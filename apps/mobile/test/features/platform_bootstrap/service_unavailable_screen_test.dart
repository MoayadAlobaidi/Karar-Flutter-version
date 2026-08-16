// The 503 surface.
//
// It must read as an outage, offer a safe retry, show the platform's reference
// so a person can quote it, and leak nothing about capabilities. It must also
// NOT resemble the empty state: a person whose services simply have not been
// enabled is in a different situation from a person whose platform is down.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/problem_details.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_strings.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/service_unavailable_screen.dart';

import '../../core/support/fakes.dart';
import 'support/feature_harness.dart';

BootstrapUnavailable unavailable({bool? retryable, String? reference}) =>
    BootstrapUnavailable(
      BootstrapUnavailableFailure(
        code: ApiErrorCode.bootstrapUnavailable,
        correlationId: reference,
        retryable: retryable,
      ),
    );

PlatformStrings mountedStrings(WidgetTester tester) =>
    PlatformStrings.of(tester.element(find.byType(ServiceUnavailableScreen)));

void main() {
  testInBothDirections(
    'renders the outage state with a retry and the platform reference',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpFeatureScreen(
        tester,
        ServiceUnavailableScreen(state: unavailable(retryable: true, reference: 'req-9')),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.serviceUnavailableTitle), findsOneWidget);
      expect(find.text(strings.serviceUnavailableDescription), findsOneWidget);
      expect(find.textContaining('req-9'), findsOneWidget);
      expect(find.text(strings.noServicesTitle), findsNothing);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'derives its direction from the locale',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpFeatureScreen(
        tester,
        ServiceUnavailableScreen(state: unavailable(retryable: true)),
        locale: locale,
        textScale: scale,
      );

      expect(
        directionUnder(tester, find.byType(ServiceUnavailableScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'offers starting over, not a retry, when the platform said a retry cannot help',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpFeatureScreen(
        tester,
        ServiceUnavailableScreen(state: unavailable(retryable: false)),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.actionStartOver), findsOneWidget);
      expect(find.text(strings.serviceUnavailableFinalDescription), findsOneWidget);
    },
  );

  testInBothDirections(
    'offers a retry when the platform did not say whether one would help',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpFeatureScreen(
        tester,
        ServiceUnavailableScreen(state: unavailable()),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.actionStartOver), findsNothing);
      expect(find.text(strings.serviceUnavailableDescription), findsOneWidget);
    },
  );

  testInBothDirections(
    'omits the reference when the platform supplied none',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpFeatureScreen(
        tester,
        ServiceUnavailableScreen(state: unavailable(retryable: true)),
        locale: locale,
        textScale: scale,
      );

      expect(find.textContaining('Reference'), findsNothing);
    },
  );

  testInBothDirections(
    'names no service, entitlement or dependency',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpFeatureScreen(
        tester,
        ServiceUnavailableScreen(
          state: unavailable(retryable: true, reference: 'req-10'),
        ),
        locale: locale,
        textScale: scale,
      );

      for (final leak in <String>[
        'transactions',
        'budgets',
        'goals',
        'insights',
        'zakat',
        'capability',
        'BOOTSTRAP_UNAVAILABLE',
      ]) {
        expectNothingMatching(
          tester,
          RegExp(leak, caseSensitive: false),
          because: 'a failure surface must not disclose what a success would have withheld',
        );
      }
    },
    textScales: featureTextScales,
  );

  testWidgets('the retry action re-reads bootstrap rather than navigating onward',
      (WidgetTester tester) async {
    final tokens = InMemoryTokenStore();
    await tokens.write(liveTokens());
    final sessions = SessionManager(store: tokens, logger: AppLogger.silent);
    addTearDown(sessions.dispose);
    await sessions.restore();

    final gateway = FakeBootstrapGateway(<Result<BootstrapSnapshot>>[
      const Failed<BootstrapSnapshot>(
        BootstrapUnavailableFailure(code: ApiErrorCode.bootstrapUnavailable),
      ),
    ]);
    final coordinator = buildTestCoordinator(sessionManager: sessions, gateway: gateway);
    addTearDown(coordinator.dispose);

    await pumpFeatureScreen(
      tester,
      ServiceUnavailableScreen(state: unavailable(retryable: true)),
      overrides: <Override>[startupCoordinatorProvider.overrideWithValue(coordinator)],
    );

    await tester.tap(find.byType(GestureDetector).last);
    await tester.pumpAndSettle();

    expect(gateway.callCount, greaterThan(0));
    expect(coordinator.state.isReady, isFalse);
    expect(find.byType(ServiceUnavailableScreen), findsOneWidget);
  });

  testWidgets('the gate builder renders progress for a state that is not an outage',
      (WidgetTester tester) async {
    await pumpFeatureScreen(
      tester,
      Builder(
        builder: (BuildContext context) =>
            buildServiceUnavailableScreen(context, const BootstrapLoading()),
      ),
      settle: false,
    );

    expect(find.byType(ServiceUnavailableScreen), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
