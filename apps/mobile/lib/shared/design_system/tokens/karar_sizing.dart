import 'package:flutter/widgets.dart';

/// Icon sizing, control sizing, stroke widths and touch targets.
///
/// [minTouchTarget] is a floor, not a fixed height. Controls express it through
/// a minimum constraint so a control still grows when the user raises the text
/// scale; a fixed height would clip the label instead.
@immutable
class KararSizing {
  const KararSizing({
    this.iconXSmall = 16,
    this.iconSmall = 20,
    this.iconMedium = 24,
    this.iconLarge = 32,
    this.iconXLarge = 48,
    this.minTouchTarget = 48,
    this.controlHeightSmall = 36,
    this.controlHeightMedium = 48,
    this.controlHeightLarge = 56,
    this.borderWidth = 1,
    this.borderWidthStrong = 1.5,
    this.focusRingWidth = 2,
    this.focusRingOffset = 2,
    this.dividerThickness = 1,
    this.loadingIndicatorStroke = 2.5,
  });

  final double iconXSmall;
  final double iconSmall;
  final double iconMedium;
  final double iconLarge;
  final double iconXLarge;

  /// WCAG 2.1 AA target-size floor, and the Material and HIG floor as well.
  final double minTouchTarget;

  final double controlHeightSmall;
  final double controlHeightMedium;
  final double controlHeightLarge;

  final double borderWidth;
  final double borderWidthStrong;
  final double focusRingWidth;
  final double focusRingOffset;
  final double dividerThickness;
  final double loadingIndicatorStroke;

  static const KararSizing standard = KararSizing();

  static KararSizing lerp(KararSizing a, KararSizing b, double t) {
    return KararSizing(
      iconXSmall: _lerp(a.iconXSmall, b.iconXSmall, t),
      iconSmall: _lerp(a.iconSmall, b.iconSmall, t),
      iconMedium: _lerp(a.iconMedium, b.iconMedium, t),
      iconLarge: _lerp(a.iconLarge, b.iconLarge, t),
      iconXLarge: _lerp(a.iconXLarge, b.iconXLarge, t),
      minTouchTarget: _lerp(a.minTouchTarget, b.minTouchTarget, t),
      controlHeightSmall: _lerp(a.controlHeightSmall, b.controlHeightSmall, t),
      controlHeightMedium: _lerp(
        a.controlHeightMedium,
        b.controlHeightMedium,
        t,
      ),
      controlHeightLarge: _lerp(a.controlHeightLarge, b.controlHeightLarge, t),
      borderWidth: _lerp(a.borderWidth, b.borderWidth, t),
      borderWidthStrong: _lerp(a.borderWidthStrong, b.borderWidthStrong, t),
      focusRingWidth: _lerp(a.focusRingWidth, b.focusRingWidth, t),
      focusRingOffset: _lerp(a.focusRingOffset, b.focusRingOffset, t),
      dividerThickness: _lerp(a.dividerThickness, b.dividerThickness, t),
      loadingIndicatorStroke: _lerp(
        a.loadingIndicatorStroke,
        b.loadingIndicatorStroke,
        t,
      ),
    );
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;
}
