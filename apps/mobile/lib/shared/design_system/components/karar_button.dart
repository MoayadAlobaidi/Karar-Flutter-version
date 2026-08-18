import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_pressable.dart';
import '../tokens/karar_colors.dart';
import 'karar_loading_indicator.dart';

/// Emphasis level, not colour. A screen picks the role the action plays.
enum KararButtonVariant {
  /// The one action the screen wants the user to take.
  primary,

  /// A supporting action of equal legitimacy.
  secondary,

  /// A low-emphasis action, typically inline.
  tertiary,

  /// An action that destroys or cannot be undone.
  destructive,
}

enum KararButtonSize { medium, large }

/// The product's button.
///
/// Sizing is expressed as a minimum, never a fixed height, so the control grows
/// with the user's text scale instead of clipping its label.
class KararButton extends StatelessWidget {
  const KararButton({
    required this.label,
    required this.onPressed,
    this.variant = KararButtonVariant.primary,
    this.size = KararButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
    this.semanticLabel,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final KararButtonVariant variant;
  final KararButtonSize size;
  final IconData? icon;

  /// Blocks presses and announces the control as busy.
  final bool isLoading;

  final bool isFullWidth;

  /// Overrides the announced name when the visible label is not enough on its
  /// own — "Continue" in a list of several continues, for example.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final KararColors colors = context.colors;
    final bool isEnabled = onPressed != null && !isLoading;
    final _ButtonSkin skin = _skinFor(variant, colors, isEnabled);

    final double verticalPadding = size == KararButtonSize.large
        ? context.spacing.lg
        : context.spacing.md;
    final double minHeight = size == KararButtonSize.large
        ? context.sizing.controlHeightLarge
        : context.sizing.minTouchTarget;

    final Widget content = Row(
      mainAxisSize: isFullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        if (isLoading)
          Padding(
            padding: EdgeInsetsDirectional.only(end: context.spacing.sm),
            child: KararLoadingIndicator.inline(color: skin.foreground),
          )
        else if (icon != null)
          Padding(
            padding: EdgeInsetsDirectional.only(end: context.spacing.sm),
            child: Icon(
              icon,
              size: context.sizing.iconSmall,
              color: skin.foreground,
            ),
          ),
        Flexible(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: context.typography.labelLarge.copyWith(
              color: skin.foreground,
            ),
          ),
        ),
      ],
    );

    final Widget button = KararPressable(
      semanticLabel: semanticLabel ?? label,
      isBusy: isLoading,
      onPressed: onPressed,
      backgroundColor: skin.background,
      borderColor: skin.border,
      borderRadius: context.radii.all(context.radii.md),
      padding: EdgeInsetsDirectional.symmetric(
        horizontal: context.spacing.lg,
        vertical: verticalPadding,
      ),
      minimumSize: Size(context.sizing.minTouchTarget, minHeight),
      child: content,
    );

    return isFullWidth
        ? SizedBox(width: double.infinity, child: button)
        : button;
  }

  static _ButtonSkin _skinFor(
    KararButtonVariant variant,
    KararColors colors,
    bool isEnabled,
  ) {
    if (!isEnabled) {
      return _ButtonSkin(
        background: variant == KararButtonVariant.tertiary
            ? Colors.transparent
            : colors.disabledSurface,
        foreground: colors.contentDisabled,
        border: variant == KararButtonVariant.secondary
            ? colors.borderDefault
            : null,
      );
    }
    switch (variant) {
      case KararButtonVariant.primary:
        return _ButtonSkin(
          background: colors.brand,
          foreground: colors.onBrand,
          border: null,
        );
      case KararButtonVariant.secondary:
        return _ButtonSkin(
          background: colors.surface,
          foreground: colors.brand,
          border: colors.borderStrong,
        );
      case KararButtonVariant.tertiary:
        return _ButtonSkin(
          background: Colors.transparent,
          foreground: colors.brand,
          border: null,
        );
      case KararButtonVariant.destructive:
        return _ButtonSkin(
          background: colors.danger.content,
          foreground: colors.onBrand,
          border: null,
        );
    }
  }
}

@immutable
class _ButtonSkin {
  const _ButtonSkin({
    required this.background,
    required this.foreground,
    required this.border,
  });

  final Color background;
  final Color foreground;
  final Color? border;
}
