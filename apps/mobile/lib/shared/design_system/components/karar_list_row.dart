import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';
import '../foundations/karar_pressable.dart';

/// A row in a settings or navigation list.
///
/// The trailing chevron uses [KararIcons.navigateNext], which mirrors under
/// RTL, and the row's padding is directional, so the leading icon stays at the
/// start of the reading direction in both languages.
class KararListRow extends StatelessWidget {
  const KararListRow({
    required this.title,
    this.subtitle,
    this.leadingIcon,
    this.trailing,
    this.onPressed,
    this.showChevron = true,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? leadingIcon;

  /// Rendered before the chevron. A badge or a short value.
  final Widget? trailing;

  final VoidCallback? onPressed;
  final bool showChevron;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final Widget content = Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        if (leadingIcon != null)
          Padding(
            padding: EdgeInsetsDirectional.only(end: context.spacing.md),
            child: Icon(
              leadingIcon,
              size: context.sizing.iconMedium,
              color: context.colors.contentSecondary,
            ),
          ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                title,
                textAlign: TextAlign.start,
                style: context.typography.bodyLarge.copyWith(
                  color: context.colors.contentPrimary,
                ),
              ),
              if (subtitle != null)
                Padding(
                  padding: EdgeInsetsDirectional.only(top: context.spacing.xxs),
                  child: Text(
                    subtitle!,
                    textAlign: TextAlign.start,
                    style: context.typography.bodySmall.copyWith(
                      color: context.colors.contentSecondary,
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (trailing != null)
          Padding(
            padding: EdgeInsetsDirectional.only(start: context.spacing.sm),
            child: trailing,
          ),
        if (onPressed != null && showChevron)
          Padding(
            padding: EdgeInsetsDirectional.only(start: context.spacing.xs),
            child: Icon(
              KararIcons.navigateNext,
              size: context.sizing.iconSmall,
              color: context.colors.contentTertiary,
            ),
          ),
      ],
    );

    final EdgeInsetsGeometry padding = EdgeInsetsDirectional.symmetric(
      horizontal: context.spacing.lg,
      vertical: context.spacing.md,
    );

    if (onPressed == null) {
      return Padding(padding: padding, child: content);
    }

    return KararPressable(
      semanticLabel:
          semanticLabel ??
          (subtitle == null
              ? title
              : context.l10n.a11yTitleWithSubtitle(title, subtitle!)),
      onPressed: onPressed,
      borderRadius: context.radii.all(context.radii.sm),
      padding: padding,
      child: content,
    );
  }
}
