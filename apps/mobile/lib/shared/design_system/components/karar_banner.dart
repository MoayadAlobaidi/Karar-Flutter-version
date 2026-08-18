import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';
import '../tokens/karar_colors.dart';
import 'karar_button.dart';
import 'karar_icon_button.dart';

/// An inline notice attached to the content it concerns.
///
/// The banner is a live region: it appears in response to something that
/// happened, so a screen reader announces it rather than waiting to be asked.
class KararBanner extends StatelessWidget {
  const KararBanner({
    required this.message,
    required this.tone,
    this.title,
    this.actionLabel,
    this.onAction,
    this.onDismiss,
    super.key,
  }) : assert(
         (actionLabel == null) == (onAction == null),
         'An action needs both a label and a callback.',
       );

  final String message;
  final String? title;
  final KararStatusTone tone;
  final String? actionLabel;
  final VoidCallback? onAction;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final KararStatusPalette palette = context.colors.paletteFor(tone);
    return Semantics(
      liveRegion: true,
      container: true,
      // The banner names itself, but its action and dismiss controls stay
      // separately reachable rather than being folded into the announcement.
      explicitChildNodes: true,
      label: title == null
          ? message
          : context.l10n.a11yBannerTitled(context.l10n.a11yBanner, title!),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: context.radii.all(context.radii.md),
          border: Border.all(
            color: palette.border,
            width: context.sizing.borderWidth,
          ),
        ),
        child: Padding(
          padding: EdgeInsetsDirectional.all(context.spacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Padding(
                padding: EdgeInsetsDirectional.only(
                  end: context.spacing.sm,
                  top: context.spacing.xxs,
                ),
                child: Icon(
                  KararIcons.forTone(tone),
                  size: context.sizing.iconSmall,
                  color: palette.content,
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (title != null)
                      Padding(
                        padding: EdgeInsetsDirectional.only(
                          bottom: context.spacing.xxs,
                        ),
                        child: Text(
                          title!,
                          textAlign: TextAlign.start,
                          style: context.typography.titleMedium.copyWith(
                            color: palette.content,
                          ),
                        ),
                      ),
                    Text(
                      message,
                      textAlign: TextAlign.start,
                      style: context.typography.bodyMedium.copyWith(
                        color: palette.content,
                      ),
                    ),
                    if (actionLabel != null)
                      Padding(
                        padding: EdgeInsetsDirectional.only(
                          top: context.spacing.sm,
                        ),
                        child: Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: KararButton(
                            label: actionLabel!,
                            onPressed: onAction,
                            variant: KararButtonVariant.tertiary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (onDismiss != null)
                KararIconButton(
                  icon: KararIcons.close,
                  semanticLabel: context.l10n.actionDismiss,
                  onPressed: onDismiss,
                  color: palette.content,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
