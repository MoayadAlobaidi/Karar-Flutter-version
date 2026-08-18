/// Which digit shapes a formatted string uses.
enum KararNumeralSystem {
  /// Whatever the locale's CLDR data specifies.
  ///
  /// For the two locales this product ships that is Western digits in both:
  /// CLDR's default numbering system for bare `ar` is `latn`, and only
  /// region-specific Arabic locales such as `ar_EG` default to `arab`. This is
  /// also the Gulf banking convention, so it is a correct default rather than a
  /// tolerated one — but it is a product decision, so [arabicIndic] exists to
  /// reverse it in one place.
  locale,

  /// Force `0-9` regardless of locale.
  western,

  /// Force `٠-٩` regardless of locale.
  arabicIndic,
}

/// Digit and separator conversion for Arabic input and output.
///
/// Input is normalised on every numeric field: a user typing on an Arabic
/// keyboard produces `٠-٩` (U+0660..U+0669) or, on some Persian and Urdu
/// layouts, `۰-۹` (U+06F0..U+06F9), and `int.parse` rejects both. Parsing has
/// to accept what the keyboard actually emits.
abstract final class ArabicNumerals {
  static const int _arabicIndicZero = 0x0660;
  static const int _extendedArabicIndicZero = 0x06F0;
  static const int _asciiZero = 0x30;

  /// U+066B ARABIC DECIMAL SEPARATOR.
  static const String arabicDecimalSeparator = '٫';

  /// U+066C ARABIC THOUSANDS SEPARATOR.
  static const String arabicThousandsSeparator = '٬';

  /// Rewrites [input] so it can be parsed by `int.parse` or `double.parse`:
  /// Arabic-Indic and extended Arabic-Indic digits become ASCII, the Arabic
  /// decimal separator becomes `.`, and the Arabic thousands separator and
  /// Unicode bidi control characters are removed.
  static String normalizeForParsing(String input) {
    final StringBuffer buffer = StringBuffer();
    for (final int rune in input.runes) {
      if (rune >= _arabicIndicZero && rune <= _arabicIndicZero + 9) {
        buffer.writeCharCode(_asciiZero + (rune - _arabicIndicZero));
      } else if (rune >= _extendedArabicIndicZero &&
          rune <= _extendedArabicIndicZero + 9) {
        buffer.writeCharCode(_asciiZero + (rune - _extendedArabicIndicZero));
      } else if (rune == 0x066B || rune == 0x060C) {
        // Arabic decimal separator, and the Arabic comma some keyboards emit
        // in its place.
        buffer.write('.');
      } else if (rune == 0x066C || _isBidiControl(rune)) {
        // Grouping separators and invisible bidi marks carry no value.
        continue;
      } else {
        buffer.writeCharCode(rune);
      }
    }
    return buffer.toString();
  }

  /// Rewrites every ASCII digit in [input] as Arabic-Indic, and the ASCII
  /// separators between two digits as their Arabic equivalents.
  ///
  /// A separator is only converted when it sits between digits, so ordinary
  /// punctuation in surrounding prose is left alone.
  static String toArabicIndic(String input) {
    final List<int> runes = input.runes.toList();
    final StringBuffer buffer = StringBuffer();
    for (int index = 0; index < runes.length; index++) {
      final int rune = runes[index];
      if (_isAsciiDigit(rune)) {
        buffer.writeCharCode(_arabicIndicZero + (rune - _asciiZero));
      } else if ((rune == 0x2E || rune == 0x2C) &&
          index > 0 &&
          index + 1 < runes.length &&
          _isAsciiDigit(runes[index - 1]) &&
          _isAsciiDigit(runes[index + 1])) {
        buffer.writeCharCode(rune == 0x2E ? 0x066B : 0x066C);
      } else {
        buffer.writeCharCode(rune);
      }
    }
    return buffer.toString();
  }

  /// Rewrites every Arabic-Indic digit in [input] as ASCII, and the Arabic
  /// separators as their ASCII equivalents. Non-digit characters, including the
  /// currency symbol and any Arabic text, are untouched.
  static String toWestern(String input) {
    final StringBuffer buffer = StringBuffer();
    for (final int rune in input.runes) {
      if (rune >= _arabicIndicZero && rune <= _arabicIndicZero + 9) {
        buffer.writeCharCode(_asciiZero + (rune - _arabicIndicZero));
      } else if (rune >= _extendedArabicIndicZero &&
          rune <= _extendedArabicIndicZero + 9) {
        buffer.writeCharCode(_asciiZero + (rune - _extendedArabicIndicZero));
      } else if (rune == 0x066B) {
        buffer.write('.');
      } else if (rune == 0x066C) {
        buffer.write(',');
      } else {
        buffer.writeCharCode(rune);
      }
    }
    return buffer.toString();
  }

  /// Whether [input] contains at least one Arabic-Indic digit.
  static bool containsArabicIndicDigits(String input) {
    return input.runes.any(
      (int rune) =>
          (rune >= _arabicIndicZero && rune <= _arabicIndicZero + 9) ||
          (rune >= _extendedArabicIndicZero &&
              rune <= _extendedArabicIndicZero + 9),
    );
  }

  static String applySystem(String formatted, KararNumeralSystem system) {
    switch (system) {
      case KararNumeralSystem.locale:
        return formatted;
      case KararNumeralSystem.western:
        return toWestern(formatted);
      case KararNumeralSystem.arabicIndic:
        return toArabicIndic(formatted);
    }
  }

  static bool _isAsciiDigit(int rune) =>
      rune >= _asciiZero && rune <= _asciiZero + 9;

  static bool _isBidiControl(int rune) {
    // LRM, RLM, ALM, and the isolate and embedding controls.
    return rune == 0x200E ||
        rune == 0x200F ||
        rune == 0x061C ||
        (rune >= 0x202A && rune <= 0x202E) ||
        (rune >= 0x2066 && rune <= 0x2069);
  }
}
