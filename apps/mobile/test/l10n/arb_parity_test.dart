import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The missing-translation gate.
///
/// Run it on its own in CI:
///
/// ```
/// cd apps/mobile && flutter test test/l10n
/// ```
///
/// It fails the build when a string exists in one language and not the other,
/// when a translation drops a placeholder, when a template message has no
/// description for the translator, or when the committed generated Dart no
/// longer matches the ARB files.
void main() {
  final Directory arbDirectory = Directory('lib/l10n/arb');
  final File templateFile = File('${arbDirectory.path}/app_en.arb');
  final File arabicFile = File('${arbDirectory.path}/app_ar.arb');

  late Map<String, dynamic> template;
  late Map<String, dynamic> arabic;

  setUpAll(() {
    template = _readArb(templateFile);
    arabic = _readArb(arabicFile);
  });

  test('every ARB file the project ships is accounted for', () {
    final List<String> found =
        arbDirectory
            .listSync()
            .whereType<File>()
            .map((File file) => file.uri.pathSegments.last)
            .where((String name) => name.endsWith('.arb'))
            .toList()
          ..sort();
    expect(
      found,
      <String>['app_ar.arb', 'app_en.arb'],
      reason:
          'A new ARB file must be added to this check and to the pumped test '
          'locales, otherwise it ships unverified.',
    );
  });

  test('Arabic translates every English message', () {
    final Set<String> missing = _messageKeys(template)
        .difference(_messageKeys(arabic));
    expect(
      missing,
      isEmpty,
      reason:
          'Untranslated in ar: ${missing.join(', ')}. Add the translation to '
          'lib/l10n/arb/app_ar.arb.',
    );
  });

  test('Arabic defines no message English does not', () {
    final Set<String> extra = _messageKeys(arabic)
        .difference(_messageKeys(template));
    expect(
      extra,
      isEmpty,
      reason:
          'Orphaned in ar: ${extra.join(', ')}. The English template is the '
          'source of truth; remove these or add them to app_en.arb.',
    );
  });

  test('no message is blank in either language', () {
    for (final MapEntry<String, Map<String, dynamic>> file
        in <String, Map<String, dynamic>>{
          'app_en.arb': template,
          'app_ar.arb': arabic,
        }.entries) {
      for (final String key in _messageKeys(file.value)) {
        expect(
          (file.value[key] as String).trim(),
          isNotEmpty,
          reason: '$key is empty in ${file.key}.',
        );
      }
    }
  });

  test('every template message carries a description', () {
    for (final String key in _messageKeys(template)) {
      final Object? metadata = template['@$key'];
      expect(
        metadata,
        isA<Map<String, dynamic>>(),
        reason: '$key has no @$key metadata block.',
      );
      final Object? description =
          (metadata! as Map<String, dynamic>)['description'];
      expect(
        description,
        isA<String>(),
        reason: '$key has no description; a translator would have to guess.',
      );
      expect((description! as String).trim(), isNotEmpty);
    }
  });

  test('translations preserve every placeholder', () {
    for (final String key in _messageKeys(template)) {
      final Set<String> expected = _placeholdersIn(template[key] as String);
      final Set<String> actual = _placeholdersIn(arabic[key] as String);
      expect(
        actual,
        equals(expected),
        reason:
            'Placeholder mismatch on $key. English uses '
            '${expected.join(', ')}; Arabic uses ${actual.join(', ')}. A '
            'translation must never drop or rename a placeholder, and must '
            'never be assembled by concatenation instead.',
      );
    }
  });

  test('a message that is plural in English is plural in Arabic', () {
    for (final String key in _messageKeys(template)) {
      final bool templateIsPlural = _isPlural(template[key] as String);
      final bool arabicIsPlural = _isPlural(arabic[key] as String);
      expect(
        arabicIsPlural,
        templateIsPlural,
        reason:
            '$key must use an ICU plural in both languages. Arabic has six '
            'plural categories; a single form is wrong for most counts.',
      );
    }
  });

  test('Arabic plurals cover the categories Arabic actually uses', () {
    for (final String key in _messageKeys(template)) {
      final String message = arabic[key] as String;
      if (!_isPlural(message)) {
        continue;
      }
      for (final String category in <String>['few', 'many', 'other']) {
        expect(
          message.contains('$category{'),
          isTrue,
          reason:
              '$key is missing the "$category" plural category in Arabic. '
              'CLDR uses it for counts Arabic speakers hit routinely.',
        );
      }
    }
  });

  test('the committed generated Dart matches the ARB files', () {
    final String generated = File('lib/l10n/generated/app_localizations.dart')
        .readAsStringSync();
    for (final String key in _messageKeys(template)) {
      expect(
        generated.contains(RegExp('\\b$key\\b')),
        isTrue,
        reason:
            '$key is not present in the generated localizations. Run '
            '`flutter gen-l10n` and commit the result.',
      );
    }
  });
}

Map<String, dynamic> _readArb(File file) {
  expect(file.existsSync(), isTrue, reason: '${file.path} is missing.');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

/// Message keys only: the `@@locale` header and `@key` metadata blocks are not
/// messages.
Set<String> _messageKeys(Map<String, dynamic> arb) {
  return arb.keys.where((String key) => !key.startsWith('@')).toSet();
}

final RegExp _placeholderPattern = RegExp(r'\{(\w+)\}');

Set<String> _placeholdersIn(String message) {
  return _placeholderPattern
      .allMatches(message)
      .map((RegExpMatch match) => match.group(1)!)
      // The plural selector itself appears as `{count, plural, ...}` and is
      // matched separately below, so only bare substitutions are compared.
      .toSet()
    ..addAll(
      RegExp(r'\{(\w+),\s*plural')
          .allMatches(message)
          .map((RegExpMatch match) => match.group(1)!),
    );
}

bool _isPlural(String message) => message.contains(', plural,');
