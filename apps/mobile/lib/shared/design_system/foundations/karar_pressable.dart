import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';

/// The single interactive primitive every pressable component is built from.
///
/// It owns the four things that are easy to get wrong once per screen and then
/// wrong forever: the minimum touch target, the visible focus ring, the
/// disabled treatment, and the semantics node. Components above it choose
/// colours and content only.
class KararPressable extends StatefulWidget {
  const KararPressable({
    required this.child,
    required this.semanticLabel,
    this.onPressed,
    this.onLongPress,
    this.backgroundColor,
    this.borderColor,
    this.borderRadius,
    this.padding,
    this.minimumSize,
    this.isBusy = false,
    this.isSelected,
    this.semanticHint,
    this.excludeChildSemantics = true,
    super.key,
  });

  final Widget child;

  /// Required. A control the screen reader cannot name is unusable.
  final String semanticLabel;
  final String? semanticHint;

  final VoidCallback? onPressed;
  final VoidCallback? onLongPress;

  final Color? backgroundColor;
  final Color? borderColor;
  final BorderRadiusGeometry? borderRadius;
  final EdgeInsetsGeometry? padding;
  final Size? minimumSize;

  /// Running an action: not pressable, and announced as busy.
  final bool isBusy;

  /// Null for a control that has no selected state. Advertising
  /// "not selected" on an ordinary button makes a screen reader describe a
  /// state the control does not have.
  final bool? isSelected;

  final bool excludeChildSemantics;

  bool get isEnabled => onPressed != null && !isBusy;

  @override
  State<KararPressable> createState() => _KararPressableState();
}

class _KararPressableState extends State<KararPressable> {
  bool _isFocused = false;

  @override
  Widget build(BuildContext context) {
    final BorderRadiusGeometry radius =
        widget.borderRadius ?? context.radii.all(context.radii.md);
    final double minHeight =
        widget.minimumSize?.height ?? context.sizing.minTouchTarget;
    final double minWidth =
        widget.minimumSize?.width ?? context.sizing.minTouchTarget;

    final Widget surface = DecoratedBox(
      decoration: BoxDecoration(
        color: widget.backgroundColor,
        borderRadius: radius,
        border: widget.borderColor == null
            ? null
            : Border.all(
                color: widget.borderColor!,
                width: context.sizing.borderWidth,
              ),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: widget.isEnabled ? widget.onPressed : null,
          onLongPress: widget.isEnabled ? widget.onLongPress : null,
          onFocusChange: (bool focused) {
            if (mounted && focused != _isFocused) {
              setState(() => _isFocused = focused);
            }
          },
          borderRadius: radius.resolve(context.direction),
          // The focus ring below is the visible affordance; the ink highlight
          // would double it.
          focusColor: Colors.transparent,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: minHeight,
              minWidth: minWidth,
            ),
            child: Padding(
              padding: widget.padding ?? EdgeInsets.zero,
              child: Center(
                widthFactor: 1,
                heightFactor: 1,
                child: widget.child,
              ),
            ),
          ),
        ),
      ),
    );

    return Semantics(
      button: true,
      enabled: widget.isEnabled,
      selected: widget.isSelected,
      // The ink well's own semantics are excluded, so the tap action has to be
      // republished here or an assistive technology has a button it cannot
      // activate.
      onTap: widget.isEnabled ? widget.onPressed : null,
      onLongPress: widget.isEnabled ? widget.onLongPress : null,
      label: widget.isBusy
          ? context.l10n.a11yControlBusy(widget.semanticLabel)
          : widget.semanticLabel,
      hint: widget.semanticHint,
      excludeSemantics: widget.excludeChildSemantics,
      child: _FocusRing(
        isVisible: _isFocused && widget.isEnabled,
        borderRadius: radius,
        child: surface,
      ),
    );
  }
}

class _FocusRing extends StatelessWidget {
  const _FocusRing({
    required this.isVisible,
    required this.borderRadius,
    required this.child,
  });

  final bool isVisible;
  final BorderRadiusGeometry borderRadius;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final double offset = context.sizing.focusRingOffset;
    return Stack(
      clipBehavior: Clip.none,
      children: <Widget>[
        child,
        if (isVisible)
          PositionedDirectional(
            top: -offset,
            bottom: -offset,
            start: -offset,
            end: -offset,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: borderRadius.add(BorderRadius.circular(offset)),
                  border: Border.all(
                    color: context.colors.borderFocus,
                    width: context.sizing.focusRingWidth,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
