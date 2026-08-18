import 'package:flutter/widgets.dart';

/// Duration and easing tokens.
///
/// Read durations through [durationOf] rather than the fields directly:
/// it collapses to [Duration.zero] when the platform reports
/// "reduce motion", which is an accessibility setting and not a preference the
/// application may ignore.
@immutable
class KararMotion {
  const KararMotion({
    this.instant = const Duration(milliseconds: 75),
    this.fast = const Duration(milliseconds: 150),
    this.medium = const Duration(milliseconds: 250),
    this.slow = const Duration(milliseconds: 400),
    this.standardCurve = Curves.easeInOutCubic,
    this.enterCurve = Curves.easeOutCubic,
    this.exitCurve = Curves.easeInCubic,
  });

  final Duration instant;
  final Duration fast;
  final Duration medium;
  final Duration slow;

  final Curve standardCurve;
  final Curve enterCurve;
  final Curve exitCurve;

  static const KararMotion standard = KararMotion();

  /// [duration], or zero when the user has asked the platform to reduce motion.
  static Duration durationOf(BuildContext context, Duration duration) {
    return MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;
  }

  static KararMotion lerp(KararMotion a, KararMotion b, double t) {
    return t < 0.5 ? a : b;
  }
}
