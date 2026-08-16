import 'package:flutter/widgets.dart';

/// Severity of a piece of status, independent of how it is drawn.
///
/// Every component that accepts a tone also requires an icon and a text label:
/// tone selects colour, it never carries the meaning on its own.
enum KararStatusTone { neutral, info, success, warning, danger }

/// The three colours a single status tone needs: foreground content, its
/// container fill, and the container outline.
@immutable
class KararStatusPalette {
  const KararStatusPalette({
    required this.content,
    required this.surface,
    required this.border,
  });

  final Color content;
  final Color surface;
  final Color border;

  static KararStatusPalette lerp(
    KararStatusPalette a,
    KararStatusPalette b,
    double t,
  ) {
    return KararStatusPalette(
      content: Color.lerp(a.content, b.content, t)!,
      surface: Color.lerp(a.surface, b.surface, t)!,
      border: Color.lerp(a.border, b.border, t)!,
    );
  }
}

/// Colour by role. No widget in this application names a hex value; it names a
/// role, and a [BrandConfiguration] supplies the value behind that role.
///
/// Every content-on-surface pair defined here is asserted against WCAG 2.1
/// contrast minima by `test/shared/design_system/color_contrast_test.dart`.
/// [contentDisabled] is deliberately exempt: WCAG 1.4.3 excludes inactive
/// controls, and raising it would make disabled read as enabled.
@immutable
class KararColors {
  const KararColors({
    required this.background,
    required this.surface,
    required this.surfaceElevated,
    required this.surfaceSunken,
    required this.surfaceInverse,
    required this.contentPrimary,
    required this.contentSecondary,
    required this.contentTertiary,
    required this.contentDisabled,
    required this.contentInverse,
    required this.brand,
    required this.brandPressed,
    required this.onBrand,
    required this.brandSurface,
    required this.onBrandSurface,
    required this.borderSubtle,
    required this.borderDefault,
    required this.borderStrong,
    required this.borderFocus,
    required this.neutral,
    required this.info,
    required this.success,
    required this.warning,
    required this.danger,
    required this.scrim,
    required this.shadow,
    required this.skeletonBase,
    required this.skeletonHighlight,
    required this.disabledSurface,
  });

  final Color background;
  final Color surface;
  final Color surfaceElevated;
  final Color surfaceSunken;
  final Color surfaceInverse;

  final Color contentPrimary;
  final Color contentSecondary;
  final Color contentTertiary;
  final Color contentDisabled;
  final Color contentInverse;

  final Color brand;
  final Color brandPressed;
  final Color onBrand;
  final Color brandSurface;
  final Color onBrandSurface;

  final Color borderSubtle;
  final Color borderDefault;
  final Color borderStrong;
  final Color borderFocus;

  final KararStatusPalette neutral;
  final KararStatusPalette info;
  final KararStatusPalette success;
  final KararStatusPalette warning;
  final KararStatusPalette danger;

  final Color scrim;
  final Color shadow;
  final Color skeletonBase;
  final Color skeletonHighlight;
  final Color disabledSurface;

  KararStatusPalette paletteFor(KararStatusTone tone) {
    switch (tone) {
      case KararStatusTone.neutral:
        return neutral;
      case KararStatusTone.info:
        return info;
      case KararStatusTone.success:
        return success;
      case KararStatusTone.warning:
        return warning;
      case KararStatusTone.danger:
        return danger;
    }
  }

  static KararColors lerp(KararColors a, KararColors b, double t) {
    return KararColors(
      background: Color.lerp(a.background, b.background, t)!,
      surface: Color.lerp(a.surface, b.surface, t)!,
      surfaceElevated: Color.lerp(a.surfaceElevated, b.surfaceElevated, t)!,
      surfaceSunken: Color.lerp(a.surfaceSunken, b.surfaceSunken, t)!,
      surfaceInverse: Color.lerp(a.surfaceInverse, b.surfaceInverse, t)!,
      contentPrimary: Color.lerp(a.contentPrimary, b.contentPrimary, t)!,
      contentSecondary: Color.lerp(a.contentSecondary, b.contentSecondary, t)!,
      contentTertiary: Color.lerp(a.contentTertiary, b.contentTertiary, t)!,
      contentDisabled: Color.lerp(a.contentDisabled, b.contentDisabled, t)!,
      contentInverse: Color.lerp(a.contentInverse, b.contentInverse, t)!,
      brand: Color.lerp(a.brand, b.brand, t)!,
      brandPressed: Color.lerp(a.brandPressed, b.brandPressed, t)!,
      onBrand: Color.lerp(a.onBrand, b.onBrand, t)!,
      brandSurface: Color.lerp(a.brandSurface, b.brandSurface, t)!,
      onBrandSurface: Color.lerp(a.onBrandSurface, b.onBrandSurface, t)!,
      borderSubtle: Color.lerp(a.borderSubtle, b.borderSubtle, t)!,
      borderDefault: Color.lerp(a.borderDefault, b.borderDefault, t)!,
      borderStrong: Color.lerp(a.borderStrong, b.borderStrong, t)!,
      borderFocus: Color.lerp(a.borderFocus, b.borderFocus, t)!,
      neutral: KararStatusPalette.lerp(a.neutral, b.neutral, t),
      info: KararStatusPalette.lerp(a.info, b.info, t),
      success: KararStatusPalette.lerp(a.success, b.success, t),
      warning: KararStatusPalette.lerp(a.warning, b.warning, t),
      danger: KararStatusPalette.lerp(a.danger, b.danger, t),
      scrim: Color.lerp(a.scrim, b.scrim, t)!,
      shadow: Color.lerp(a.shadow, b.shadow, t)!,
      skeletonBase: Color.lerp(a.skeletonBase, b.skeletonBase, t)!,
      skeletonHighlight: Color.lerp(
        a.skeletonHighlight,
        b.skeletonHighlight,
        t,
      )!,
      disabledSurface: Color.lerp(a.disabledSurface, b.disabledSurface, t)!,
    );
  }
}
