// PURE DART ONLY. See lib/README.md — domain purity.
//
// A MASK IS A TAIL, AND THE CLIENT CHECKS THAT IT IS.
//
// The platform sends a short masked tail — `**1234` — and refuses to store
// anything that reads as a full account or card number. The client does not
// have to trust that: this type checks the value it was handed and withholds
// anything that could be a full number, an IBAN or a PAN.
//
// The check is deliberately conservative and its failure mode is silence. A
// value it does not accept renders as WITHHELD; it is never truncated to a
// tail, because truncating would turn "the platform sent something it should
// not have" into "the screen looks fine" and the incident would go unnoticed.
//
// Nothing here reconstructs, pads or invents a number. There is no
// placeholder that implies digits the client does not hold: a row of dots
// standing in for twelve unseen characters is a claim about their existence,
// and this client makes no such claim.
import 'package:meta/meta.dart';

/// The most characters a legitimate mask can have, per the contract
/// (`mask: { maxLength: 8 }`).
const int maximumSafeMaskLength = 8;

/// The most consecutive digits a tail may reveal. Four is the tail everyone
/// prints; five is the beginning of something else.
const int maximumRevealedDigits = 4;

/// A masked tail that is safe to put on a screen.
@immutable
final class SafeMask {
  const SafeMask._(this.value);

  /// Nothing was reported. Distinct from withheld: the platform sent no mask.
  static const SafeMask absent = SafeMask._(null);

  /// A value arrived and this client refuses to render it.
  static const SafeMask withheld = SafeMask._(null);

  /// The characters to render, or null when there are none to render.
  final String? value;

  bool get isPresent => value != null;

  /// Whether a value arrived and was refused. Rendered as an explicit
  /// "withheld" state so a refusal is visible rather than mistaken for
  /// absence.
  bool get isWithheld => identical(this, withheld);

  /// Accepts [reported] only if it cannot be a full identifier.
  static SafeMask from(String? reported) {
    if (reported == null) {
      return absent;
    }
    final trimmed = reported.trim();
    if (trimmed.isEmpty) {
      return absent;
    }
    if (trimmed.length > maximumSafeMaskLength) {
      return withheld;
    }
    var run = 0;
    var digits = 0;
    var letters = 0;
    for (final unit in trimmed.codeUnits) {
      final isDigit = unit >= 0x30 && unit <= 0x39;
      if (isDigit) {
        digits++;
        run++;
        if (run > maximumRevealedDigits) {
          return withheld;
        }
      } else {
        run = 0;
        final isUpper = unit >= 0x41 && unit <= 0x5A;
        final isLower = unit >= 0x61 && unit <= 0x7A;
        if (isUpper || isLower) {
          letters++;
        }
      }
    }
    // An IBAN opens with two letters and two check digits. A mask has no
    // reason to carry a country prefix, so a leading letter pair is refused
    // rather than rendered as the head of an account identifier.
    if (letters >= 2 && digits >= 2 && _opensWithLetterPair(trimmed)) {
      return withheld;
    }
    return SafeMask._(trimmed);
  }

  static bool _opensWithLetterPair(String value) {
    if (value.length < 2) {
      return false;
    }
    return _isLetter(value.codeUnitAt(0)) && _isLetter(value.codeUnitAt(1));
  }

  static bool _isLetter(int unit) =>
      (unit >= 0x41 && unit <= 0x5A) || (unit >= 0x61 && unit <= 0x7A);

  @override
  bool operator ==(Object other) =>
      other is SafeMask && other.value == value && other.isWithheld == isWithheld;

  @override
  int get hashCode => Object.hash(value, isWithheld);

  /// Carries no characters: a mask is holder data and has no place in a log.
  @override
  String toString() => 'SafeMask()';
}
