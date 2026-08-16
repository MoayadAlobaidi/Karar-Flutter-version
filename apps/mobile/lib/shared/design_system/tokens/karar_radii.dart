import 'package:flutter/widgets.dart';

/// Corner radius scale.
///
/// Every value is directional: components build [BorderRadiusDirectional] from
/// these so a leading corner stays leading under RTL.
@immutable
class KararRadii {
  const KararRadii({
    this.none = 0,
    this.xs = 4,
    this.sm = 8,
    this.md = 12,
    this.lg = 16,
    this.xl = 24,
    this.pill = 999,
  });

  /// Scales every step by [scale], the seam a brand uses to move between a
  /// square and a rounded product without touching a widget.
  factory KararRadii.scaled(double scale) {
    const KararRadii base = KararRadii();
    return KararRadii(
      none: base.none * scale,
      xs: base.xs * scale,
      sm: base.sm * scale,
      md: base.md * scale,
      lg: base.lg * scale,
      xl: base.xl * scale,
      pill: base.pill,
    );
  }

  final double none;
  final double xs;
  final double sm;
  final double md;
  final double lg;
  final double xl;
  final double pill;

  BorderRadiusDirectional all(double radius) =>
      BorderRadiusDirectional.circular(radius);

  /// Top corners only — the shape a bottom sheet uses.
  BorderRadiusDirectional top(double radius) =>
      BorderRadiusDirectional.vertical(top: Radius.circular(radius));

  static const KararRadii standard = KararRadii();

  static KararRadii lerp(KararRadii a, KararRadii b, double t) {
    return KararRadii(
      none: _lerp(a.none, b.none, t),
      xs: _lerp(a.xs, b.xs, t),
      sm: _lerp(a.sm, b.sm, t),
      md: _lerp(a.md, b.md, t),
      lg: _lerp(a.lg, b.lg, t),
      xl: _lerp(a.xl, b.xl, t),
      pill: _lerp(a.pill, b.pill, t),
    );
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;
}
