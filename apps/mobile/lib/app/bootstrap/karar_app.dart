// The application shell.
//
// Deliberately thin. It attaches the router, the locale and the theme, and
// nothing else — every decision about what to show has already been made by
// the startup coordinator before a frame is built.
//
// Theme and message catalogues are owned by the design-system workstream and
// arrive through provider overrides, so this file never needs editing to
// restyle or re-translate the application.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/locale_preference.dart';
import '../../l10n/generated/app_localizations.dart';
import '../dependency_injection/providers.dart';

/// The root widget.
final class KararApp extends ConsumerWidget {
  const KararApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final preferences = ref.watch(localePreferencesProvider);
    final storedLocale = preferences.readLocale();
    final themePreference = preferences.readTheme();

    return MaterialApp.router(
      // The application title is not user-visible on either mobile platform's
      // task switcher in a way that warrants translating it here; the
      // localized title is set by the platform manifests.
      title: 'Karar',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ref.watch(lightThemeProvider),
      darkTheme: ref.watch(darkThemeProvider),
      themeMode: switch (themePreference) {
        ThemePreference.system => ThemeMode.system,
        ThemePreference.light => ThemeMode.light,
        ThemePreference.dark => ThemeMode.dark,
      },
      locale: storedLocale == null
          ? null
          : Locale(storedLocale.languageCode, storedLocale.regionCode),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
