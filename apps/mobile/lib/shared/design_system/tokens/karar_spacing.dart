import 'package:flutter/widgets.dart';

/// A 4pt spacing scale. Widgets reference a step, never a literal.
///
/// The scale is a token set rather than a constant class so a
/// `BrandConfiguration` can scale density without a code fork.
@immutable
class KararSpacing {
  const KararSpacing({
    this.none = 0,
    this.xxs = 2,
    this.xs = 4,
    this.sm = 8,
    this.md = 12,
    this.lg = 16,
    this.xl = 24,
    this.xxl = 32,
    this.xxxl = 48,
  });

  final double none;
  final double xxs;
  final double xs;
  final double sm;
  final double md;
  final double lg;
  final double xl;
  final double xxl;
  final double xxxl;

  /// Horizontal inset from the screen edge for primary content.
  double get screenInset => lg;

  /// Vertical gap between two unrelated sections of a screen.
  double get sectionGap => xl;

  static const KararSpacing standard = KararSpacing();

  static KararSpacing lerp(KararSpacing a, KararSpacing b, double t) {
    return KararSpacing(
      none: _lerp(a.none, b.none, t),
      xxs: _lerp(a.xxs, b.xxs, t),
      xs: _lerp(a.xs, b.xs, t),
      sm: _lerp(a.sm, b.sm, t),
      md: _lerp(a.md, b.md, t),
      lg: _lerp(a.lg, b.lg, t),
      xl: _lerp(a.xl, b.xl, t),
      xxl: _lerp(a.xxl, b.xxl, t),
      xxxl: _lerp(a.xxxl, b.xxxl, t),
    );
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;
}
