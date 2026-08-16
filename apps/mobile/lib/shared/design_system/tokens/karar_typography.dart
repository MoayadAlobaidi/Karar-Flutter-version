import 'package:flutter/material.dart' show TextTheme;
import 'package:flutter/widgets.dart';

/// The writing system a text style is being resolved for.
///
/// This is a typographic distinction, not a locale one: Arabic needs different
/// tracking and leading than Latin regardless of which locale asked for it.
enum KararScript { latin, arabic }

/// Typeface configuration a brand supplies.
///
/// A null [family] means "platform default", which is the shipped Karar
/// setting. The platform default is the only typeface this repository can use
/// without shipping a font binary whose licence it can prove, and it is a
/// correct choice rather than a fallback: iOS resolves Arabic through SF Arabic
/// and Android through the bundled Noto Naskh Arabic, so Arabic, Latin, Western
/// and Arabic-Indic digits, and currency symbols all render with real glyphs.
///
/// See `docs/` handover notes in the workstream report for the licensing basis.
@immutable
class BrandTypeface {
  const BrandTypeface({
    this.family,
    this.latinFallback = const <String>[],
    this.arabicFallback = const <String>[
      // Named so that, if a device carries them, Arabic resolves to a Naskh
      // face rather than a Kufi display face. Absent names are skipped.
      'SF Arabic',
      'Noto Naskh Arabic',
      'Geeza Pro',
    ],
  });

  final String? family;
  final List<String> latinFallback;
  final List<String> arabicFallback;

  List<String> fallbackFor(KararScript script) {
    switch (script) {
      case KararScript.latin:
        return latinFallback;
      case KararScript.arabic:
        return arabicFallback;
    }
  }

  static const BrandTypeface platformDefault = BrandTypeface();
}

/// The type scale, resolved for one script.
///
/// Two rules are encoded here rather than left to each screen:
///
///  * Arabic never carries letter spacing. Tracking a cursive script forces
///    gaps between glyphs that should be joined, which reads as broken text.
///  * Arabic carries extra leading, because its ascenders and the tashkeel and
///    tanween marks above them need vertical room that a Latin line height
///    does not reserve.
@immutable
class KararTypography {
  const KararTypography({
    required this.script,
    required this.displayLarge,
    required this.headingLarge,
    required this.headingMedium,
    required this.headingSmall,
    required this.titleMedium,
    required this.bodyLarge,
    required this.bodyMedium,
    required this.bodySmall,
    required this.labelLarge,
    required this.labelMedium,
    required this.labelSmall,
    required this.numeric,
  });

  /// Builds the scale for [script] using [typeface].
  factory KararTypography.forScript(
    KararScript script, {
    BrandTypeface typeface = BrandTypeface.platformDefault,
  }) {
    final bool isArabic = script == KararScript.arabic;
    final double leading = isArabic ? _arabicLeadingBonus : 0;
    final String? family = typeface.family;
    final List<String>? fallback = typeface.fallbackFor(script).isEmpty
        ? null
        : typeface.fallbackFor(script);

    TextStyle style({
      required double size,
      required FontWeight weight,
      required double height,
      double tracking = 0,
      List<FontFeature>? features,
    }) {
      return TextStyle(
        fontFamily: family,
        fontFamilyFallback: fallback,
        fontSize: size,
        fontWeight: weight,
        height: height + leading,
        // Tracking is dropped entirely for Arabic; see the class comment.
        letterSpacing: isArabic ? 0 : tracking,
        fontFeatures: features,
        leadingDistribution: TextLeadingDistribution.even,
      );
    }

    return KararTypography(
      script: script,
      displayLarge: style(
        size: 32,
        weight: FontWeight.w700,
        height: 1.25,
        tracking: -0.4,
      ),
      headingLarge: style(
        size: 26,
        weight: FontWeight.w700,
        height: 1.28,
        tracking: -0.3,
      ),
      headingMedium: style(
        size: 22,
        weight: FontWeight.w600,
        height: 1.30,
        tracking: -0.2,
      ),
      headingSmall: style(size: 18, weight: FontWeight.w600, height: 1.35),
      titleMedium: style(size: 16, weight: FontWeight.w600, height: 1.40),
      bodyLarge: style(size: 17, weight: FontWeight.w400, height: 1.45),
      bodyMedium: style(size: 15, weight: FontWeight.w400, height: 1.50),
      bodySmall: style(size: 13, weight: FontWeight.w400, height: 1.50),
      labelLarge: style(
        size: 15,
        weight: FontWeight.w600,
        height: 1.30,
        tracking: 0.1,
      ),
      labelMedium: style(
        size: 13,
        weight: FontWeight.w600,
        height: 1.30,
        tracking: 0.1,
      ),
      labelSmall: style(
        size: 11,
        weight: FontWeight.w600,
        height: 1.30,
        tracking: 0.2,
      ),
      // Tabular figures keep reference numbers and any platform-supplied
      // amount from shifting horizontally as digits change.
      numeric: style(
        size: 16,
        weight: FontWeight.w500,
        height: 1.40,
        features: const <FontFeature>[FontFeature.tabularFigures()],
      ),
    );
  }

  static const double _arabicLeadingBonus = 0.12;

  final KararScript script;

  final TextStyle displayLarge;
  final TextStyle headingLarge;
  final TextStyle headingMedium;
  final TextStyle headingSmall;
  final TextStyle titleMedium;
  final TextStyle bodyLarge;
  final TextStyle bodyMedium;
  final TextStyle bodySmall;
  final TextStyle labelLarge;
  final TextStyle labelMedium;
  final TextStyle labelSmall;
  final TextStyle numeric;

  /// The script a locale is written in.
  static KararScript scriptOf(Locale locale) {
    return _arabicScriptLanguages.contains(locale.languageCode)
        ? KararScript.arabic
        : KararScript.latin;
  }

  static const Set<String> _arabicScriptLanguages = <String>{
    'ar',
    'fa',
    'ur',
    'ps',
    'ckb',
  };

  static KararTypography forLocale(
    Locale locale, {
    BrandTypeface typeface = BrandTypeface.platformDefault,
  }) {
    return KararTypography.forScript(scriptOf(locale), typeface: typeface);
  }

  /// Maps this scale onto Flutter's [TextTheme] so framework widgets that are
  /// not part of this design system still inherit the same type.
  TextTheme toTextTheme(Color contentPrimary, Color contentSecondary) {
    return TextTheme(
      displayLarge: displayLarge.copyWith(color: contentPrimary),
      displayMedium: headingLarge.copyWith(color: contentPrimary),
      displaySmall: headingMedium.copyWith(color: contentPrimary),
      headlineLarge: headingLarge.copyWith(color: contentPrimary),
      headlineMedium: headingMedium.copyWith(color: contentPrimary),
      headlineSmall: headingSmall.copyWith(color: contentPrimary),
      titleLarge: headingSmall.copyWith(color: contentPrimary),
      titleMedium: titleMedium.copyWith(color: contentPrimary),
      titleSmall: labelMedium.copyWith(color: contentPrimary),
      bodyLarge: bodyLarge.copyWith(color: contentPrimary),
      bodyMedium: bodyMedium.copyWith(color: contentPrimary),
      bodySmall: bodySmall.copyWith(color: contentSecondary),
      labelLarge: labelLarge.copyWith(color: contentPrimary),
      labelMedium: labelMedium.copyWith(color: contentSecondary),
      labelSmall: labelSmall.copyWith(color: contentSecondary),
    );
  }

  static KararTypography lerp(KararTypography a, KararTypography b, double t) {
    return t < 0.5 ? a : b;
  }
}
