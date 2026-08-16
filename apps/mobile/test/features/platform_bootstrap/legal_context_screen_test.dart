// The operating-entity and legal-context surface.
//
// The assertions are as much about what must NOT be on screen as about what
// must: no controller or processor role, no licence, no regulatory approval,
// no lawful basis, and no wording the client composed for any of them.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_context.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/legal_context_screen.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_providers.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_strings.dart';

import 'support/feature_harness.dart';
import 'support/fixtures.dart';

Future<void> pumpLegal(
  WidgetTester tester, {
  required Locale locale,
  double textScale = 1.0,
  PlatformContext? platform,
}) =>
    pumpFeatureScreen(
      tester,
      const LegalContextScreen(),
      locale: locale,
      textScale: textScale,
      overrides: <Override>[
        platformContextProvider.overrideWithValue(platform ?? platformContext()),
      ],
    );

PlatformStrings mountedStrings(WidgetTester tester) =>
    PlatformStrings.of(tester.element(find.byType(LegalContextScreen)));

void main() {
  testInBothDirections(
    'renders the reviewed safe summary of an assigned entity',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(tester, locale: locale, textScale: scale);
      final strings = mountedStrings(tester);

      expect(find.text(strings.operatingEntityNameLabel), findsOneWidget);
      expect(find.text('Example Operating Entity'), findsOneWidget);
      expect(find.text('jurisdiction-a'), findsWidgets);
      expect(find.text('privacy@example.invalid'), findsOneWidget);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'derives its direction from the locale',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(tester, locale: locale, textScale: scale);

      expect(
        directionUnder(tester, find.byType(LegalContextScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'infers no role, obligation, licence, approval or processing basis',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(tester, locale: locale, textScale: scale);

      for (final claim in <String>[
        'controller',
        'processor',
        'licen',
        'regulat',
        'authoris',
        'authoriz',
        'supervis',
        'lawful basis',
        'legal basis',
        'compliant',
        'مرخّص',
        'منظَّم',
        'المتحكم',
        'المعالِج',
      ]) {
        expectNothingMatching(
          tester,
          RegExp(claim, caseSensitive: false),
          because: 'the client renders the safe summary and infers nothing from it',
        );
      }
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'renders each absent entity state as itself',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(operatingEntity: const OperatingEntityUnassigned()),
      );
      var strings = mountedStrings(tester);
      expect(find.text(strings.operatingEntityUnassignedTitle), findsOneWidget);

      await pumpLegal(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(operatingEntity: const OperatingEntityUnavailable()),
      );
      strings = mountedStrings(tester);
      expect(find.text(strings.operatingEntityUnavailableTitle), findsOneWidget);

      await pumpLegal(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(operatingEntity: const OperatingEntityUnrecognised()),
      );
      strings = mountedStrings(tester);
      expect(find.text(strings.operatingEntityUnrecognisedTitle), findsOneWidget);
    },
  );

  testInBothDirections(
    'renders the governing policy version and status as data',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(tester, locale: locale, textScale: scale);
      final strings = mountedStrings(tester);

      expect(find.text(strings.policyPackHeading), findsOneWidget);
      expect(find.text('1.0.0'), findsOneWidget);
      expect(find.text('ACTIVE'), findsOneWidget);
    },
  );

  testInBothDirections(
    'says nothing rather than something when no policy is in effect',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(policyPack: const PolicyPackStatus()),
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.policyPackAbsent), findsOneWidget);
    },
  );

  testInBothDirections(
    'renders no monetary value',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpLegal(tester, locale: locale, textScale: scale);

      expectNothingMatching(
        tester,
        RegExp(r'[\$€£¥]|\b(QAR|USD|EUR|SAR|AED)\b'),
        because: 'no financial value belongs on the legal surface',
      );
    },
  );

  testWidgets('shows progress rather than an error before the context arrives',
      (WidgetTester tester) async {
    await pumpFeatureScreen(
      tester,
      const LegalContextScreen(),
      settle: false,
      overrides: <Override>[platformContextProvider.overrideWithValue(null)],
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
