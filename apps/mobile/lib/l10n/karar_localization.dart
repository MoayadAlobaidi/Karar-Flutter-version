import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart' show Bidi;

import 'generated/app_localizations.dart';

export 'generated/app_localizations.dart'
    show AppLocalizations, lookupAppLocalizations;

/// The localization surface the application shell wires into `MaterialApp`.
///
/// The shell depends on this file and never on the generated output directly,
/// so the generator's layout can change without touching `lib/app`.
abstract final class KararLocalization {
  static const Locale english = Locale('en');
  static const Locale arabic = Locale('ar');

  /// Used when the device asks for a language the product does not ship.
  ///
  /// English rather than "whatever is first": a resolution failure must be
  /// deterministic, and a user who silently lands in Arabic because of list
  /// ordering has been given a defect, not a default.
  static const Locale fallbackLocale = english;

  static List<Locale> get supportedLocales => AppLocalizations.supportedLocales;

  static List<LocalizationsDelegate<dynamic>> get localizationsDelegates =>
      AppLocalizations.localizationsDelegates;

  /// `MaterialApp.localeResolutionCallback`.
  ///
  /// Matches on language subtag only. `ar-QA`, `ar-EG` and bare `ar` all
  /// resolve to the single Arabic bundle; anything unmatched resolves to
  /// [fallbackLocale] instead of being left to the framework's own ordering.
  static Locale resolve(Locale? deviceLocale, Iterable<Locale> supported) {
    if (deviceLocale == null) {
      return fallbackLocale;
    }
    for (final Locale candidate in supported) {
      if (candidate.languageCode == deviceLocale.languageCode) {
        return candidate;
      }
    }
    return fallbackLocale;
  }

  /// Whether the product ships a translation for [locale].
  static bool isSupported(Locale locale) {
    return supportedLocales.any(
      (Locale candidate) => candidate.languageCode == locale.languageCode,
    );
  }

  /// Reading direction for [locale], independent of any widget tree.
  static TextDirection directionOf(Locale locale) {
    return Bidi.isRtlLanguage(locale.languageCode)
        ? TextDirection.rtl
        : TextDirection.ltr;
  }
}
