import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:karar_mobile/shared/shared.dart';

/// The formatter is pure: it renders values it is handed and derives nothing.
/// The integers below are formatter inputs, not product data — no balance,
/// account or transaction is represented anywhere in this suite.
void main() {
  setUpAll(initializeDateFormatting);

  const KararFormatter english = KararFormatter(locale: Locale('en'));
  const KararFormatter arabic = KararFormatter(locale: Locale('ar'));

  group('numbers', () {
    test('English uses Western digits and grouping', () {
      expect(english.integer(1234567), '1,234,567');
    });

    test('Arabic follows its CLDR data, which is Western digits', () {
      expect(
        arabic.integer(1234567),
        '1,234,567',
        reason:
            'CLDR gives bare "ar" the latn numbering system; only region '
            'variants such as ar_EG default to Arabic-Indic. This is also the '
            'Gulf banking convention.',
      );
      expect(ArabicNumerals.containsArabicIndicDigits(arabic.integer(1)), isFalse);
    });

    test('Arabic-Indic digits are available as an explicit product choice', () {
      const KararFormatter arabicIndic = KararFormatter(
        locale: Locale('ar'),
        numerals: KararNumeralSystem.arabicIndic,
      );
      expect(
        arabicIndic.integer(1234567),
        '\u0661\u066C\u0662\u0663\u0664\u066C\u0665\u0666\u0667',
      );
    });

    test('the numeral system can be forced without changing the locale', () {
      const KararFormatter western = KararFormatter(
        locale: Locale('ar'),
        numerals: KararNumeralSystem.western,
      );
      expect(western.integer(1234567), '1,234,567');
    });

    test('a scaled integer keeps its exact fractional digits', () {
      expect(english.scaled(1234567, 2), '12,345.67');
      expect(english.scaled(5, 2), '0.05');
      expect(english.scaled(-1234567, 2), '-12,345.67');
    });

    test('basis points render as a percentage without floating point', () {
      expect(english.percentFromBasisPoints(2550), '25.5%');
      expect(english.percentFromBasisPoints(2550, fractionDigits: 0), '26%');
      expect(english.percentFromBasisPoints(0), '0.0%');
    });
  });

  group('currency', () {
    test('the ISO exponent decides the decimal places', () {
      expect(KararFormatter.currencyExponentFor('QAR'), 2);
      expect(KararFormatter.currencyExponentFor('KWD'), 3);
      expect(KararFormatter.currencyExponentFor('BHD'), 3);
      expect(KararFormatter.currencyExponentFor('OMR'), 3);
      expect(KararFormatter.currencyExponentFor('JPY'), 0);
      expect(
        KararFormatter.currencyExponentFor('ZZZ'),
        2,
        reason: 'Two places is the ISO 4217 default for anything unlisted.',
      );
    });

    test('a two-decimal currency renders with two places', () {
      expect(english.money(1234567, 'QAR'), 'QAR\u00A012,345.67');
    });

    test('a three-decimal currency renders with three places', () {
      expect(
        english.money(1234567, 'KWD'),
        'KWD\u00A01,234.567',
        reason:
            'Treating a three-decimal currency as two moves the decimal point '
            'by a factor of ten.',
      );
    });

    test('a zero-decimal currency renders with none', () {
      expect(english.money(1234567, 'JPY'), 'JPY\u00A01,234,567');
    });

    test('the currency follows the amount under Arabic', () {
      expect(
        arabic.money(1234567, 'QAR'),
        '12,345.67\u00A0QAR',
        reason: 'CLDR places the currency after the amount in Arabic.',
      );
    });

    test('the currency precedes the amount under English', () {
      expect(english.money(0, 'QAR').startsWith('QAR'), isTrue);
    });

    test('a negative amount keeps its sign', () {
      expect(english.money(-1234567, 'QAR'), 'QAR\u00A0-12,345.67');
    });

    test('the code is used verbatim, never a shared short symbol', () {
      expect(english.currencyDisplayFor('qar'), 'QAR');
      expect(english.currencyDisplayFor('SAR'), 'SAR');
      expect(
        english.currencyDisplayFor('QAR'),
        isNot(english.currencyDisplayFor('SAR')),
        reason:
            'The available symbol data renders both QAR and SAR as "Riyal". '
            'Two currencies that look identical is a defect, not a nicety.',
      );
    });
  });

  group('dates', () {
    final DateTime moment = DateTime(2026, 8, 16, 14, 30);

    test('English renders a medium date', () {
      expect(english.date(moment), 'Aug 16, 2026');
    });

    test('Arabic renders the same instant with Arabic month names', () {
      final String formatted = arabic.date(moment);
      expect(formatted, isNot(english.date(moment)));
      expect(
        formatted.contains(RegExp(r'[\u0600-\u06FF]')),
        isTrue,
        reason: 'The month name is translated even though the digits are not.',
      );
    });

    test('the numeric date follows the locale order', () {
      expect(english.dateNumeric(moment), '8/16/2026');
    });

    test('date and time compose in one locale-aware call', () {
      expect(english.dateTime(moment), contains('2026'));
      expect(english.dateTime(moment), contains('2:30'));
    });

    test('a forced numeral system also applies to dates', () {
      const KararFormatter arabicIndic = KararFormatter(
        locale: Locale('ar'),
        numerals: KararNumeralSystem.arabicIndic,
      );
      expect(ArabicNumerals.containsArabicIndicDigits(arabicIndic.date(moment)), isTrue);
    });
  });

  group('direction', () {
    test('the formatter knows its own reading direction', () {
      expect(arabic.isRightToLeft, isTrue);
      expect(english.isRightToLeft, isFalse);
    });
  });
}
