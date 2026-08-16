import 'package:flutter/material.dart';

import '../tokens/brand_configuration.dart';
import '../tokens/karar_tokens.dart';
import 'karar_theme.dart';

/// Re-resolves design tokens against the locale that is actually active.
///
/// Typography is script-dependent — Arabic carries different tracking and
/// leading than Latin — but `MaterialApp.theme` is built before a locale is
/// known. Installing this in `MaterialApp.builder` closes that gap:
///
/// ```dart
/// MaterialApp(
///   theme: KararTheme.light(),
///   darkTheme: KararTheme.dark(),
///   localizationsDelegates: KararLocalization.localizationsDelegates,
///   supportedLocales: KararLocalization.supportedLocales,
///   localeResolutionCallback: KararLocalization.resolve,
///   builder: (BuildContext context, Widget? child) =>
///       KararThemeScope(child: child),
/// )
/// ```
class KararThemeScope extends StatelessWidget {
  const KararThemeScope({
    required this.child,
    this.brand = BrandConfiguration.karar,
    super.key,
  });

  final Widget? child;
  final BrandConfiguration brand;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Locale locale =
        Localizations.maybeLocaleOf(context) ?? const Locale('en');
    final KararTokens tokens = KararTokens.resolve(
      brand: brand,
      brightness: theme.brightness,
      locale: locale,
    );
    return Theme(
      data: KararTheme.applyTokens(theme, tokens),
      child: child ?? const SizedBox.shrink(),
    );
  }
}
