// The small pieces every financial screen is built from.
//
// They exist so that the label/value pair, the section heading and the
// selectable chip behave identically on eight screens, in two directions, at
// any text scale. Each one:
//
//   * uses DIRECTIONAL insets and alignment only, so Arabic mirrors without a
//     second layout;
//   * STACKS rather than clips when text is scaled up — a label beside a value
//     is a row that runs out of width at 2x, and a truncated currency code is
//     a different currency;
//   * carries its own semantics, so a screen reader hears "label, value" as
//     one node instead of two unrelated strings.
import 'package:flutter/material.dart';

import '../../../shared/shared.dart';

/// A heading with the content it names beneath it.
final class FinancialSection extends StatelessWidget {
  const FinancialSection({
    required this.heading,
    required this.child,
    this.trailing,
    super.key,
  });

  final String heading;
  final Widget child;

  /// An action that belongs to the section rather than to the screen.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final headingText = Semantics(
      header: true,
      child: Text(
        heading,
        textAlign: TextAlign.start,
        style: context.typography.titleMedium.copyWith(
          color: context.colors.contentSecondary,
        ),
      ),
    );
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
            child: trailing == null || context.prefersStackedLayout
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      headingText,
                      ?trailing,
                    ],
                  )
                : Row(
                    children: <Widget>[
                      Expanded(child: headingText),
                      trailing!,
                    ],
                  ),
          ),
          child,
        ],
      ),
    );
  }
}

/// A label above the value it names.
///
/// Stacked rather than side by side, so a large text scale lengthens the
/// column instead of clipping either half. The value goes through
/// [KararBidiText] because an account name, a merchant or an issuer can be in
/// the opposite script from the interface.
final class LabelledValue extends StatelessWidget {
  const LabelledValue({
    required this.label,
    required this.value,
    this.emphasis = false,
    super.key,
  });

  final String label;
  final String value;

  /// Renders the value in the body-large style. Used for the one value a card
  /// is about.
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.l10n.a11yTitleWithSubtitle(label, value),
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          KararBidiText(
            value,
            style: (emphasis
                    ? context.typography.bodyLarge
                    : context.typography.bodyMedium)
                .copyWith(color: context.colors.contentPrimary),
          ),
        ],
      ),
    );
  }
}

/// One selectable option in a group of them.
///
/// A radio in a row rather than a dropdown: every option stays visible and
/// reachable by focus, which is what a screen reader user needs in order to
/// know what the alternatives are.
final class FinancialChoice extends StatelessWidget {
  const FinancialChoice({
    required this.label,
    required this.isSelected,
    required this.onPressed,
    super.key,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final Color background =
        isSelected ? context.colors.brandSurface : context.colors.surfaceSunken;
    final Color foreground =
        isSelected ? context.colors.brand : context.colors.contentSecondary;
    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.all(Radius.circular(context.radii.pill)),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: context.sizing.minTouchTarget),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.all(Radius.circular(context.radii.pill)),
              border: Border.all(
                color: isSelected ? context.colors.brand : context.colors.borderSubtle,
                width: context.sizing.borderWidth,
              ),
            ),
            child: Padding(
              padding: EdgeInsetsDirectional.symmetric(
                horizontal: context.spacing.md,
                vertical: context.spacing.sm,
              ),
              child: Center(
                widthFactor: 1,
                child: Text(
                  label,
                  textAlign: TextAlign.start,
                  style: context.typography.labelLarge.copyWith(color: foreground),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A labelled row of [FinancialChoice]s that wraps rather than scrolls.
///
/// Wrapping matters at 2x text scale: a horizontal scroller hides options
/// behind a gesture, and an option a person cannot see is an option they do
/// not know they have.
final class FinancialChoiceRow extends StatelessWidget {
  const FinancialChoiceRow({
    required this.label,
    required this.children,
    super.key,
  });

  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              label,
              textAlign: TextAlign.start,
              style: context.typography.labelMedium.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
          ),
          SizedBox(height: context.spacing.xs),
          Wrap(
            spacing: context.spacing.xs,
            runSpacing: context.spacing.xs,
            children: children,
          ),
        ],
      ),
    );
  }
}
