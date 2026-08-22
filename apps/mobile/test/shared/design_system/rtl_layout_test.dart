import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

/// Layout invariants that hold across the whole system rather than inside one
/// component.
void main() {
  test('the localization facade resolves deterministically', () {
    const List<Locale> supported = <Locale>[KararLocalization.english, KararLocalization.arabic];
    expect(KararLocalization.resolve(const Locale('ar'), supported), KararLocalization.arabic);
    expect(
      KararLocalization.resolve(const Locale('ar', 'QA'), supported),
      KararLocalization.arabic,
      reason: 'Country is not a translation boundary; language is.',
    );
    expect(
      KararLocalization.resolve(const Locale('en', 'US'), supported),
      KararLocalization.english,
    );
    expect(
      KararLocalization.resolve(const Locale('fr'), supported),
      KararLocalization.fallbackLocale,
      reason:
          'An unsupported language must land somewhere stated, not wherever '
          'the framework happens to order the list.',
    );
    expect(KararLocalization.resolve(null, supported), KararLocalization.fallbackLocale);
  });

  test('direction is derived from the locale, not configured per screen', () {
    expect(KararLocalization.directionOf(KararLocalization.arabic), TextDirection.rtl);
    expect(KararLocalization.directionOf(KararLocalization.english), TextDirection.ltr);
  });

  testInBothDirections('the framework applies the direction the locale implies', (
    WidgetTester tester,
    Locale locale,
    double scale,
  ) async {
    late TextDirection observed;
    await pumpKarar(
      tester,
      Builder(
        builder: (BuildContext context) {
          observed = context.direction;
          return const SizedBox.shrink();
        },
      ),
      locale: locale,
    );
    expect(observed, KararLocalization.directionOf(locale));
  });

  testWidgets('directional padding actually flips between the two locales', (
    WidgetTester tester,
  ) async {
    const Key marker = Key('inset-probe');
    Widget probe() => SizedBox(
      width: 200,
      child: Row(
        children: <Widget>[
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 40),
            child: SizedBox(key: marker, width: 20, height: 20),
          ),
        ],
      ),
    );

    await pumpKarar(tester, probe());
    final double ltrLeftEdge = tester.getTopLeft(find.byKey(marker)).dx;

    await pumpKarar(tester, probe(), locale: KararLocalization.arabic);
    final double rtlLeftEdge = tester.getTopLeft(find.byKey(marker)).dx;

    expect(
      rtlLeftEdge,
      greaterThan(ltrLeftEdge),
      reason:
          'A start inset pushes content away from the left edge in English and '
          'away from the right edge in Arabic. If these matched, the inset was '
          'not directional.',
    );
  });

  group('mixed-direction text', () {
    test('paragraph direction follows the first strong character', () {
      expect(KararBidiText.directionOf('Karar', TextDirection.rtl), TextDirection.ltr);
      expect(KararBidiText.directionOf('قرار', TextDirection.ltr), TextDirection.rtl);
      expect(
        KararBidiText.directionOf('قرار Karar', TextDirection.ltr),
        TextDirection.rtl,
        reason: 'A mixed string takes the direction of its first strong run.',
      );
    });

    test('a string with no strong character inherits the ambient direction', () {
      expect(KararBidiText.directionOf('2026-08-16', TextDirection.rtl), TextDirection.rtl);
      expect(KararBidiText.directionOf('2026-08-16', TextDirection.ltr), TextDirection.ltr);
    });

    testInBothDirections(
      'server-supplied text renders in its own direction, not the interface one',
      (WidgetTester tester, Locale locale, double scale) async {
        // Stands in for a legal document the platform returned in Arabic while
        // the interface is in English, or the reverse. Nothing is translated
        // on the device.
        await pumpKarar(
          tester,
          const KararBidiText('شروط الاستخدام'),
          locale: locale,
          textScale: scale,
        );
        expect(directionOf(tester, find.text('شروط الاستخدام')), TextDirection.rtl);
      },
      textScales: testTextScales,
    );
  });
}
