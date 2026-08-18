import 'package:flutter/material.dart';

import '../tokens/brand_configuration.dart';
import '../tokens/karar_colors.dart';
import '../tokens/karar_tokens.dart';

/// Builds the [ThemeData] the application shell installs on `MaterialApp`.
///
/// The theme carries a [KararTokens] extension; widgets read tokens from there
/// rather than from `ColorScheme`, which cannot express the number of roles
/// this product needs. `ColorScheme` is still populated so framework widgets
/// that are not part of this design system inherit sane values.
abstract final class KararTheme {
  static ThemeData light({
    BrandConfiguration brand = BrandConfiguration.karar,
    Locale locale = const Locale('en'),
  }) {
    return _build(brand: brand, brightness: Brightness.light, locale: locale);
  }

  static ThemeData dark({
    BrandConfiguration brand = BrandConfiguration.karar,
    Locale locale = const Locale('en'),
  }) {
    return _build(brand: brand, brightness: Brightness.dark, locale: locale);
  }

  /// Re-resolves [base] against [tokens], preserving any other theme extension
  /// the shell installed.
  static ThemeData applyTokens(ThemeData base, KararTokens tokens) {
    final List<ThemeExtension<dynamic>> extensions =
        base.extensions.values
            .where(
              (ThemeExtension<dynamic> extension) => extension is! KararTokens,
            )
            .toList()
          ..add(tokens);
    return base.copyWith(
      extensions: extensions,
      textTheme: tokens.typography.toTextTheme(
        tokens.colors.contentPrimary,
        tokens.colors.contentSecondary,
      ),
    );
  }

  static ThemeData _build({
    required BrandConfiguration brand,
    required Brightness brightness,
    required Locale locale,
  }) {
    final KararTokens tokens = KararTokens.resolve(
      brand: brand,
      brightness: brightness,
      locale: locale,
    );
    final KararColors colors = tokens.colors;

    final ThemeData base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: _colorScheme(colors, brightness),
      scaffoldBackgroundColor: colors.background,
      canvasColor: colors.surface,
      splashFactory: InkSparkle.splashFactory,
      // Guarantees the framework's own controls honour the 48dp floor even
      // where this design system is not the thing being rendered.
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      dividerTheme: DividerThemeData(
        color: colors.borderSubtle,
        thickness: tokens.sizing.dividerThickness,
        space: tokens.sizing.dividerThickness,
      ),
      iconTheme: IconThemeData(
        color: colors.contentSecondary,
        size: tokens.sizing.iconMedium,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colors.brand,
        linearTrackColor: colors.surfaceSunken,
        circularTrackColor: colors.surfaceSunken,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: colors.surfaceInverse,
        contentTextStyle: tokens.typography.bodyMedium.copyWith(
          color: colors.contentInverse,
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );

    return applyTokens(base, tokens);
  }

  static ColorScheme _colorScheme(KararColors colors, Brightness brightness) {
    return ColorScheme(
      brightness: brightness,
      primary: colors.brand,
      onPrimary: colors.onBrand,
      primaryContainer: colors.brandSurface,
      onPrimaryContainer: colors.onBrandSurface,
      secondary: colors.brand,
      onSecondary: colors.onBrand,
      secondaryContainer: colors.brandSurface,
      onSecondaryContainer: colors.onBrandSurface,
      tertiary: colors.info.content,
      onTertiary: colors.onBrand,
      tertiaryContainer: colors.info.surface,
      onTertiaryContainer: colors.info.content,
      error: colors.danger.content,
      onError: colors.onBrand,
      errorContainer: colors.danger.surface,
      onErrorContainer: colors.danger.content,
      surface: colors.surface,
      onSurface: colors.contentPrimary,
      surfaceContainerHighest: colors.surfaceSunken,
      onSurfaceVariant: colors.contentSecondary,
      outline: colors.borderStrong,
      outlineVariant: colors.borderDefault,
      shadow: colors.shadow,
      scrim: colors.scrim,
      inverseSurface: colors.surfaceInverse,
      onInverseSurface: colors.contentInverse,
      inversePrimary: colors.brandSurface,
    );
  }
}
