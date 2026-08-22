// THE PRODUCT HAS ONE NAME IN EACH LANGUAGE.
//
// It did not. The launcher, the consent screen and the iOS Face ID prompt said
// قرار while twelve in-app messages said كرار, so an Arabic user met one name
// on the home screen and a different one in the notice explaining that their
// session had been ended for a security reason. Nothing failed, because no
// check related one surface to another.
//
// The spelling is كرار. Both readings are pronounceable renderings of the
// Latin name, but قرار is the Arabic word "decision" and is the name of the
// legacy system: `docs/documentation-style-guide.md` reserves "Qarar" for
// `MoayadAlobaidi/Qarar` and states this platform is "Karar". The launcher was
// therefore carrying the previous product's name.
//
// The one deliberate exception is the common noun. `consentScreenDescription`
// contains قراراتك — "your decisions" — which is ordinary Arabic and not the
// brand at all. A find-and-replace across the catalogue would have turned it
// into a non-word, so this file tests for the brand in isolation and the
// exception is stated rather than silently skipped.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The Arabic product name, and the spelling that must not appear.
const String _arabicBrand = 'كرار';
const String _legacyArabicBrand = 'قرار';

/// Keys whose Arabic value legitimately contains the letters of the legacy
/// spelling as part of an ordinary word rather than as the product name.
///
/// Listed individually so that adding one is a decision. The substring test
/// below cannot tell a brand from a noun; a human has to.
const Map<String, String> _commonNounExceptions = <String, String>{
  'consentScreenDescription': 'قراراتك — "your decisions", the ordinary noun',
};

Map<String, Object?> _arb(String path) =>
    jsonDecode(File(path).readAsStringSync()) as Map<String, Object?>;

Iterable<MapEntry<String, String>> _messages(Map<String, Object?> arb) sync* {
  for (final MapEntry<String, Object?> entry in arb.entries) {
    if (entry.key.startsWith('@')) continue;
    yield MapEntry<String, String>(entry.key, entry.value.toString());
  }
}

void main() {
  group('the Arabic product name is one name', () {
    late Map<String, Object?> arabic;

    setUpAll(() {
      arabic = _arb('lib/l10n/arb/app_ar.arb');
    });

    test('the catalogue declares the name at all', () {
      // Guards the assertions below against a renamed or removed key, which
      // would otherwise make them vacuously true.
      expect(arabic['appName'], _arabicBrand);
    });

    test('no message uses the legacy spelling as the product name', () {
      final Map<String, String> offenders = <String, String>{
        for (final MapEntry<String, String> message in _messages(arabic))
          if (message.value.contains(_legacyArabicBrand) &&
              !_commonNounExceptions.containsKey(message.key))
            message.key: message.value,
      };
      expect(
        offenders,
        isEmpty,
        reason:
            'these Arabic messages contain "$_legacyArabicBrand", which is '
            'the legacy system\'s name. The product is "$_arabicBrand". If a '
            'message genuinely needs the ordinary Arabic word, add it to '
            '_commonNounExceptions with the reason:\n'
            '${offenders.keys.join('\n')}',
      );
    });

    test('the documented common-noun exceptions are still real', () {
      // An exception that no longer applies is a hole nobody closed. If the
      // message is reworded so the noun disappears, the entry must go.
      for (final MapEntry<String, String> exception in _commonNounExceptions.entries) {
        expect(
          arabic.containsKey(exception.key),
          isTrue,
          reason:
              '${exception.key} is listed as a common-noun exception but is '
              'no longer in the catalogue; remove the exception',
        );
        expect(
          arabic[exception.key].toString().contains(_legacyArabicBrand),
          isTrue,
          reason:
              '${exception.key} no longer contains the word the exception '
              'exists for (${exception.value}); remove the exception so the '
              'rule applies to it again',
        );
      }
    });

    test('the iOS purpose string uses the same name as the catalogue', () {
      // The Face ID prompt is drawn by iOS from a file the Flutter tooling
      // never reads, so it is the surface most able to drift without notice —
      // and it is shown at exactly the moment a user is deciding whether to
      // trust the application with a biometric.
      final File strings = File('ios/Runner/ar.lproj/InfoPlist.strings');
      expect(strings.existsSync(), isTrue);

      final String contents = strings.readAsStringSync();
      final String? purpose = RegExp(r'"NSFaceIDUsageDescription"\s*=\s*"([^"]*)"')
          .firstMatch(contents)
          ?.group(1);
      expect(purpose, isNotNull, reason: 'no Arabic Face ID purpose string');
      expect(
        purpose,
        contains(_arabicBrand),
        reason: 'the Arabic Face ID prompt must name the product',
      );
      expect(
        purpose,
        isNot(contains(_legacyArabicBrand)),
        reason: 'the Arabic Face ID prompt names the legacy system',
      );
    });

    test('the English catalogue spells the product one way', () {
      final Map<String, Object?> english = _arb('lib/l10n/arb/app_en.arb');
      expect(english['appName'], 'Karar');
      final Map<String, String> offenders = <String, String>{
        for (final MapEntry<String, String> message in _messages(english))
          if (RegExp(r'\b(Qarar|Karrar)\b').hasMatch(message.value)) message.key: message.value,
      };
      expect(
        offenders,
        isEmpty,
        reason:
            'the style guide reserves "Qarar" for the legacy system and '
            'rules out "Karrar" entirely:\n${offenders.keys.join('\n')}',
      );
    });
  });
}
