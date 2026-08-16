// PURE DART ONLY.
//
// Persistence and validation for the user's locale and theme choices.
//
// This file deliberately holds NO translations, NO ARB references and NO
// Flutter localization delegates: message catalogues and the delegate wiring
// are owned elsewhere. What lives here is the part the platform foundation
// needs — a validated preference the shell can read before the first frame,
// without awaiting I/O.
import 'package:meta/meta.dart';

import '../storage/key_value_store.dart';

/// Preference keys. Both values are non-sensitive.
final PreferenceKey localePreferenceKey = PreferenceKey('localization.locale');
final PreferenceKey themePreferenceKey = PreferenceKey('localization.theme');

/// The user's theme choice. `system` follows the platform setting.
enum ThemePreference { system, light, dark }

/// A validated BCP-47-shaped language tag.
///
/// The pattern matches the server's own contract for `locale`
/// (`^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$`), so a value the client stores is a
/// value the server will accept.
@immutable
final class LocaleTag {
  const LocaleTag._(this.value);

  static final RegExp _pattern = RegExp(r'^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$');

  /// Returns null when [value] is not a well-formed tag. A malformed stored
  /// preference is discarded rather than propagated.
  static LocaleTag? tryParse(String? value) {
    if (value == null || !_pattern.hasMatch(value)) {
      return null;
    }
    return LocaleTag._(value);
  }

  final String value;

  /// The primary language subtag.
  String get languageCode => value.split('-').first;

  /// The region subtag when the tag carries one.
  String? get regionCode {
    final parts = value.split('-');
    if (parts.length < 2) {
      return null;
    }
    final candidate = parts[1];
    return candidate.length == 2 || candidate.length == 3 ? candidate.toUpperCase() : null;
  }

  @override
  bool operator ==(Object other) => other is LocaleTag && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => value;
}

/// Reads and writes the presentation preferences.
final class LocalePreferences {
  const LocalePreferences(this._store);

  final KeyValueStore _store;

  /// The stored locale, or null to follow the platform.
  LocaleTag? readLocale() => LocaleTag.tryParse(_store.readString(localePreferenceKey));

  Future<void> writeLocale(LocaleTag? locale) async {
    if (locale == null) {
      await _store.remove(localePreferenceKey);
      return;
    }
    await _store.writeString(localePreferenceKey, locale.value);
  }

  /// The stored theme choice; defaults to following the platform.
  ThemePreference readTheme() {
    final stored = _store.readString(themePreferenceKey);
    return ThemePreference.values
            .where((ThemePreference candidate) => candidate.name == stored)
            .firstOrNull ??
        ThemePreference.system;
  }

  Future<void> writeTheme(ThemePreference theme) =>
      _store.writeString(themePreferenceKey, theme.name);
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
