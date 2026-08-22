import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/shared/shared.dart';

void main() {
  group('normalising input for parsing', () {
    test('Arabic-Indic digits become ASCII', () {
      expect(ArabicNumerals.normalizeForParsing('١٢٣٤٥٦٧٨٩٠'), '1234567890');
    });

    test('extended Arabic-Indic digits become ASCII', () {
      expect(ArabicNumerals.normalizeForParsing('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
    });

    test('the Arabic decimal separator becomes a full stop', () {
      expect(ArabicNumerals.normalizeForParsing('١٢٫٥'), '12.5');
    });

    test('the Arabic thousands separator is dropped', () {
      expect(ArabicNumerals.normalizeForParsing('١٬٢٣٤'), '1234');
    });

    test('the Arabic comma is treated as a decimal separator', () {
      expect(ArabicNumerals.normalizeForParsing('١٢،٥'), '12.5');
    });

    test('invisible bidi marks are removed', () {
      expect(
        ArabicNumerals.normalizeForParsing('‏123‎'),
        '123',
        reason:
            'A right-to-left mark copied in with a number would otherwise make '
            'int.parse fail on input that looks correct.',
      );
    });

    test('the result parses', () {
      expect(int.parse(ArabicNumerals.normalizeForParsing('١٢٣٤٥٦')), 123456);
    });

    test('ASCII input is returned unchanged', () {
      expect(ArabicNumerals.normalizeForParsing('123456'), '123456');
    });

    test('non-numeric text is untouched', () {
      expect(ArabicNumerals.normalizeForParsing('قرار'), 'قرار');
    });
  });

  group('digit shaping', () {
    test('ASCII digits can be rendered as Arabic-Indic', () {
      expect(ArabicNumerals.toArabicIndic('2026'), '٢٠٢٦');
    });

    test('Arabic-Indic digits can be rendered as ASCII', () {
      expect(ArabicNumerals.toWestern('٢٠٢٦'), '2026');
    });

    test('separators convert alongside the digits', () {
      expect(ArabicNumerals.toWestern('١٬٢٣٤٫٥'), '1,234.5');
    });

    test('surrounding text survives conversion', () {
      expect(
        ArabicNumerals.toWestern('الرقم ٢٠٢٦'),
        'الرقم 2026',
        reason: 'Only digits change; the Arabic script around them does not.',
      );
    });

    test('detection distinguishes the two digit sets', () {
      expect(ArabicNumerals.containsArabicIndicDigits('٢٠٢٦'), isTrue);
      expect(ArabicNumerals.containsArabicIndicDigits('2026'), isFalse);
    });

    test('applying a system is a no-op when the locale already decided', () {
      expect(
        ArabicNumerals.applySystem('٢٠٢٦', KararNumeralSystem.locale),
        '٢٠٢٦',
      );
      expect(
        ArabicNumerals.applySystem('٢٠٢٦', KararNumeralSystem.western),
        '2026',
      );
      expect(
        ArabicNumerals.applySystem('2026', KararNumeralSystem.arabicIndic),
        '٢٠٢٦',
      );
    });
  });
}
