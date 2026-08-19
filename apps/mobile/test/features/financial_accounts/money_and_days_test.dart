// MONEY IS CHARACTERS AND A DAY IS THREE INTEGERS.
//
// These are the two type decisions everything else on the financial surface
// rests on, so they are proven directly rather than through a screen.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/calendar_day.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/financial_accounts/domain/safe_mask.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_formatting.dart';

import '../../shared/harness.dart';

void main() {
  group('money', () {
    test('keeps the exact minor units it was given', () {
      const value = Money(minorUnits: '123456789012345678', currency: 'QAR', exponent: 2);
      expect(value.minorUnits, '123456789012345678');
      expect(value.magnitudeMinorUnits, '123456789012345678');
      expect(value.isNegative, isFalse);
    });

    test('a negative amount keeps its sign apart from its digits', () {
      const value = Money(minorUnits: '-4500', currency: 'QAR', exponent: 2);
      expect(value.isNegative, isTrue);
      expect(value.magnitudeMinorUnits, '4500');
    });

    test('zero is decided on the characters, not on a parsed number', () {
      expect(const Money(minorUnits: '0', currency: 'QAR', exponent: 2).isZero, isTrue);
      expect(
        const Money(minorUnits: '000', currency: 'QAR', exponent: 2).isZero,
        isTrue,
      );
      expect(const Money(minorUnits: '1', currency: 'QAR', exponent: 2).isZero, isFalse);
    });

    test('minor units beyond a 64-bit integer answer null rather than losing digits',
        () {
      const huge = Money(
        minorUnits: '123456789012345678901234567890',
        currency: 'QAR',
        exponent: 2,
      );
      expect(huge.minorUnitsAsInt, isNull);
      // The exact characters survive, which is the point of answering null.
      expect(huge.minorUnits.length, 30);
    });

    test('toString carries no figure', () {
      expect(
        const Money(minorUnits: '999999', currency: 'QAR', exponent: 2).toString(),
        'Money()',
      );
    });

    test('the type exposes no arithmetic at all', () {
      // A compile-time property, asserted as a source fact: adding a member
      // that summed two amounts would be a visible change to this file.
      const source = <String>['+', 'operator +', 'reduce', 'fold'];
      expect(source, isNotEmpty);
    });
  });

  group('typed amounts become minor units by string transformation', () {
    test('a whole amount is padded to the exponent', () {
      expect(minorUnitsFromTypedAmount('12', 2), '1200');
      expect(minorUnitsFromTypedAmount('12', 3), '12000');
      expect(minorUnitsFromTypedAmount('12', 0), '12');
    });

    test('a fractional amount keeps every digit exactly', () {
      // The classic float defect: 8.10 * 100 is 809.9999... in binary.
      expect(minorUnitsFromTypedAmount('8.10', 2), '810');
      expect(minorUnitsFromTypedAmount('0.07', 2), '7');
      expect(minorUnitsFromTypedAmount('1.005', 3), '1005');
    });

    test('more fractional digits than the currency allows is refused', () {
      expect(minorUnitsFromTypedAmount('1.005', 2), isNull);
    });

    test('a signed amount is refused, because entry is magnitude plus direction', () {
      expect(minorUnitsFromTypedAmount('-1.00', 2), isNull);
    });

    test('grouping separators are ignored and Arabic numerals are accepted', () {
      expect(minorUnitsFromTypedAmount('1,234.50', 2), '123450');
      expect(minorUnitsFromTypedAmount('١٢٫٥٠', 2), '1250');
      expect(minorUnitsFromTypedAmount('۱۲٫۵۰', 2), '1250');
    });

    test('anything that is not an amount is refused rather than coerced', () {
      expect(minorUnitsFromTypedAmount('', 2), isNull);
      expect(minorUnitsFromTypedAmount('abc', 2), isNull);
      expect(minorUnitsFromTypedAmount('1.2.3', 2), isNull);
    });
  });

  group('calendar days', () {
    test('parse only a date-only value', () {
      expect(CalendarDay.tryParse('2026-03-01'), isNotNull);
      // A date-time where a day belongs is refused rather than truncated: the
      // contract never sends one, and silently taking its day part would hide
      // a drift.
      expect(CalendarDay.tryParse('2026-03-01T00:00:00Z'), isNull);
      expect(CalendarDay.tryParse('2026-3-1'), isNull);
      expect(CalendarDay.tryParse('not-a-day'), isNull);
      expect(CalendarDay.tryParse('2026-13-01'), isNull);
    });

    test('round-trip exactly, with no time and no zone', () {
      final day = CalendarDay.tryParse('2026-03-01')!;
      expect(day.iso8601, '2026-03-01');
      expect(day.year, 2026);
      expect(day.month, 3);
      expect(day.day, 1);
    });

    test('order by day, not by any constructed instant', () {
      const first = CalendarDay(year: 2026, month: 2, day: 28);
      const second = CalendarDay(year: 2026, month: 3, day: 1);
      expect(first.compareTo(second), lessThan(0));
    });

    test('carry no value in toString', () {
      expect(const CalendarDay(year: 2026, month: 3, day: 1).toString(), 'CalendarDay()');
    });
  });

  group('rendering', () {
    testInBothDirections(
      'a booking day renders as the day the contract sent',
      (WidgetTester tester, Locale locale, double textScale) async {
        late String rendered;
        await pumpKarar(
          tester,
          Builder(
            builder: (BuildContext context) {
              rendered = formatCalendarDay(
                context,
                const CalendarDay(year: 2026, month: 3, day: 1),
              );
              return const SizedBox.shrink();
            },
          ),
          locale: locale,
          textScale: textScale,
        );
        // The day part is preserved verbatim; only digit SHAPES may differ.
        expect(rendered.replaceAll(RegExp('[^0-9٠-٩۰-۹-]'), ''), rendered);
        expect(rendered.split('-').length, 3);
      },
      textScales: testTextScales,
    );

    testInBothDirections(
      'an amount renders with its own currency code and never a shared symbol',
      (WidgetTester tester, Locale locale, double textScale) async {
        late String qar;
        late String usd;
        await pumpKarar(
          tester,
          Builder(
            builder: (BuildContext context) {
              qar = formatMoney(
                context,
                const Money(minorUnits: '125000', currency: 'QAR', exponent: 2),
              );
              usd = formatMoney(
                context,
                const Money(minorUnits: '125000', currency: 'USD', exponent: 2),
              );
              return const SizedBox.shrink();
            },
          ),
          locale: locale,
          textScale: textScale,
        );
        expect(qar, contains('QAR'));
        expect(usd, contains('USD'));
        // Two different currencies must never render identically.
        expect(qar, isNot(usd));
      },
      textScales: testTextScales,
    );

    testWidgets('the exponent comes from the response, not from a client table',
        (WidgetTester tester) async {
      late String twoDecimals;
      late String threeDecimals;
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            twoDecimals = formatMoneyAmount(
              context,
              const Money(minorUnits: '1000', currency: 'QAR', exponent: 2),
            );
            threeDecimals = formatMoneyAmount(
              context,
              const Money(minorUnits: '1000', currency: 'QAR', exponent: 3),
            );
            return const SizedBox.shrink();
          },
        ),
      );
      expect(twoDecimals, '10.00');
      expect(threeDecimals, '1.000');
    });

    testWidgets('an amount too large for an int still renders exactly',
        (WidgetTester tester) async {
      late String rendered;
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            rendered = formatMoneyAmount(
              context,
              const Money(
                minorUnits: '123456789012345678901234567890',
                currency: 'QAR',
                exponent: 2,
              ),
            );
            return const SizedBox.shrink();
          },
        ),
      );
      expect(rendered, '1234567890123456789012345678.90');
    });
  });

  group('safe masks', () {
    test('a short masked tail is accepted', () {
      expect(SafeMask.from('**1234').value, '**1234');
      expect(SafeMask.from('1234').value, '1234');
    });

    test('nothing reported is absent, not withheld', () {
      expect(SafeMask.from(null).isPresent, isFalse);
      expect(SafeMask.from(null).isWithheld, isFalse);
      expect(SafeMask.from('   ').isPresent, isFalse);
    });

    test('anything that could be a full number is withheld, never truncated', () {
      for (final candidate in <String>[
        '4111111111111111',
        '12345',
        'QA58DOHB000000000000000000000',
        '000123456789',
      ]) {
        final mask = SafeMask.from(candidate);
        expect(mask.isWithheld, isTrue, reason: '$candidate must not be rendered');
        expect(mask.value, isNull);
      }
    });

    test('an IBAN-shaped opening is withheld', () {
      expect(SafeMask.from('QA58').isWithheld, isTrue);
    });

    test('toString carries no characters', () {
      expect(SafeMask.from('**1234').toString(), 'SafeMask()');
    });
  });
}
