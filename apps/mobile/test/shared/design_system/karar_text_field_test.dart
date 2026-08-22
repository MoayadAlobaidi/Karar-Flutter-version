import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

void main() {
  testInBothDirections('renders label, hint and helper text', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(
      tester,
      const KararTextField(
        label: 'Email address',
        hint: 'name@example.com',
        helperText: 'We use this to sign you in.',
      ),
      locale: locale,
      textScale: scale,
    );
    expect(find.text('Email address'), findsOneWidget);
    expect(find.text('name@example.com'), findsOneWidget);
    expect(find.text('We use this to sign you in.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  }, textScales: testTextScales);

  testInBothDirections('text is aligned to the start, never to the left', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(tester, const KararTextField(label: 'Full name'), locale: locale);
    final TextField field = tester.widget(find.byType(TextField));
    expect(field.textAlign, TextAlign.start);
    expect(
      directionOf(tester, find.byType(KararTextField)),
      locale == KararLocalization.arabic ? TextDirection.rtl : TextDirection.ltr,
    );
  });

  testInBothDirections('the label is announced as required', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpKarar(
      tester,
      const KararTextField(label: 'Full name', isRequired: true),
      locale: locale,
    );
    final AppLocalizations l10n = AppLocalizations.of(tester.element(find.byType(KararTextField)));
    expect(
      find.bySemanticsLabel(l10n.a11yFieldWithRequired('Full name')),
      findsOneWidget,
      reason: 'A red asterisk is invisible to a screen reader.',
    );
    handle.dispose();
  });

  testInBothDirections('an error is published as a live region', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpKarar(
      tester,
      const KararTextField(label: 'Email address', errorText: 'Enter a valid email address.'),
      locale: locale,
    );
    expect(
      tester.getSemantics(find.text('Enter a valid email address.')),
      isSemantics(isLiveRegion: true),
      reason:
          'A field that turns red without announcing anything is silent to a '
          'screen reader.',
    );
    handle.dispose();
  });

  testInBothDirections('the error replaces the helper text', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(
      tester,
      const KararTextField(
        label: 'Email address',
        helperText: 'We use this to sign you in.',
        errorText: 'Enter a valid email address.',
      ),
      locale: locale,
    );
    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(find.text('We use this to sign you in.'), findsNothing);
  });

  testInBothDirections('the obscure toggle names what it will do', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpKarar(
      tester,
      const KararTextField(label: 'Password', obscureText: true),
      locale: locale,
    );
    final AppLocalizations l10n = AppLocalizations.of(tester.element(find.byType(KararTextField)));
    expect(find.bySemanticsLabel(l10n.fieldShowValue('Password')), findsOneWidget);

    await tester.tap(find.bySemanticsLabel(l10n.fieldShowValue('Password')));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel(l10n.fieldHideValue('Password')), findsOneWidget);
    handle.dispose();
  });

  testInBothDirections('Arabic-Indic digits typed into a numeric field are normalised', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final TextEditingController controller = TextEditingController();
    addTearDown(controller.dispose);
    await pumpKarar(
      tester,
      KararTextField(
        label: 'Verification code',
        controller: controller,
        keyboardType: TextInputType.number,
        normalizeArabicDigits: true,
      ),
      locale: locale,
    );

    await tester.enterText(find.byType(TextField), '١٢٣٤٥٦');
    await tester.pump();

    expect(
      controller.text,
      '123456',
      reason:
          'An Arabic keyboard emits U+0660..U+0669. A code typed that way must '
          'not fail validation for a reason the user cannot see.',
    );
  });

  testInBothDirections('the character counter is localized', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(tester, const KararTextField(label: 'Nickname', maxLength: 20), locale: locale);
    final AppLocalizations l10n = AppLocalizations.of(tester.element(find.byType(KararTextField)));
    expect(find.text(l10n.fieldCharacterCount(0, 20)), findsOneWidget);
  });

  testInBothDirections('a disabled field is not editable', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    await pumpKarar(
      tester,
      const KararTextField(label: 'Full name', isEnabled: false),
      locale: locale,
    );
    final TextField field = tester.widget(find.byType(TextField));
    expect(field.enabled, isFalse);
  });

  testInBothDirections('the clear action empties the field', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    final TextEditingController controller = TextEditingController();
    addTearDown(controller.dispose);
    await pumpKarar(
      tester,
      KararTextField(label: 'Search', controller: controller, showClearAction: true),
      locale: locale,
    );
    await tester.enterText(find.byType(TextField), 'Doha');
    await tester.pumpAndSettle();

    final AppLocalizations l10n = AppLocalizations.of(tester.element(find.byType(KararTextField)));
    await tester.tap(find.bySemanticsLabel(l10n.fieldClear('Search')));
    await tester.pumpAndSettle();

    expect(controller.text, isEmpty);
  });

  test('the input formatter also handles extended Arabic-Indic digits', () {
    const ArabicDigitInputFormatter formatter = ArabicDigitInputFormatter();
    final TextEditingValue result = formatter.formatEditUpdate(
      TextEditingValue.empty,
      const TextEditingValue(text: '۰۱۲۳', selection: TextSelection.collapsed(offset: 4)),
    );
    expect(result.text, '0123');
    expect(result.selection.baseOffset, 4);
  });
}
