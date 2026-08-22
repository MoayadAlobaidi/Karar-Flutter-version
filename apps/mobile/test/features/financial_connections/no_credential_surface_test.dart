// NO CREDENTIAL FIELD, AND NO INVITATION TO CONNECT — IN THE SOURCE ITSELF.
//
// The widget tests prove that the rendered tree contains no field and no
// affordance in the states they pump. This file proves the stronger, cheaper
// thing: the SOURCE of the whole feature contains nothing that could construct
// one, and the SENTENCES the feature uses contain nothing that could be read as
// an offer.
//
// Two scans, and each fires on the shape it exists to catch:
//
//   1. NO INPUT WIDGET IS CONSTRUCTIBLE. No `TextField`, no `KararTextField`,
//      no `obscureText`, no `TextEditingController`, no autofill hint. A
//      credential field cannot be added to this feature without deleting a line
//      of this test first, which is a reviewable act rather than a slip;
//
//   2. NO MESSAGE THIS FEATURE USES OFFERS ANYTHING. The keys are DERIVED from
//      the feature source rather than listed here, so a message added later is
//      covered without anyone editing this file. The banned phrases are the
//      promissory ones — "coming soon", "connect your", "link your" — and not
//      the bare word "connect", because the introduction legitimately says that
//      Karar does NOT connect to any bank.
//
// The self-test at the bottom seeds each shape into a temporary tree and proves
// the scan actually fires on it. A guard nobody has seen fail is a guard nobody
// knows works.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The feature this file guards.
const String featureRoot = 'lib/features/financial_connections';

/// Identifiers that build, control or fill a text input. Not one of them
/// belongs anywhere in this feature: the surface is read-only, and a credential
/// field belongs nowhere in this product at all.
final List<RegExp> inputConstruction = <RegExp>[
  RegExp(r'\bTextField\b'),
  RegExp(r'\bTextFormField\b'),
  RegExp(r'\bKararTextField\b'),
  RegExp(r'\bEditableText\b'),
  RegExp(r'\bCupertinoTextField\b'),
  RegExp(r'\bTextEditingController\b'),
  RegExp(r'\bobscureText\b'),
  RegExp(r'\bautofillHints\b'),
  RegExp(r'\bAutofillGroup\b'),
  RegExp(r'\bTextInputType\b'),
  RegExp(r'\bkeyboardType\b'),
  RegExp(r'\bTextInputFormatter\b'),
];

/// Phrases that promise a person something this platform does not do.
///
/// Lower-cased before matching. The bare word "connect" is deliberately NOT
/// here: the surface has to be able to say that Karar does not connect to
/// anything.
const List<String> promissoryEnglish = <String>[
  'coming soon',
  'available soon',
  'soon',
  'connect your',
  'connect to your',
  'connect a bank',
  'link your',
  'link a bank',
  'sign in to your',
  'log in to your',
  'authorise your',
  'authorize your',
  'oauth',
  'not yet supported',
  'we are working on',
  'in a future',
];

/// The Arabic equivalents. Fewer, because Arabic offers fewer near-misses for
/// the phrases that matter, and each is a phrase rather than a stem so an
/// ordinary word cannot trip it.
const List<String> promissoryArabic = <String>[
  'قريبًا',
  'قريباً',
  'قريبا',
  'اربط حسابك',
  'اربط بنكك',
  'سجّل الدخول إلى',
  'سجل الدخول إلى',
  'قيد التطوير',
];

/// Credential nouns. They may appear in exactly ONE message: the sentence that
/// says none of them is ever asked for or stored.
const List<String> credentialNounsEnglish = <String>[
  'password',
  'pin,',
  'mpin',
  'one-time code',
  'recovery code',
  'card number',
  'cvv',
];

const String credentialDenialKey = 'dataSourcesCredentialNote';

/// Every Dart file under [root], with comment-only lines blanked so prose
/// explaining a rule cannot trip the rule it explains.
List<({String path, String body})> sourcesUnder(String root) {
  final directory = Directory(root);
  if (!directory.existsSync()) {
    return const <({String path, String body})>[];
  }
  final found = <({String path, String body})>[];
  for (final file in directory.listSync(recursive: true).whereType<File>()) {
    final path = file.path.replaceAll(r'\', '/');
    if (!path.endsWith('.dart')) {
      continue;
    }
    final body = <String>[
      for (final line in file.readAsLinesSync())
        line.trimLeft().startsWith('//') ? '' : line,
    ].join('\n');
    found.add((path: path, body: body));
  }
  found.sort((({String path, String body}) a, ({String path, String body}) b) =>
      a.path.compareTo(b.path));
  return found;
}

/// Rule 1 over one tree.
List<String> findInputConstruction(String root) {
  final findings = <String>[];
  for (final source in sourcesUnder(root)) {
    for (final pattern in inputConstruction) {
      if (pattern.hasMatch(source.body)) {
        findings.add('${source.path}  ${pattern.pattern}');
      }
    }
  }
  return findings;
}

/// Every localisation key the feature reads, derived from `l10n.<key>` in its
/// own source.
Set<String> keysUsedBy(String root) {
  final pattern = RegExp(r'\bl10n\.([A-Za-z][A-Za-z0-9]*)');
  final keys = <String>{};
  for (final source in sourcesUnder(root)) {
    for (final match in pattern.allMatches(source.body)) {
      keys.add(match.group(1)!);
    }
  }
  return keys;
}

Map<String, Object?> readArb(String path) =>
    jsonDecode(File(path).readAsStringSync()) as Map<String, Object?>;

void main() {
  test('the scan reads the feature source', () {
    // A scan that found nothing would pass every rule below without checking
    // anything, which is the failure mode these guards exist to avoid.
    expect(sourcesUnder(featureRoot), isNotEmpty);
    expect(sourcesUnder(featureRoot).length, greaterThan(5));
  });

  test('no text input of any kind is constructible in this feature', () {
    final findings = findInputConstruction(featureRoot);
    expect(
      findings,
      isEmpty,
      reason: 'this surface is read-only and holds no credential of any kind; '
          'no field belongs in it:\n${findings.join('\n')}',
    );
  });

  group('the sentences this feature uses', () {
    late Map<String, Object?> english;
    late Map<String, Object?> arabic;
    late Set<String> used;

    setUpAll(() {
      english = readArb('lib/l10n/arb/app_en.arb');
      arabic = readArb('lib/l10n/arb/app_ar.arb');
      used = keysUsedBy(featureRoot);
    });

    test('the derivation found the keys the feature actually reads', () {
      expect(used, isNotEmpty);
      expect(used, contains('dataSourcesScreenTitle'));
      expect(used, contains('railStandingNotBuilt'));
      expect(used, contains(credentialDenialKey));
      // Every derived key must exist, or the checks below would silently skip
      // the message they were meant to read.
      for (final key in used) {
        expect(english.containsKey(key), isTrue, reason: '$key is not in app_en.arb');
        expect(arabic.containsKey(key), isTrue, reason: '$key is not in app_ar.arb');
      }
    });

    test('no message promises a rail that does not exist', () {
      final offenders = <String>[];
      for (final key in used) {
        final en = (english[key]! as String).toLowerCase();
        for (final phrase in promissoryEnglish) {
          if (en.contains(phrase)) {
            offenders.add('$key [en] contains "$phrase": ${english[key]}');
          }
        }
        final ar = arabic[key]! as String;
        for (final phrase in promissoryArabic) {
          if (ar.contains(phrase)) {
            offenders.add('$key [ar] contains "$phrase": $ar');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'an unimplemented rail may be NAMED and REFUSED. It may not be '
            'offered, scheduled or apologised for with a date:\n'
            '${offenders.join('\n')}',
      );
    });

    test('a credential is named only where it is denied', () {
      final offenders = <String>[];
      for (final key in used) {
        if (key == credentialDenialKey) {
          continue;
        }
        final en = (english[key]! as String).toLowerCase();
        for (final noun in credentialNounsEnglish) {
          if (en.contains(noun)) {
            offenders.add('$key contains "$noun": ${english[key]}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'the only sentence on this surface that may name a credential '
            'is the one saying none is ever asked for:\n${offenders.join('\n')}',
      );
      // And that sentence has to actually be there, or the exemption above
      // would be guarding nothing.
      final denial = (english[credentialDenialKey]! as String).toLowerCase();
      for (final noun in <String>['password', 'card number']) {
        expect(denial, contains(noun));
      }
    });
  });

  group('the guard itself fires', () {
    late Directory seeded;

    setUp(() {
      seeded = Directory.systemTemp.createTempSync('karar_connection_guard');
    });

    tearDown(() {
      if (seeded.existsSync()) {
        seeded.deleteSync(recursive: true);
      }
    });

    void seed(String name, String source) {
      File('${seeded.path}/$name').writeAsStringSync(source);
    }

    test('a credential field is caught', () {
      seed('offending_form.dart', '''
final class ConnectBankForm extends StatelessWidget {
  @override
  Widget build(BuildContext context) => TextField(
        obscureText: true,
        controller: TextEditingController(),
      );
}
''');
      final findings = findInputConstruction(seeded.path);
      expect(findings, isNotEmpty);
      expect(findings.first, contains('offending_form.dart'));
    });

    test('a clean tree produces nothing, so the rule is not always-on', () {
      // The opposite failure: a guard that fires on everything is as useless as
      // one that fires on nothing, and would have to be deleted the first time
      // somebody wrote ordinary code.
      seed('innocent.dart', '''
final class Ordinary extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Text('a label from the catalogue');
}
''');
      expect(findInputConstruction(seeded.path), isEmpty);
    });

    test('a comment explaining the rule does not trip it', () {
      seed('commented.dart', '''
// There is no TextField and no obscureText anywhere in this feature.
const int answer = 1;
''');
      expect(findInputConstruction(seeded.path), isEmpty);
    });
  });
}
