import 'dart:math' as math;

import 'package:flutter/services.dart';

import 'arabic_numerals.dart';

/// Rewrites Arabic-Indic digits to ASCII as the user types.
///
/// Applied to every numeric field. An Arabic keyboard emits `٠-٩`, and a
/// verification code or an amount typed that way would otherwise fail
/// validation for a reason the user cannot see.
class ArabicDigitInputFormatter extends TextInputFormatter {
  const ArabicDigitInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final String normalized = ArabicNumerals.normalizeForParsing(newValue.text);
    if (normalized == newValue.text) {
      return newValue;
    }
    // Normalisation can shorten the text by dropping grouping separators and
    // invisible bidi marks, so the caret is clamped rather than assumed.
    final int length = normalized.length;
    return TextEditingValue(
      text: normalized,
      selection: TextSelection(
        baseOffset: math.min(newValue.selection.baseOffset, length),
        extentOffset: math.min(newValue.selection.extentOffset, length),
        affinity: newValue.selection.affinity,
        isDirectional: newValue.selection.isDirectional,
      ),
      composing: TextRange.empty,
    );
  }
}
