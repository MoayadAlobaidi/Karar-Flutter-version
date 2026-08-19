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

/// The most characters the contract admits in a `minorUnits` value.
///
/// The contract's pattern is `^-?[0-9]{1,30}$`. A figure that does not fit is
/// not an amount this platform can hold, and the client refuses it here rather
/// than sending something the platform will reject or, worse, truncate.
const int maximumMinorUnitDigits = 30;

/// THE GRAMMAR AN AMOUNT MAY BE TYPED IN.
///
/// A financial client must never turn malformed punctuation into a different
/// valid amount. This one accepts exactly:
///
///     amount    ::= digits [ separator digits ]
///     digits    ::= digit+
///     digit     ::= U+0030..U+0039   (ASCII)
///                 | U+0660..U+0669   (Arabic-Indic)
///                 | U+06F0..U+06F9   (Extended Arabic-Indic)
///     separator ::= U+002E FULL STOP | U+066B ARABIC DECIMAL SEPARATOR
///
/// Surrounding whitespace is trimmed. Everything else is refused: a sign, a
/// second separator, a separator with no digits on one side, more fractional
/// digits than the currency's exponent allows, a letter, any punctuation, and
/// a value whose minor units would not fit the contract's thirty characters.
///
/// NO GROUPING SEPARATOR IS ACCEPTED, and that is the whole point.
/// ------------------------------------------------------------------
/// This function used to delete commas, the Arabic thousands separator,
/// spaces and typographic apostrophes wherever they appeared. Deleting a
/// separator is not a lenient reading of a well-formed amount; it is a
/// REINTERPRETATION of a malformed one, and each of these silently became a
/// different figure:
///
///     '1,2'    → 12       (someone typing a comma decimal meant 1.2)
///     '12,34'  → 1234     (they meant 12.34)
///     '8,10'   → 810      (they meant 8.10)
///     '1,2,3'  → 123      (no convention produces this)
///     '1 2'    → 12       (two numbers, or a typo)
///     "1'2"    → 12       (a stray keystroke)
///
/// Every one of those was accepted and turned into an amount the person did
/// not type. Grouping cannot be validated away either: `1,234` is a thousand
/// under one convention and one point two three four under another, and the
/// client does not know which the person meant. The amount field is a numeric
/// keypad, which produces no grouping separator at all, so refusing them costs
/// nothing and removes the entire class of silent reinterpretation.
///
/// A refusal is visible: the form reports the amount as invalid and the person
/// retypes it. A silent reinterpretation is not, and it writes a wrong record
/// that looks exactly like a right one.
///
/// Both decimal separators are accepted because a person reading the interface
/// in Arabic may type U+066B, and refusing their own punctuation would be
/// refusing their own language. A plain COMMA is never read as a decimal
/// separator: no surface in this product selects a convention in which it is.
///
/// The transformation is STRING to STRING and touches no numeric type at all:
/// the digits a person typed become the digits the ledger stores, with the
/// separator removed and the fraction padded to the currency's exponent.
/// Parsing to a `double` and multiplying by a power of ten is the classic way
/// to turn 8.10 into 809 minor units, and there is no arithmetic here that
/// could.
///
/// Returns null for anything the grammar does not accept.
String? minorUnitsFromTypedAmount(String typed, int exponent) {
  // The contract declares `exponent: { type: integer, minimum: 0 }`. A
  // negative one is not a currency this platform describes, and padding by a
  // negative amount would silently drop digits.
  if (exponent < 0) {
    return null;
  }

  final input = typed.trim();
  if (input.isEmpty) {
    return null;
  }

  final integerPart = StringBuffer();
  final fractionPart = StringBuffer();
  var separatorSeen = false;

  for (final unit in input.codeUnits) {
    if (unit == _fullStop || unit == _arabicDecimalSeparator) {
      // A second separator means the input is not one amount. It is refused
      // rather than resolved: neither reading is more likely to be right.
      if (separatorSeen) {
        return null;
      }
      separatorSeen = true;
      continue;
    }
    final digit = _asciiDigitOf(unit);
    if (digit == null) {
      // A grouping separator, a sign, a letter, a space, an apostrophe: all
      // arrive here, and all are refused. Nothing is skipped.
      return null;
    }
    (separatorSeen ? fractionPart : integerPart).writeCharCode(digit);
  }

  // `.5` and `5.` are both incomplete. Reading either as a whole amount would
  // be inventing the missing side.
  if (integerPart.isEmpty || (separatorSeen && fractionPart.isEmpty)) {
    return null;
  }
  // MORE fractional digits than the currency holds is refused rather than
  // rounded: dropping one is changing the amount.
  if (fractionPart.length > exponent) {
    return null;
  }

  final assembled = StringBuffer()
    ..write(integerPart)
    ..write(fractionPart);
  for (var index = fractionPart.length; index < exponent; index++) {
    assembled.write('0');
  }

  final minorUnits = _withoutLeadingZeros(assembled.toString());
  // The bound is on the VALUE that goes on the wire. Leading zeros are not
  // part of it, so `0008.10` is the same two-digit-currency amount as `8.10`.
  return minorUnits.length > maximumMinorUnitDigits ? null : minorUnits;
}

/// U+002E FULL STOP.
const int _fullStop = 0x2E;

/// U+066B ARABIC DECIMAL SEPARATOR.
const int _arabicDecimalSeparator = 0x066B;

/// [digits] without its leading zeros, keeping at least one character so zero
/// stays `0` rather than becoming the empty string.
String _withoutLeadingZeros(String digits) {
  var first = 0;
  while (first < digits.length - 1 && digits.codeUnitAt(first) == 0x30) {
    first++;
  }
  return digits.substring(first);
}

/// The ASCII code unit for [unit] when it is a digit in any of the scripts the
/// product renders, or null.
///
/// Arabic-Indic and Extended Arabic-Indic digits are accepted because a person
/// reading the interface in Arabic may well type them, and refusing their own
/// numerals would be refusing their own language. Mixing scripts within one
/// amount is accepted too: each code point has exactly one numeric value, so
/// there is no ambiguity to resolve and nothing is being guessed at.
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
