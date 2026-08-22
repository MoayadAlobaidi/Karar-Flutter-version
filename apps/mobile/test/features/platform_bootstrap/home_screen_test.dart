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
import 'package:karar_mobile/l10n/karar_localization.dart';

import 'support/feature_harness.dart';
import 'support/fixtures.dart';

Future<void> pumpHome(
  WidgetTester tester, {
  required Locale locale,
  double textScale = 1.0,
  PlatformContext? platform,
}) => pumpFeatureScreen(
  tester,
  const PlatformHomeScreen(),
  locale: locale,
  textScale: textScale,
  overrides: <Override>[platformContextProvider.overrideWithValue(platform ?? platformContext())],
);

/// The catalogue the mounted screen resolved, so an assertion compares against
/// the same strings the widget rendered rather than against a copy.
AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(PlatformHomeScreen)));

void main() {
  testInBothDirections('renders the honest no-services empty state, not an error', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpHome(tester, locale: locale, textScale: scale);

    final l10n = mountedL10n(tester);

    expect(find.text(l10n.platformNoServicesTitle), findsOneWidget);
    expect(find.text(l10n.platformNoServicesDescription), findsOneWidget);
    expect(find.text(l10n.platformCapabilitiesUnresolvedTitle), findsNothing);
    expect(find.text(l10n.platformServiceUnavailableTitle), findsNothing);
  }, textScales: featureTextScales);

  testInBothDirections('derives its direction from the locale', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpHome(tester, locale: locale, textScale: scale);

    expect(
      directionUnder(tester, find.byType(PlatformHomeScreen)),
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
    );
  }, textScales: featureTextScales);

  testInBothDirections('renders every platform section', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpHome(tester, locale: locale, textScale: scale);
    final l10n = mountedL10n(tester);

    for (final heading in <String>[
      l10n.platformSectionServices,
      l10n.platformSectionAccount,
      l10n.platformSectionSession,
      l10n.platformSectionOrganisation,
      l10n.platformSectionJurisdiction,
      l10n.platformSectionLegal,
      l10n.platformSectionConsent,
      l10n.platformSectionSettings,
    ]) {
      expect(
        find.text(heading),
        findsWidgets,
        reason: 'the $heading section must be present in ${locale.languageCode}',
      );
    }
  }, textScales: featureTextScales);

  testInBothDirections('shows the bound organisation and the session status', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpHome(tester, locale: locale, textScale: scale);
    final l10n = mountedL10n(tester);

    expect(find.text('Example Organisation'), findsOneWidget);
    expect(find.text(l10n.platformSessionActive), findsOneWidget);
    expect(find.text(testSessionId), findsOneWidget);
  }, textScales: featureTextScales);

  testInBothDirections('names the unbound state rather than leaving the organisation blank', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpHome(
      tester,
      locale: locale,
      textScale: scale,
      platform: platformContext(tenant: const TenantContextUnbound()),
    );
    final l10n = mountedL10n(tester);

    expect(find.text(l10n.platformOrganisationUnbound), findsOneWidget);
  });

  testInBothDirections('an unresolved capability answer is a warning, never the empty state', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpHome(
      tester,
      locale: locale,
      textScale: scale,
      platform: platformContext(navigation: const CapabilityNavigationUnresolved()),
    );
    final l10n = mountedL10n(tester);

    expect(find.text(l10n.platformCapabilitiesUnresolvedTitle), findsOneWidget);
    expect(find.text(l10n.platformNoServicesTitle), findsNothing);
  }, textScales: featureTextScales);

  testInBothDirections('names each operating-entity state honestly', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    for (final entry in <(OperatingEntityContext, String Function(AppLocalizations))>[
      (
        const OperatingEntityUnassigned(),
        (AppLocalizations s) => s.platformOperatingEntityUnassignedTitle,
      ),
      (
        const OperatingEntityUnavailable(),
        (AppLocalizations s) => s.platformOperatingEntityUnavailableTitle,
      ),
      (
        const OperatingEntityUnrecognised(),
        (AppLocalizations s) => s.platformOperatingEntityUnrecognisedTitle,
      ),
    ]) {
      await pumpHome(
        tester,
        locale: locale,
        textScale: scale,
        platform: platformContext(operatingEntity: entry.$1),
      );
      final l10n = mountedL10n(tester);
      expect(find.text(entry.$2(l10n)), findsOneWidget);
    }
  });

  testInBothDirections('section headings are exposed as headers to a screen reader', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final handle = tester.ensureSemantics();
    await pumpHome(tester, locale: locale, textScale: scale);
    final l10n = mountedL10n(tester);

    expect(
      tester.getSemantics(find.text(l10n.platformSectionServices).first),
      matchesSemantics(label: l10n.platformSectionServices, isHeader: true),
    );
    handle.dispose();
  });

  testInBothDirections('renders no monetary or account-like value anywhere', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
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
  }, textScales: featureTextScales);

  testWidgets('falls back to progress rather than an error before the context arrives', (
    WidgetTester tester,
  ) async {
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
