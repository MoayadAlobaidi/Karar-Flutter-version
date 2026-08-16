import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import 'arabic_numerals.dart';

/// The one formatter. Every date, number, percentage and monetary value the
/// client renders goes through it.
///
/// Two rules are structural rather than stylistic:
///
///  * **No `double` anywhere in the money path.** Money arrives from the
///    platform as minor units plus an ISO 4217 currency code
///    (`docs/architecture/flutter.md` §6). This class formats that integer
///    directly; there is no API here that accepts a floating-point amount, so
///    a rounding error cannot be introduced at the display layer.
///  * **The client formats, it never computes.** Nothing here derives a
///    financial figure. A value that was not in a platform response cannot be
///    produced by this class (ADR-0007).
@immutable
class KararFormatter {
  const KararFormatter({
    required this.locale,
    this.numerals = KararNumeralSystem.locale,
  });

  /// Resolves against the locale currently active in the widget tree.
  ///
  /// Date symbol data for that locale is installed by the localization
  /// delegates, so this must be called from inside `Localizations`.
  factory KararFormatter.of(BuildContext context) {
    return KararFormatter(
      locale: Localizations.maybeLocaleOf(context) ?? const Locale('en'),
    );
  }

  final Locale locale;

  /// Digit shapes. The default follows CLDR, which for both shipped locales
  /// means Western digits — see [KararNumeralSystem.locale]. Overriding is a
  /// product decision, made once, not a per-screen one.
  final KararNumeralSystem numerals;

  String get _localeName => locale.toLanguageTag().replaceAll('-', '_');

  // ---------------------------------------------------------------- dates

  /// Medium date: `16 Aug 2026`.
  String date(DateTime value) => _apply(DateFormat.yMMMd(_localeName), value);

  /// All-numeric date: `16/08/2026`.
  String dateNumeric(DateTime value) =>
      _apply(DateFormat.yMd(_localeName), value);

  /// Month and year: `August 2026`.
  String monthYear(DateTime value) =>
      _apply(DateFormat.yMMMM(_localeName), value);

  /// Locale-preferred time of day.
  String time(DateTime value) => _apply(DateFormat.jm(_localeName), value);

  /// Medium date followed by the locale-preferred time.
  String dateTime(DateTime value) {
    return ArabicNumerals.applySystem(
      DateFormat.yMMMd(_localeName).add_jm().format(value),
      numerals,
    );
  }

  // -------------------------------------------------------------- numbers

  /// A plain integer with locale grouping.
  String integer(int value) {
    return ArabicNumerals.applySystem(
      NumberFormat.decimalPattern(_localeName).format(value),
      numerals,
    );
  }

  /// A value carried as an integer scaled by `10^scale`.
  ///
  /// `scaled(12345, 2)` renders `123.45` — the shape the platform uses for any
  /// exact fractional quantity that is not money.
  String scaled(int value, int scale) {
    return ArabicNumerals.applySystem(_formatScaled(value, scale), numerals);
  }

  /// A percentage carried as basis points, so no fractional type is needed:
  /// `2550` renders as `25.5%`.
  String percentFromBasisPoints(int basisPoints, {int fractionDigits = 1}) {
    assert(
      fractionDigits >= 0 && fractionDigits <= 2,
      'Basis points carry at most two fractional percentage digits.',
    );
    final int divisor = _pow10(2 - fractionDigits);
    final int rounded = _divideRounded(basisPoints, divisor);
    final NumberFormat format = NumberFormat.decimalPattern(_localeName);
    final String number = _formatScaled(
      rounded,
      fractionDigits,
      formatOverride: format,
    );
    return ArabicNumerals.applySystem(
      '$number${format.symbols.PERCENT}',
      numerals,
    );
  }

  // ----------------------------------------------------------------- money

  /// Formats a monetary value carried as minor units plus an ISO 4217 code.
  ///
  /// The currency is rendered as its alphabetic code rather than a short
  /// symbol. `QAR`, `SAR` and `AED` all share the short symbol "Riyal"/"dh" in
  /// the available symbol data, and a fintech that renders two different
  /// currencies identically has shipped a defect. A verified per-locale symbol
  /// table can replace [currencyDisplayFor] later without touching a caller.
  String money(int minorUnits, String currencyCode) {
    final String code = currencyCode.toUpperCase();
    final String amount = ArabicNumerals.applySystem(
      _formatScaled(minorUnits, currencyExponentFor(code)),
      numerals,
    );
    final String display = currencyDisplayFor(code);
    // CLDR places the currency after the amount under Arabic and before it
    // under English; the non-breaking space keeps the pair from wrapping.
    return isRightToLeft ? '$amount $display' : '$display $amount';
  }

  /// How a currency is written. The ISO 4217 alphabetic code, by design.
  String currencyDisplayFor(String currencyCode) => currencyCode.toUpperCase();

  bool get isRightToLeft => Bidi.isRtlLanguage(locale.languageCode);

  /// ISO 4217 minor-unit exponent. Reference data, not a computed value.
  static int currencyExponentFor(String currencyCode) {
    return _currencyExponents[currencyCode.toUpperCase()] ?? 2;
  }

  static const Map<String, int> _currencyExponents = <String, int>{
    // Three-decimal currencies. Getting these wrong misplaces the decimal
    // point by a factor of ten, so they are enumerated rather than inferred.
    'BHD': 3,
    'IQD': 3,
    'JOD': 3,
    'KWD': 3,
    'LYD': 3,
    'OMR': 3,
    'TND': 3,
    // Zero-decimal currencies.
    'BIF': 0,
    'CLP': 0,
    'DJF': 0,
    'GNF': 0,
    'ISK': 0,
    'JPY': 0,
    'KMF': 0,
    'KRW': 0,
    'PYG': 0,
    'RWF': 0,
    'UGX': 0,
    'UYI': 0,
    'VND': 0,
    'VUV': 0,
    'XAF': 0,
    'XOF': 0,
    'XPF': 0,
    // Two-decimal currencies are the default and are not listed. The Karar
    // home market, QAR, is one of them.
  };

  String _apply(DateFormat format, DateTime value) {
    return ArabicNumerals.applySystem(format.format(value), numerals);
  }

  String _formatScaled(int value, int scale, {NumberFormat? formatOverride}) {
    final NumberFormat format =
        formatOverride ?? NumberFormat.decimalPattern(_localeName);
    final bool isNegative = value < 0;
    final int magnitude = value.abs();
    final int divisor = _pow10(scale);
    final int whole = magnitude ~/ divisor;
    final int fraction = magnitude % divisor;

    final StringBuffer buffer = StringBuffer();
    if (isNegative) {
      buffer.write(format.symbols.MINUS_SIGN);
    }
    buffer.write(format.format(whole));
    if (scale > 0) {
      buffer
        ..write(format.symbols.DECIMAL_SEP)
        ..write(
          _localizeDigits(
            fraction.toString().padLeft(scale, '0'),
            format.symbols.ZERO_DIGIT,
          ),
        );
    }
    return buffer.toString();
  }

  static String _localizeDigits(String asciiDigits, String zeroDigit) {
    if (zeroDigit == '0') {
      return asciiDigits;
    }
    final int base = zeroDigit.codeUnitAt(0);
    final StringBuffer buffer = StringBuffer();
    for (final int unit in asciiDigits.codeUnits) {
      buffer.writeCharCode(base + (unit - 0x30));
    }
    return buffer.toString();
  }

  static int _pow10(int exponent) {
    int result = 1;
    for (int i = 0; i < exponent; i++) {
      result *= 10;
    }
    return result;
  }

  /// Integer division with half-away-from-zero rounding, so no floating point
  /// is needed to drop a digit.
  static int _divideRounded(int value, int divisor) {
    if (divisor == 1) {
      return value;
    }
    final int magnitude = value.abs();
    final int quotient = (magnitude + divisor ~/ 2) ~/ divisor;
    return value < 0 ? -quotient : quotient;
  }
}
