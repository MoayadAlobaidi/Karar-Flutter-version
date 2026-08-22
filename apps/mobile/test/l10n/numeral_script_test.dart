// ONE NUMERAL SCRIPT PER LOCALE, INCLUDING IN PROSE.
//
// The Arabic catalogue used to write numbers two ways at once. Seven messages
// spelled quantities in Arabic-Indic digits as literal text — `٨ أحرف على
// الأقل.` — while every message that carried a number through an ICU
// placeholder rendered it in Western digits, because CLDR gives `ar` the
// `latn` numbering system. The two met on the same screen: the registration
// form showed `٨ أحرف على الأقل.` as helper text directly above the validation
// error `استخدم 8 أحرف على الأقل.`, one field, one requirement, two alphabets.
//
// The literals were the outlier, and Qatar decides it. `NumberFormat
// .decimalPattern('ar_QA')` renders `8`, as does bare `ar`; only `ar_EG` and
// its neighbours use `٨`. `KararLocalization.resolve` narrows every Arabic
// locale to bare `ar`, so Western digits are what this application actually
// renders everywhere else, on every surface, today.
//
// The formatter can flip the whole client to Arabic-Indic in one place, and
// `numeral_rules_test.dart` guarantees every ICU-carried number follows it.
// LITERAL digits in prose do not follow it — that test reads placeholder
// types, so prose is invisible to it. This file is that gap's guard: it holds
// the catalogue to a single script, and if the product ever chooses
// Arabic-Indic, it fails and names every message that has to move with it.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The digits CLDR calls `arab`. Their presence in a message is the defect
/// this file exists to catch.
const String _arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';

/// Extended Arabic-Indic, used by Persian and Urdu. No locale here uses them;
/// they are checked so a copy-paste from another catalogue cannot slip in.
const String _extendedArabicIndicDigits = '۰۱۲۳۴۵۶۷۸۹';

Map<String, String> _messages(String path) {
  final Map<String, Object?> arb =
      jsonDecode(File(path).readAsStringSync()) as Map<String, Object?>;
  return <String, String>{
    for (final MapEntry<String, Object?> entry in arb.entries)
      if (!entry.key.startsWith('@')) entry.key: entry.value.toString(),
  };
}

Iterable<String> _offenders(Map<String, String> messages, String digits) sync* {
  for (final MapEntry<String, String> message in messages.entries) {
    if (message.value.split('').any(digits.contains)) {
      yield '${message.key}: ${message.value}';
    }
  }
}

void main() {
  group('the catalogues use one numeral script', () {
    late Map<String, String> arabic;
    late Map<String, String> english;

    setUpAll(() {
      arabic = _messages('lib/l10n/arb/app_ar.arb');
      english = _messages('lib/l10n/arb/app_en.arb');
    });

    test('the catalogues were actually read', () {
      // Without this, a path typo would make every assertion below pass by
      // examining nothing.
      expect(arabic.length, greaterThan(300));
      expect(english.length, arabic.length);
    });

    test('no Arabic message writes a number in Arabic-Indic digits', () {
      final List<String> offenders = _offenders(arabic, _arabicIndicDigits).toList();
      expect(
        offenders,
        isEmpty,
        reason:
            'these messages spell a number in Arabic-Indic while every '
            'number this application formats renders in Western digits under '
            '`ar` and `ar_QA`. A user sees both scripts for the same quantity:\n'
            '${offenders.join('\n')}\n'
            'If the product has decided to move the whole client to '
            'Arabic-Indic, that is a change to KararNumeralSystem plus a wrap '
            'of these prose messages — not a change to these literals alone.',
      );
    });

    test('no message uses extended Arabic-Indic digits', () {
      for (final Map<String, String> catalogue in <Map<String, String>>[arabic, english]) {
        expect(
          _offenders(catalogue, _extendedArabicIndicDigits).toList(),
          isEmpty,
          reason:
              'extended Arabic-Indic digits belong to Persian and Urdu; '
              'no locale here uses them',
        );
      }
    });

    test('no English message writes a number in a non-Western script', () {
      expect(
        _offenders(english, '$_arabicIndicDigits$_extendedArabicIndicDigits').toList(),
        isEmpty,
      );
    });
  });
}
