import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/shared/shared.dart';

/// WCAG 2.1 contrast, asserted rather than eyeballed.
///
/// A palette drifts one convenient adjustment at a time. Encoding the minima as
/// tests means a colour change that breaks readability fails in CI instead of
/// in a customer's hand.
void main() {
  const double textMinimum = 4.5; // 1.4.3 AA, normal-size text.
  const double nonTextMinimum = 3.0; // 1.4.11, UI component boundaries.

  for (final MapEntry<String, KararColors> scheme in <String, KararColors>{
    'light': BrandConfiguration.karar.palette.light,
    'dark': BrandConfiguration.karar.palette.dark,
  }.entries) {
    final String name = scheme.key;
    final KararColors colors = scheme.value;

    final List<Color> readingSurfaces = <Color>[
      colors.background,
      colors.surface,
      colors.surfaceElevated,
      colors.surfaceSunken,
    ];

    group('$name palette', () {
      test('body content is readable on every reading surface', () {
        for (final Color surface in readingSurfaces) {
          _expectContrast(colors.contentPrimary, surface, textMinimum);
          _expectContrast(colors.contentSecondary, surface, textMinimum);
          _expectContrast(colors.contentTertiary, surface, textMinimum);
        }
      });

      test('brand text is readable on every reading surface', () {
        // Secondary and tertiary buttons draw their label in the brand colour.
        for (final Color surface in readingSurfaces) {
          _expectContrast(colors.brand, surface, textMinimum);
        }
      });

      test('content on a filled brand surface is readable', () {
        _expectContrast(colors.onBrand, colors.brand, textMinimum);
        _expectContrast(colors.onBrand, colors.brandPressed, textMinimum);
        _expectContrast(
          colors.onBrandSurface,
          colors.brandSurface,
          textMinimum,
        );
        _expectContrast(
          colors.contentInverse,
          colors.surfaceInverse,
          textMinimum,
        );
      });

      test('a destructive control is readable', () {
        _expectContrast(colors.onBrand, colors.danger.content, textMinimum);
      });

      test('status content is readable on its own container', () {
        for (final KararStatusTone tone in KararStatusTone.values) {
          final KararStatusPalette palette = colors.paletteFor(tone);
          _expectContrast(palette.content, palette.surface, textMinimum);
        }
      });

      test('status content is readable on a plain surface', () {
        // Field errors and inline status text sit directly on the page.
        for (final KararStatusTone tone in KararStatusTone.values) {
          final KararStatusPalette palette = colors.paletteFor(tone);
          for (final Color surface in readingSurfaces) {
            _expectContrast(palette.content, surface, textMinimum);
          }
        }
      });

      test('control boundaries and the focus ring are visible', () {
        for (final Color surface in readingSurfaces) {
          _expectContrast(colors.borderStrong, surface, nonTextMinimum);
          _expectContrast(colors.borderFocus, surface, nonTextMinimum);
        }
      });

      test('disabled content is dimmer than enabled content', () {
        // WCAG 1.4.3 exempts inactive controls, so the assertion is the
        // opposite one: disabled must not read as strongly as enabled, or the
        // user cannot tell the control is unavailable.
        expect(
          _contrast(colors.contentDisabled, colors.surface),
          lessThan(_contrast(colors.contentSecondary, colors.surface)),
        );
      });
    });
  }
}

void _expectContrast(Color foreground, Color background, double minimum) {
  final double ratio = _contrast(foreground, background);
  expect(
    ratio,
    greaterThanOrEqualTo(minimum),
    reason:
        '${_hex(foreground)} on ${_hex(background)} is '
        '${ratio.toStringAsFixed(2)}:1, below the required '
        '${minimum.toStringAsFixed(1)}:1.',
  );
}

double _contrast(Color foreground, Color background) {
  final double a = foreground.computeLuminance();
  final double b = background.computeLuminance();
  final double lighter = a > b ? a : b;
  final double darker = a > b ? b : a;
  return (lighter + 0.05) / (darker + 0.05);
}

String _hex(Color color) =>
    '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase()}';
