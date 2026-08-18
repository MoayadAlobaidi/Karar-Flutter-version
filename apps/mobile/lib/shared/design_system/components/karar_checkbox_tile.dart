import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';

/// A labelled checkbox occupying a full row.
///
/// The whole row is the target, not the 20pt box, and the label is part of the
/// same semantics node so a screen reader reads the question and the answer
/// together.
class KararCheckboxTile extends StatelessWidget {
  const KararCheckboxTile({
    required this.label,
    required this.value,
    required this.onChanged,
    this.description,
    this.errorText,
    super.key,
  });

  final String label;
  final String? description;
  final bool value;
  final ValueChanged<bool>? onChanged;

  /// Non-null puts the tile into its error state and announces the message.
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final bool isEnabled = onChanged != null;
    final bool hasError = errorText != null;
    final Color boxColor = !isEnabled
        ? context.colors.disabledSurface
        : value
        ? context.colors.brand
        : context.colors.surface;
    final Color boxBorder = hasError
        ? context.colors.danger.content
        : value && isEnabled
        ? context.colors.brand
        : context.colors.borderStrong;

    return Semantics(
      checked: value,
      enabled: isEnabled,
      label: description == null
          ? label
          : context.l10n.a11yTitleWithSubtitle(label, description!),
      onTap: isEnabled ? () => onChanged!(!value) : null,
      excludeSemantics: true,
      child: InkWell(
        onTap: isEnabled ? () => onChanged!(!value) : null,
        borderRadius: context.radii
            .all(context.radii.sm)
            .resolve(context.direction),
        child: Padding(
          padding: EdgeInsetsDirectional.symmetric(
            vertical: context.spacing.sm,
            horizontal: context.spacing.xs,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: context.sizing.minTouchTarget,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: <Widget>[
                    Container(
                      width: context.sizing.iconSmall,
                      height: context.sizing.iconSmall,
                      decoration: BoxDecoration(
                        color: boxColor,
                        borderRadius: context.radii.all(context.radii.xs),
                        border: Border.all(
                          color: boxBorder,
                          width: context.sizing.borderWidthStrong,
                        ),
                      ),
                      child: value
                          ? Icon(
                              KararIcons.check,
                              size: context.sizing.iconXSmall,
                              color: isEnabled
                                  ? context.colors.onBrand
                                  : context.colors.contentDisabled,
                            )
                          : null,
                    ),
                    SizedBox(width: context.spacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Text(
                            label,
                            textAlign: TextAlign.start,
                            style: context.typography.bodyMedium.copyWith(
                              color: isEnabled
                                  ? context.colors.contentPrimary
                                  : context.colors.contentDisabled,
                            ),
                          ),
                          if (description != null)
                            Padding(
                              padding: EdgeInsetsDirectional.only(
                                top: context.spacing.xxs,
                              ),
                              child: Text(
                                description!,
                                textAlign: TextAlign.start,
                                style: context.typography.bodySmall.copyWith(
                                  color: context.colors.contentSecondary,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (hasError)
                Padding(
                  padding: EdgeInsetsDirectional.only(top: context.spacing.xxs),
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      errorText!,
                      textAlign: TextAlign.start,
                      style: context.typography.bodySmall.copyWith(
                        color: context.colors.danger.content,
                      ),
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
