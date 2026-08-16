import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';
import '../tokens/karar_colors.dart';

/// A compact status marker.
///
/// [label] and the tone icon are both mandatory. Status is never carried by
/// colour alone: a colour-blind user, a user in bright sunlight, and a screen
/// reader all need the word.
class KararStatusBadge extends StatelessWidget {
  const KararStatusBadge({
    required this.label,
    required this.tone,
    this.icon,
    super.key,
  });

  final String label;
  final KararStatusTone tone;

  /// Overrides the tone's default icon. It is never removed.
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final KararStatusPalette palette = context.colors.paletteFor(tone);
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: context.radii.all(context.radii.sm),
          border: Border.all(
            color: palette.border,
            width: context.sizing.borderWidth,
          ),
        ),
        child: Padding(
          padding: EdgeInsetsDirectional.symmetric(
            horizontal: context.spacing.sm,
            vertical: context.spacing.xs,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              Icon(
                icon ?? KararIcons.forTone(tone),
                size: context.sizing.iconXSmall,
                color: palette.content,
              ),
              SizedBox(width: context.spacing.xs),
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.start,
                  style: context.typography.labelSmall.copyWith(
                    color: palette.content,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
