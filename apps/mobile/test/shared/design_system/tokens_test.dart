import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

void main() {
  group('typography', () {
    final KararTypography latin = KararTypography.forScript(KararScript.latin);
    final KararTypography arabic = KararTypography.forScript(
      KararScript.arabic,
    );

    test('Arabic carries no letter spacing on any style', () {
      for (final TextStyle style in _allStyles(arabic)) {
        expect(
          style.letterSpacing,
          0,
          reason:
              'Tracking a cursive script pulls joined glyphs apart. Every '
              'Arabic style must sit at zero.',
        );
      }
    });

    test('Latin keeps its tracking', () {
      expect(latin.displayLarge.letterSpacing, isNot(0));
      expect(latin.labelSmall.letterSpacing, isNot(0));
    });

    test('Arabic gets more leading than Latin at the same size', () {
      expect(arabic.bodyMedium.fontSize, latin.bodyMedium.fontSize);
      expect(
        arabic.bodyMedium.height!,
        greaterThan(latin.bodyMedium.height!),
        reason:
            'Tashkeel and tanween sit above the ascender and need vertical '
            'room a Latin line height does not reserve.',
      );
    });

    test('the numeric style uses tabular figures', () {
      expect(
        latin.numeric.fontFeatures,
        contains(const FontFeature.tabularFigures()),
      );
    });

    test('the shipped typeface is the platform default', () {
      expect(
        latin.bodyMedium.fontFamily,
        isNull,
        reason:
            'A null family resolves to SF Pro / SF Arabic on iOS and Roboto '
            'with the bundled Noto Naskh Arabic fallback on Android. No font '
            'binary is committed to this repository.',
      );
    });

    test('the Arabic fallback chain names Naskh faces, not display faces', () {
      expect(
        arabic.bodyMedium.fontFamilyFallback,
        contains('Noto Naskh Arabic'),
      );
    });

    test('script is chosen by language, not by country', () {
      expect(
        KararTypography.scriptOf(const Locale('ar', 'QA')),
        KararScript.arabic,
      );
      expect(KararTypography.scriptOf(const Locale('fa')), KararScript.arabic);
      expect(KararTypography.scriptOf(const Locale('ur')), KararScript.arabic);
      expect(
        KararTypography.scriptOf(const Locale('en', 'GB')),
        KararScript.latin,
      );
    });
  });

  group('brand configuration', () {
    test('only the Karar brand ships in this phase', () {
      expect(BrandConfiguration.karar.id, 'karar');
      expect(
        BrandConfiguration.karar.wordmarkAssetPath,
        isNull,
        reason: 'No logo or marketing identity is invented in this phase.',
      );
    });

    test('a brand can change colour and shape without a widget change', () {
      const BrandConfiguration partner = BrandConfiguration(
        id: 'test_partner',
        palette: BrandPalette(light: _squarePalette, dark: _squarePalette),
        shapeScale: 0,
      );
      final KararTokens tokens = KararTokens.resolve(brand: partner);
      expect(tokens.brandId, 'test_partner');
      expect(tokens.colors.brand, const Color(0xFF123456));
      expect(
        tokens.radii.lg,
        0,
        reason: 'shapeScale is the seam between a rounded and a square brand.',
      );
    });
  });

  group('token resolution', () {
    test('brightness selects the palette', () {
      expect(
        KararTokens.resolve(brightness: Brightness.light).colors.background,
        BrandConfiguration.karar.palette.light.background,
      );
      expect(
        KararTokens.resolve(brightness: Brightness.dark).colors.background,
        BrandConfiguration.karar.palette.dark.background,
      );
    });

    test('locale selects the script', () {
      expect(
        KararTokens.resolve(locale: KararLocalization.arabic).typography.script,
        KararScript.arabic,
      );
      expect(
        KararTokens.resolve(locale: KararLocalization.english)
            .typography
            .script,
        KararScript.latin,
      );
    });

    test('tokens interpolate for a theme transition', () {
      final KararTokens light = KararTokens.resolve();
      final KararTokens dark = KararTokens.resolve(brightness: Brightness.dark);
      final KararTokens midpoint = light.lerp(dark, 0.5);
      expect(midpoint.colors.background, isNot(light.colors.background));
      expect(midpoint.colors.background, isNot(dark.colors.background));
      expect(light.lerp(dark, 0).colors.background, light.colors.background);
      expect(light.lerp(dark, 1).colors.background, dark.colors.background);
    });
  });

  group('theme', () {
    testWidgets('the theme carries the token extension', (
      WidgetTester tester,
    ) async {
      late KararTokens seen;
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            seen = context.tokens;
            return const SizedBox.shrink();
          },
        ),
      );
      expect(seen.brandId, 'karar');
      expect(seen.colors.brand, BrandConfiguration.karar.palette.light.brand);
    });

    testWidgets('the scope re-resolves typography for the active locale', (
      WidgetTester tester,
    ) async {
      late KararScript seen;
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            seen = context.typography.script;
            return const SizedBox.shrink();
          },
        ),
        locale: KararLocalization.arabic,
      );
      expect(
        seen,
        KararScript.arabic,
        reason:
            'MaterialApp.theme is built before a locale is known, so the '
            'scope is what makes Arabic typography actually apply.',
      );
    });

    testWidgets('applyTokens keeps other theme extensions', (
      WidgetTester tester,
    ) async {
      final ThemeData base = KararTheme.light().copyWith(
        extensions: <ThemeExtension<dynamic>>[const _OtherExtension()],
      );
      final ThemeData result = KararTheme.applyTokens(
        base,
        KararTokens.resolve(),
      );
      expect(result.extension<_OtherExtension>(), isNotNull);
      expect(result.extension<KararTokens>(), isNotNull);
    });
  });

  group('motion', () {
    testWidgets('durations collapse when the platform reduces motion', (
      WidgetTester tester,
    ) async {
      late Duration reduced;
      late Duration normal;
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            normal = KararMotion.durationOf(context, context.motion.medium);
            return const SizedBox.shrink();
          },
        ),
      );
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            reduced = KararMotion.durationOf(context, context.motion.medium);
            return const SizedBox.shrink();
          },
        ),
        disableAnimations: true,
      );
      expect(normal, KararMotion.standard.medium);
      expect(reduced, Duration.zero);
    });
  });

  group('sizing', () {
    test('the touch target floor is the platform minimum', () {
      expect(KararSizing.standard.minTouchTarget, 48);
    });
  });
}

List<TextStyle> _allStyles(KararTypography typography) => <TextStyle>[
  typography.displayLarge,
  typography.headingLarge,
  typography.headingMedium,
  typography.headingSmall,
  typography.titleMedium,
  typography.bodyLarge,
  typography.bodyMedium,
  typography.bodySmall,
  typography.labelLarge,
  typography.labelMedium,
  typography.labelSmall,
  typography.numeric,
];

const KararColors _squarePalette = KararColors(
  background: Color(0xFFFFFFFF),
  surface: Color(0xFFFFFFFF),
  surfaceElevated: Color(0xFFFFFFFF),
  surfaceSunken: Color(0xFFEEEEEE),
  surfaceInverse: Color(0xFF000000),
  contentPrimary: Color(0xFF000000),
  contentSecondary: Color(0xFF333333),
  contentTertiary: Color(0xFF555555),
  contentDisabled: Color(0xFF999999),
  contentInverse: Color(0xFFFFFFFF),
  brand: Color(0xFF123456),
  brandPressed: Color(0xFF0E2A45),
  onBrand: Color(0xFFFFFFFF),
  brandSurface: Color(0xFFE6ECF2),
  onBrandSurface: Color(0xFF123456),
  borderSubtle: Color(0xFFEEEEEE),
  borderDefault: Color(0xFFCCCCCC),
  borderStrong: Color(0xFF767676),
  borderFocus: Color(0xFF123456),
  neutral: KararStatusPalette(
    content: Color(0xFF333333),
    surface: Color(0xFFEEEEEE),
    border: Color(0xFFCCCCCC),
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
  scrim: Color(0x7A000000),
  shadow: Color(0xFF000000),
  skeletonBase: Color(0xFFEEEEEE),
  skeletonHighlight: Color(0xFFF7F7F7),
  disabledSurface: Color(0xFFEEEEEE),
);

@immutable
class _OtherExtension extends ThemeExtension<_OtherExtension> {
  const _OtherExtension();

  @override
  _OtherExtension copyWith() => this;

  @override
  _OtherExtension lerp(
    covariant ThemeExtension<_OtherExtension>? other,
    double t,
  ) => this;
}
