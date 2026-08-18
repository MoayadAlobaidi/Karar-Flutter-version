import 'package:flutter/widgets.dart';

import 'karar_colors.dart';
import 'karar_typography.dart';

/// The light and dark colour sets a brand supplies.
@immutable
class BrandPalette {
  const BrandPalette({required this.light, required this.dark});

  final KararColors light;
  final KararColors dark;
}

/// Everything a brand is allowed to change.
///
/// A white-label partner supplies a different [BrandConfiguration]. It supplies
/// **values only** — there is no hook here for partner-specific widgets or
/// behaviour, because a partner-specific widget is a design failure
/// (`docs/architecture/white-label.md` §4).
///
/// Only [karar] is implemented in this phase. Partner configurations, flavour
/// wiring, and control-plane delivery of these values are Phase 11.
@immutable
class BrandConfiguration {
  const BrandConfiguration({
    required this.id,
    required this.palette,
    this.typeface = BrandTypeface.platformDefault,
    this.shapeScale = 1.0,
    this.wordmarkAssetPath,
  });

  /// Stable identifier, used by build flavours and diagnostics.
  final String id;

  final BrandPalette palette;
  final BrandTypeface typeface;

  /// Multiplies the corner-radius scale. 0 produces a square product, 1 the
  /// Karar default.
  final double shapeScale;

  /// Path to a wordmark asset, or null to render the product name as text.
  ///
  /// Null in this phase on purpose: no logo or marketing identity is invented
  /// here, and no placeholder art is committed.
  final String? wordmarkAssetPath;

  /// The default first-party brand.
  static const BrandConfiguration karar = BrandConfiguration(
    id: 'karar',
    palette: BrandPalette(light: _lightColors, dark: _darkColors),
  );
}

const KararColors _lightColors = KararColors(
  background: Color(0xFFF7F8F8),
  surface: Color(0xFFFFFFFF),
  surfaceElevated: Color(0xFFFFFFFF),
  surfaceSunken: Color(0xFFEFF1F1),
  surfaceInverse: Color(0xFF101615),
  contentPrimary: Color(0xFF101615),
  contentSecondary: Color(0xFF4A5553),
  contentTertiary: Color(0xFF626D6B),
  contentDisabled: Color(0xFF9AA3A1),
  contentInverse: Color(0xFFFFFFFF),
  brand: Color(0xFF0F3D3E),
  brandPressed: Color(0xFF0A2C2D),
  onBrand: Color(0xFFFFFFFF),
  brandSurface: Color(0xFFE3EDEC),
  onBrandSurface: Color(0xFF0F3D3E),
  borderSubtle: Color(0xFFE7EAEA),
  borderDefault: Color(0xFFC4CBCA),
  borderStrong: Color(0xFF767F7E),
  borderFocus: Color(0xFF0F3D3E),
  neutral: KararStatusPalette(
    content: Color(0xFF4A5553),
    surface: Color(0xFFEFF1F1),
    border: Color(0xFFC4CBCA),
  ),
  info: KararStatusPalette(
    content: Color(0xFF10456E),
    surface: Color(0xFFE4EEF6),
    border: Color(0xFFA7C6DF),
  ),
  success: KararStatusPalette(
    content: Color(0xFF0F5C33),
    surface: Color(0xFFE4F2E9),
    border: Color(0xFFA8D3BB),
  ),
  warning: KararStatusPalette(
    content: Color(0xFF7A4A05),
    surface: Color(0xFFFBF0DC),
    border: Color(0xFFE4C489),
  ),
  danger: KararStatusPalette(
    content: Color(0xFFA11A1A),
    surface: Color(0xFFFBE7E7),
    border: Color(0xFFEDACAC),
  ),
  scrim: Color(0x7A101615),
  shadow: Color(0xFF101615),
  skeletonBase: Color(0xFFE7EAEA),
  skeletonHighlight: Color(0xFFF5F7F7),
  disabledSurface: Color(0xFFEFF1F1),
);

const KararColors _darkColors = KararColors(
  background: Color(0xFF0B1211),
  surface: Color(0xFF131A19),
  surfaceElevated: Color(0xFF1B2322),
  surfaceSunken: Color(0xFF080D0C),
  surfaceInverse: Color(0xFFF2F5F4),
  contentPrimary: Color(0xFFF2F5F4),
  contentSecondary: Color(0xFFB6C0BE),
  contentTertiary: Color(0xFF8B9694),
  contentDisabled: Color(0xFF5E6968),
  contentInverse: Color(0xFF0B1211),
  brand: Color(0xFF55B7AE),
  brandPressed: Color(0xFF3F9C94),
  onBrand: Color(0xFF06100F),
  brandSurface: Color(0xFF14312F),
  onBrandSurface: Color(0xFF9BDDD6),
  borderSubtle: Color(0xFF232C2B),
  borderDefault: Color(0xFF33403E),
  borderStrong: Color(0xFF7C8785),
  borderFocus: Color(0xFF55B7AE),
  neutral: KararStatusPalette(
    content: Color(0xFFB6C0BE),
    surface: Color(0xFF1B2322),
    border: Color(0xFF33403E),
  ),
  info: KararStatusPalette(
    content: Color(0xFF86BEEA),
    surface: Color(0xFF10283C),
    border: Color(0xFF2E5C86),
  ),
  success: KararStatusPalette(
    content: Color(0xFF6ED79A),
    surface: Color(0xFF10301F),
    border: Color(0xFF2E6647),
  ),
  warning: KararStatusPalette(
    content: Color(0xFFEDBB63),
    surface: Color(0xFF33260C),
    border: Color(0xFF6E5620),
  ),
  danger: KararStatusPalette(
    content: Color(0xFFF58F8F),
    surface: Color(0xFF3A1616),
    border: Color(0xFF7A2F2F),
  ),
  scrim: Color(0x99000000),
  shadow: Color(0xFF000000),
  skeletonBase: Color(0xFF1B2322),
  skeletonHighlight: Color(0xFF242D2C),
  disabledSurface: Color(0xFF1B2322),
);
