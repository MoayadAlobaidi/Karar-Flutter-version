import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';
import 'karar_icon_button.dart';

/// The screen header.
///
/// The back control uses [KararIcons.back], which Flutter mirrors under RTL, so
/// "back" points towards the start of the reading direction in both languages
/// without the screen deciding anything.
class KararAppBar extends StatelessWidget implements PreferredSizeWidget {
  const KararAppBar({
    required this.title,
    this.onBack,
    this.actions = const <Widget>[],
    this.showDivider = true,
    super.key,
  });

  final String title;

  /// Null renders no back control. A screen that cannot be left should say so
  /// rather than render a control that does nothing.
  final VoidCallback? onBack;

  final List<Widget> actions;
  final bool showDivider;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: showDivider
            ? Border(
                bottom: BorderSide(
                  color: context.colors.borderSubtle,
                  width: context.sizing.dividerThickness,
                ),
              )
            : null,
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: preferredSize.height,
          child: Padding(
            padding: EdgeInsetsDirectional.symmetric(
              horizontal: context.spacing.sm,
            ),
            child: Row(
              children: <Widget>[
                if (onBack != null)
                  KararIconButton(
                    icon: KararIcons.back,
                    semanticLabel: context.l10n.actionBack,
                    onPressed: onBack,
                    color: context.colors.contentPrimary,
                  )
                else
                  SizedBox(width: context.spacing.sm),
                Expanded(
                  child: Padding(
                    padding: EdgeInsetsDirectional.symmetric(
                      horizontal: context.spacing.sm,
                    ),
                    child: Semantics(
                      header: true,
                      child: Text(
                        title,
                        textAlign: TextAlign.start,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.typography.headingSmall.copyWith(
                          color: context.colors.contentPrimary,
                        ),
                      ),
                    ),
                  ),
                ),
                ...actions,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
