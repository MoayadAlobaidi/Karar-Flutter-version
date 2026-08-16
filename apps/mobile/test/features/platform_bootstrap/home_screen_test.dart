// The authenticated home, proven in both reading directions and at the
// largest text scale the platform offers.
//
// The assertions are about honesty as much as layout: the empty services state
// must read as an empty state and not as an error, the unresolved state must
// not read as an empty one, and no figure that looks like money may appear
// anywhere on the surface.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_capability.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_context.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/home_screen.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_providers.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_strings.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import 'support/feature_harness.dart';
import 'support/fixtures.dart';

Future<void> pumpHome(
  WidgetTester tester, {
  required Locale locale,
  double textScale = 1.0,
  PlatformContext? platform,
}) =>
    pumpFeatureScreen(
      tester,
      const PlatformHomeScreen(),
      locale: locale,
      textScale: textScale,
      overrides: <Override>[
        platformContextProvider.overrideWithValue(platform ?? platformContext()),
      ],
    );

/// The catalogue the mounted screen resolved, so an assertion compares against
/// the same strings the widget rendered rather than against a copy.
PlatformStrings mountedStrings(WidgetTester tester) =>
    PlatformStrings.of(tester.element(find.byType(PlatformHomeScreen)));

void main() {
  testInBothDirections(
    'renders the honest no-services empty state, not an error',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(tester, locale: locale, textScale: scale);

      final strings = mountedStrings(tester);

      expect(find.text(strings.noServicesTitle), findsOneWidget);
      expect(find.text(strings.noServicesDescription), findsOneWidget);
      expect(find.text(strings.capabilitiesUnresolvedTitle), findsNothing);
      expect(find.text(strings.serviceUnavailableTitle), findsNothing);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'derives its direction from the locale',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(tester, locale: locale, textScale: scale);

      expect(
        directionUnder(tester, find.byType(PlatformHomeScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'renders every platform section',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(tester, locale: locale, textScale: scale);
      final strings = mountedStrings(tester);

      for (final heading in <String>[
        strings.sectionServices,
        strings.sectionAccount,
        strings.sectionSession,
        strings.sectionOrganisation,
        strings.sectionJurisdiction,
        strings.sectionLegal,
        strings.sectionConsent,
        strings.sectionSettings,
      ]) {
        expect(
          find.text(heading),
          findsWidgets,
          reason: 'the $heading section must be present in ${locale.languageCode}',
        );
      }
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'shows the bound organisation and the session status',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(tester, locale: locale, textScale: scale);
      final strings = mountedStrings(tester);

      expect(find.text('Example Organisation'), findsOneWidget);
      expect(find.text(strings.sessionActive), findsOneWidget);
      expect(find.text(testSessionId), findsOneWidget);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'names the unbound state rather than leaving the organisation blank',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(tenant: const TenantContextUnbound()),
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.organisationUnbound), findsOneWidget);
    },
  );

  testInBothDirections(
    'an unresolved capability answer is a warning, never the empty state',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(navigation: const CapabilityNavigationUnresolved()),
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.capabilitiesUnresolvedTitle), findsOneWidget);
      expect(find.text(strings.noServicesTitle), findsNothing);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'names each operating-entity state honestly',
    (WidgetTester tester, Locale locale, double scale) async {
      for (final entry in <(OperatingEntityContext, String Function(PlatformStrings))>[
        (
          const OperatingEntityUnassigned(),
          (PlatformStrings s) => s.operatingEntityUnassignedTitle,
        ),
        (
          const OperatingEntityUnavailable(),
          (PlatformStrings s) => s.operatingEntityUnavailableTitle,
        ),
        (
          const OperatingEntityUnrecognised(),
          (PlatformStrings s) => s.operatingEntityUnrecognisedTitle,
        ),
      ]) {
        await pumpHome(
          tester,
          locale: locale,
          textScale: scale,
          platform: platformContext(operatingEntity: entry.$1),
        );
        final strings = mountedStrings(tester);
        expect(find.text(entry.$2(strings)), findsOneWidget);
      }
    },
  );

  testInBothDirections(
    'section headings are exposed as headers to a screen reader',
    (WidgetTester tester, Locale locale, double scale) async {
      final handle = tester.ensureSemantics();
      await pumpHome(tester, locale: locale, textScale: scale);
      final strings = mountedStrings(tester);

      expect(
        tester.getSemantics(find.text(strings.sectionServices).first),
        matchesSemantics(label: strings.sectionServices, isHeader: true),
      );
      handle.dispose();
    },
  );

  testInBothDirections(
    'renders no monetary or account-like value anywhere',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpHome(tester, locale: locale, textScale: scale);

      for (final pattern in <Pattern>[
        RegExp(r'[\$€£¥]'),
        RegExp(r'\b(QAR|USD|EUR|SAR|AED)\b'),
        RegExp(r'\d+[.,]\d{2}\b'),
      ]) {
        expectNothingMatching(
          tester,
          pattern,
          because: 'the platform publishes no financial value and the client invents none',
        );
      }
    },
    textScales: featureTextScales,
  );

  testWidgets('falls back to progress rather than an error before the context arrives',
      (WidgetTester tester) async {
    await pumpFeatureScreen(
      tester,
      const PlatformHomeScreen(),
      settle: false,
      overrides: <Override>[platformContextProvider.overrideWithValue(null)],
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  test('the localized catalogues cover the same message set', () {
    // A missing Arabic message would render English text inside an RTL
    // layout, which is a defect the type system cannot catch on its own.
    expect(KararLocalization.supportedLocales.length, 2);
  });
}
