import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';

/// An accessible progress indicator.
///
/// A bare spinner is invisible to a screen reader, which is how "the app looks
/// frozen" becomes a support ticket. This wraps the indicator in a live region
/// carrying a spoken label, and the label is always a real sentence rather than
/// the word "progress".
class KararLoadingIndicator extends StatelessWidget {
  const KararLoadingIndicator({
    this.label,
    this.subject,
    this.size,
    this.color,
    this.announce = true,
    super.key,
  }) : _isInline = false;

  /// A small indicator that sits inside another control, such as a busy
  /// button. The parent control owns the announcement, so this one is silent.
  const KararLoadingIndicator.inline({this.color, this.size, super.key})
    : label = null,
      subject = null,
      announce = false,
      _isInline = true;

  /// Overrides the spoken label entirely.
  final String? label;

  /// Names what is loading: "your profile" produces "Loading your profile".
  final String? subject;

  final double? size;
  final Color? color;

  /// Whether the indicator publishes a live region. False when a parent
  /// already announces the busy state, so the user hears it once.
  final bool announce;

  final bool _isInline;

  @override
  Widget build(BuildContext context) {
    final double diameter =
        size ??
        (_isInline ? context.sizing.iconSmall : context.sizing.iconLarge);
    final Widget indicator = SizedBox(
      width: diameter,
      height: diameter,
      child: CircularProgressIndicator(
        strokeWidth: context.sizing.loadingIndicatorStroke,
        color: color ?? context.colors.brand,
      ),
    );

    if (!announce) {
      return ExcludeSemantics(child: indicator);
    }

    final String spoken =
        label ??
        (subject == null
            ? context.l10n.stateLoading
            : context.l10n.stateLoadingWithSubject(subject!));

    return Semantics(
      label: spoken,
      liveRegion: true,
      excludeSemantics: true,
      child: indicator,
    );
  }
}

/// A neutral placeholder block for content that is still loading.
///
/// It renders shape only. It never renders a plausible-looking value, because a
/// skeleton that resolves into a different figure teaches the user to distrust
/// the screen.
class KararSkeletonBox extends StatefulWidget {
  const KararSkeletonBox({
    required this.width,
    required this.height,
    this.borderRadius,
    super.key,
  });

  final double width;
  final double height;
  final BorderRadiusGeometry? borderRadius;

  @override
  State<KararSkeletonBox> createState() => _KararSkeletonBoxState();
}

class _KararSkeletonBoxState extends State<KararSkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reduce-motion is an accessibility setting, not a preference: the pulse
    // stops entirely rather than merely slowing down.
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
      _controller.value = 0;
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (BuildContext context, Widget? child) {
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              color: Color.lerp(
                context.colors.skeletonBase,
                context.colors.skeletonHighlight,
                _controller.value,
              ),
              borderRadius:
                  widget.borderRadius ?? context.radii.all(context.radii.xs),
            ),
          );
        },
      ),
    );
  }
}
