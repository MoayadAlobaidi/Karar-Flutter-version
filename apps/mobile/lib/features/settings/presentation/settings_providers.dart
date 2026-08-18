// Providers for the settings surface.
//
// Language and appearance are DEVICE preferences, held in the non-sensitive
// preference store. Writing one invalidates `localePreferencesProvider`, which
// is what the shell reads, so the choice takes effect without this feature
// reaching into `lib/app`.
//
// The account language recorded on the platform is a separate value and is
// shown on the profile surface. This screen does not silently write one from
// the other: a device preference is not a statement about the account.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/localization/locale_preference.dart';

/// The stored interface language, or null to follow the device.
final Provider<LocaleTag?> selectedLocaleProvider = Provider<LocaleTag?>(
  (Ref ref) => ref.watch(localePreferencesProvider).readLocale(),
);

/// The stored appearance choice.
final Provider<ThemePreference> selectedThemeProvider = Provider<ThemePreference>(
  (Ref ref) => ref.watch(localePreferencesProvider).readTheme(),
);

/// Writes the presentation preferences and re-reads the shell's view of them.
final class PresentationPreferencesController {
  const PresentationPreferencesController(this._ref);

  final Ref _ref;

  Future<void> setLocale(LocaleTag? locale) async {
    await _ref.read(localePreferencesProvider).writeLocale(locale);
    _invalidate();
  }

  Future<void> setTheme(ThemePreference theme) async {
    await _ref.read(localePreferencesProvider).writeTheme(theme);
    _invalidate();
  }

  /// The shell reads the preference object itself, so invalidating it is what
  /// makes the application rebuild with the new choice.
  void _invalidate() {
    _ref.invalidate(localePreferencesProvider);
    _ref.invalidate(selectedLocaleProvider);
    _ref.invalidate(selectedThemeProvider);
  }
}

final Provider<PresentationPreferencesController> presentationPreferencesProvider =
    Provider<PresentationPreferencesController>(
  PresentationPreferencesController.new,
);

/// The language tags this build ships an interface for.
///
/// Null is "follow the device". These are the application's own locales, not a
/// platform-published list, and the account's recorded language is a separate
/// value that only the profile surface writes.
final List<LocaleTag?> interfaceLocaleOptions = <LocaleTag?>[
  null,
  LocaleTag.tryParse('en'),
  LocaleTag.tryParse('ar'),
];
