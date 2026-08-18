import 'package:flutter/material.dart';

import 'brand_configuration.dart';
import 'karar_colors.dart';
import 'karar_elevation.dart';
import 'karar_motion.dart';
import 'karar_radii.dart';
import 'karar_sizing.dart';
import 'karar_spacing.dart';
import 'karar_typography.dart';

/// Every design token, resolved for one brand, one brightness and one locale,
/// carried on [ThemeData] so any widget can read it without an inherited widget
/// of its own.
///
/// Read it with `context.tokens` rather than `Theme.of(context).extension<..>`.
@immutable
class KararTokens extends ThemeExtension<KararTokens> {
  const KararTokens({
    required this.brandId,
    required this.colors,
    required this.typography,
    required this.spacing,
    required this.radii,
    required this.sizing,
    required this.elevation,
    required this.motion,
  });

  /// Resolves the token set. This is the only place a brand, a brightness and a
  /// locale are turned into concrete values.
  factory KararTokens.resolve({
    BrandConfiguration brand = BrandConfiguration.karar,
    Brightness brightness = Brightness.light,
    Locale locale = const Locale('en'),
  }) {
    final KararColors colors = brightness == Brightness.dark
        ? brand.palette.dark
        : brand.palette.light;
    return KararTokens(
      brandId: brand.id,
      colors: colors,
      typography: KararTypography.forLocale(locale, typeface: brand.typeface),
      spacing: KararSpacing.standard,
      radii: KararRadii.scaled(brand.shapeScale),
      sizing: KararSizing.standard,
      elevation: KararElevation(shadowColor: colors.shadow),
      motion: KararMotion.standard,
    );
  }

  final String brandId;
  final KararColors colors;
  final KararTypography typography;
  final KararSpacing spacing;
  final KararRadii radii;
  final KararSizing sizing;
  final KararElevation elevation;
  final KararMotion motion;

  @override
  KararTokens copyWith({
    String? brandId,
    KararColors? colors,
    KararTypography? typography,
    KararSpacing? spacing,
    KararRadii? radii,
    KararSizing? sizing,
    KararElevation? elevation,
    KararMotion? motion,
  }) {
    return KararTokens(
      brandId: brandId ?? this.brandId,
      colors: colors ?? this.colors,
      typography: typography ?? this.typography,
      spacing: spacing ?? this.spacing,
      radii: radii ?? this.radii,
      sizing: sizing ?? this.sizing,
      elevation: elevation ?? this.elevation,
      motion: motion ?? this.motion,
    );
  }

  @override
  KararTokens lerp(covariant ThemeExtension<KararTokens>? other, double t) {
    if (other is! KararTokens) {
      return this;
    }
    return KararTokens(
      brandId: t < 0.5 ? brandId : other.brandId,
      colors: KararColors.lerp(colors, other.colors, t),
      typography: KararTypography.lerp(typography, other.typography, t),
      spacing: KararSpacing.lerp(spacing, other.spacing, t),
      radii: KararRadii.lerp(radii, other.radii, t),
      sizing: KararSizing.lerp(sizing, other.sizing, t),
      elevation: KararElevation.lerp(elevation, other.elevation, t),
      motion: KararMotion.lerp(motion, other.motion, t),
    );
  }
}
