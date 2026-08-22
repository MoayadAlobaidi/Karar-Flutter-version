// Settings, in both reading directions and at the largest text scale.
//
// Two things are proven beyond layout: a language choice is a DEVICE
// preference and is not silently written to the account, and the disable
// request is described as recording an intention rather than as a completed
// closure.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/localization/locale_preference.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/features/profile/domain/user_profile.dart';
import 'package:karar_mobile/features/profile/presentation/profile_providers.dart';
import 'package:karar_mobile/features/settings/presentation/settings_providers.dart';
import 'package:karar_mobile/features/settings/presentation/settings_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import '../platform_bootstrap/support/fixtures.dart';
import '../profile/profile_test.dart' show ScriptedProfileRepository;

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(SettingsScreen)));

Future<InMemoryKeyValueStore> pumpSettings(
  WidgetTester tester, {
  Locale locale = const Locale('en'),
  double textScale = 1.0,
  ProfileRepository? profiles,
}) async {
  final store = InMemoryKeyValueStore();
  await pumpFeatureScreen(
    tester,
    const SettingsScreen(),
    locale: locale,
    textScale: textScale,
    overrides: <Override>[
      keyValueStoreProvider.overrideWithValue(store),
      profileRepositoryProvider.overrideWithValue(profiles ?? ScriptedProfileRepository()),
    ],
  );
  return store;
}

void main() {
  testInBothDirections('renders every group and derives its direction from the locale', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpSettings(tester, locale: locale, textScale: scale);
    final l10n = mountedL10n(tester);

    expect(find.text(l10n.settingsAppearanceTitle), findsOneWidget);
    expect(find.text(l10n.settingsYourAccountTitle), findsOneWidget);
    expect(find.text(l10n.settingsDangerTitle), findsOneWidget);
    expect(
      directionUnder(tester, find.byType(SettingsScreen)),
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
    );
  }, textScales: featureTextScales);

  testInBothDirections('a language choice writes a device preference, not an account field', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final profiles = ScriptedProfileRepository();
    final store = await pumpSettings(tester, locale: locale, textScale: scale, profiles: profiles);

    // The second option is Arabic; the first is "follow the device".
    await tester.tap(find.byType(KararCheckboxTile).at(2));
    await tester.pumpAndSettle();

    expect(store.readString(localePreferenceKey), 'ar');
    expect(
      profiles.updates,
      isEmpty,
      reason: 'a device preference is not a statement about the account',
    );
  });

  testInBothDirections('an appearance choice is stored as a device preference', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final store = await pumpSettings(tester, locale: locale, textScale: scale);

    // The three interface locales come first, then the three themes.
    await tester.tap(find.byType(KararCheckboxTile).at(4));
    await tester.pumpAndSettle();

    expect(store.readString(themePreferenceKey), ThemePreference.light.name);
  });

  testInBothDirections('the disable request is described as recording an intention', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpSettings(tester, locale: locale, textScale: scale);
    final l10n = mountedL10n(tester);

    expect(find.text(l10n.settingsDisableTitle), findsOneWidget);
    expect(find.text(l10n.settingsDisableDescription), findsOneWidget);
    expect(find.text(l10n.settingsDisableRecordedTitle), findsNothing);
  }, textScales: featureTextScales);

  testWidgets('the disable request is confirmed before it is sent', (WidgetTester tester) async {
    final profiles = ScriptedProfileRepository();
    await pumpSettings(tester, profiles: profiles);
    final l10n = mountedL10n(tester);

    await tester.tap(find.text(l10n.settingsDisableAction));
    await tester.pumpAndSettle();

    expect(find.text(l10n.settingsDisableConfirmTitle), findsOneWidget);
    expect(profiles.disableRequests, 0);

    // The dialog's cancel control, named by the shared catalogue. This test
    // runs in the default English locale, so the label is stable.
    await tester.tap(find.widgetWithText(KararButton, 'Cancel'));
    await tester.pumpAndSettle();

    expect(profiles.disableRequests, 0, reason: 'the cancel control sends nothing');
    expect(find.text(l10n.settingsDisableConfirmTitle), findsNothing);
  });

  testWidgets('a confirmed disable request records an intention and says so', (
    WidgetTester tester,
  ) async {
    final profiles = ScriptedProfileRepository();
    await pumpSettings(tester, profiles: profiles);
    final l10n = mountedL10n(tester);

    await tester.tap(find.text(l10n.settingsDisableAction));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.settingsDisableAction).last);
    await tester.pumpAndSettle();

    expect(profiles.disableRequests, 1);
    expect(find.text(l10n.settingsDisableRecordedTitle), findsOneWidget);
    expect(find.text(l10n.settingsDisableRecordedMessage), findsOneWidget);
  });

  testWidgets('an unrecorded audit entry is surfaced rather than hidden', (
    WidgetTester tester,
  ) async {
    final profiles = ScriptedProfileRepository(
      disableResult: Success<AccountDisableRequest>(
        AccountDisableRequest(requestedAt: DateTime.utc(2026, 4), auditRecorded: false),
      ),
    );
    await pumpSettings(tester, profiles: profiles);
    final l10n = mountedL10n(tester);

    await tester.tap(find.text(l10n.settingsDisableAction));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.settingsDisableAction).last);
    await tester.pumpAndSettle();

    expect(find.textContaining(l10n.settingsDisableAuditWarning), findsOneWidget);
  });

  testInBothDirections('renders no monetary value', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpSettings(tester, locale: locale, textScale: scale);

    expectNothingMatching(
      tester,
      RegExp(r'[€£¥]|\b(QAR|USD|EUR|SAR|AED)\b'),
      because: 'no financial value belongs in settings',
    );
  }, textScales: featureTextScales);

  test('the interface locales are the ones this build ships', () {
    expect(interfaceLocaleOptions.length, 3);
    expect(interfaceLocaleOptions.first, isNull);
    expect(interfaceLocaleOptions[1]?.value, 'en');
    expect(interfaceLocaleOptions[2]?.value, 'ar');
  });

  test('the fixture set carries no financial value', () {
    expect(userProfile().displayName, isNot(matches(RegExp(r'\d'))));
  });
}
