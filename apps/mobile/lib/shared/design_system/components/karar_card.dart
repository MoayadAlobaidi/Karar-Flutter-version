import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_pressable.dart';

/// A grouped surface.
///
/// [KararCard.pressable] is a separate constructor rather than a nullable
/// callback so a card that can be tapped always carries a semantic label; a
/// tappable surface with no name is the most common screen-reader defect in a
/// card-heavy product.
class KararCard extends StatelessWidget {
  const KararCard({
    required this.child,
    this.padding,
    this.isElevated = false,
    super.key,
  }) : onPressed = null,
       semanticLabel = null;

  const KararCard.pressable({
    required this.child,
    required this.onPressed,
    required String this.semanticLabel,
    this.padding,
    this.isElevated = false,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final bool isElevated;
  final VoidCallback? onPressed;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final EdgeInsetsGeometry effectivePadding =
        padding ?? EdgeInsetsDirectional.all(context.spacing.lg);
    final BorderRadiusGeometry radius = context.radii.all(context.radii.lg);

    if (onPressed != null) {
      return KararPressable(
        semanticLabel: semanticLabel!,
        onPressed: onPressed,
        backgroundColor: context.colors.surface,
        borderColor: context.colors.borderSubtle,
        borderRadius: radius,
        padding: effectivePadding,
        excludeChildSemantics: false,
        child: child,
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: radius,
        border: Border.all(
          color: context.colors.borderSubtle,
          width: context.sizing.borderWidth,
        ),
        boxShadow: isElevated
            ? context.elevation.level1
            : context.elevation.level0,
      ),
      child: Padding(padding: effectivePadding, child: child),
    );
  }
}
