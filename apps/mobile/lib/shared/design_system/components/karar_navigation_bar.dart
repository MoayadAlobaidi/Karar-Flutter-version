import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';

/// One destination in the bottom navigation bar.
@immutable
class KararNavigationDestination {
  const KararNavigationDestination({
    required this.icon,
    required this.label,
    this.selectedIcon,
  });

  final IconData icon;
  final IconData? selectedIcon;

  /// Always rendered. An icon-only navigation bar is unreadable to anyone who
  /// does not already recognise the icon.
  final String label;
}

/// Bottom navigation.
///
/// Destination order follows the reading direction because the row is laid out
/// directionally: the first destination sits at the start, which is the left in
/// English and the right in Arabic.
class KararNavigationBar extends StatelessWidget {
  const KararNavigationBar({
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
    super.key,
  }) : assert(
         destinations.length > 1,
         'A single destination is not navigation.',
       );

  final List<KararNavigationDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: context.l10n.a11yNavigationBar,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border(
            top: BorderSide(
              color: context.colors.borderSubtle,
              width: context.sizing.dividerThickness,
            ),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: <Widget>[
              for (int index = 0; index < destinations.length; index++)
                Expanded(
                  child: _Destination(
                    destination: destinations[index],
                    isSelected: index == selectedIndex,
                    position: index + 1,
                    total: destinations.length,
                    onPressed: () => onDestinationSelected(index),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Destination extends StatelessWidget {
  const _Destination({
    required this.destination,
    required this.isSelected,
    required this.position,
    required this.total,
    required this.onPressed,
  });

  final KararNavigationDestination destination;
  final bool isSelected;
  final int position;
  final int total;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final Color color = isSelected
        ? context.colors.brand
        : context.colors.contentTertiary;
    return Semantics(
      button: true,
      selected: isSelected,
      label: destination.label,
      // Position is spoken so a user who cannot see the bar knows where they
      // are in it. It is read out as a number, so it takes the same digits as
      // every other number in the interface.
      hint: context.formatter.applyNumerals(
        context.l10n.a11yTabPosition(position, total),
      ),
      onTap: onPressed,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onPressed,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: context.sizing.minTouchTarget),
          child: Padding(
            padding: EdgeInsetsDirectional.symmetric(
              vertical: context.spacing.sm,
              horizontal: context.spacing.xs,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(
                  isSelected
                      ? (destination.selectedIcon ?? destination.icon)
                      : destination.icon,
                  size: context.sizing.iconMedium,
                  color: color,
                ),
                SizedBox(height: context.spacing.xxs),
                Text(
                  destination.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: context.typography.labelSmall.copyWith(color: color),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
