// PURE DART ONLY. See lib/README.md — domain purity.
//
// MONEY IS CHARACTERS, NOT A NUMBER.
//
// The platform serialises every amount as an exact integer count of minor
// units in a string, with the currency and that currency's ISO 4217 exponent
// beside it (ADR-0006). This type keeps all three exactly as they arrived.
//
// Three things are deliberately absent, and each absence is the point:
//
//   * NO ARITHMETIC. There is no `+`, no `-`, no `compareTo` and no
//     aggregate. The client formats what the platform reported; it never
//     computes a figure the platform did not send (ADR-0007). A total, a net
//     position, a net worth or a budget is a Phase 6 concern and cannot be
//     assembled out of this type.
//   * NO `double`, ANYWHERE. A binary float cannot hold a decimal ledger
//     value, so the minor units never leave string form inside the domain.
//     [minorUnitsAsInt] exists solely so the presentation layer can hand an
//     exact integer to the one formatter; it answers null rather than losing
//     precision.
//   * NO CONVERSION. There is no exchange rate on this surface and none may
//     be invented. Two amounts in different currencies are two amounts.
import 'package:meta/meta.dart';

/// An exact monetary amount, as the platform reported it.
@immutable
final class Money {
  const Money({
    required this.minorUnits,
    required this.currency,
    required this.exponent,
  });

  /// The signed integer the ledger holds, as characters. Never parsed to a
  /// `double`, and never rounded.
  final String minorUnits;

  /// ISO 4217 alphabetic code, exactly as sent.
  final String currency;

  /// The currency's ISO 4217 minor-unit exponent, as the platform supplied
  /// it. The client never consults a currency table of its own: a table that
  /// disagreed with the platform would misplace the decimal point.
  final int exponent;

  bool get isNegative => minorUnits.startsWith('-');

  /// The digits without the sign. Still characters, still exact.
  String get magnitudeMinorUnits => isNegative ? minorUnits.substring(1) : minorUnits;

  /// Whether the amount is exactly zero, decided on the characters.
  bool get isZero {
    for (final unit in magnitudeMinorUnits.codeUnits) {
      if (unit != 0x30) {
        return false;
      }
    }
    return magnitudeMinorUnits.isNotEmpty;
  }

  /// The minor units as an exact `int`, or null when they do not fit one.
  ///
  /// Null is a real answer rather than an error: the contract permits thirty
  /// digits and a 64-bit integer holds nineteen. The presentation layer
  /// renders the exact characters in that case instead of a number it would
  /// have had to approximate.
  int? get minorUnitsAsInt => int.tryParse(minorUnits);

  @override
  bool operator ==(Object other) =>
      other is Money &&
      other.minorUnits == minorUnits &&
      other.currency == currency &&
      other.exponent == exponent;

  @override
  int get hashCode => Object.hash(minorUnits, currency, exponent);

  /// Carries no figure. A monetary value in a log line, a crash dump or a
  /// framework error is financial data leaving through a diagnostic sink.
  @override
  String toString() => 'Money()';
}

/// Which way money moved, as the platform names it.
///
/// The sign is a consequence of the direction, never the other way round: a
/// client that inferred direction from a leading minus would be one contract
/// change away from writing an inverted record.
enum MoneyDirection {
  /// Money leaving the account. Stored negative.
  moneyOut,

  /// Money arriving. Stored positive.
  moneyIn,

  /// A direction this build does not recognise. Rendered as unrecognised,
  /// never defaulted to either arm.
  unrecognised,
}

/// Turns what a person typed into an exact minor-unit string.
///
/// It is a STRING-to-STRING transformation and touches no numeric type at all:
/// the digits a person typed become the digits the ledger stores, with the
/// decimal point removed and the fraction padded to the currency's exponent.
/// Parsing to a `double` and multiplying by a power of ten is the classic way
/// to turn 8.10 into 809 minor units, and there is no arithmetic here that
/// could.
///
/// Returns null when the input is not a non-negative amount this currency can
/// hold — including when it carries MORE fractional digits than the exponent
/// allows, because silently dropping one is silently changing the amount.
///
/// Grouping separators are removed and both the ASCII and the Arabic decimal
/// separators are accepted, so a person typing on an Arabic keyboard is not
/// refused for using their own punctuation.
String? minorUnitsFromTypedAmount(String typed, int exponent) {
  final buffer = StringBuffer();
  var separatorSeen = false;
  var fractionDigits = 0;
  for (final unit in typed.trim().codeUnits) {
    if (unit == 0x2C || unit == 0x066C || unit == 0x20 || unit == 0x2019) {
      // Grouping separator: comma, Arabic thousands separator, space, or the
      // typographic apostrophe some locales group with.
      continue;
    }
    if (unit == 0x2E || unit == 0x066B) {
      if (separatorSeen) {
        return null;
      }
      separatorSeen = true;
      continue;
    }
    final digit = _asciiDigitOf(unit);
    if (digit == null) {
      return null;
    }
    buffer.writeCharCode(digit);
    if (separatorSeen) {
      fractionDigits++;
    }
  }

  final digits = buffer.toString();
  if (digits.isEmpty || fractionDigits > exponent) {
    return null;
  }

  final padded = StringBuffer(digits);
  for (var index = fractionDigits; index < exponent; index++) {
    padded.write('0');
  }
  final minorUnits = padded.toString();

  var firstSignificant = 0;
  while (firstSignificant < minorUnits.length - 1 &&
      minorUnits.codeUnitAt(firstSignificant) == 0x30) {
    firstSignificant++;
  }
  return minorUnits.substring(firstSignificant);
}

/// The ASCII code unit for [unit] when it is a digit in any of the scripts the
/// product renders, or null.
///
/// Arabic-Indic and Extended Arabic-Indic digits are accepted because a person
/// reading the interface in Arabic may well type them, and refusing their own
/// numerals would be refusing their own language.
int? _asciiDigitOf(int unit) {
  if (unit >= 0x30 && unit <= 0x39) {
    return unit;
  }
  if (unit >= 0x0660 && unit <= 0x0669) {
    return 0x30 + (unit - 0x0660);
  }
  if (unit >= 0x06F0 && unit <= 0x06F9) {
    return 0x30 + (unit - 0x06F0);
  }
  return null;
}

/// A magnitude and a direction, which is how a person enters an amount.
///
/// The platform accepts exactly this shape for a manual entry and refuses a
/// signed amount, because a client that gets the sign backwards writes a wrong
/// record that looks like a right one. The type mirrors that refusal: there is
/// no way to construct one from a signed value.
@immutable
final class MoneyEntry {
  const MoneyEntry({
    required this.magnitude,
    required this.direction,
  });

  /// A NON-NEGATIVE amount. The server applies the canonical sign.
  final Money magnitude;

  final MoneyDirection direction;

  @override
  String toString() => 'MoneyEntry()';
}
