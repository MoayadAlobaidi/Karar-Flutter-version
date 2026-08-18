import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_pressable.dart';

/// An icon-only control.
///
/// [semanticLabel] is required and has no default. An icon carries no text, so
/// the label is the only name the control has.
class KararIconButton extends StatelessWidget {
  const KararIconButton({
    required this.icon,
    required this.semanticLabel,
    required this.onPressed,
    this.color,
    this.backgroundColor,
    this.size,
    super.key,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback? onPressed;
  final Color? color;
  final Color? backgroundColor;
  final double? size;

  @override
  Widget build(BuildContext context) {
    final Color foreground = onPressed == null
        ? context.colors.contentDisabled
        : color ?? context.colors.contentSecondary;
    return KararPressable(
      semanticLabel: semanticLabel,
      onPressed: onPressed,
      backgroundColor: backgroundColor,
      borderRadius: context.radii.all(context.radii.pill),
      child: Icon(
        icon,
        size: size ?? context.sizing.iconMedium,
        color: foreground,
      ),
    );
  }
}
