import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import 'karar_button.dart';

/// A modal decision.
///
/// The dialog names itself as a route so a screen reader announces that a modal
/// opened, and traps focus inside it — otherwise the user can swipe past a
/// dialog into content that is no longer reachable by touch.
class KararDialog extends StatelessWidget {
  const KararDialog({
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.onConfirm,
    this.cancelLabel,
    this.onCancel,
    this.isDestructive = false,
    super.key,
  });

  final String title;
  final String message;
  final String confirmLabel;
  final VoidCallback onConfirm;
  final String? cancelLabel;
  final VoidCallback? onCancel;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: context.l10n.a11yDialog,
      child: Dialog(
        backgroundColor: context.colors.surfaceElevated,
        surfaceTintColor: Colors.transparent,
        // Symmetric, so there is no directional distinction to preserve.
        insetPadding: EdgeInsets.symmetric(
          horizontal: context.spacing.xl,
          vertical: context.spacing.xxl,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: context.radii.all(context.radii.lg),
        ),
        child: Padding(
          padding: EdgeInsetsDirectional.all(context.spacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Semantics(
                header: true,
                child: Text(
                  title,
                  textAlign: TextAlign.start,
                  style: context.typography.headingSmall.copyWith(
                    color: context.colors.contentPrimary,
                  ),
                ),
              ),
              SizedBox(height: context.spacing.sm),
              Text(
                message,
                textAlign: TextAlign.start,
                style: context.typography.bodyMedium.copyWith(
                  color: context.colors.contentSecondary,
                ),
              ),
              SizedBox(height: context.spacing.xl),
              _Actions(
                confirmLabel: confirmLabel,
                onConfirm: onConfirm,
                cancelLabel: cancelLabel,
                onCancel: onCancel,
                isDestructive: isDestructive,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.confirmLabel,
    required this.onConfirm,
    required this.cancelLabel,
    required this.onCancel,
    required this.isDestructive,
  });

  final String confirmLabel;
  final VoidCallback onConfirm;
  final String? cancelLabel;
  final VoidCallback? onCancel;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    final KararButton confirm = KararButton(
      label: confirmLabel,
      onPressed: onConfirm,
      variant: isDestructive
          ? KararButtonVariant.destructive
          : KararButtonVariant.primary,
      isFullWidth: true,
    );
    if (cancelLabel == null) {
      return confirm;
    }
    final KararButton cancel = KararButton(
      label: cancelLabel!,
      onPressed: onCancel ?? () => Navigator.of(context).maybePop(),
      variant: KararButtonVariant.secondary,
      isFullWidth: true,
    );

    // At large text the two actions cannot share a row without truncating, so
    // they stack. The confirm action stays first in both layouts.
    if (context.prefersStackedLayout) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          confirm,
          SizedBox(height: context.spacing.sm),
          cancel,
        ],
      );
    }
    return Row(
      children: <Widget>[
        Expanded(child: cancel),
        SizedBox(width: context.spacing.sm),
        Expanded(child: confirm),
      ],
    );
  }
}

/// Presents [dialog] with the product's scrim.
Future<T?> showKararDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
}) {
  return showDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierColor: context.colors.scrim,
    builder: builder,
  );
}
