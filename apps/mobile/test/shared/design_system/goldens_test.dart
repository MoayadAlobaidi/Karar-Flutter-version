@Tags(<String>['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

/// A deliberately small golden set.
///
/// Goldens are kept for the two things a widget assertion describes badly: the
/// whole button family side by side, and a form field carrying label, error and
/// counter at once. Everything else is asserted structurally, because fifty
/// screenshots break together on an unrelated change and teach the team to
/// regenerate without looking.
///
/// Baselines are rendered with Flutter's built-in test font, so they are
/// deterministic across machines for layout and colour. They cannot prove
/// Arabic glyph shaping — that needs a device.
///
/// Regenerate: `flutter test --update-goldens test/shared/design_system/goldens_test.dart`
/// Skip on a platform whose baselines have not been generated:
/// `flutter test --exclude-tags golden`
void main() {
  for (final Locale locale in testLocales) {
    final String suffix = locale.languageCode;

    testWidgets('button family [$suffix]', (WidgetTester tester) async {
      await pumpKarar(
        tester,
        const _Frame(width: 320, child: _ButtonMatrix()),
        locale: locale,
      );
      await expectLater(
        find.byType(_Frame),
        matchesGoldenFile('goldens/button_family_$suffix.png'),
      );
    });

    testWidgets('form field states [$suffix]', (WidgetTester tester) async {
      await pumpKarar(
        tester,
        const _Frame(width: 320, child: _FormFieldStates()),
        locale: locale,
      );
      await expectLater(
        find.byType(_Frame),
        matchesGoldenFile('goldens/form_field_states_$suffix.png'),
      );
    });
  }
}

class _Frame extends StatelessWidget {
  const _Frame({required this.width, required this.child});

  final double width;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.colors.background,
      child: SizedBox(
        width: width,
        child: Padding(
          padding: EdgeInsetsDirectional.all(context.spacing.lg),
          child: child,
        ),
      ),
    );
  }
}

class _ButtonMatrix extends StatelessWidget {
  const _ButtonMatrix();

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        KararButton(
          label: l10n.actionContinue,
          onPressed: () {},
          icon: KararIcons.check,
          isFullWidth: true,
        ),
        SizedBox(height: context.spacing.sm),
        KararButton(
          label: l10n.actionSave,
          onPressed: () {},
          variant: KararButtonVariant.secondary,
          isFullWidth: true,
        ),
        SizedBox(height: context.spacing.sm),
        KararButton(
          label: l10n.actionCancel,
          onPressed: () {},
          variant: KararButtonVariant.tertiary,
          isFullWidth: true,
        ),
        SizedBox(height: context.spacing.sm),
        KararButton(
          label: l10n.actionRemove,
          onPressed: () {},
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
        ),
        SizedBox(height: context.spacing.sm),
        KararButton(
          label: l10n.actionSubmit,
          onPressed: null,
          isFullWidth: true,
        ),
      ],
    );
  }
}

class _FormFieldStates extends StatelessWidget {
  const _FormFieldStates();

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        KararTextField(
          label: l10n.languageSettingTitle,
          isRequired: true,
          hint: l10n.languageSystemDefault,
          helperText: l10n.fieldRequiredMarker,
          maxLength: 40,
        ),
        SizedBox(height: context.spacing.lg),
        KararTextField(
          label: l10n.languageSettingTitle,
          errorText: l10n.stateErrorTitle,
        ),
        SizedBox(height: context.spacing.lg),
        KararStatusBadge(
          label: l10n.statusPending,
          tone: KararStatusTone.warning,
        ),
      ],
    );
  }
}
