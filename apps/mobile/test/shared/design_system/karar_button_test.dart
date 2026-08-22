import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

void main() {
  testInBothDirections('renders its label and reports the resolved direction', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(tester, _button(locale), locale: locale, textScale: scale);
    expect(find.text(_label(locale)), findsOneWidget);
    expect(
      directionOf(tester, find.byType(KararButton)),
      locale == KararLocalization.arabic ? TextDirection.rtl : TextDirection.ltr,
    );
  }, textScales: testTextScales);

  testInBothDirections('meets the touch target floor at every text scale', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(tester, _button(locale), locale: locale, textScale: scale);
    final Size size = tester.getSize(find.byType(KararButton));
    expect(
      size.height,
      greaterThanOrEqualTo(KararSizing.standard.minTouchTarget),
      reason:
          'The control expresses a minimum, not a fixed height, so raising '
          'the text scale grows it instead of clipping the label.',
    );
  }, textScales: testTextScales);

  testInBothDirections('grows rather than clips at large text', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(tester, _button(locale), locale: locale);
    final double normal = tester.getSize(find.byType(KararButton)).height;
    await pumpKarar(tester, _button(locale), locale: locale, textScale: 2);
    final double large = tester.getSize(find.byType(KararButton)).height;
    expect(large, greaterThan(normal));
    expect(tester.takeException(), isNull);
  });

  testInBothDirections('is announced as an enabled button', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpKarar(tester, _button(locale), locale: locale);
    expect(
      tester.getSemantics(find.byType(KararButton)),
      isSemantics(
        label: _label(locale),
        isButton: true,
        isEnabled: true,
        hasEnabledState: true,
        hasTapAction: true,
      ),
    );
    handle.dispose();
  });

  testInBothDirections('a disabled button is announced as disabled', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpKarar(tester, KararButton(label: _label(locale), onPressed: null), locale: locale);
    expect(
      tester.getSemantics(find.byType(KararButton)),
      isSemantics(isEnabled: false, hasEnabledState: true),
    );
    handle.dispose();
  });

  testInBothDirections('a loading button announces busy and blocks presses', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    int presses = 0;
    await pumpKarar(
      tester,
      KararButton(label: _label(locale), onPressed: () => presses++, isLoading: true),
      locale: locale,
      settle: false,
    );
    await tester.tap(find.byType(KararButton), warnIfMissed: false);
    await tester.pump();

    expect(presses, 0, reason: 'A busy control must not queue a second call.');
    expect(find.byType(KararLoadingIndicator), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(KararButton)).label,
      _localizations(tester).a11yControlBusy(_label(locale)),
    );
    handle.dispose();
  });

  testInBothDirections('invokes its callback once when pressed', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    int presses = 0;
    await pumpKarar(
      tester,
      KararButton(label: _label(locale), onPressed: () => presses++),
      locale: locale,
    );
    await tester.tap(find.byType(KararButton));
    await tester.pump();
    expect(presses, 1);
  });

  testInBothDirections('every variant renders without overflow', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(
      tester,
      Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          for (final KararButtonVariant variant in KararButtonVariant.values)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: KararButton(label: _label(locale), onPressed: () {}, variant: variant),
            ),
        ],
      ),
      locale: locale,
      textScale: scale,
    );
    expect(find.byType(KararButton), findsNWidgets(4));
    expect(tester.takeException(), isNull);
  }, textScales: testTextScales);

  testInBothDirections('the leading icon sits at the start of the reading order', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(
      tester,
      KararButton(label: _label(locale), onPressed: () {}, icon: KararIcons.check),
      locale: locale,
    );
    final double iconCentre = tester.getCenter(find.byType(Icon)).dx;
    final double labelCentre = tester.getCenter(find.text(_label(locale))).dx;
    if (locale == KararLocalization.arabic) {
      expect(
        iconCentre,
        greaterThan(labelCentre),
        reason: 'Under RTL the leading slot is on the right.',
      );
    } else {
      expect(iconCentre, lessThan(labelCentre));
    }
  });
}

KararButton _button(Locale locale) => KararButton(label: _label(locale), onPressed: () {});

/// Localized copy, so the test proves the delegate resolved rather than
/// asserting on a string the widget was handed.
String _label(Locale locale) => locale == KararLocalization.arabic ? 'متابعة' : 'Continue';

AppLocalizations _localizations(WidgetTester tester) {
  return AppLocalizations.of(tester.element(find.byType(KararButton)));
}
