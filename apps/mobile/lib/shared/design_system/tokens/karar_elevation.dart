import 'package:flutter/widgets.dart';

/// Elevation expressed as shadow recipes rather than Material's numeric
/// elevation, so a brand can flatten the product without a widget change.
@immutable
class KararElevation {
  const KararElevation({
    required this.shadowColor,
    this.level0Opacity = 0,
    this.level1Opacity = 0.06,
    this.level2Opacity = 0.10,
    this.level3Opacity = 0.16,
  });

  final Color shadowColor;
  final double level0Opacity;
  final double level1Opacity;
  final double level2Opacity;
  final double level3Opacity;

  /// Flat. A bordered surface on the page background.
  List<BoxShadow> get level0 => const <BoxShadow>[];

  /// Resting card.
  List<BoxShadow> get level1 => <BoxShadow>[
    BoxShadow(
      color: shadowColor.withValues(alpha: level1Opacity),
      blurRadius: 6,
      offset: const Offset(0, 1),
    ),
  ];

  /// Raised surface: menu, popover.
  List<BoxShadow> get level2 => <BoxShadow>[
    BoxShadow(
      color: shadowColor.withValues(alpha: level2Opacity),
      blurRadius: 14,
      offset: const Offset(0, 4),
    ),
  ];

  /// Modal surface: dialog, sheet.
  List<BoxShadow> get level3 => <BoxShadow>[
    BoxShadow(
      color: shadowColor.withValues(alpha: level3Opacity),
      blurRadius: 28,
      offset: const Offset(0, 10),
    ),
  ];

  static KararElevation lerp(KararElevation a, KararElevation b, double t) {
    return KararElevation(
      shadowColor: Color.lerp(a.shadowColor, b.shadowColor, t)!,
      level0Opacity: _lerp(a.level0Opacity, b.level0Opacity, t),
      level1Opacity: _lerp(a.level1Opacity, b.level1Opacity, t),
      level2Opacity: _lerp(a.level2Opacity, b.level2Opacity, t),
      level3Opacity: _lerp(a.level3Opacity, b.level3Opacity, t),
    );
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;
}
