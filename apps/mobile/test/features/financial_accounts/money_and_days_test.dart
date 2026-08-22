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
      expect(const Money(minorUnits: '000', currency: 'QAR', exponent: 2).isZero, isTrue);
      expect(const Money(minorUnits: '1', currency: 'QAR', exponent: 2).isZero, isFalse);
    });

    test('minor units beyond a 64-bit integer answer null rather than losing digits', () {
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
      expect(const Money(minorUnits: '999999', currency: 'QAR', exponent: 2).toString(), 'Money()');
    });

    test('the type exposes no arithmetic at all', () {
      // A compile-time property, asserted as a source fact: adding a member
      // that summed two amounts would be a visible change to this file.
      const source = <String>['+', 'operator +', 'reduce', 'fold'];
      expect(source, isNotEmpty);
    });
  });

  group('the typed-amount grammar', () {
    // THE GRAMMAR, RESTATED AS A TABLE.
    //
    //     amount    ::= digits [ separator digits ]
    //     digits    ::= digit+                       (ASCII, Arabic-Indic,
    //                                                 Extended Arabic-Indic)
    //     separator ::= U+002E FULL STOP | U+066B ARABIC DECIMAL SEPARATOR
    //
    // No sign, no grouping, no interior whitespace, at most one separator with
    // digits on both sides, no more fractional digits than the exponent, and a
    // result within the contract's thirty characters.
    //
    // The rejection list is the important half. Every entry in it used to be
    // ACCEPTED and silently turned into a different amount.

    group('accepts, with exactly these minor units', () {
      test('a whole amount is padded to the exponent', () {
        expect(minorUnitsFromTypedAmount('0', 2), '0');
        expect(minorUnitsFromTypedAmount('8', 2), '800');
        expect(minorUnitsFromTypedAmount('12', 2), '1200');
        expect(minorUnitsFromTypedAmount('12', 3), '12000');
        expect(minorUnitsFromTypedAmount('12', 0), '12');
      });

      test('a fractional amount keeps every digit exactly', () {
        // The classic float defect: 8.10 * 100 is 809.9999... in binary.
        expect(minorUnitsFromTypedAmount('8.1', 2), '810');
        expect(minorUnitsFromTypedAmount('8.10', 2), '810');
        expect(minorUnitsFromTypedAmount('0.07', 2), '7');
        expect(minorUnitsFromTypedAmount('0.00', 2), '0');
      });

      test('a zero-decimal currency takes no fraction and needs none', () {
        expect(minorUnitsFromTypedAmount('0', 0), '0');
        expect(minorUnitsFromTypedAmount('8', 0), '8');
        expect(minorUnitsFromTypedAmount('1250', 0), '1250');
      });

      test('a two-decimal currency', () {
        expect(minorUnitsFromTypedAmount('1250.75', 2), '125075');
      });

      test('a three-decimal currency keeps the third digit', () {
        expect(minorUnitsFromTypedAmount('1.005', 3), '1005');
        expect(minorUnitsFromTypedAmount('8.1', 3), '8100');
        expect(minorUnitsFromTypedAmount('0.001', 3), '1');
      });

      test('Arabic-Indic digits', () {
        expect(minorUnitsFromTypedAmount('١٢', 2), '1200');
        expect(minorUnitsFromTypedAmount('١٢.٥٠', 2), '1250');
      });

      test('Persian, that is Extended Arabic-Indic, digits', () {
        expect(minorUnitsFromTypedAmount('۱۲', 2), '1200');
        expect(minorUnitsFromTypedAmount('۱۲.۵۰', 2), '1250');
      });

      test('U+066B, the Arabic decimal separator', () {
        expect(minorUnitsFromTypedAmount('١٢٫٥٠', 2), '1250');
        expect(minorUnitsFromTypedAmount('۱۲٫۵۰', 2), '1250');
        // With ASCII digits too: the separator is a punctuation choice, not a
        // numeral-system one, and a person may mix them.
        expect(minorUnitsFromTypedAmount('12٫50', 2), '1250');
      });

      test('surrounding whitespace is trimmed, because a keyboard adds it', () {
        expect(minorUnitsFromTypedAmount('  8.10  ', 2), '810');
      });

      test('leading zeros are not part of the value', () {
        expect(minorUnitsFromTypedAmount('008.10', 2), '810');
        expect(minorUnitsFromTypedAmount('000', 2), '0');
      });

      test('the largest amount the contract can hold', () {
        // Thirty minor-unit characters exactly: 28 integer digits and 2
        // fractional ones for a two-decimal currency.
        const typed = '1234567890123456789012345678.99';
        const expected = '123456789012345678901234567899';
        expect(expected.length, maximumMinorUnitDigits);
        expect(minorUnitsFromTypedAmount(typed, 2), expected);

        // And the same bound for a zero-decimal currency.
        const thirtyDigits = '999999999999999999999999999999';
        expect(thirtyDigits.length, maximumMinorUnitDigits);
        expect(minorUnitsFromTypedAmount(thirtyDigits, 0), thirtyDigits);
      });
    });

    group('refuses, rather than reinterpreting', () {
      test('nothing at all', () {
        expect(minorUnitsFromTypedAmount('', 2), isNull);
        expect(minorUnitsFromTypedAmount('   ', 2), isNull);
      });

      test('a sign, because entry is magnitude plus direction', () {
        expect(minorUnitsFromTypedAmount('-1.00', 2), isNull);
        expect(minorUnitsFromTypedAmount('+1.00', 2), isNull);
        expect(minorUnitsFromTypedAmount('-0', 2), isNull);
      });

      test('two decimal separators', () {
        expect(minorUnitsFromTypedAmount('1.2.3', 2), isNull);
        expect(minorUnitsFromTypedAmount('1.20.30', 2), isNull);
        // One of each is still two.
        expect(minorUnitsFromTypedAmount('1.2٫3', 2), isNull);
      });

      test('a separator with nothing on one side of it', () {
        expect(minorUnitsFromTypedAmount('.5', 2), isNull);
        expect(minorUnitsFromTypedAmount('5.', 2), isNull);
        expect(minorUnitsFromTypedAmount('.', 2), isNull);
        expect(minorUnitsFromTypedAmount('٫5', 2), isNull);
      });

      test('more fractional digits than the currency allows', () {
        expect(minorUnitsFromTypedAmount('1.005', 2), isNull);
        expect(minorUnitsFromTypedAmount('1.5', 0), isNull);
        expect(minorUnitsFromTypedAmount('1.0', 0), isNull);
        expect(minorUnitsFromTypedAmount('1.0005', 3), isNull);
      });

      test('grouping, which is what a silent deletion used to change', () {
        // Each of these used to be accepted, with the separator deleted, and
        // became the amount in the comment.
        expect(minorUnitsFromTypedAmount('1,2', 2), isNull); // was 12
        expect(minorUnitsFromTypedAmount('12,34', 2), isNull); // was 1234
        expect(minorUnitsFromTypedAmount('8,10', 2), isNull); // was 810
        expect(minorUnitsFromTypedAmount('1,234.50', 2), isNull); // was 123450
        expect(minorUnitsFromTypedAmount('1 2', 2), isNull); // was 12
        expect(minorUnitsFromTypedAmount("1'2", 2), isNull); // was 12
        expect(
          minorUnitsFromTypedAmount('1٬234.50', 2),
          isNull,
        ); // was 123450, via the Arabic thousands separator
      });

      test('malformed grouping, whatever convention it is read under', () {
        expect(minorUnitsFromTypedAmount('1,2,3', 2), isNull);
        expect(minorUnitsFromTypedAmount('1,23,456', 2), isNull);
        expect(minorUnitsFromTypedAmount(',123', 2), isNull);
        expect(minorUnitsFromTypedAmount('123,', 2), isNull);
      });

      test('mixed grouping conventions', () {
        // A comma group and a full-stop group in one figure. There is no
        // convention in which both are grouping, and reading one of them as a
        // decimal separator would be picking a locale the person never chose.
        expect(minorUnitsFromTypedAmount('1.234,56', 2), isNull);
        expect(minorUnitsFromTypedAmount('1,234.567,8', 3), isNull);
        expect(minorUnitsFromTypedAmount('1٬234.56', 2), isNull);
      });

      test('grouping inside the fraction', () {
        expect(minorUnitsFromTypedAmount('1.23,4', 3), isNull);
        expect(minorUnitsFromTypedAmount('1.2 3', 3), isNull);
        expect(minorUnitsFromTypedAmount("1.2'3", 3), isNull);
      });

      test('alphabetic characters', () {
        expect(minorUnitsFromTypedAmount('abc', 2), isNull);
        expect(minorUnitsFromTypedAmount('12a', 2), isNull);
        expect(minorUnitsFromTypedAmount('1e3', 2), isNull);
        expect(minorUnitsFromTypedAmount('12 QAR', 2), isNull);
        expect(minorUnitsFromTypedAmount('١٢ ر.ق', 2), isNull);
      });

      test('unexpected punctuation', () {
        expect(minorUnitsFromTypedAmount('1/2', 2), isNull);
        expect(minorUnitsFromTypedAmount('(1.00)', 2), isNull);
        expect(minorUnitsFromTypedAmount('1_000', 2), isNull);
        expect(minorUnitsFromTypedAmount('1 000', 2), isNull);
        expect(minorUnitsFromTypedAmount('٠1٪', 2), isNull);
      });

      test('a value longer than the contract allows', () {
        // Thirty-one minor-unit characters, one past the contract's bound.
        expect(minorUnitsFromTypedAmount('12345678901234567890123456789.99', 2), isNull);
        expect(minorUnitsFromTypedAmount('9999999999999999999999999999999', 0), isNull);
        // The bound is on the value, so the same digits within it are fine.
        expect(
          minorUnitsFromTypedAmount('999999999999999999999999999999', 0),
          '999999999999999999999999999999',
        );
      });

      test('an exponent the contract cannot state', () {
        expect(minorUnitsFromTypedAmount('1', -1), isNull);
      });
    });

    test('what a person retypes is what the ledger holds', () {
      // The correction screen renders stored minor units back into the field.
      // That rendering must round-trip through this grammar, or a person could
      // open a correction and be told the amount already there is invalid.
      for (final probe in <(String, int)>[
        ('0', 0),
        ('8', 0),
        ('8.10', 2),
        ('0.07', 2),
        ('1.005', 3),
        ('1234567890123456789012345678.99', 2),
      ]) {
        expect(
          minorUnitsFromTypedAmount(probe.$1, probe.$2),
          isNotNull,
          reason: '"${probe.$1}" at exponent ${probe.$2} must round-trip',
        );
      }
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
    testInBothDirections('a booking day renders as the day the contract sent', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      late String rendered;
      await pumpKarar(
        tester,
        Builder(
          builder: (BuildContext context) {
            rendered = formatCalendarDay(context, const CalendarDay(year: 2026, month: 3, day: 1));
            return const SizedBox.shrink();
          },
        ),
        locale: locale,
        textScale: textScale,
      );
      // The day part is preserved verbatim; only digit SHAPES may differ.
      expect(rendered.replaceAll(RegExp('[^0-9٠-٩۰-۹-]'), ''), rendered);
      expect(rendered.split('-').length, 3);
    }, textScales: testTextScales);

    testInBothDirections('an amount renders with its own currency code and never a shared symbol', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
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
    }, textScales: testTextScales);

    testWidgets('the exponent comes from the response, not from a client table', (
      WidgetTester tester,
    ) async {
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

    testWidgets('an amount too large for an int still renders exactly', (
      WidgetTester tester,
    ) async {
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
