// A PLACEHOLDER DECLARED OUT OF ORDER SCRAMBLES EVERY CALLER, SILENTLY.
//
// `gen-l10n` orders a generated method's positional parameters by the ORDER OF
// THE `placeholders` MAP, not by the order the placeholders appear in the
// message. So this template:
//
//   "sourceCoverageRange": "{start} to {end}",
//   "@sourceCoverageRange": { "placeholders": { "end": {}, "start": {} } }
//
// generates `String sourceCoverageRange(String end, String start)`. Every
// caller writing the arguments in reading order — which is every caller — then
// renders "2026-09-30 to 2026-01-01". Nothing fails: the types match, the
// message is present in both catalogues, parity holds, and the sentence is
// backwards.
//
// That was not hypothetical. Four messages shipped this way: a date range that
// read end-to-start on the account detail screen, and three screen-reader
// labels that announced an account as "Current account, QAR, Everyday account".
// They were found by eye, which is not a method.
//
// The rule is mechanical, so it is checked mechanically: a message's
// placeholders must be DECLARED in the order they first APPEAR in it.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The placeholder names in the order they first appear in [message].
List<String> appearanceOrder(String message) {
  final List<String> seen = <String>[];
  for (final RegExpMatch match in RegExp(r'\{(\w+)\}').allMatches(message)) {
    final String name = match.group(1)!;
    if (!seen.contains(name)) {
      seen.add(name);
    }
  }
  return seen;
}

void main() {
  final Directory arbDirectory = Directory('lib/l10n/arb');

  group('a placeholder is declared where it is used', () {
    late Map<String, Object?> template;

    setUpAll(() {
      template = jsonDecode(
        File('${arbDirectory.path}/app_en.arb').readAsStringSync(),
      ) as Map<String, Object?>;
    });

    test('every message declares its placeholders in reading order', () {
      final Map<String, String> wrong = <String, String>{};
      var checked = 0;

      for (final MapEntry<String, Object?> entry in template.entries) {
        if (entry.key.startsWith('@')) continue;
        final Object? metadata = template['@${entry.key}'];
        if (metadata is! Map<String, Object?>) continue;
        final Object? declared = metadata['placeholders'];
        if (declared is! Map<String, Object?> || declared.isEmpty) continue;

        final List<String> used = appearanceOrder(entry.value! as String);
        // A placeholder declared but never used is a separate problem and not
        // this one; compare only what the message actually mentions, in order.
        final List<String> declaredAndUsed = declared.keys.where(used.contains).toList();
        if (declaredAndUsed.isEmpty) continue;

        checked += 1;
        final List<String> expected = used.where(declared.keys.contains).toList();
        if (!const ListEquality().equals(declaredAndUsed, expected)) {
          wrong[entry.key] = 'declared $declaredAndUsed, used $expected';
        }
      }

      expect(
        wrong,
        isEmpty,
        reason:
            'gen-l10n orders the generated parameters by the declaration, so '
            'these messages render their arguments in the wrong places: $wrong',
      );
      // A scan that reaches nothing passes for the wrong reason.
      expect(
        checked,
        greaterThan(20),
        reason:
            'the scan found almost no messages with placeholders, which '
            'means it is not reading the catalogue it thinks it is',
      );
    });

    test('the check would catch the bug that prompted it', () {
      // The exact shape that shipped, asserted directly so the rule is
      // demonstrated rather than only enforced.
      const String message = '{start} to {end}';
      expect(appearanceOrder(message), <String>['start', 'end']);

      final List<String> declaredBackwards = <String>['end', 'start'];
      expect(
        const ListEquality().equals(declaredBackwards, appearanceOrder(message)),
        isFalse,
        reason: 'a backwards declaration must not compare equal to reading order',
      );
    });
  });
}

/// Minimal list equality, so the test needs no extra dependency.
class ListEquality {
  const ListEquality();

  bool equals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (int i = 0; i < a.length; i += 1) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
