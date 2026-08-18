import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';
import 'karar_icon_button.dart';

/// A sheet anchored to the bottom of the screen.
///
/// The close control is always present. A sheet that can only be dismissed by
/// dragging is unreachable to a user driving the screen with a screen reader or
/// a switch control.
class KararBottomSheet extends StatelessWidget {
  const KararBottomSheet({
    required this.title,
    required this.child,
    this.onClose,
    super.key,
  });

  final String title;
  final Widget child;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: context.l10n.a11ySheet,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.colors.surfaceElevated,
          borderRadius: context.radii.top(context.radii.xl),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsetsDirectional.only(
              start: context.spacing.lg,
              end: context.spacing.lg,
              bottom: context.spacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const _DragHandle(),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          title,
                          textAlign: TextAlign.start,
                          style: context.typography.headingSmall.copyWith(
                            color: context.colors.contentPrimary,
                          ),
                        ),
                      ),
                    ),
                    KararIconButton(
                      icon: KararIcons.close,
                      semanticLabel: context.l10n.actionClose,
                      onPressed:
                          onClose ?? () => Navigator.of(context).maybePop(),
                    ),
                  ],
                ),
                SizedBox(height: context.spacing.md),
                Flexible(child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DragHandle extends StatelessWidget {
  const _DragHandle();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.l10n.a11yDragHandle,
      child: Center(
        child: Padding(
          padding: EdgeInsetsDirectional.symmetric(
            vertical: context.spacing.md,
          ),
          child: Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: context.colors.borderDefault,
              borderRadius: context.radii.all(context.radii.pill),
            ),
          ),
        ),
      ),
    );
  }
}

/// Presents a sheet with the product's scrim and shape.
Future<T?> showKararBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isDismissible = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isDismissible: isDismissible,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: context.colors.scrim,
    builder: builder,
  );
}
